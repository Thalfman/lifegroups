-- Julian feedback Q5 (PRD Q5 / ADR 0004 D3): per-tier shepherd-care cadence.
-- RESOLVED in grill 2026-05-30 (docs PR #130): per-tier staleness windows,
-- admin-only clock for now.
--
-- Replaces the single app_settings.metric_defaults.shepherd_care_stale_days
-- with two windows keyed by coverage tier (derived from
-- shepherd_coverage_assignments — no new per-group field):
--   * shepherd_care_stale_days_direct     — directly-overseen (falls to the
--                                            Ministry Admin). Shorter, 30.
--   * shepherd_care_stale_days_delegated  — delegated (active over-shepherd
--                                            assignment). Longer, 60.
-- Both configurable, bounds 7..365. Mirrors lib/admin/metrics.ts
-- BUILT_IN_METRIC_DEFAULTS — if you change one, change the other.
--
-- The staleness clock still resets on Ministry-Admin interactions only;
-- over-shepherds have no write path yet (#126). This migration only reshapes
-- the configurable windows + the audited admin write path — no new write RLS,
-- each write still pairs an audit_events row, no hard deletes.

-- ---------------------------------------------------------------------------
-- 1. Seed the two new keys, then drop the superseded single key.
--    Repair-merge: only fill a key that isn't already configured. The
--    delegated window inherits any operator-configured single window (the old
--    window applied to everyone and equalled the delegated default), so an
--    operator who had tuned it keeps that value on the delegated tier.
-- ---------------------------------------------------------------------------

update public.app_settings
   set setting_value = setting_value
     || jsonb_build_object(
          'shepherd_care_stale_days_delegated',
          coalesce((setting_value ->> 'shepherd_care_stale_days')::int, 60)
        )
 where setting_key = 'metric_defaults'
   and not (setting_value ? 'shepherd_care_stale_days_delegated');

update public.app_settings
   set setting_value = setting_value
     || jsonb_build_object('shepherd_care_stale_days_direct', 30)
 where setting_key = 'metric_defaults'
   and not (setting_value ? 'shepherd_care_stale_days_direct');

update public.app_settings
   set setting_value = setting_value - 'shepherd_care_stale_days'
 where setting_key = 'metric_defaults'
   and (setting_value ? 'shepherd_care_stale_days');

-- ---------------------------------------------------------------------------
-- 2. Recreate admin_update_metric_defaults (latest definition is
--    20260528120000_julian_p1_shepherd_care_stale_days.sql) swapping the
--    single shepherd_care_stale_days whitelist/bounds/merge for the two
--    per-tier keys. Parameter list is unchanged (single jsonb), so
--    create-or-replace is sufficient and preserves the EXECUTE grants.
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
    if jsonb_typeof(p_settings -> 'default_group_capacity') not in ('null','number') then
      raise exception 'invalid_input';
    end if;
    if jsonb_typeof(p_settings -> 'default_group_capacity') = 'number' then
      v_int := (p_settings ->> 'default_group_capacity')::int;
      if v_int < 1 or v_int > 500 then
        raise exception 'invalid_input';
      end if;
    end if;
  end if;

  if p_settings ? 'capacity_warning_threshold_pct' then
    if jsonb_typeof(p_settings -> 'capacity_warning_threshold_pct') <> 'number' then
      raise exception 'invalid_input';
    end if;
    v_int := (p_settings ->> 'capacity_warning_threshold_pct')::int;
    if v_int < 0 or v_int > 300 then
      raise exception 'invalid_input';
    end if;
  end if;

  if p_settings ? 'capacity_full_threshold_pct' then
    if jsonb_typeof(p_settings -> 'capacity_full_threshold_pct') <> 'number' then
      raise exception 'invalid_input';
    end if;
    v_int := (p_settings ->> 'capacity_full_threshold_pct')::int;
    if v_int < 1 or v_int > 300 then
      raise exception 'invalid_input';
    end if;
  end if;

  if p_settings ? 'check_in_due_day_of_week' then
    if jsonb_typeof(p_settings -> 'check_in_due_day_of_week') <> 'number' then
      raise exception 'invalid_input';
    end if;
    v_int := (p_settings ->> 'check_in_due_day_of_week')::int;
    if v_int < 0 or v_int > 6 then
      raise exception 'invalid_input';
    end if;
  end if;

  if p_settings ? 'missed_checkin_warning_weeks' then
    if jsonb_typeof(p_settings -> 'missed_checkin_warning_weeks') <> 'number' then
      raise exception 'invalid_input';
    end if;
    v_int := (p_settings ->> 'missed_checkin_warning_weeks')::int;
    if v_int < 1 or v_int > 12 then
      raise exception 'invalid_input';
    end if;
  end if;

  if p_settings ? 'default_healthy_attendance_pct' then
    if jsonb_typeof(p_settings -> 'default_healthy_attendance_pct') <> 'number' then
      raise exception 'invalid_input';
    end if;
    v_int := (p_settings ->> 'default_healthy_attendance_pct')::int;
    if v_int < 0 or v_int > 100 then
      raise exception 'invalid_input';
    end if;
  end if;

  if p_settings ? 'check_in_due_offset_hours' then
    if jsonb_typeof(p_settings -> 'check_in_due_offset_hours') <> 'number' then
      raise exception 'invalid_input';
    end if;
    v_int := (p_settings ->> 'check_in_due_offset_hours')::int;
    if v_int < 0 or v_int > 336 then
      raise exception 'invalid_input';
    end if;
  end if;

  -- Julian Q5: per-tier staleness windows. Both 7 .. 365 days.
  if p_settings ? 'shepherd_care_stale_days_direct' then
    if jsonb_typeof(p_settings -> 'shepherd_care_stale_days_direct') <> 'number' then
      raise exception 'invalid_input';
    end if;
    v_int := (p_settings ->> 'shepherd_care_stale_days_direct')::int;
    if v_int < 7 or v_int > 365 then
      raise exception 'invalid_input';
    end if;
  end if;

  if p_settings ? 'shepherd_care_stale_days_delegated' then
    if jsonb_typeof(p_settings -> 'shepherd_care_stale_days_delegated') <> 'number' then
      raise exception 'invalid_input';
    end if;
    v_int := (p_settings ->> 'shepherd_care_stale_days_delegated')::int;
    if v_int < 7 or v_int > 365 then
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
  if p_settings ? 'shepherd_care_stale_days_direct' then
    v_merged := v_merged || jsonb_build_object('shepherd_care_stale_days_direct', p_settings -> 'shepherd_care_stale_days_direct');
  end if;
  if p_settings ? 'shepherd_care_stale_days_delegated' then
    v_merged := v_merged || jsonb_build_object('shepherd_care_stale_days_delegated', p_settings -> 'shepherd_care_stale_days_delegated');
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
  'Julian Q5 admin write: merges submitted keys (including the per-tier shepherd_care_stale_days_direct / _delegated windows) into app_settings.metric_defaults, validates per-key bounds, writes a paired audit_events row.';

-- ---------------------------------------------------------------------------
-- 3. Recreate admin_reset_metric_defaults (latest definition is
--    20260528130000_julian_p2_capacity.sql) so the baseline carries the two
--    per-tier windows instead of the single one. Mirrors
--    lib/admin/metrics.ts BUILT_IN_METRIC_DEFAULTS.
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
    'default_group_capacity',             12,
    'capacity_warning_threshold_pct',     80,
    'capacity_full_threshold_pct',        100,
    'check_in_due_day_of_week',           1,
    'missed_checkin_warning_weeks',       2,
    'default_healthy_attendance_pct',     60,
    'check_in_due_offset_hours',          24,
    'shepherd_care_stale_days_direct',    30,
    'shepherd_care_stale_days_delegated', 60
  );

  select id, setting_value into v_row_id, v_before
    from public.app_settings
   where setting_key = 'metric_defaults'
   for update;

  if v_row_id is null then
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
  'Julian Q5 admin write: restores app_settings.metric_defaults to the documented baseline (now including the per-tier shepherd_care_stale_days_direct 30 / _delegated 60). Does NOT touch group_metric_settings overrides. Writes a paired audit_events row.';
