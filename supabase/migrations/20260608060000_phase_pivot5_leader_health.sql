-- Leader-Health Grade (#378 / ADR 0018, pivot slice 5). The SYMMETRIC
-- counterpart to the Group-Health Grade: a per-Leader report-card letter rolled
-- up from the Leader-Health Rubric (health_rubrics kind='leader', already shipped
-- in #374), keyed to the Ministry Year (Aug–May) rather than a calendar month.
--
-- A deliberate FOURTH "health" concept — kept distinct from Leader Care Status
-- (the pastoral signal on shepherd_care_profiles) and the Health Pulse
-- (self-report). It feeds the Multiplication "Leader Health" pillar.
--
-- The roll-up math + weight-to-100 gate are pure TS (lib/admin/health-rubric.ts +
-- lib/admin/leader-rubric-grade.ts), unit-tested without a DB; this migration
-- persists the grade and writes the paired audit row. The rubric itself lives in
-- Settings (health_rubrics, Ministry-Admin-owned) — this migration does NOT
-- redefine admin_set_health_rubric, which already handles the leader kind.
--
-- Architecture parity with group_health_assessments / health_rubrics: admin-only
-- RLS read, SECURITY DEFINER write path only, paired audit_events rows, no
-- service-role writes. The override-scope enum (group_health_override_scope) is
-- reused — the leader grade and group grade share one override vocabulary.

-- ---------------------------------------------------------------------------
-- 1. Table: one Leader-Health Grade per leader per ministry year.
-- ---------------------------------------------------------------------------

create table if not exists public.leader_rubric_grades (
  id                   uuid primary key default gen_random_uuid(),
  profile_id           uuid not null references public.profiles(id) on delete cascade,
  -- The Ministry Year (its August-start calendar year), e.g. 2025 = Aug 2025 →
  -- May 2026. One grade row per leader per ministry year.
  ministry_year        integer not null,

  -- Per-criterion 0–100 scores keyed by the rubric criterion's `key`. The
  -- weight-to-100 rubric + the roll-up are validated in TS + the RPC; the column
  -- only guards that the value is a JSON object.
  criterion_scores     jsonb not null default '{}'::jsonb,

  -- Computed grade: the A–F letter the rubric rolled up to (null until scored).
  computed_letter      text,

  -- Manual override (the same vocabulary as the group grade), stored separately
  -- from the computed letter so the override never overwrites the underlying
  -- signal. The override letter + scope travel together.
  override_letter      text,
  override_scope       public.group_health_override_scope,
  -- The review month the override was set for (YYYY-MM-01), consulted only for a
  -- "this_month" override's expiry; "until_cleared" ignores it.
  override_period_month date,

  created_by           uuid references public.profiles(id) on delete set null,
  updated_by           uuid references public.profiles(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint leader_rubric_grades_one_per_leader_year unique (profile_id, ministry_year),
  constraint leader_rubric_grades_scores_is_object
    check (jsonb_typeof(criterion_scores) = 'object'),
  constraint leader_rubric_grades_computed_letter_valid
    check (computed_letter is null or computed_letter in ('A','B','C','D','F')),
  constraint leader_rubric_grades_override_letter_valid
    check (override_letter is null or override_letter in ('A','B','C','D','F')),
  -- An override letter and its scope travel together.
  constraint leader_rubric_grades_override_scope_paired
    check ((override_letter is null) = (override_scope is null)),
  -- The override period month, when present, is a first-of-month.
  constraint leader_rubric_grades_override_period_is_month_start
    check (override_period_month is null
           or date_trunc('month', override_period_month) = override_period_month)
);

create index if not exists leader_rubric_grades_profile_idx
  on public.leader_rubric_grades (profile_id);
create index if not exists leader_rubric_grades_year_idx
  on public.leader_rubric_grades (ministry_year);

drop trigger if exists leader_rubric_grades_set_updated_at
  on public.leader_rubric_grades;
create trigger leader_rubric_grades_set_updated_at
  before update on public.leader_rubric_grades
  for each row execute function public.set_updated_at();

alter table public.leader_rubric_grades enable row level security;

-- Admin-only read. Deliberately auth_is_admin() (not the _or_staff variant):
-- the Leader-Health Grade is an oversight signal, never leader-facing.
drop policy if exists leader_rubric_grades_admin_read
  on public.leader_rubric_grades;
create policy leader_rubric_grades_admin_read
  on public.leader_rubric_grades
  for select to authenticated using (public.auth_is_admin());

revoke all    on public.leader_rubric_grades from public;
revoke all    on public.leader_rubric_grades from anon;
revoke all    on public.leader_rubric_grades from authenticated;
grant  select on public.leader_rubric_grades to authenticated;

comment on table public.leader_rubric_grades is
  'Leader-Health Grade (#378 / ADR 0018): one rubric grade per leader per ministry year. Admin-only RLS; writes only via admin_set_leader_rubric_grade. Distinct from Leader Care Status and Health Pulse.';

-- ---------------------------------------------------------------------------
-- 2. RPC: upsert the Leader-Health Grade for a (leader, ministry year).
-- ---------------------------------------------------------------------------
--
-- The roll-up math lives in TS (lib/admin/leader-rubric-grade.ts), which is
-- unit-tested without a DB; this RPC persists the already-computed values and
-- writes the paired audit row. It upserts the one row for (profile, year).
-- Mirrors admin_set_group_rubric_grade conventions: auth_is_admin() guard,
-- server-resolved actor, input validation (scores object 0–100, letters A–F,
-- scope enum), profile existence check, paired before/after audit row.

create or replace function public.admin_set_leader_rubric_grade(
  p_profile_id          uuid,
  p_ministry_year       integer,
  p_criterion_scores    jsonb,
  p_computed_letter     text,
  p_override_letter     text,
  p_override_scope      text,
  p_override_period_month date
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_profile_exists boolean;
  v_scope public.group_health_override_scope;
  v_period date;
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

  if p_ministry_year is null then
    raise exception 'invalid_input';
  end if;

  -- The scores must be a JSON object whose values are all numbers in [0,100].
  -- The RPC is the DB trust boundary (execute is granted to any authenticated
  -- admin), so re-validate here even though the action validated first.
  if p_criterion_scores is null or jsonb_typeof(p_criterion_scores) <> 'object' then
    raise exception 'invalid_input';
  end if;
  declare
    v_val jsonb;
  begin
    for v_val in select value from jsonb_each(p_criterion_scores) loop
      if jsonb_typeof(v_val) <> 'number' then
        raise exception 'invalid_input';
      end if;
      -- A jsonb scalar cannot cast straight to numeric; extract its text first
      -- (mirrors the group-grade RPC's `#>> '{}'` form).
      if (v_val #>> '{}')::numeric < 0 or (v_val #>> '{}')::numeric > 100 then
        raise exception 'invalid_input';
      end if;
    end loop;
  end;

  if p_computed_letter is not null and p_computed_letter not in ('A','B','C','D','F') then
    raise exception 'invalid_input';
  end if;

  -- The override letter + scope travel together: both null, or both present.
  if (p_override_letter is null) <> (p_override_scope is null) then
    raise exception 'invalid_input';
  end if;
  if p_override_letter is not null and p_override_letter not in ('A','B','C','D','F') then
    raise exception 'invalid_input';
  end if;
  if p_override_scope is not null then
    if p_override_scope not in ('this_month','until_cleared') then
      raise exception 'invalid_input';
    end if;
    v_scope := p_override_scope::public.group_health_override_scope;
  end if;
  -- Normalize the override period to the first of its month (when supplied).
  if p_override_period_month is not null then
    v_period := date_trunc('month', p_override_period_month)::date;
  end if;

  -- The graded profile must exist (and be a real profile). Lock it for the write.
  select true into v_profile_exists from public.profiles where id = p_profile_id for update;
  if v_profile_exists is null then
    raise exception 'missing_profile';
  end if;

  -- The target must actually be an active leader/co-leader of some group. The UI
  -- already filters to active leaders, but this audited SECURITY DEFINER RPC is
  -- the trust boundary: without this a stale client or direct caller could grade
  -- an admin or inactive user, whose Leader-Health letter would then skew the
  -- Multiply rollup. Mirrors the active leader→type read in the rollup.
  if not exists (
    select 1 from public.group_leaders
     where profile_id = p_profile_id
       and active
       and role in ('leader','co_leader')
  ) then
    raise exception 'not_a_leader';
  end if;

  -- Snapshot the prior row (if any) for the audit before/after pair.
  select jsonb_build_object(
           'criterion_scores', criterion_scores,
           'computed_letter', computed_letter,
           'override_letter', override_letter,
           'override_scope', override_scope,
           'override_period_month', override_period_month
         )
    into v_before
    from public.leader_rubric_grades
   where profile_id = p_profile_id and ministry_year = p_ministry_year
   for update;

  insert into public.leader_rubric_grades (
    profile_id, ministry_year, criterion_scores, computed_letter,
    override_letter, override_scope, override_period_month,
    created_by, updated_by
  )
  values (
    p_profile_id, p_ministry_year, p_criterion_scores, p_computed_letter,
    p_override_letter, v_scope, v_period,
    v_actor, v_actor
  )
  on conflict (profile_id, ministry_year) do update
     set criterion_scores      = excluded.criterion_scores,
         computed_letter       = excluded.computed_letter,
         override_letter       = excluded.override_letter,
         override_scope        = excluded.override_scope,
         override_period_month = excluded.override_period_month,
         updated_by            = v_actor
  returning id into v_id;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.set_leader_rubric_grade',
    'leader_rubric_grades',
    v_id,
    jsonb_build_object(
      'before', v_before,
      'after', jsonb_build_object(
        'criterion_scores', p_criterion_scores,
        'computed_letter', p_computed_letter,
        'override_letter', p_override_letter,
        'override_scope', p_override_scope,
        'override_period_month', v_period
      ),
      'profile_id', p_profile_id,
      'ministry_year', p_ministry_year
    )
  );

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Grants.
-- ---------------------------------------------------------------------------

revoke all on function public.admin_set_leader_rubric_grade(
  uuid, integer, jsonb, text, text, text, date
) from public, anon, authenticated;
grant execute on function public.admin_set_leader_rubric_grade(
  uuid, integer, jsonb, text, text, text, date
) to authenticated;

comment on function public.admin_set_leader_rubric_grade(
  uuid, integer, jsonb, text, text, text, date
) is 'Leader-Health Grade (#378) admin write: upserts a leader''s Leader-Health Grade for a ministry year (computed A-F + optional override). Writes a paired audit_events row.';
