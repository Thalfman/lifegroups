-- Phase 5A.4: Admin operations UX + metric settings foundation.
--
-- This migration introduces:
--   * One new table: group_metric_settings (per-group threshold overrides
--     and admin notes, keyed 1:1 by group_id).
--   * One seeded app_settings row keyed 'metric_defaults' holding the
--     ministry-wide capacity / health thresholds used by the dashboard.
--     The seed uses a repair-merge upsert so re-running this migration
--     never overwrites values an operator has already configured.
--   * Three SECURITY DEFINER RPCs:
--       - admin_update_metric_defaults(p_settings jsonb)
--       - admin_upsert_group_metric_settings(...)
--       - admin_change_leader_role(p_profile_id, p_new_role)
--
-- Architecture parity with Phase 5A.1 / 5A.2 / 5A.3 / 5B.0:
--   * Each function is the security boundary. RLS does NOT protect writes
--     inside the function body. Each function enforces auth_is_admin() (or
--     auth_role() = 'super_admin' for the few cases we still gate that way)
--     and auth_profile_id() is not null.
--   * Each function writes its data change AND the matching audit_events
--     row in a single transaction; if the audit insert fails, the data
--     change rolls back.
--   * No INSERT/UPDATE/DELETE policies are added; the SECURITY DEFINER
--     surface is the only write path.
--   * No hard deletes anywhere. Clearing overrides means upserting a row
--     with null fields, not deleting it.
--   * Fixed error tokens raised by these functions are mapped to friendly
--     UI strings in lib/admin/action-result.ts:
--       insufficient_privilege, invalid_input, missing_settings,
--       missing_group, missing_profile, self_target_not_allowed,
--       forbidden_target, invalid_role, no_role_change.

-- ===========================================================================
-- 1. group_metric_settings table
-- ===========================================================================

create table if not exists public.group_metric_settings (
  group_id                                uuid primary key references public.groups(id) on delete cascade,
  capacity_override                       integer,
  capacity_warning_threshold_pct_override integer,
  healthy_attendance_pct_override         integer,
  manual_health_status_override           public.group_health_status,
  exclude_from_capacity_metrics           boolean not null default false,
  admin_metric_notes                      text,
  created_at                              timestamptz not null default now(),
  updated_at                              timestamptz not null default now(),
  constraint group_metric_settings_capacity_override_bounds
    check (capacity_override is null or (capacity_override between 1 and 500)),
  constraint group_metric_settings_capacity_warning_threshold_bounds
    check (capacity_warning_threshold_pct_override is null
           or (capacity_warning_threshold_pct_override between 0 and 300)),
  constraint group_metric_settings_healthy_attendance_bounds
    check (healthy_attendance_pct_override is null
           or (healthy_attendance_pct_override between 0 and 100)),
  constraint group_metric_settings_notes_length
    check (admin_metric_notes is null or char_length(admin_metric_notes) <= 1000)
);

drop trigger if exists group_metric_settings_set_updated_at on public.group_metric_settings;
create trigger group_metric_settings_set_updated_at
  before update on public.group_metric_settings
  for each row execute function public.set_updated_at();

-- RLS: admin-only SELECT. The table holds admin_metric_notes which is
-- explicitly ministry-internal context and must never reach leader /
-- co_leader sessions. Postgres evaluates table-level grants BEFORE
-- policies, so the explicit `grant select on ... to authenticated`
-- below is required for admins to read the table at all; the RLS
-- policy then narrows that grant to admins only.
alter table public.group_metric_settings enable row level security;

drop policy if exists group_metric_settings_admin_read on public.group_metric_settings;
create policy group_metric_settings_admin_read on public.group_metric_settings
  for select to authenticated using (public.auth_is_admin());

-- No INSERT/UPDATE/DELETE policies. All writes flow through the
-- SECURITY DEFINER RPC at the bottom of this migration.

revoke all     on public.group_metric_settings from public;
revoke all     on public.group_metric_settings from anon;
revoke all     on public.group_metric_settings from authenticated;
grant  select  on public.group_metric_settings to authenticated;

comment on table public.group_metric_settings is
  'Phase 5A.4: per-group capacity/health threshold overrides and admin metric notes. Keyed 1:1 by group_id. Admin-only RLS; writes only via admin_upsert_group_metric_settings.';

-- ===========================================================================
-- 2. Seed metric_defaults into app_settings (repair-merge)
-- ===========================================================================
--
-- On first run: insert the full defaults jsonb.
-- On re-run:    only fill in keys that are missing from the stored row,
--               leaving any value an operator already changed untouched.
--               This is the meaning of `EXCLUDED.setting_value || app_settings.setting_value`:
--               the right-hand operand wins for duplicate keys in jsonb concat,
--               so existing configured values override the defaults.

insert into public.app_settings (setting_key, setting_value)
values (
  'metric_defaults',
  jsonb_build_object(
    'default_group_capacity',         null,
    'capacity_warning_threshold_pct', 80,
    'capacity_full_threshold_pct',    100,
    'check_in_due_day_of_week',       1,
    'missed_checkin_warning_weeks',   2,
    'default_healthy_attendance_pct', 60
  )
)
on conflict (setting_key) do update
  set setting_value = excluded.setting_value || public.app_settings.setting_value;

-- ===========================================================================
-- 3. RPC: admin_update_metric_defaults
-- ===========================================================================

create or replace function public.admin_update_metric_defaults(
  p_settings jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_before jsonb;
  v_merged jsonb;
  v_after  jsonb;
  v_row_id uuid;
  v_default_group_capacity         jsonb;
  v_capacity_warning_threshold_pct jsonb;
  v_capacity_full_threshold_pct    jsonb;
  v_check_in_due_day_of_week       jsonb;
  v_missed_checkin_warning_weeks   jsonb;
  v_default_healthy_attendance_pct jsonb;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;

  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then
    raise exception 'invalid_input';
  end if;

  -- Whitelist + per-key bounds. Unknown keys are ignored so a future
  -- schema addition cannot corrupt existing rows by accident. Each
  -- present key must be either null (where allowed) or an integer in
  -- range; anything else raises invalid_input.

  if p_settings ? 'default_group_capacity' then
    v_default_group_capacity := p_settings -> 'default_group_capacity';
    if jsonb_typeof(v_default_group_capacity) not in ('null','number') then
      raise exception 'invalid_input';
    end if;
    if jsonb_typeof(v_default_group_capacity) = 'number'
       and ((v_default_group_capacity)::int < 1 or (v_default_group_capacity)::int > 500) then
      raise exception 'invalid_input';
    end if;
  end if;

  if p_settings ? 'capacity_warning_threshold_pct' then
    v_capacity_warning_threshold_pct := p_settings -> 'capacity_warning_threshold_pct';
    if jsonb_typeof(v_capacity_warning_threshold_pct) <> 'number' then
      raise exception 'invalid_input';
    end if;
    if (v_capacity_warning_threshold_pct)::int < 0
       or (v_capacity_warning_threshold_pct)::int > 300 then
      raise exception 'invalid_input';
    end if;
  end if;

  if p_settings ? 'capacity_full_threshold_pct' then
    v_capacity_full_threshold_pct := p_settings -> 'capacity_full_threshold_pct';
    if jsonb_typeof(v_capacity_full_threshold_pct) <> 'number' then
      raise exception 'invalid_input';
    end if;
    if (v_capacity_full_threshold_pct)::int < 1
       or (v_capacity_full_threshold_pct)::int > 300 then
      raise exception 'invalid_input';
    end if;
  end if;

  if p_settings ? 'check_in_due_day_of_week' then
    v_check_in_due_day_of_week := p_settings -> 'check_in_due_day_of_week';
    if jsonb_typeof(v_check_in_due_day_of_week) <> 'number' then
      raise exception 'invalid_input';
    end if;
    if (v_check_in_due_day_of_week)::int < 0
       or (v_check_in_due_day_of_week)::int > 6 then
      raise exception 'invalid_input';
    end if;
  end if;

  if p_settings ? 'missed_checkin_warning_weeks' then
    v_missed_checkin_warning_weeks := p_settings -> 'missed_checkin_warning_weeks';
    if jsonb_typeof(v_missed_checkin_warning_weeks) <> 'number' then
      raise exception 'invalid_input';
    end if;
    if (v_missed_checkin_warning_weeks)::int < 1
       or (v_missed_checkin_warning_weeks)::int > 12 then
      raise exception 'invalid_input';
    end if;
  end if;

  if p_settings ? 'default_healthy_attendance_pct' then
    v_default_healthy_attendance_pct := p_settings -> 'default_healthy_attendance_pct';
    if jsonb_typeof(v_default_healthy_attendance_pct) <> 'number' then
      raise exception 'invalid_input';
    end if;
    if (v_default_healthy_attendance_pct)::int < 0
       or (v_default_healthy_attendance_pct)::int > 100 then
      raise exception 'invalid_input';
    end if;
  end if;

  -- Cross-field invariant: full % must be >= warning %. We need the
  -- effective merged values for this check, not just the submitted
  -- subset, since either field may be present in either source.
  select id, setting_value into v_row_id, v_before
    from public.app_settings
   where setting_key = 'metric_defaults'
   for update;

  if v_row_id is null then
    raise exception 'missing_settings';
  end if;

  -- Merge: submitted keys override stored keys, unspecified keys retain
  -- their existing value. Whitelist the keys we accept here so a stray
  -- top-level field can't sneak into the stored jsonb.
  v_merged := v_before;
  if p_settings ? 'default_group_capacity' then
    v_merged := v_merged || jsonb_build_object('default_group_capacity', p_settings -> 'default_group_capacity');
  end if;
  if p_settings ? 'capacity_warning_threshold_pct' then
    v_merged := v_merged || jsonb_build_object('capacity_warning_threshold_pct', p_settings -> 'capacity_warning_threshold_pct');
  end if;
  if p_settings ? 'capacity_full_threshold_pct' then
    v_merged := v_merged || jsonb_build_object('capacity_full_threshold_pct', p_settings -> 'capacity_full_threshold_pct');
  end if;
  if p_settings ? 'check_in_due_day_of_week' then
    v_merged := v_merged || jsonb_build_object('check_in_due_day_of_week', p_settings -> 'check_in_due_day_of_week');
  end if;
  if p_settings ? 'missed_checkin_warning_weeks' then
    v_merged := v_merged || jsonb_build_object('missed_checkin_warning_weeks', p_settings -> 'missed_checkin_warning_weeks');
  end if;
  if p_settings ? 'default_healthy_attendance_pct' then
    v_merged := v_merged || jsonb_build_object('default_healthy_attendance_pct', p_settings -> 'default_healthy_attendance_pct');
  end if;

  -- Final cross-field check on the merged values.
  if (v_merged -> 'capacity_full_threshold_pct') is not null
     and (v_merged -> 'capacity_warning_threshold_pct') is not null
     and (v_merged ->> 'capacity_full_threshold_pct')::int
         < (v_merged ->> 'capacity_warning_threshold_pct')::int then
    raise exception 'invalid_input';
  end if;

  update public.app_settings
     set setting_value = v_merged
   where id = v_row_id
   returning setting_value into v_after;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.update_metric_defaults',
    'app_settings',
    v_row_id,
    jsonb_build_object(
      'before', v_before,
      'after',  v_after,
      'submitted_keys', (select jsonb_agg(k) from jsonb_object_keys(p_settings) k)
    )
  );

  return v_row_id;
end;
$$;

-- ===========================================================================
-- 4. RPC: admin_upsert_group_metric_settings
-- ===========================================================================

create or replace function public.admin_upsert_group_metric_settings(
  p_group_id                                uuid,
  p_capacity_override                       integer,
  p_capacity_warning_threshold_pct_override integer,
  p_healthy_attendance_pct_override         integer,
  p_manual_health_status_override           public.group_health_status,
  p_exclude_from_capacity_metrics           boolean,
  p_admin_metric_notes                      text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_group_exists boolean;
  v_notes text;
  v_exclude boolean;
  v_before jsonb;
  v_after  jsonb;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;

  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_capacity_override is not null
     and (p_capacity_override < 1 or p_capacity_override > 500) then
    raise exception 'invalid_input';
  end if;

  if p_capacity_warning_threshold_pct_override is not null
     and (p_capacity_warning_threshold_pct_override < 0
          or p_capacity_warning_threshold_pct_override > 300) then
    raise exception 'invalid_input';
  end if;

  if p_healthy_attendance_pct_override is not null
     and (p_healthy_attendance_pct_override < 0
          or p_healthy_attendance_pct_override > 100) then
    raise exception 'invalid_input';
  end if;

  v_notes := nullif(btrim(coalesce(p_admin_metric_notes, '')), '');
  if v_notes is not null and char_length(v_notes) > 1000 then
    raise exception 'invalid_input';
  end if;

  v_exclude := coalesce(p_exclude_from_capacity_metrics, false);

  -- Lock the parent group row to serialize concurrent override writes
  -- against the same group, and to confirm the group still exists.
  select true into v_group_exists
    from public.groups
   where id = p_group_id
   for update;

  if v_group_exists is null or v_group_exists = false then
    raise exception 'missing_group';
  end if;

  select jsonb_build_object(
           'capacity_override', capacity_override,
           'capacity_warning_threshold_pct_override', capacity_warning_threshold_pct_override,
           'healthy_attendance_pct_override', healthy_attendance_pct_override,
           'manual_health_status_override', manual_health_status_override,
           'exclude_from_capacity_metrics', exclude_from_capacity_metrics,
           'admin_metric_notes', admin_metric_notes
         )
    into v_before
    from public.group_metric_settings
   where group_id = p_group_id;

  insert into public.group_metric_settings (
    group_id,
    capacity_override,
    capacity_warning_threshold_pct_override,
    healthy_attendance_pct_override,
    manual_health_status_override,
    exclude_from_capacity_metrics,
    admin_metric_notes
  )
  values (
    p_group_id,
    p_capacity_override,
    p_capacity_warning_threshold_pct_override,
    p_healthy_attendance_pct_override,
    p_manual_health_status_override,
    v_exclude,
    v_notes
  )
  on conflict (group_id) do update
    set capacity_override                       = excluded.capacity_override,
        capacity_warning_threshold_pct_override = excluded.capacity_warning_threshold_pct_override,
        healthy_attendance_pct_override         = excluded.healthy_attendance_pct_override,
        manual_health_status_override           = excluded.manual_health_status_override,
        exclude_from_capacity_metrics           = excluded.exclude_from_capacity_metrics,
        admin_metric_notes                      = excluded.admin_metric_notes;

  v_after := jsonb_build_object(
    'capacity_override', p_capacity_override,
    'capacity_warning_threshold_pct_override', p_capacity_warning_threshold_pct_override,
    'healthy_attendance_pct_override', p_healthy_attendance_pct_override,
    'manual_health_status_override', p_manual_health_status_override,
    'exclude_from_capacity_metrics', v_exclude,
    'admin_metric_notes', v_notes
  );

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.upsert_group_metric_settings',
    'group_metric_settings',
    p_group_id,
    jsonb_build_object(
      'before', coalesce(v_before, jsonb_build_object()),
      'after',  v_after
    )
  );

  return p_group_id;
end;
$$;

-- ===========================================================================
-- 5. RPC: admin_change_leader_role
-- ===========================================================================
--
-- Ministry-admin-safe role swap, narrowly scoped to leader <-> co_leader.
-- This is intentionally NOT a generalization of super_admin_update_profile_role
-- (Phase 5A.3) -- super_admin retains its own broader function. The new
-- function:
--   * Accepts super_admin OR ministry_admin actors via auth_is_admin().
--   * Refuses any target whose current role is not leader / co_leader, so
--     ministry_admin / super_admin / staff_viewer accounts can never be
--     touched here.
--   * Refuses any new role outside leader / co_leader (rejects
--     super_admin / ministry_admin / staff_viewer assignments).
--   * Updates profiles.role only. group_leaders rows are NOT modified --
--     per-group leader/co-leader assignment remains handled by
--     admin_assign_leader_to_group.

create or replace function public.admin_change_leader_role(
  p_profile_id uuid,
  p_new_role   public.user_role
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor    uuid;
  v_old_role public.user_role;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;

  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_profile_id = v_actor then
    raise exception 'self_target_not_allowed';
  end if;

  if p_new_role not in ('leader'::public.user_role, 'co_leader'::public.user_role) then
    raise exception 'invalid_role';
  end if;

  select role into v_old_role
    from public.profiles
   where id = p_profile_id
   for update;

  if v_old_role is null then
    raise exception 'missing_profile';
  end if;

  if v_old_role not in ('leader'::public.user_role, 'co_leader'::public.user_role) then
    raise exception 'forbidden_target';
  end if;

  if v_old_role = p_new_role then
    raise exception 'no_role_change';
  end if;

  update public.profiles
     set role = p_new_role
   where id = p_profile_id;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.change_leader_role',
    'profiles',
    p_profile_id,
    jsonb_build_object(
      'before', jsonb_build_object('role', v_old_role),
      'after',  jsonb_build_object('role', p_new_role)
    )
  );

  return p_profile_id;
end;
$$;

-- ===========================================================================
-- 6. Grants. Revoke from public/anon/authenticated, then grant execute to
-- authenticated. The function bodies enforce the role gate; granting
-- execute to authenticated only makes the functions callable.
-- ===========================================================================

revoke all on function public.admin_update_metric_defaults(jsonb) from public;
revoke all on function public.admin_update_metric_defaults(jsonb) from anon;
revoke all on function public.admin_update_metric_defaults(jsonb) from authenticated;
grant  execute on function public.admin_update_metric_defaults(jsonb) to authenticated;

revoke all on function public.admin_upsert_group_metric_settings(uuid, integer, integer, integer, public.group_health_status, boolean, text) from public;
revoke all on function public.admin_upsert_group_metric_settings(uuid, integer, integer, integer, public.group_health_status, boolean, text) from anon;
revoke all on function public.admin_upsert_group_metric_settings(uuid, integer, integer, integer, public.group_health_status, boolean, text) from authenticated;
grant  execute on function public.admin_upsert_group_metric_settings(uuid, integer, integer, integer, public.group_health_status, boolean, text) to authenticated;

revoke all on function public.admin_change_leader_role(uuid, public.user_role) from public;
revoke all on function public.admin_change_leader_role(uuid, public.user_role) from anon;
revoke all on function public.admin_change_leader_role(uuid, public.user_role) from authenticated;
grant  execute on function public.admin_change_leader_role(uuid, public.user_role) to authenticated;

comment on function public.admin_update_metric_defaults(jsonb) is
  'Phase 5A.4 admin write: merges submitted keys into app_settings.metric_defaults, validates per-key bounds, writes a paired audit_events row.';
comment on function public.admin_upsert_group_metric_settings(uuid, integer, integer, integer, public.group_health_status, boolean, text) is
  'Phase 5A.4 admin write: upserts a group_metric_settings row for a group, validates bounds, writes a paired audit_events row. Clears overrides by passing all nulls.';
comment on function public.admin_change_leader_role(uuid, public.user_role) is
  'Phase 5A.4 admin write: swaps profiles.role between leader and co_leader for actors with admin role. Target must currently be leader/co_leader; does not touch group_leaders rows. Writes a paired audit_events row.';
