-- PRD-SAC6 follow-up: per-category history reset + snapshot capture.
--
-- The Clean Slate wipe (#288) clears EVERY history table at once. This adds a
-- scoped sibling: clear ONE category of pre-launch history (health checks,
-- follow-ups, attendance, guests, church-attendance, shepherd-care, group status
-- history) at a time, each independently recoverable. The mute feature flags
-- (#reset-attention-metrics) only hide a "Needs attention" item from Home; they
-- never delete rows, so toggling one off/on leaves stale pre-launch history
-- behind. This is the audited, recoverable way to clear it one category at a time.
--
-- A SEPARATE snapshot store (history_reset_snapshots) is used on purpose, NOT the
-- single-row clean_slate_snapshots: the full wipe deletes that whole store before
-- each run and the full revert's target_not_empty guard requires ALL ten history
-- tables empty. A scoped snapshot living there would either be blown away by a
-- full wipe or trip the all-tables-empty guard on revert. Keeping the stores
-- independent leaves Clean Slate completely untouched. Both RPCs take the SAME
-- 'clean_slate' advisory lock as the full wipe/revert, so a scoped reset can never
-- interleave with a full wipe on overlapping tables.

set check_function_bodies = off;

create table if not exists public.history_reset_snapshots (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  -- Which category this snapshot captured (one of the allow-listed keys).
  category text not null,
  -- Discriminator for forward-compatible snapshot kinds; this slice writes 'history_reset'.
  kind text not null,
  -- The captured rows for this category's tables, plus schema_version + category.
  payload jsonb not null,
  -- Per-table counts captured at reset time, and their sum.
  row_counts jsonb not null default '{}'::jsonb,
  total_rows bigint not null default 0,
  -- Set when this snapshot is reverted back into the database.
  restored_at timestamptz,
  restored_by uuid references public.profiles(id)
);

create index if not exists idx_history_reset_snapshots_category_created_at
  on public.history_reset_snapshots (category, created_at desc);

alter table public.history_reset_snapshots enable row level security;

-- Single SELECT policy, super-admin only (mirrors clean_slate_snapshots /
-- audit_events). No INSERT/UPDATE/DELETE policy: the RPCs are SECURITY DEFINER
-- and bypass RLS.
create policy history_reset_snapshots_super_admin_read
  on public.history_reset_snapshots
  for select to authenticated using (public.auth_role() = 'super_admin');

revoke all    on public.history_reset_snapshots from public;
revoke all    on public.history_reset_snapshots from anon;
revoke all    on public.history_reset_snapshots from authenticated;
grant  select on public.history_reset_snapshots to authenticated;

-- super_admin_reset_history_category(p_category): gate super_admin; validate the
-- category against the in-SQL allow-list (invalid_category); serialize on the
-- shared 'clean_slate' advisory lock; lock the category's tables EXCLUSIVE so the
-- snapshot captures exactly what is deleted (no concurrent write slips through);
-- count + snapshot that category's rows; raise nothing_to_wipe when empty; replace
-- the prior un-restored snapshot for this category; INSERT the snapshot first,
-- DELETE the category's tables (children → parents), then INSERT one paired audit
-- row — all in one transaction. Returns the snapshot id; the action layer reads
-- counts back from the snapshot row (never through this uuid channel). Per-category
-- statements are explicit (no dynamic SQL), matching the wipe's convention.
create or replace function public.super_admin_reset_history_category(p_category text)
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
  v_total bigint := 0;
  c_a bigint;
  c_b bigint;
begin
  if public.auth_role() <> 'super_admin' then
    raise exception 'insufficient_privilege';
  end if;

  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  -- Reject any category not in the allow-list before touching the database.
  if p_category not in (
    'health_checks', 'follow_ups', 'attendance', 'guests',
    'church_attendance', 'shepherd_care', 'group_status_history'
  ) then
    raise exception 'invalid_category';
  end if;

  -- Shared key with the full wipe/revert: a scoped reset and a full wipe can
  -- never interleave. Released at transaction end.
  perform pg_advisory_xact_lock(hashtext('clean_slate'));

  -- Lock the category's tables EXCLUSIVE, count, and build the snapshot payload.
  -- EXCLUSIVE blocks concurrent writers but still allows plain SELECTs; the
  -- function's own counts/snapshot/deletes proceed. Held to transaction end.
  case p_category
    when 'health_checks' then
      lock table public.group_health_updates, public.group_health_assessments in exclusive mode;
      select count(*) into c_a from public.group_health_updates;
      select count(*) into c_b from public.group_health_assessments;
      v_counts := jsonb_build_object('group_health_updates', c_a, 'group_health_assessments', c_b);
      v_total := c_a + c_b;
      v_payload := jsonb_build_object(
        'schema_version', 1, 'category', p_category,
        'group_health_updates',
          coalesce((select jsonb_agg(to_jsonb(t.*)) from public.group_health_updates t), '[]'::jsonb),
        'group_health_assessments',
          coalesce((select jsonb_agg(to_jsonb(t.*)) from public.group_health_assessments t), '[]'::jsonb)
      );
    when 'follow_ups' then
      lock table public.follow_ups in exclusive mode;
      select count(*) into c_a from public.follow_ups;
      v_counts := jsonb_build_object('follow_ups', c_a);
      v_total := c_a;
      v_payload := jsonb_build_object(
        'schema_version', 1, 'category', p_category,
        'follow_ups',
          coalesce((select jsonb_agg(to_jsonb(t.*)) from public.follow_ups t), '[]'::jsonb)
      );
    when 'attendance' then
      lock table public.attendance_sessions, public.attendance_records in exclusive mode;
      select count(*) into c_a from public.attendance_records;
      select count(*) into c_b from public.attendance_sessions;
      v_counts := jsonb_build_object('attendance_records', c_a, 'attendance_sessions', c_b);
      v_total := c_a + c_b;
      v_payload := jsonb_build_object(
        'schema_version', 1, 'category', p_category,
        'attendance_records',
          coalesce((select jsonb_agg(to_jsonb(t.*)) from public.attendance_records t), '[]'::jsonb),
        'attendance_sessions',
          coalesce((select jsonb_agg(to_jsonb(t.*)) from public.attendance_sessions t), '[]'::jsonb)
      );
    when 'guests' then
      lock table public.guests in exclusive mode;
      select count(*) into c_a from public.guests;
      v_counts := jsonb_build_object('guests', c_a);
      v_total := c_a;
      v_payload := jsonb_build_object(
        'schema_version', 1, 'category', p_category,
        'guests',
          coalesce((select jsonb_agg(to_jsonb(t.*)) from public.guests t), '[]'::jsonb)
      );
    when 'church_attendance' then
      lock table public.church_attendance_snapshots in exclusive mode;
      select count(*) into c_a from public.church_attendance_snapshots;
      v_counts := jsonb_build_object('church_attendance_snapshots', c_a);
      v_total := c_a;
      v_payload := jsonb_build_object(
        'schema_version', 1, 'category', p_category,
        'church_attendance_snapshots',
          coalesce((select jsonb_agg(to_jsonb(t.*)) from public.church_attendance_snapshots t), '[]'::jsonb)
      );
    when 'shepherd_care' then
      lock table public.shepherd_care_interactions, public.shepherd_care_follow_ups in exclusive mode;
      select count(*) into c_a from public.shepherd_care_follow_ups;
      select count(*) into c_b from public.shepherd_care_interactions;
      v_counts := jsonb_build_object('shepherd_care_follow_ups', c_a, 'shepherd_care_interactions', c_b);
      v_total := c_a + c_b;
      v_payload := jsonb_build_object(
        'schema_version', 1, 'category', p_category,
        'shepherd_care_follow_ups',
          coalesce((select jsonb_agg(to_jsonb(t.*)) from public.shepherd_care_follow_ups t), '[]'::jsonb),
        'shepherd_care_interactions',
          coalesce((select jsonb_agg(to_jsonb(t.*)) from public.shepherd_care_interactions t), '[]'::jsonb)
      );
    when 'group_status_history' then
      lock table public.group_status_history in exclusive mode;
      select count(*) into c_a from public.group_status_history;
      v_counts := jsonb_build_object('group_status_history', c_a);
      v_total := c_a;
      v_payload := jsonb_build_object(
        'schema_version', 1, 'category', p_category,
        'group_status_history',
          coalesce((select jsonb_agg(to_jsonb(t.*)) from public.group_status_history t), '[]'::jsonb)
      );
  end case;

  if v_total = 0 then
    -- Nothing to reset for this category: no snapshot, no audit, no-op.
    raise exception 'nothing_to_wipe';
  end if;

  -- Keep at most one un-restored snapshot per category (the recoverable one).
  delete from public.history_reset_snapshots
    where category = p_category and restored_at is null;

  insert into public.history_reset_snapshots
    (id, created_by, category, kind, payload, row_counts, total_rows)
  values
    (v_snapshot_id, v_actor, p_category, 'history_reset', v_payload, v_counts, v_total);

  -- Delete this category's tables children → parents (attendance_records before
  -- attendance_sessions is the only intra-category FK that requires order; the
  -- rest are siblings, ordered to match the full-wipe order for consistency).
  case p_category
    when 'health_checks' then
      delete from public.group_health_updates;
      delete from public.group_health_assessments;
    when 'follow_ups' then
      delete from public.follow_ups;
    when 'attendance' then
      delete from public.attendance_records;
      delete from public.attendance_sessions;
    when 'guests' then
      delete from public.guests;
    when 'church_attendance' then
      delete from public.church_attendance_snapshots;
    when 'shepherd_care' then
      delete from public.shepherd_care_follow_ups;
      delete from public.shepherd_care_interactions;
    when 'group_status_history' then
      delete from public.group_status_history;
  end case;

  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values
    (v_actor, 'super_admin.reset_history_category', 'history_reset_snapshots', v_snapshot_id,
     v_counts || jsonb_build_object('category', p_category));

  return v_snapshot_id;
end;
$$;

revoke all     on function public.super_admin_reset_history_category(text) from public;
revoke all     on function public.super_admin_reset_history_category(text) from anon;
revoke all     on function public.super_admin_reset_history_category(text) from authenticated;
grant  execute on function public.super_admin_reset_history_category(text) to authenticated;

comment on function public.super_admin_reset_history_category(text) is
  'PRD-SAC6 follow-up: super-admin per-category history reset. Validates the category (invalid_category), locks that category''s tables EXCLUSIVE, captures one history_reset_snapshots row, deletes the category''s tables children → parents, and writes a paired super_admin.reset_history_category audit row in one transaction. Raises nothing_to_wipe when the category is already empty.';

-- super_admin_reset_history_category_revert(p_snapshot_id): gate super_admin;
-- serialize on the shared 'clean_slate' advisory lock; resolve the snapshot FOR
-- UPDATE; raise missing_snapshot when absent; no-op (idempotent) if already
-- restored; restore ONLY that snapshot's category tables — lock them EXCLUSIVE,
-- guard target_not_empty for those tables only, insert parents → children — then
-- stamp restored_at/restored_by and write one paired audit row. Returns the
-- restored snapshot id. Unlike the full Clean Slate revert, the emptiness guard is
-- scoped to the category's tables, so other categories' rows do not block it.
create or replace function public.super_admin_reset_history_category_revert(p_snapshot_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_snapshot public.history_reset_snapshots;
  v_category text;
  v_payload jsonb;
begin
  if public.auth_role() <> 'super_admin' then
    raise exception 'insufficient_privilege';
  end if;

  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  perform pg_advisory_xact_lock(hashtext('clean_slate'));

  select * into v_snapshot
    from public.history_reset_snapshots
    where id = p_snapshot_id
    for update;

  if v_snapshot.id is null then
    raise exception 'missing_snapshot';
  end if;

  -- Double-revert of the same snapshot is a no-op (idempotent via restored_at).
  if v_snapshot.restored_at is not null then
    return v_snapshot.id;
  end if;

  v_category := v_snapshot.category;
  v_payload := v_snapshot.payload;

  -- Restore only this category's tables. Lock EXCLUSIVE, refuse if any of the
  -- category's tables still holds rows (target_not_empty — scoped to the
  -- category), then insert parents → children (reverse of the delete order).
  case v_category
    when 'health_checks' then
      lock table public.group_health_assessments, public.group_health_updates in exclusive mode;
      if exists (select 1 from public.group_health_updates)
         or exists (select 1 from public.group_health_assessments) then
        raise exception 'target_not_empty';
      end if;
      insert into public.group_health_assessments
        select * from jsonb_populate_recordset(null::public.group_health_assessments, v_payload->'group_health_assessments');
      insert into public.group_health_updates
        select * from jsonb_populate_recordset(null::public.group_health_updates, v_payload->'group_health_updates');
    when 'follow_ups' then
      lock table public.follow_ups in exclusive mode;
      if exists (select 1 from public.follow_ups) then
        raise exception 'target_not_empty';
      end if;
      insert into public.follow_ups
        select * from jsonb_populate_recordset(null::public.follow_ups, v_payload->'follow_ups');
    when 'attendance' then
      lock table public.attendance_sessions, public.attendance_records in exclusive mode;
      if exists (select 1 from public.attendance_records)
         or exists (select 1 from public.attendance_sessions) then
        raise exception 'target_not_empty';
      end if;
      insert into public.attendance_sessions
        select * from jsonb_populate_recordset(null::public.attendance_sessions, v_payload->'attendance_sessions');
      insert into public.attendance_records
        select * from jsonb_populate_recordset(null::public.attendance_records, v_payload->'attendance_records');
    when 'guests' then
      lock table public.guests in exclusive mode;
      if exists (select 1 from public.guests) then
        raise exception 'target_not_empty';
      end if;
      insert into public.guests
        select * from jsonb_populate_recordset(null::public.guests, v_payload->'guests');
    when 'church_attendance' then
      lock table public.church_attendance_snapshots in exclusive mode;
      if exists (select 1 from public.church_attendance_snapshots) then
        raise exception 'target_not_empty';
      end if;
      insert into public.church_attendance_snapshots
        select * from jsonb_populate_recordset(null::public.church_attendance_snapshots, v_payload->'church_attendance_snapshots');
    when 'shepherd_care' then
      lock table public.shepherd_care_interactions, public.shepherd_care_follow_ups in exclusive mode;
      if exists (select 1 from public.shepherd_care_follow_ups)
         or exists (select 1 from public.shepherd_care_interactions) then
        raise exception 'target_not_empty';
      end if;
      insert into public.shepherd_care_interactions
        select * from jsonb_populate_recordset(null::public.shepherd_care_interactions, v_payload->'shepherd_care_interactions');
      insert into public.shepherd_care_follow_ups
        select * from jsonb_populate_recordset(null::public.shepherd_care_follow_ups, v_payload->'shepherd_care_follow_ups');
    when 'group_status_history' then
      lock table public.group_status_history in exclusive mode;
      if exists (select 1 from public.group_status_history) then
        raise exception 'target_not_empty';
      end if;
      insert into public.group_status_history
        select * from jsonb_populate_recordset(null::public.group_status_history, v_payload->'group_status_history');
    else
      -- A snapshot row with an unrecognised category can't be restored safely.
      raise exception 'invalid_category';
  end case;

  update public.history_reset_snapshots
    set restored_at = now(),
        restored_by = v_actor
    where id = v_snapshot.id;

  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values
    (v_actor, 'super_admin.reset_history_category_revert', 'history_reset_snapshots', v_snapshot.id,
     v_snapshot.row_counts || jsonb_build_object('category', v_category));

  return v_snapshot.id;
end;
$$;

revoke all     on function public.super_admin_reset_history_category_revert(uuid) from public;
revoke all     on function public.super_admin_reset_history_category_revert(uuid) from anon;
revoke all     on function public.super_admin_reset_history_category_revert(uuid) from authenticated;
grant  execute on function public.super_admin_reset_history_category_revert(uuid) to authenticated;

comment on function public.super_admin_reset_history_category_revert(uuid) is
  'PRD-SAC6 follow-up: super-admin revert of a per-category history reset. Restores only the snapshot''s category tables (target_not_empty guard scoped to those tables), stamps restored_at/restored_by, and writes a paired super_admin.reset_history_category_revert audit row in one transaction. Raises missing_snapshot when there is nothing to restore; a second revert of the same snapshot is a no-op.';
