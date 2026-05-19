-- Phase 5A.5 (admin UX + schedule intelligence): per-group check-in due
-- offset, reset-to-defaults RPC, and metric defaults schema additions.
--
-- This migration adds:
--   * A new metric default key `check_in_due_offset_hours` (integer, default 24)
--     stored in app_settings.metric_defaults. The dashboard / leader workflow
--     compute each group's check-in due moment from the group's
--     meeting_day + meeting_time PLUS this offset, instead of the legacy
--     global `check_in_due_day_of_week`. The legacy key stays in the row
--     for compatibility but is no longer the source of truth for
--     leader-facing due messaging.
--   * A new optional per-group override column
--     `check_in_due_offset_hours_override` on group_metric_settings so an
--     admin can extend a single group's due window without bumping the
--     global default. Null means "follow the global default".
--   * A SECURITY DEFINER RPC `admin_reset_metric_defaults()` that snapshots
--     the prior settings, restores the baseline defaults, and writes a
--     paired audit_events row. Per-group overrides are deliberately NOT
--     touched.
--   * The existing `admin_update_metric_defaults(jsonb)` is extended to
--     accept the new `check_in_due_offset_hours` key with the same
--     whitelist / bounds pattern as its siblings.
--   * The existing `admin_upsert_group_metric_settings(...)` is extended
--     with a new trailing parameter `p_check_in_due_offset_hours_override`
--     so the override surface stays inside the same RPC.
--
-- Architecture parity with Phase 5A.2 / 5A.4:
--   * No service_role usage in app code. No broad write RLS policies.
--   * Each function is the security boundary and enforces auth_is_admin().
--   * Each function writes its data change AND the matching audit_events
--     row in the same transaction.
--   * No INSERT/UPDATE/DELETE policies added; SECURITY DEFINER is the
--     only write path. No hard deletes.
--   * staff_viewer is not revived.

-- ---------------------------------------------------------------------------
-- 1. Per-group check-in due offset override column.
-- ---------------------------------------------------------------------------

alter table public.group_metric_settings
  add column if not exists check_in_due_offset_hours_override integer;

-- Bounds: 0 means "due immediately when the meeting ends", up to 14 days.
-- Hard cap of 14 * 24 = 336 hours so a stray very-large value can't make
-- the dashboard claim a group is overdue for never-ending grace periods.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'group_metric_settings_check_in_due_offset_bounds'
  ) then
    alter table public.group_metric_settings
      add constraint group_metric_settings_check_in_due_offset_bounds
        check (
          check_in_due_offset_hours_override is null
          or (check_in_due_offset_hours_override between 0 and 336)
        );
  end if;
end$$;

comment on column public.group_metric_settings.check_in_due_offset_hours_override is
  'Phase 5A.5: per-group override (in hours) for how long after the scheduled meeting time a check-in is due. Null = follow the global default in app_settings.metric_defaults.check_in_due_offset_hours.';

-- ---------------------------------------------------------------------------
-- 2. Seed `check_in_due_offset_hours` into the metric_defaults row.
-- ---------------------------------------------------------------------------
--
-- Repair-merge upsert: if the row exists and already has this key, leave
-- the operator's value alone. Otherwise insert the 24-hour default.

update public.app_settings
   set setting_value = setting_value
                     || jsonb_build_object('check_in_due_offset_hours', 24)
 where setting_key = 'metric_defaults'
   and not (setting_value ? 'check_in_due_offset_hours');

-- ---------------------------------------------------------------------------
-- 3. Recreate `admin_update_metric_defaults` to accept the new key.
--
-- `create or replace function` is enough here — the parameter list is
-- unchanged (still a single `jsonb` argument). We extend the whitelist
-- and merge logic only.
-- ---------------------------------------------------------------------------

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
  v_check_in_due_offset_hours      jsonb;
  v_int int;
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

  if p_settings ? 'default_group_capacity' then
    v_default_group_capacity := p_settings -> 'default_group_capacity';
    if jsonb_typeof(v_default_group_capacity) not in ('null','number') then
      raise exception 'invalid_input';
    end if;
    if jsonb_typeof(v_default_group_capacity) = 'number' then
      v_int := (p_settings ->> 'default_group_capacity')::int;
      if v_int < 1 or v_int > 500 then
        raise exception 'invalid_input';
      end if;
    end if;
  end if;

  if p_settings ? 'capacity_warning_threshold_pct' then
    v_capacity_warning_threshold_pct := p_settings -> 'capacity_warning_threshold_pct';
    if jsonb_typeof(v_capacity_warning_threshold_pct) <> 'number' then
      raise exception 'invalid_input';
    end if;
    v_int := (p_settings ->> 'capacity_warning_threshold_pct')::int;
    if v_int < 0 or v_int > 300 then
      raise exception 'invalid_input';
    end if;
  end if;

  if p_settings ? 'capacity_full_threshold_pct' then
    v_capacity_full_threshold_pct := p_settings -> 'capacity_full_threshold_pct';
    if jsonb_typeof(v_capacity_full_threshold_pct) <> 'number' then
      raise exception 'invalid_input';
    end if;
    v_int := (p_settings ->> 'capacity_full_threshold_pct')::int;
    if v_int < 1 or v_int > 300 then
      raise exception 'invalid_input';
    end if;
  end if;

  if p_settings ? 'check_in_due_day_of_week' then
    v_check_in_due_day_of_week := p_settings -> 'check_in_due_day_of_week';
    if jsonb_typeof(v_check_in_due_day_of_week) <> 'number' then
      raise exception 'invalid_input';
    end if;
    v_int := (p_settings ->> 'check_in_due_day_of_week')::int;
    if v_int < 0 or v_int > 6 then
      raise exception 'invalid_input';
    end if;
  end if;

  if p_settings ? 'missed_checkin_warning_weeks' then
    v_missed_checkin_warning_weeks := p_settings -> 'missed_checkin_warning_weeks';
    if jsonb_typeof(v_missed_checkin_warning_weeks) <> 'number' then
      raise exception 'invalid_input';
    end if;
    v_int := (p_settings ->> 'missed_checkin_warning_weeks')::int;
    if v_int < 1 or v_int > 12 then
      raise exception 'invalid_input';
    end if;
  end if;

  if p_settings ? 'default_healthy_attendance_pct' then
    v_default_healthy_attendance_pct := p_settings -> 'default_healthy_attendance_pct';
    if jsonb_typeof(v_default_healthy_attendance_pct) <> 'number' then
      raise exception 'invalid_input';
    end if;
    v_int := (p_settings ->> 'default_healthy_attendance_pct')::int;
    if v_int < 0 or v_int > 100 then
      raise exception 'invalid_input';
    end if;
  end if;

  -- Phase 5A.5: check_in_due_offset_hours. 0 .. 336 (= 14 days). Matches
  -- the per-group override bounds so global + override stay aligned.
  if p_settings ? 'check_in_due_offset_hours' then
    v_check_in_due_offset_hours := p_settings -> 'check_in_due_offset_hours';
    if jsonb_typeof(v_check_in_due_offset_hours) <> 'number' then
      raise exception 'invalid_input';
    end if;
    v_int := (p_settings ->> 'check_in_due_offset_hours')::int;
    if v_int < 0 or v_int > 336 then
      raise exception 'invalid_input';
    end if;
  end if;

  select id, setting_value into v_row_id, v_before
    from public.app_settings
   where setting_key = 'metric_defaults'
   for update;

  if v_row_id is null then
    raise exception 'missing_settings';
  end if;

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
  if p_settings ? 'check_in_due_offset_hours' then
    v_merged := v_merged || jsonb_build_object('check_in_due_offset_hours', p_settings -> 'check_in_due_offset_hours');
  end if;

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

revoke all on function public.admin_update_metric_defaults(jsonb) from public;
revoke all on function public.admin_update_metric_defaults(jsonb) from anon;
revoke all on function public.admin_update_metric_defaults(jsonb) from authenticated;
grant  execute on function public.admin_update_metric_defaults(jsonb) to authenticated;

comment on function public.admin_update_metric_defaults(jsonb) is
  'Phase 5A.5 admin write: merges submitted keys (including check_in_due_offset_hours) into app_settings.metric_defaults, validates per-key bounds, writes a paired audit_events row.';

-- ---------------------------------------------------------------------------
-- 4. New SECURITY DEFINER RPC: admin_reset_metric_defaults().
--
-- Restores the documented baseline metric defaults. Per-group overrides
-- in group_metric_settings are NOT touched -- the UI explicitly states
-- this so admins know to clear overrides separately if they want a
-- truly clean slate. The baseline mirrors lib/admin/metrics.ts
-- BUILT_IN_METRIC_DEFAULTS so the source of truth in the app and the
-- value the RPC writes can't drift apart silently. If you change one,
-- change the other.
-- ---------------------------------------------------------------------------

create or replace function public.admin_reset_metric_defaults()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_row_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_baseline jsonb;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;

  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  v_baseline := jsonb_build_object(
    'default_group_capacity',         null,
    'capacity_warning_threshold_pct', 80,
    'capacity_full_threshold_pct',    100,
    'check_in_due_day_of_week',       1,
    'missed_checkin_warning_weeks',   2,
    'default_healthy_attendance_pct', 60,
    'check_in_due_offset_hours',      24
  );

  select id, setting_value into v_row_id, v_before
    from public.app_settings
   where setting_key = 'metric_defaults'
   for update;

  if v_row_id is null then
    -- No row to reset: insert the baseline so callers always get a row id back.
    insert into public.app_settings (setting_key, setting_value)
    values ('metric_defaults', v_baseline)
    returning id, setting_value into v_row_id, v_after;
  else
    update public.app_settings
       set setting_value = v_baseline
     where id = v_row_id
     returning setting_value into v_after;
  end if;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.reset_metric_defaults',
    'app_settings',
    v_row_id,
    jsonb_build_object(
      'before', coalesce(v_before, jsonb_build_object()),
      'after',  v_after
    )
  );

  return v_row_id;
end;
$$;

revoke all on function public.admin_reset_metric_defaults() from public;
revoke all on function public.admin_reset_metric_defaults() from anon;
revoke all on function public.admin_reset_metric_defaults() from authenticated;
grant  execute on function public.admin_reset_metric_defaults() to authenticated;

comment on function public.admin_reset_metric_defaults() is
  'Phase 5A.5 admin write: restores app_settings.metric_defaults to the documented baseline. Does NOT touch group_metric_settings overrides. Writes a paired audit_events row.';

-- ---------------------------------------------------------------------------
-- 5. Recreate `admin_upsert_group_metric_settings` to accept the per-group
--    check-in due offset override.
-- ---------------------------------------------------------------------------

drop function if exists public.admin_upsert_group_metric_settings(
  uuid, integer, integer, integer, public.group_health_status, boolean, text
);

create or replace function public.admin_upsert_group_metric_settings(
  p_group_id                                uuid,
  p_capacity_override                       integer,
  p_capacity_warning_threshold_pct_override integer,
  p_healthy_attendance_pct_override         integer,
  p_manual_health_status_override           public.group_health_status,
  p_exclude_from_capacity_metrics           boolean,
  p_admin_metric_notes                      text,
  p_check_in_due_offset_hours_override      integer
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

  if p_check_in_due_offset_hours_override is not null
     and (p_check_in_due_offset_hours_override < 0
          or p_check_in_due_offset_hours_override > 336) then
    raise exception 'invalid_input';
  end if;

  v_notes := nullif(btrim(coalesce(p_admin_metric_notes, '')), '');
  if v_notes is not null and char_length(v_notes) > 1000 then
    raise exception 'invalid_input';
  end if;

  v_exclude := coalesce(p_exclude_from_capacity_metrics, false);

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
           'admin_metric_notes', admin_metric_notes,
           'check_in_due_offset_hours_override', check_in_due_offset_hours_override
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
    admin_metric_notes,
    check_in_due_offset_hours_override
  )
  values (
    p_group_id,
    p_capacity_override,
    p_capacity_warning_threshold_pct_override,
    p_healthy_attendance_pct_override,
    p_manual_health_status_override,
    v_exclude,
    v_notes,
    p_check_in_due_offset_hours_override
  )
  on conflict (group_id) do update
    set capacity_override                       = excluded.capacity_override,
        capacity_warning_threshold_pct_override = excluded.capacity_warning_threshold_pct_override,
        healthy_attendance_pct_override         = excluded.healthy_attendance_pct_override,
        manual_health_status_override           = excluded.manual_health_status_override,
        exclude_from_capacity_metrics           = excluded.exclude_from_capacity_metrics,
        admin_metric_notes                      = excluded.admin_metric_notes,
        check_in_due_offset_hours_override      = excluded.check_in_due_offset_hours_override;

  v_after := jsonb_build_object(
    'capacity_override', p_capacity_override,
    'capacity_warning_threshold_pct_override', p_capacity_warning_threshold_pct_override,
    'healthy_attendance_pct_override', p_healthy_attendance_pct_override,
    'manual_health_status_override', p_manual_health_status_override,
    'exclude_from_capacity_metrics', v_exclude,
    'admin_metric_notes', v_notes,
    'check_in_due_offset_hours_override', p_check_in_due_offset_hours_override
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

revoke all on function public.admin_upsert_group_metric_settings(
  uuid, integer, integer, integer, public.group_health_status, boolean, text, integer
) from public;
revoke all on function public.admin_upsert_group_metric_settings(
  uuid, integer, integer, integer, public.group_health_status, boolean, text, integer
) from anon;
revoke all on function public.admin_upsert_group_metric_settings(
  uuid, integer, integer, integer, public.group_health_status, boolean, text, integer
) from authenticated;
grant  execute on function public.admin_upsert_group_metric_settings(
  uuid, integer, integer, integer, public.group_health_status, boolean, text, integer
) to authenticated;

comment on function public.admin_upsert_group_metric_settings(
  uuid, integer, integer, integer, public.group_health_status, boolean, text, integer
) is
  'Phase 5A.5 admin write: upserts a group_metric_settings row including the per-group check-in due offset override. Pass null overrides to fall back to the global default. Writes a paired audit_events row.';
