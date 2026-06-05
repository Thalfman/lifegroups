-- Health Rubric (#374 / ADR 0018). ADR 0007 deferred the rubric; this hands
-- Julian the builder: one current rubric per kind (group / leader), each a
-- weighted set of criteria whose weightings total 100, owned in Settings (a
-- Ministry-Admin surface — auth_is_admin(), NOT super-admin). The roll-up math
-- and the weight-to-100 gate are pure TS (lib/admin/health-rubric.ts), unit-
-- tested without a DB; this migration persists the rubric and writes the paired
-- audit row.
--
-- It also lands ADR 0018's A–F relaxation: the group-health letter scale gains
-- F, so the group_health_assessments letter CHECKs and the upsert RPC's letter
-- guard are widened from A–D to A–F.
--
-- Architecture parity with group_health_assessments / launch_planning_scenarios:
-- admin-only RLS read, SECURITY DEFINER write path only, paired audit_events
-- rows, no service-role writes.

-- ---------------------------------------------------------------------------
-- 1. Rubric-kind enum + table (one current rubric per kind).
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'health_rubric_kind') then
    create type public.health_rubric_kind as enum ('group','leader');
  end if;
end$$;

create table if not exists public.health_rubrics (
  id          uuid primary key default gen_random_uuid(),
  -- One current rubric per kind: the unique constraint makes the kind the upsert
  -- conflict target.
  kind        public.health_rubric_kind not null unique,
  -- Ordered array of {key,label,weight}. The weight-to-100 validity is enforced
  -- in TS + the RPC; the column only guards that the value is a JSON array.
  criteria    jsonb not null,
  created_by  uuid references public.profiles(id) on delete set null,
  updated_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint health_rubrics_criteria_is_array
    check (jsonb_typeof(criteria) = 'array')
);

drop trigger if exists health_rubrics_set_updated_at on public.health_rubrics;
create trigger health_rubrics_set_updated_at
  before update on public.health_rubrics
  for each row execute function public.set_updated_at();

alter table public.health_rubrics enable row level security;

-- Admin-only read. auth_is_admin() admits super_admin + ministry_admin; the
-- rubric is Julian's pastoral copy, never leader-facing.
drop policy if exists health_rubrics_admin_read on public.health_rubrics;
create policy health_rubrics_admin_read
  on public.health_rubrics
  for select to authenticated using (public.auth_is_admin());

revoke all    on public.health_rubrics from public;
revoke all    on public.health_rubrics from anon;
revoke all    on public.health_rubrics from authenticated;
grant  select on public.health_rubrics to authenticated;

comment on table public.health_rubrics is
  'Health Rubric (#374 / ADR 0018): one current rubric per kind (group/leader), Julian-owned in Settings. Admin-only RLS; writes only via admin_set_health_rubric.';

-- ---------------------------------------------------------------------------
-- 2. RPC: upsert the current rubric for a kind.
-- ---------------------------------------------------------------------------

create or replace function public.admin_set_health_rubric(
  p_kind     text,
  p_criteria jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_kind  public.health_rubric_kind;
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

  if p_kind is null or p_kind not in ('group','leader') then
    raise exception 'invalid_input';
  end if;
  v_kind := p_kind::public.health_rubric_kind;

  if p_criteria is null or jsonb_typeof(p_criteria) <> 'array' then
    raise exception 'invalid_input';
  end if;

  -- Snapshot the prior rubric (if any) for the audit before/after pair.
  select criteria into v_before
    from public.health_rubrics
   where kind = v_kind
   for update;

  insert into public.health_rubrics (kind, criteria, created_by, updated_by)
  values (v_kind, p_criteria, v_actor, v_actor)
  on conflict (kind) do update
     set criteria   = excluded.criteria,
         updated_by = v_actor
  returning id into v_id;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.set_health_rubric',
    'health_rubrics',
    v_id,
    jsonb_build_object(
      'kind', p_kind,
      'before', v_before,
      'after', p_criteria
    )
  );

  return v_id;
end;
$$;

revoke all on function public.admin_set_health_rubric(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.admin_set_health_rubric(text, jsonb)
  to authenticated;

comment on function public.admin_set_health_rubric(text, jsonb) is
  'Health Rubric (#374) admin write: upserts the current rubric for a kind (group/leader). Writes a paired audit_events row.';

-- ---------------------------------------------------------------------------
-- 3. A–F relaxation (ADR 0018 criterion 2): widen the group-health letter
--    scale from A–D to A–F on the existing assessments table + upsert RPC.
-- ---------------------------------------------------------------------------

alter table public.group_health_assessments
  drop constraint if exists group_health_assessments_computed_letter_valid;
alter table public.group_health_assessments
  add constraint group_health_assessments_computed_letter_valid
    check (computed_letter is null or computed_letter in ('A','B','C','D','F'));

alter table public.group_health_assessments
  drop constraint if exists group_health_assessments_override_letter_valid;
alter table public.group_health_assessments
  add constraint group_health_assessments_override_letter_valid
    check (override_letter is null or override_letter in ('A','B','C','D','F'));

-- Re-create the attendance-dimension upsert RPC unchanged EXCEPT for the letter
-- guard, which now allows 'F' (ADR 0018). Body otherwise reproduces the #127
-- definition verbatim.
create or replace function public.admin_upsert_group_health_assessment(
  p_group_id                 uuid,
  p_period_month             date,
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

  if p_attendance_pct is not null and (p_attendance_pct < 0 or p_attendance_pct > 100) then
    raise exception 'invalid_input';
  end if;
  if p_computed_numeric is not null and (p_computed_numeric < 0 or p_computed_numeric > 100) then
    raise exception 'invalid_input';
  end if;
  if p_computed_letter is not null and p_computed_letter not in ('A','B','C','D','F') then
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

  -- Snapshot the prior row (if any) for the audit before/after pair.
  select jsonb_build_object(
           'attendance_pct', attendance_pct,
           'attendance_weeks_counted', attendance_weeks_counted,
           'computed_numeric', computed_numeric,
           'computed_letter', computed_letter
         )
    into v_before
    from public.group_health_assessments
   where group_id = p_group_id and period_month = v_period
   for update;

  insert into public.group_health_assessments (
    group_id, period_month, attendance_pct, attendance_weeks_counted,
    computed_numeric, computed_letter, created_by, updated_by
  )
  values (
    p_group_id, v_period, p_attendance_pct, v_weeks,
    p_computed_numeric, p_computed_letter, v_actor, v_actor
  )
  on conflict (group_id, period_month) do update
     set attendance_pct           = excluded.attendance_pct,
         attendance_weeks_counted = excluded.attendance_weeks_counted,
         computed_numeric         = excluded.computed_numeric,
         computed_letter          = excluded.computed_letter,
         updated_by               = v_actor
  returning id into v_id;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.upsert_group_health_assessment',
    'group_health_assessments',
    v_id,
    jsonb_build_object(
      'before', v_before,
      'after', jsonb_build_object(
        'attendance_pct', p_attendance_pct,
        'attendance_weeks_counted', v_weeks,
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

revoke all on function public.admin_upsert_group_health_assessment(
  uuid, date, numeric, integer, numeric, text
) from public, anon, authenticated;
grant execute on function public.admin_upsert_group_health_assessment(
  uuid, date, numeric, integer, numeric, text
) to authenticated;
