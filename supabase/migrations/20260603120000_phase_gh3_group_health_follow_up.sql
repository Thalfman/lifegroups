-- Group-Health triage final filter logic (Admin IM 05 / #265). PRD Q12 /
-- ADR 0004 D8. Director sign-off resolved Open Question 1 on 2026-06-03.
--
-- The step-04 shell shipped only the ungated filters (Not assessed, Needs
-- rating). This slice lands the two gated filters the director confirmed:
--
--   * Needs follow-up — a per-assessment open flag. The flag does not exist
--     yet, so it is BUILT here: a boolean column on group_health_assessments
--     plus the audited write path that sets/clears it (folded into the existing
--     set-ratings RPC, so the editor drawer's checkbox persists on the same
--     save). No service-role at runtime; SECURITY DEFINER, paired audit row.
--   * Watch grade threshold (default C) and the attendance decline margin
--     (default 10 pts) — director-tuned, sourced from app_settings.metric_defaults
--     (not hard-coded), so admin_update_metric_defaults / _reset learn the two
--     new keys. The Watch/declining math itself runs in TS (lib/admin/*), like
--     the rest of the rubric.
--
-- Architecture parity with the #127/#128 write path: admin-only guard,
-- SECURITY DEFINER, paired audit_events, no service-role writes, no hard deletes.

-- ---------------------------------------------------------------------------
-- 1. needs_follow_up flag on the assessment row.
-- ---------------------------------------------------------------------------

alter table public.group_health_assessments
  add column if not exists needs_follow_up boolean not null default false;

comment on column public.group_health_assessments.needs_follow_up is
  'Admin IM 05 (#265): the director''s open follow-up flag for the month''s assessment. Drives the "Needs follow-up" triage filter. Set/cleared via admin_set_group_health_ratings.';

-- ---------------------------------------------------------------------------
-- 2. Recreate admin_set_group_health_ratings with the needs_follow_up input.
--    The parameter list changes (a new trailing boolean), so the prior
--    overload is dropped first — create-or-replace cannot change a signature.
-- ---------------------------------------------------------------------------

drop function if exists public.admin_set_group_health_ratings(
  uuid, date, smallint, text, smallint, numeric, integer, numeric, text
);

create or replace function public.admin_set_group_health_ratings(
  p_group_id                 uuid,
  p_period_month             date,
  p_spiritual_growth_score   smallint,
  p_spiritual_growth_note    text,
  p_group_question_score     smallint,
  p_needs_follow_up          boolean,
  p_attendance_pct           numeric,
  p_attendance_weeks_counted integer,
  p_computed_numeric         numeric,
  p_computed_letter          text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_group_exists boolean;
  v_period date;
  v_weeks integer;
  v_follow_up boolean;
  v_before jsonb;
  v_id uuid;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_period_month is null then
    raise exception 'invalid_input';
  end if;
  -- Normalize to the first of the month so callers can pass any day in it.
  v_period := date_trunc('month', p_period_month)::date;

  -- Both ratings are optional (the admin may set one before the other), but a
  -- supplied rating must be a calibrated 1-5.
  if p_spiritual_growth_score is not null
     and (p_spiritual_growth_score < 1 or p_spiritual_growth_score > 5) then
    raise exception 'invalid_input';
  end if;
  if p_group_question_score is not null
     and (p_group_question_score < 1 or p_group_question_score > 5) then
    raise exception 'invalid_input';
  end if;
  if p_spiritual_growth_note is not null and char_length(p_spiritual_growth_note) > 2000 then
    raise exception 'invalid_input';
  end if;
  if p_attendance_pct is not null and (p_attendance_pct < 0 or p_attendance_pct > 100) then
    raise exception 'invalid_input';
  end if;
  if p_computed_numeric is not null and (p_computed_numeric < 0 or p_computed_numeric > 100) then
    raise exception 'invalid_input';
  end if;
  if p_computed_letter is not null and p_computed_letter not in ('A','B','C','D') then
    raise exception 'invalid_input';
  end if;
  v_weeks := coalesce(p_attendance_weeks_counted, 0);
  if v_weeks < 0 then
    raise exception 'invalid_input';
  end if;
  -- An absent flag is an explicit "not flagged"; the column is NOT NULL.
  v_follow_up := coalesce(p_needs_follow_up, false);

  select true into v_group_exists from public.groups where id = p_group_id for update;
  if v_group_exists is null then
    raise exception 'missing_group';
  end if;

  -- Snapshot the prior row (if any) for the audit before/after pair. This RPC
  -- also overwrites the attendance snapshot from the live recompute, so the
  -- attendance fields ride in the audit too. The spiritual-growth note body is
  -- never written to audit metadata (it is a broader super-admin log); only a
  -- presence flag, per the has_notes convention (sc1b / launch-planning).
  select jsonb_build_object(
           'attendance_pct', attendance_pct,
           'attendance_weeks_counted', attendance_weeks_counted,
           'spiritual_growth_score', spiritual_growth_score,
           'has_spiritual_growth_note', spiritual_growth_note is not null,
           'group_question_score', group_question_score,
           'group_question_leader_reported', group_question_leader_reported,
           'needs_follow_up', needs_follow_up,
           'computed_numeric', computed_numeric,
           'computed_letter', computed_letter
         )
    into v_before
    from public.group_health_assessments
   where group_id = p_group_id and period_month = v_period
   for update;

  insert into public.group_health_assessments (
    group_id, period_month,
    attendance_pct, attendance_weeks_counted,
    spiritual_growth_score, spiritual_growth_note,
    group_question_score, group_question_leader_reported,
    needs_follow_up,
    computed_numeric, computed_letter,
    created_by, updated_by
  )
  values (
    p_group_id, v_period,
    p_attendance_pct, v_weeks,
    p_spiritual_growth_score, p_spiritual_growth_note,
    p_group_question_score, (p_group_question_score is not null),
    v_follow_up,
    p_computed_numeric, p_computed_letter,
    v_actor, v_actor
  )
  on conflict (group_id, period_month) do update
     set attendance_pct                 = excluded.attendance_pct,
         attendance_weeks_counted       = excluded.attendance_weeks_counted,
         spiritual_growth_score         = excluded.spiritual_growth_score,
         spiritual_growth_note          = excluded.spiritual_growth_note,
         group_question_score           = excluded.group_question_score,
         -- Provenance is derived from the score's presence, never trusted from
         -- the caller: the relayed group question is always leader-reported.
         group_question_leader_reported = (p_group_question_score is not null),
         needs_follow_up                = excluded.needs_follow_up,
         computed_numeric               = excluded.computed_numeric,
         computed_letter                = excluded.computed_letter,
         updated_by                     = v_actor
  returning id into v_id;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.set_group_health_ratings',
    'group_health_assessments',
    v_id,
    jsonb_build_object(
      'before', v_before,
      'after', jsonb_build_object(
        'attendance_pct', p_attendance_pct,
        'attendance_weeks_counted', v_weeks,
        'spiritual_growth_score', p_spiritual_growth_score,
        'has_spiritual_growth_note', p_spiritual_growth_note is not null,
        'group_question_score', p_group_question_score,
        'group_question_leader_reported', (p_group_question_score is not null),
        'needs_follow_up', v_follow_up,
        'computed_numeric', p_computed_numeric,
        'computed_letter', p_computed_letter
      ),
      'group_id', p_group_id,
      'period_month', v_period
    )
  );

  return v_id;
end;
$$;

revoke all on function public.admin_set_group_health_ratings(
  uuid, date, smallint, text, smallint, boolean, numeric, integer, numeric, text
) from public, anon, authenticated;
grant execute on function public.admin_set_group_health_ratings(
  uuid, date, smallint, text, smallint, boolean, numeric, integer, numeric, text
) to authenticated;

comment on function public.admin_set_group_health_ratings(
  uuid, date, smallint, text, smallint, boolean, numeric, integer, numeric, text
) is 'Group-Health Grade (#128/#265) admin write: captures the spiritual-growth and relayed group-question 1-5 ratings, the needs-follow-up flag, and the recomputed A-D grade for a group''s month. Forces the leader-reported provenance flag; writes a paired audit_events row.';

-- ---------------------------------------------------------------------------
-- 3. Seed the two director-confirmed metric_defaults keys (repair-merge:
--    only fill a key that isn't already configured, so a re-run never clobbers
--    an operator-tuned value). Mirrors lib/admin/metrics.ts BUILT_IN_METRIC_DEFAULTS.
-- ---------------------------------------------------------------------------

update public.app_settings
   set setting_value = setting_value
     || jsonb_build_object('group_health_watch_grade', 'C')
 where setting_key = 'metric_defaults'
   and not (setting_value ? 'group_health_watch_grade');

update public.app_settings
   set setting_value = setting_value
     || jsonb_build_object('group_health_attendance_decline_margin_pct', 10)
 where setting_key = 'metric_defaults'
   and not (setting_value ? 'group_health_attendance_decline_margin_pct');

-- ---------------------------------------------------------------------------
-- 4. Recreate admin_update_metric_defaults (latest definition is
--    20260530040000_julian_q5_per_tier_care_cadence.sql) to whitelist, bound,
--    and merge the two new keys. Parameter list is unchanged (single jsonb), so
--    create-or-replace preserves the EXECUTE grants. group_health_watch_grade is
--    a letter (A-D string); the decline margin is an integer 0..100.
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

  -- Admin IM 05 (#265): Watch grade threshold (an A-D letter) and the
  -- attendance decline margin (0..100 points).
  if p_settings ? 'group_health_watch_grade' then
    if jsonb_typeof(p_settings -> 'group_health_watch_grade') <> 'string'
       or (p_settings ->> 'group_health_watch_grade') not in ('A','B','C','D') then
      raise exception 'invalid_input';
    end if;
  end if;

  if p_settings ? 'group_health_attendance_decline_margin_pct' then
    if jsonb_typeof(p_settings -> 'group_health_attendance_decline_margin_pct') <> 'number' then
      raise exception 'invalid_input';
    end if;
    v_int := (p_settings ->> 'group_health_attendance_decline_margin_pct')::int;
    if v_int < 0 or v_int > 100 then
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
  if p_settings ? 'group_health_watch_grade' then
    v_merged := v_merged || jsonb_build_object('group_health_watch_grade', p_settings -> 'group_health_watch_grade');
  end if;
  if p_settings ? 'group_health_attendance_decline_margin_pct' then
    v_merged := v_merged || jsonb_build_object('group_health_attendance_decline_margin_pct', p_settings -> 'group_health_attendance_decline_margin_pct');
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
  'Admin IM 05 (#265) admin write: merges submitted keys (now including the Group-health Watch grade threshold + attendance decline margin) into app_settings.metric_defaults, validates per-key bounds, writes a paired audit_events row.';

-- ---------------------------------------------------------------------------
-- 5. Recreate admin_reset_metric_defaults (latest definition is
--    20260530040000_julian_q5_per_tier_care_cadence.sql) so the baseline
--    carries the two new keys. Mirrors lib/admin/metrics.ts BUILT_IN_METRIC_DEFAULTS.
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
    'default_group_capacity',                     12,
    'capacity_warning_threshold_pct',             80,
    'capacity_full_threshold_pct',                100,
    'check_in_due_day_of_week',                   1,
    'missed_checkin_warning_weeks',               2,
    'default_healthy_attendance_pct',             60,
    'check_in_due_offset_hours',                  24,
    'shepherd_care_stale_days_direct',            30,
    'shepherd_care_stale_days_delegated',         60,
    'group_health_watch_grade',                   'C',
    'group_health_attendance_decline_margin_pct', 10
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
  'Admin IM 05 (#265) admin write: restores app_settings.metric_defaults to the documented baseline (now including group_health_watch_grade C / group_health_attendance_decline_margin_pct 10). Does NOT touch group_metric_settings overrides. Writes a paired audit_events row.';
