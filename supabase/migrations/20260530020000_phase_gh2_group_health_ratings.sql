-- Group-Health Grade: the two admin-entered rating dimensions (#128).
-- PRD Q12 / ADR 0004 D8. Second build slice on top of the #127 tracer.
--
-- The #127 migration already created the rated-dimension columns on
-- group_health_assessments (spiritual_growth_score/_note, group_question_score,
-- group_question_leader_reported) so this slice adds no table reshape — only the
-- audited write path that captures them. Both dimensions are net-new,
-- Ministry-Admin-entered 1-5 ratings; the spiritual-growth leg carries an
-- optional pastoral note, the group-question leg is the leader's read relayed
-- and entered by the admin (its leader-reported provenance is forced
-- server-side, never trusted from the caller).
--
-- Architecture parity with admin_upsert_group_health_assessment (#127) and the
-- shepherd_care_* / multiplication_candidates write paths: admin-only guard,
-- SECURITY DEFINER, paired audit_events, no service-role writes. Like the
-- tracer, the composite grade math runs in TS (lib/admin/group-health.ts,
-- unit-tested without a DB) and this RPC persists the already-computed numbers
-- alongside the rated inputs, upserting the one row for (group, month).

create or replace function public.admin_set_group_health_ratings(
  p_group_id                 uuid,
  p_period_month             date,
  p_spiritual_growth_score   smallint,
  p_spiritual_growth_note    text,
  p_group_question_score     smallint,
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
    computed_numeric, computed_letter,
    created_by, updated_by
  )
  values (
    p_group_id, v_period,
    p_attendance_pct, v_weeks,
    p_spiritual_growth_score, p_spiritual_growth_note,
    p_group_question_score, (p_group_question_score is not null),
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
  uuid, date, smallint, text, smallint, numeric, integer, numeric, text
) from public, anon, authenticated;
grant execute on function public.admin_set_group_health_ratings(
  uuid, date, smallint, text, smallint, numeric, integer, numeric, text
) to authenticated;

comment on function public.admin_set_group_health_ratings(
  uuid, date, smallint, text, smallint, numeric, integer, numeric, text
) is 'Group-Health Grade (#128) admin write: captures the spiritual-growth and relayed group-question 1-5 ratings (+ recomputed A-D grade) for a group''s month. Forces the leader-reported provenance flag; writes a paired audit_events row.';
