-- PRD-SAC6 Feature 1 (#288): Clean Slate — history-only wipe + snapshot capture.
--
-- The core Super-Admin "Clean Slate" path: wipe a month of accumulated history
-- / activity (attendance, follow-ups, guests, group-health updates +
-- assessments, status history, church-attendance snapshots, shepherd-care
-- interactions + follow-ups) while keeping every structural / config / pastoral
-- record (people, groups, leaders, memberships, settings, care profiles +
-- private/admin notes, audit_events). Before deleting, capture a single in-DB
-- snapshot of everything wiped so it can be recovered later (revert + export
-- ship in separate slices).
--
-- clean_slate_snapshots is a single logical snapshot store: super-admin-only
-- SELECT RLS (mirrors audit_events), and NO write policy — every write flows
-- through the SECURITY DEFINER RPC below. A new wipe overwrites the prior
-- snapshot (the table holds at most one).

set check_function_bodies = off;

create table if not exists public.clean_slate_snapshots (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  -- Discriminator for future snapshot kinds; this slice writes 'clean_slate_history'.
  kind text not null,
  -- The wiped rows, keyed per table, plus a schema_version for forward-compatible recovery.
  payload jsonb not null,
  -- Per-table counts captured at wipe time, and their sum.
  row_counts jsonb not null default '{}'::jsonb,
  total_rows bigint not null default 0,
  -- Set when a future revert slice restores this snapshot.
  restored_at timestamptz,
  restored_by uuid references public.profiles(id)
);

create index if not exists idx_clean_slate_snapshots_created_at
  on public.clean_slate_snapshots (created_at desc);

alter table public.clean_slate_snapshots enable row level security;

-- Single SELECT policy, super-admin only (mirrors audit_events). No
-- INSERT/UPDATE/DELETE policy: the RPC is SECURITY DEFINER and bypasses RLS.
create policy clean_slate_snapshots_super_admin_read
  on public.clean_slate_snapshots
  for select to authenticated using (public.auth_role() = 'super_admin');

revoke all    on public.clean_slate_snapshots from public;
revoke all    on public.clean_slate_snapshots from anon;
revoke all    on public.clean_slate_snapshots from authenticated;
grant  select on public.clean_slate_snapshots to authenticated;

-- super_admin_clean_slate_wipe(): gate super_admin; serialize with an advisory
-- xact lock so two concurrent wipes can't race the snapshot/delete; build a
-- single explicit-per-table snapshot; raise nothing_to_wipe when there is
-- nothing to clear; INSERT the snapshot first, DELETE history children →
-- parents, then INSERT one paired audit row — all in one atomic transaction.
-- Returns the snapshot id; the action layer reads counts back from the snapshot
-- row (never through this uuid channel).
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

revoke all     on function public.super_admin_clean_slate_wipe() from public;
revoke all     on function public.super_admin_clean_slate_wipe() from anon;
revoke all     on function public.super_admin_clean_slate_wipe() from authenticated;
grant  execute on function public.super_admin_clean_slate_wipe() to authenticated;

comment on function public.super_admin_clean_slate_wipe() is
  'PRD-SAC6 (#288): super-admin history-only wipe. Captures one clean_slate_snapshots row (per-table payload + counts) then deletes the history tables children → parents, with a paired super_admin.clean_slate_wipe audit row, in one transaction. Raises nothing_to_wipe when there is nothing to clear.';
