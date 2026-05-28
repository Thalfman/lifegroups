-- Julian feedback P2: capacity default = 12 and "kept open past 12".
--
-- Julian's systems conversation (answer 10): "We consider a group full
-- after 12 members, but give the leaders and the group the option to keep
-- it opened if they'd like."
--
-- This migration:
--   1. Sets the ministry-wide default_group_capacity to 12 (only when no
--      operator value is configured yet) so groups without an explicit
--      capacity are measured against 12.
--   2. Adds a per-group allow_over_capacity flag so a group that has hit
--      capacity but is intentionally still accepting members is no longer
--      flagged as "full" needing action. It stays counted in metrics.
--   3. Extends admin_upsert_group_metric_settings with the new flag.
--   4. Updates the reset baseline to mirror BUILT_IN_METRIC_DEFAULTS
--      (default_group_capacity 12, shepherd_care_stale_days 60).
--
-- Architecture parity with Phase 5A.4 / 5A.5: SECURITY DEFINER is the only
-- write path, each write pairs an audit_events row, no new write RLS, no
-- hard deletes.

-- ---------------------------------------------------------------------------
-- 1. Default group capacity = 12 (fill only when unset / JSON null).
-- ---------------------------------------------------------------------------

update public.app_settings
   set setting_value = setting_value
                     || jsonb_build_object('default_group_capacity', 12)
 where setting_key = 'metric_defaults'
   and (
     (setting_value -> 'default_group_capacity') is null
     or (setting_value -> 'default_group_capacity') = 'null'::jsonb
   );

-- ---------------------------------------------------------------------------
-- 2. Per-group allow_over_capacity flag.
-- ---------------------------------------------------------------------------

alter table public.group_metric_settings
  add column if not exists allow_over_capacity boolean not null default false;

comment on column public.group_metric_settings.allow_over_capacity is
  'Julian P2: when true, a group at/over its effective capacity is reported as "open by choice" rather than "full" — still counted in capacity metrics, but not flagged as needing action. Mirrors Julian answer 10 (leaders may keep a full group open).';

-- ---------------------------------------------------------------------------
-- 3. Recreate admin_upsert_group_metric_settings with the new flag as a
--    trailing parameter. Drop the prior 8-arg signature first.
-- ---------------------------------------------------------------------------

drop function if exists public.admin_upsert_group_metric_settings(
  uuid, integer, integer, integer, public.group_health_status, boolean, text, integer
);

create or replace function public.admin_upsert_group_metric_settings(
  p_group_id                                uuid,
  p_capacity_override                       integer,
  p_capacity_warning_threshold_pct_override integer,
  p_healthy_attendance_pct_override         integer,
  p_manual_health_status_override           public.group_health_status,
  p_exclude_from_capacity_metrics           boolean,
  p_admin_metric_notes                      text,
  p_check_in_due_offset_hours_override      integer,
  p_allow_over_capacity                     boolean
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
  v_allow_over boolean;
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
  v_allow_over := coalesce(p_allow_over_capacity, false);

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
           'check_in_due_offset_hours_override', check_in_due_offset_hours_override,
           'allow_over_capacity', allow_over_capacity
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
    check_in_due_offset_hours_override,
    allow_over_capacity
  )
  values (
    p_group_id,
    p_capacity_override,
    p_capacity_warning_threshold_pct_override,
    p_healthy_attendance_pct_override,
    p_manual_health_status_override,
    v_exclude,
    v_notes,
    p_check_in_due_offset_hours_override,
    v_allow_over
  )
  on conflict (group_id) do update
    set capacity_override                       = excluded.capacity_override,
        capacity_warning_threshold_pct_override = excluded.capacity_warning_threshold_pct_override,
        healthy_attendance_pct_override         = excluded.healthy_attendance_pct_override,
        manual_health_status_override           = excluded.manual_health_status_override,
        exclude_from_capacity_metrics           = excluded.exclude_from_capacity_metrics,
        admin_metric_notes                      = excluded.admin_metric_notes,
        check_in_due_offset_hours_override      = excluded.check_in_due_offset_hours_override,
        allow_over_capacity                     = excluded.allow_over_capacity;

  v_after := jsonb_build_object(
    'capacity_override', p_capacity_override,
    'capacity_warning_threshold_pct_override', p_capacity_warning_threshold_pct_override,
    'healthy_attendance_pct_override', p_healthy_attendance_pct_override,
    'manual_health_status_override', p_manual_health_status_override,
    'exclude_from_capacity_metrics', v_exclude,
    'admin_metric_notes', v_notes,
    'check_in_due_offset_hours_override', p_check_in_due_offset_hours_override,
    'allow_over_capacity', v_allow_over
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
  uuid, integer, integer, integer, public.group_health_status, boolean, text, integer, boolean
) from public;
revoke all on function public.admin_upsert_group_metric_settings(
  uuid, integer, integer, integer, public.group_health_status, boolean, text, integer, boolean
) from anon;
revoke all on function public.admin_upsert_group_metric_settings(
  uuid, integer, integer, integer, public.group_health_status, boolean, text, integer, boolean
) from authenticated;
grant  execute on function public.admin_upsert_group_metric_settings(
  uuid, integer, integer, integer, public.group_health_status, boolean, text, integer, boolean
) to authenticated;

comment on function public.admin_upsert_group_metric_settings(
  uuid, integer, integer, integer, public.group_health_status, boolean, text, integer, boolean
) is
  'Julian P2 admin write: upserts a group_metric_settings row including the allow_over_capacity flag. Pass null overrides to fall back to the global default. Writes a paired audit_events row.';

-- ---------------------------------------------------------------------------
-- 4. Update the reset baseline so default_group_capacity is 12.
--    Mirrors lib/admin/metrics.ts BUILT_IN_METRIC_DEFAULTS.
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
    'default_group_capacity',         12,
    'capacity_warning_threshold_pct', 80,
    'capacity_full_threshold_pct',    100,
    'check_in_due_day_of_week',       1,
    'missed_checkin_warning_weeks',   2,
    'default_healthy_attendance_pct', 60,
    'check_in_due_offset_hours',      24,
    'shepherd_care_stale_days',       60
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
  'Julian P2 admin write: restores app_settings.metric_defaults to the documented baseline (default_group_capacity 12). Does NOT touch group_metric_settings overrides. Writes a paired audit_events row.';
