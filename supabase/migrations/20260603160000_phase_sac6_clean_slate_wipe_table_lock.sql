-- PRD-SAC6 Feature 1 (#293/#294 follow-up): close the wipe's snapshot/delete
-- race so recovery (revert/import) can actually recover everything the wipe
-- removed.
--
-- The #288 wipe (20260603130000) takes only the clean_slate advisory lock, which
-- serializes the clean-slate RPCs against each other but NOT against ordinary
-- history writers (admin_submit_leader_checkin, guest/follow-up writes, …) — they
-- never take that lock. So a history row committed after the snapshot payload is
-- assembled but before the deletes run would be wiped WITHOUT being captured in
-- the snapshot, and the recovery feature this PR adds could never bring it back.
--
-- Fix: lock every history table EXCLUSIVE up front (immediately after the
-- advisory lock, before the counts/snapshot), exactly as the restore body does.
-- EXCLUSIVE blocks concurrent writers but still allows plain SELECTs, and the
-- function's own counts/snapshot/deletes proceed (a txn never conflicts with its
-- own locks). The lock order is parent → child — the same order the writers and
-- the restore body acquire locks — so a wipe and a concurrent writer queue on the
-- first contended table rather than deadlocking. Held to transaction end.
--
-- Everything else is byte-for-byte the #288 body; this is a CREATE OR REPLACE
-- (the table already exists and its grants/RLS are unchanged).

set check_function_bodies = off;

create or replace function public.super_admin_clean_slate_wipe()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_snapshot_id uuid := gen_random_uuid();
  v_payload jsonb;
  v_counts jsonb;
  v_total bigint;
  c_attendance_records bigint;
  c_attendance_sessions bigint;
  c_follow_ups bigint;
  c_guests bigint;
  c_group_health_updates bigint;
  c_group_health_assessments bigint;
  c_group_status_history bigint;
  c_church_attendance_snapshots bigint;
  c_shepherd_care_follow_ups bigint;
  c_shepherd_care_interactions bigint;
begin
  if public.auth_role() <> 'super_admin' then
    raise exception 'insufficient_privilege';
  end if;

  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  -- One Clean Slate at a time; released at transaction end.
  perform pg_advisory_xact_lock(hashtext('clean_slate'));

  -- Block concurrent history writers for the whole snapshot+delete window so the
  -- snapshot captures exactly what is deleted (no row slips in between). Parent →
  -- child order matches the writers + the restore body to avoid deadlocks.
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

  select count(*) into c_attendance_records          from public.attendance_records;
  select count(*) into c_attendance_sessions         from public.attendance_sessions;
  select count(*) into c_follow_ups                  from public.follow_ups;
  select count(*) into c_guests                      from public.guests;
  select count(*) into c_group_health_updates        from public.group_health_updates;
  select count(*) into c_group_health_assessments    from public.group_health_assessments;
  select count(*) into c_group_status_history        from public.group_status_history;
  select count(*) into c_church_attendance_snapshots from public.church_attendance_snapshots;
  select count(*) into c_shepherd_care_follow_ups    from public.shepherd_care_follow_ups;
  select count(*) into c_shepherd_care_interactions  from public.shepherd_care_interactions;

  v_counts := jsonb_build_object(
    'attendance_records',          c_attendance_records,
    'attendance_sessions',         c_attendance_sessions,
    'follow_ups',                  c_follow_ups,
    'guests',                      c_guests,
    'group_health_updates',        c_group_health_updates,
    'group_health_assessments',    c_group_health_assessments,
    'group_status_history',        c_group_status_history,
    'church_attendance_snapshots', c_church_attendance_snapshots,
    'shepherd_care_follow_ups',    c_shepherd_care_follow_ups,
    'shepherd_care_interactions',  c_shepherd_care_interactions
  );

  v_total :=
    c_attendance_records + c_attendance_sessions + c_follow_ups + c_guests
    + c_group_health_updates + c_group_health_assessments + c_group_status_history
    + c_church_attendance_snapshots + c_shepherd_care_follow_ups
    + c_shepherd_care_interactions;

  if v_total = 0 then
    -- Nothing to wipe: no snapshot, no audit, no-op.
    raise exception 'nothing_to_wipe';
  end if;

  -- Explicit per-table snapshot (no dynamic loop). coalesce(..., '[]') so an
  -- empty table serializes to [] rather than null.
  v_payload := jsonb_build_object(
    'schema_version', 1,
    'attendance_records',
      coalesce((select jsonb_agg(to_jsonb(t.*)) from public.attendance_records t), '[]'::jsonb),
    'attendance_sessions',
      coalesce((select jsonb_agg(to_jsonb(t.*)) from public.attendance_sessions t), '[]'::jsonb),
    'follow_ups',
      coalesce((select jsonb_agg(to_jsonb(t.*)) from public.follow_ups t), '[]'::jsonb),
    'guests',
      coalesce((select jsonb_agg(to_jsonb(t.*)) from public.guests t), '[]'::jsonb),
    'group_health_updates',
      coalesce((select jsonb_agg(to_jsonb(t.*)) from public.group_health_updates t), '[]'::jsonb),
    'group_health_assessments',
      coalesce((select jsonb_agg(to_jsonb(t.*)) from public.group_health_assessments t), '[]'::jsonb),
    'group_status_history',
      coalesce((select jsonb_agg(to_jsonb(t.*)) from public.group_status_history t), '[]'::jsonb),
    'church_attendance_snapshots',
      coalesce((select jsonb_agg(to_jsonb(t.*)) from public.church_attendance_snapshots t), '[]'::jsonb),
    'shepherd_care_follow_ups',
      coalesce((select jsonb_agg(to_jsonb(t.*)) from public.shepherd_care_follow_ups t), '[]'::jsonb),
    'shepherd_care_interactions',
      coalesce((select jsonb_agg(to_jsonb(t.*)) from public.shepherd_care_interactions t), '[]'::jsonb)
  );

  -- A new wipe overwrites the prior snapshot — the store holds at most one.
  delete from public.clean_slate_snapshots;

  insert into public.clean_slate_snapshots
    (id, created_by, kind, payload, row_counts, total_rows)
  values
    (v_snapshot_id, v_actor, 'clean_slate_history', v_payload, v_counts, v_total);

  -- Delete history children → parents. attendance_records is deleted
  -- explicitly (a CASCADE from attendance_sessions would be invisible to the
  -- counts we already captured, and we want the order explicit regardless).
  delete from public.attendance_records;
  delete from public.attendance_sessions;
  delete from public.follow_ups;          -- before guests (FK is ON DELETE SET NULL)
  delete from public.guests;
  delete from public.group_health_updates;
  delete from public.group_health_assessments;
  delete from public.group_status_history;
  delete from public.church_attendance_snapshots;
  delete from public.shepherd_care_follow_ups;
  delete from public.shepherd_care_interactions;

  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values
    (v_actor, 'super_admin.clean_slate_wipe', 'clean_slate_snapshots', v_snapshot_id, v_counts);

  return v_snapshot_id;
end;
$$;

comment on function public.super_admin_clean_slate_wipe() is
  'PRD-SAC6 (#288): super-admin history-only wipe. Locks the history tables EXCLUSIVE (so the snapshot captures exactly what is deleted — no concurrent write slips through), captures one clean_slate_snapshots row (per-table payload + counts), then deletes the history tables children → parents, with a paired super_admin.clean_slate_wipe audit row, in one transaction. Raises nothing_to_wipe when there is nothing to clear.';
