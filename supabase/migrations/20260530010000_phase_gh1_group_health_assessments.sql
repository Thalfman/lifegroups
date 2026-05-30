-- Group-Health Grade tracer (#127). PRD Q12 / ADR 0004 D8.
--
-- One assessment row per group per month. The current month recomputes on
-- admin write (and on dashboard read); closed months stay as a frozen history.
-- The tracer fills only the attendance-consistency dimension (computed in TS
-- from attendance_sessions/_records, see lib/admin/group-health.ts) plus the
-- resulting internal numeric and A-D letter. The rated dimensions (spiritual
-- growth, relayed group question) and the manual override land in #128/#129;
-- their columns are created here (nullable) so those slices add no migration to
-- reshape the table.
--
-- Architecture parity with multiplication_candidates / shepherd_care_*:
-- admin-only RLS read, SECURITY DEFINER write path only, paired audit_events
-- rows, no service-role writes.

-- ---------------------------------------------------------------------------
-- 1. Override-scope enum + table.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'group_health_override_scope') then
    create type public.group_health_override_scope as enum (
      'this_month','until_cleared'
    );
  end if;
end$$;

create table if not exists public.group_health_assessments (
  id                         uuid primary key default gen_random_uuid(),
  group_id                   uuid not null references public.groups(id) on delete cascade,
  -- First day of the assessment month (YYYY-MM-01). One row per group per month.
  period_month               date not null,

  -- Attendance-consistency dimension (the one live leg in the tracer).
  attendance_pct             numeric(5,2),
  attendance_weeks_counted   integer not null default 0,

  -- Rated dimensions (#128). Net-new admin-entered 1-5s; null until captured.
  spiritual_growth_score     smallint,
  spiritual_growth_note      text,
  group_question_score       smallint,
  -- Provenance: the group question is leader-reported but admin-entered.
  group_question_leader_reported boolean not null default false,

  -- Computed grade: internal numeric (0-100) drives the A-D letter.
  computed_numeric           numeric(5,2),
  computed_letter            text,

  -- Manual override (#129), stored separately from the computed grade.
  override_letter            text,
  override_scope             public.group_health_override_scope,
  override_reason            text,

  created_by                 uuid references public.profiles(id) on delete set null,
  updated_by                 uuid references public.profiles(id) on delete set null,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),

  constraint group_health_assessments_one_per_group_month unique (group_id, period_month),
  constraint group_health_assessments_period_is_month_start
    check (date_trunc('month', period_month) = period_month),
  constraint group_health_assessments_attendance_pct_bounds
    check (attendance_pct is null or (attendance_pct between 0 and 100)),
  constraint group_health_assessments_weeks_counted_nonneg
    check (attendance_weeks_counted >= 0),
  constraint group_health_assessments_spiritual_growth_bounds
    check (spiritual_growth_score is null or (spiritual_growth_score between 1 and 5)),
  constraint group_health_assessments_group_question_bounds
    check (group_question_score is null or (group_question_score between 1 and 5)),
  constraint group_health_assessments_computed_numeric_bounds
    check (computed_numeric is null or (computed_numeric between 0 and 100)),
  constraint group_health_assessments_computed_letter_valid
    check (computed_letter is null or computed_letter in ('A','B','C','D')),
  constraint group_health_assessments_override_letter_valid
    check (override_letter is null or override_letter in ('A','B','C','D')),
  -- An override letter and its scope travel together.
  constraint group_health_assessments_override_scope_paired
    check ((override_letter is null) = (override_scope is null)),
  constraint group_health_assessments_notes_length
    check (spiritual_growth_note is null or char_length(spiritual_growth_note) <= 2000),
  constraint group_health_assessments_override_reason_length
    check (override_reason is null or char_length(override_reason) <= 2000)
);

create index if not exists group_health_assessments_group_idx
  on public.group_health_assessments (group_id);
create index if not exists group_health_assessments_period_idx
  on public.group_health_assessments (period_month);

drop trigger if exists group_health_assessments_set_updated_at
  on public.group_health_assessments;
create trigger group_health_assessments_set_updated_at
  before update on public.group_health_assessments
  for each row execute function public.set_updated_at();

alter table public.group_health_assessments enable row level security;

-- Admin-only read. Deliberately auth_is_admin() (not the _or_staff variant):
-- group-health grades are an oversight signal, never leader-facing.
drop policy if exists group_health_assessments_admin_read
  on public.group_health_assessments;
create policy group_health_assessments_admin_read
  on public.group_health_assessments
  for select to authenticated using (public.auth_is_admin());

revoke all    on public.group_health_assessments from public;
revoke all    on public.group_health_assessments from anon;
revoke all    on public.group_health_assessments from authenticated;
grant  select on public.group_health_assessments to authenticated;

comment on table public.group_health_assessments is
  'Group-Health Grade (#127): one assessment per group per month. Admin-only RLS; writes only via admin_upsert_group_health_assessment. Rated dimensions + override columns are reserved for #128/#129.';

-- ---------------------------------------------------------------------------
-- 2. RPC: upsert the current-month attendance dimension + computed grade.
-- ---------------------------------------------------------------------------
--
-- The rolling-window math lives in TS (lib/admin/group-health.ts), which is
-- unit-tested without a DB; this RPC persists the already-computed values and
-- writes the paired audit row. It upserts the one row for (group, month).

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

-- ---------------------------------------------------------------------------
-- 3. Grants.
-- ---------------------------------------------------------------------------

revoke all on function public.admin_upsert_group_health_assessment(
  uuid, date, numeric, integer, numeric, text
) from public, anon, authenticated;
grant execute on function public.admin_upsert_group_health_assessment(
  uuid, date, numeric, integer, numeric, text
) to authenticated;

comment on function public.admin_upsert_group_health_assessment(
  uuid, date, numeric, integer, numeric, text
) is 'Group-Health Grade (#127) admin write: upserts a group''s monthly attendance dimension + computed A-D grade. Writes a paired audit_events row.';
