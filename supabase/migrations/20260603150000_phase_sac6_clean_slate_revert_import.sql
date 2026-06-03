-- PRD-SAC6 Feature 1 (#293 revert + #294 export/import): recover from a Clean
-- Slate wipe by putting the snapshotted history rows back exactly as they were.
--
-- Two entry points share one restore body:
--   * super_admin_clean_slate_revert(p_snapshot_id) — restore from the in-DB
--     snapshot row (the #288 store).
--   * super_admin_clean_slate_import(p_payload)      — restore from a JSON file
--     a Super Admin exported earlier (covers the case where the in-DB snapshot
--     is gone).
--
-- The actual re-insert (the target_not_empty guard + the FK-safe parent → child
-- INSERT order) lives once in super_admin_clean_slate_restore_payload, so the
-- ordered table list reviewers must check is in a single place. The two public
-- RPCs own the super-admin gate + advisory lock and call the helper.

set check_function_bodies = off;

-- Shared restore body. NOT a public RPC: EXECUTE is revoked from every client
-- role and granted to none, so it is reachable only from the two SECURITY
-- DEFINER RPCs below (which run as the function owner and so may call it). It
-- assumes its caller already gated super_admin and took the advisory lock.
--
-- target_not_empty guard: refuse if ANY wipe table still holds rows. Restoring
-- into a non-empty target would collide on the preserved primary keys (or, worse
-- on a different schema, silently merge), so we stop before touching anything.
--
-- Insert order is the exact REVERSE of the #288 wipe's delete order, which makes
-- it parent → child and therefore FK-safe (attendance_sessions before
-- attendance_records; guests before follow_ups, whose related_guest_id FK is ON
-- DELETE SET NULL; shepherd_care_interactions before shepherd_care_follow_ups).
-- Each row keeps its original id / created_at / FK linkage because the payload
-- was captured with to_jsonb(t.*) over every column.
--
-- jsonb_populate_recordset(null::public.<table>, ...) ignores keys that are not
-- columns of <table>, so a newer-schema export still imports its known columns
-- (forward-compatible recovery).
create or replace function public.super_admin_clean_slate_restore_payload(p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- The clean_slate advisory lock only serializes the clean-slate RPCs; ordinary
  -- history-write RPCs (leader check-ins, guest/follow-up writes, etc.) do NOT
  -- take it. Lock every wipe table up front so no concurrent write can slip a row
  -- in between the emptiness check and the restore inserts — which would either
  -- merge a new row into the restored snapshot or trip a late FK/unique conflict
  -- instead of the target_not_empty guard. EXCLUSIVE blocks other writers (it
  -- conflicts with the ROW EXCLUSIVE that INSERT/UPDATE/DELETE take) while still
  -- allowing plain SELECTs, and our own inserts below proceed (a transaction
  -- never conflicts with its own locks). Table locks are held to transaction end.
  --
  -- Order matters: tables are locked parent → child, the same order the history
  -- writers acquire row locks (admin_submit_leader_checkin inserts the
  -- attendance_session before the attendance_record; guest/follow-up writes touch
  -- the guest before the follow_up). Acquiring in that shared order means a
  -- restore and a concurrent writer queue on the first contended table instead of
  -- each holding what the other needs — no lock-order-reversal deadlock. This
  -- list mirrors the parent → child insert order below.
  lock table
    public.shepherd_care_interactions,
    public.shepherd_care_follow_ups,
    public.church_attendance_snapshots,
    public.group_status_history,
    public.group_health_assessments,
    public.group_health_updates,
    public.guests,
    public.follow_ups,
    public.attendance_sessions,
    public.attendance_records
  in exclusive mode;

  if exists (select 1 from public.attendance_records)
     or exists (select 1 from public.attendance_sessions)
     or exists (select 1 from public.follow_ups)
     or exists (select 1 from public.guests)
     or exists (select 1 from public.group_health_updates)
     or exists (select 1 from public.group_health_assessments)
     or exists (select 1 from public.group_status_history)
     or exists (select 1 from public.church_attendance_snapshots)
     or exists (select 1 from public.shepherd_care_follow_ups)
     or exists (select 1 from public.shepherd_care_interactions)
  then
    raise exception 'target_not_empty';
  end if;

  -- Parent → child (reverse of the wipe order).
  insert into public.shepherd_care_interactions
    select * from jsonb_populate_recordset(null::public.shepherd_care_interactions, p_payload->'shepherd_care_interactions');
  insert into public.shepherd_care_follow_ups
    select * from jsonb_populate_recordset(null::public.shepherd_care_follow_ups, p_payload->'shepherd_care_follow_ups');
  insert into public.church_attendance_snapshots
    select * from jsonb_populate_recordset(null::public.church_attendance_snapshots, p_payload->'church_attendance_snapshots');
  insert into public.group_status_history
    select * from jsonb_populate_recordset(null::public.group_status_history, p_payload->'group_status_history');
  insert into public.group_health_assessments
    select * from jsonb_populate_recordset(null::public.group_health_assessments, p_payload->'group_health_assessments');
  insert into public.group_health_updates
    select * from jsonb_populate_recordset(null::public.group_health_updates, p_payload->'group_health_updates');
  insert into public.guests
    select * from jsonb_populate_recordset(null::public.guests, p_payload->'guests');
  insert into public.follow_ups
    select * from jsonb_populate_recordset(null::public.follow_ups, p_payload->'follow_ups');
  insert into public.attendance_sessions
    select * from jsonb_populate_recordset(null::public.attendance_sessions, p_payload->'attendance_sessions');
  insert into public.attendance_records
    select * from jsonb_populate_recordset(null::public.attendance_records, p_payload->'attendance_records');
end;
$$;

revoke all on function public.super_admin_clean_slate_restore_payload(jsonb) from public;
revoke all on function public.super_admin_clean_slate_restore_payload(jsonb) from anon;
revoke all on function public.super_admin_clean_slate_restore_payload(jsonb) from authenticated;

comment on function public.super_admin_clean_slate_restore_payload(jsonb) is
  'PRD-SAC6 (#293/#294): shared Clean Slate restore body — target_not_empty guard + FK-safe parent → child re-insert of a snapshot payload. Internal helper (no EXECUTE grant); called by the revert/import RPCs which own the super-admin gate + advisory lock.';

-- super_admin_clean_slate_revert(p_snapshot_id): gate super_admin; serialize on
-- the same advisory xact lock as the wipe; resolve the target snapshot (explicit
-- id, else the latest un-restored one) FOR UPDATE; raise missing_snapshot when
-- there is none; skip (no-op return) if it was already restored; restore via the
-- shared body; stamp restored_at/restored_by and write one paired audit row — all
-- in one transaction. Returns the restored snapshot id.
create or replace function public.super_admin_clean_slate_revert(p_snapshot_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_snapshot public.clean_slate_snapshots;
begin
  if public.auth_role() <> 'super_admin' then
    raise exception 'insufficient_privilege';
  end if;

  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  -- Same lock key as the wipe: a revert and a wipe can never interleave.
  perform pg_advisory_xact_lock(hashtext('clean_slate'));

  if p_snapshot_id is not null then
    select * into v_snapshot
      from public.clean_slate_snapshots
      where id = p_snapshot_id
      for update;
  else
    select * into v_snapshot
      from public.clean_slate_snapshots
      where restored_at is null
      order by created_at desc
      limit 1
      for update;
  end if;

  if v_snapshot.id is null then
    raise exception 'missing_snapshot';
  end if;

  -- Double-revert of the same snapshot is a no-op (idempotent via restored_at):
  -- no re-insert, no second audit row.
  if v_snapshot.restored_at is not null then
    return v_snapshot.id;
  end if;

  perform public.super_admin_clean_slate_restore_payload(v_snapshot.payload);

  update public.clean_slate_snapshots
    set restored_at = now(),
        restored_by = v_actor
    where id = v_snapshot.id;

  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values
    (v_actor, 'super_admin.clean_slate_revert', 'clean_slate_snapshots', v_snapshot.id, v_snapshot.row_counts);

  return v_snapshot.id;
end;
$$;

revoke all     on function public.super_admin_clean_slate_revert(uuid) from public;
revoke all     on function public.super_admin_clean_slate_revert(uuid) from anon;
revoke all     on function public.super_admin_clean_slate_revert(uuid) from authenticated;
grant  execute on function public.super_admin_clean_slate_revert(uuid) to authenticated;

comment on function public.super_admin_clean_slate_revert(uuid) is
  'PRD-SAC6 (#293): super-admin in-DB Clean Slate revert. Restores the snapshot payload (target_not_empty guarded), stamps restored_at/restored_by, and writes a paired super_admin.clean_slate_revert audit row in one transaction. Raises missing_snapshot when there is nothing to restore; a second revert of the same snapshot is a no-op.';

-- super_admin_clean_slate_import(p_payload): gate super_admin; serialize on the
-- same advisory lock; validate schema_version = 1 (unsupported_snapshot_version)
-- and that every expected table key is a JSON array (malformed_snapshot); restore
-- via the shared body (same target_not_empty guard + ordered inserts); write one
-- paired audit row carrying the per-table counts — all in one transaction.
-- Returns the audit row id (there is no snapshot row for a file import).
create or replace function public.super_admin_clean_slate_import(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_audit_id uuid := gen_random_uuid();
  v_key text;
  v_counts jsonb := '{}'::jsonb;
  -- The tables an import must carry, in any order (validation is order-free).
  v_keys text[] := array[
    'attendance_records', 'attendance_sessions', 'follow_ups', 'guests',
    'group_health_updates', 'group_health_assessments', 'group_status_history',
    'church_attendance_snapshots', 'shepherd_care_follow_ups',
    'shepherd_care_interactions'
  ];
begin
  if public.auth_role() <> 'super_admin' then
    raise exception 'insufficient_privilege';
  end if;

  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  perform pg_advisory_xact_lock(hashtext('clean_slate'));

  -- schema_version gate: only the v1 export shape is understood.
  if coalesce(p_payload->>'schema_version', '') <> '1' then
    raise exception 'unsupported_snapshot_version';
  end if;

  -- Every expected key must be a JSON array; tally per-table counts for the
  -- audit row (the bare {table: n} map the wipe + revert audit rows also use).
  foreach v_key in array v_keys loop
    if jsonb_typeof(p_payload->v_key) is distinct from 'array' then
      raise exception 'malformed_snapshot';
    end if;
    v_counts := v_counts || jsonb_build_object(v_key, jsonb_array_length(p_payload->v_key));
  end loop;

  perform public.super_admin_clean_slate_restore_payload(p_payload);

  -- A file import has no clean_slate_snapshots row, so entity_id is null (the
  -- wipe/revert rows point entity_id at the real snapshot id). Metadata is the
  -- same bare per-table counts map those rows write. The audit row's id is set
  -- explicitly to v_audit_id so the value this RPC returns identifies the row it
  -- just wrote (the uuid return-channel contract).
  insert into public.audit_events
    (id, actor_profile_id, action, entity_type, entity_id, metadata)
  values
    (v_audit_id, v_actor, 'super_admin.clean_slate_import', 'clean_slate_snapshots', null, v_counts);

  return v_audit_id;
end;
$$;

revoke all     on function public.super_admin_clean_slate_import(jsonb) from public;
revoke all     on function public.super_admin_clean_slate_import(jsonb) from anon;
revoke all     on function public.super_admin_clean_slate_import(jsonb) from authenticated;
grant  execute on function public.super_admin_clean_slate_import(jsonb) to authenticated;

comment on function public.super_admin_clean_slate_import(jsonb) is
  'PRD-SAC6 (#294): super-admin Clean Slate import from a JSON export. Validates schema_version = 1 (unsupported_snapshot_version) and that every table key is a JSON array (malformed_snapshot), restores the payload (target_not_empty guarded, extra columns ignored), and writes a paired super_admin.clean_slate_import audit row in one transaction.';
