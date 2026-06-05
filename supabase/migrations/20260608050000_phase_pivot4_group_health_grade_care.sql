-- Group-Health Grade entry in Care (#377 / ADR 0018, Pivot slice 4). A grader
-- scores a group against the configured Health Rubric (per-criterion 0–100); the
-- engine rolls the scores up to a fluid weighted A–F (lib/admin/health-rubric.ts
-- + lib/admin/group-rubric-grade.ts, unit-tested without a DB). A manual override
-- can force the letter under the existing this-month / until-cleared scopes. The
-- grade is keyed to the current Ministry Year (one row per group per year), so a
-- new ministry year starts a fresh grade rather than mutating last year's.
--
-- The persisted grade is the source the Multiplication "Group Health" pillar
-- rolls up. The recompute math runs in TS first (the action recomputes the letter
-- via the pure facade before writing); this migration persists the already-
-- computed values and re-validates them at the trust boundary.
--
-- Architecture parity with health_rubrics / group_health_assessments: admin-only
-- RLS read (auth_is_admin()), write only via a SECURITY DEFINER RPC with an
-- auth_profile_id() actor, trust-boundary re-validation, a paired audit_events
-- row, and revoke/grant EXECUTE lockdown to authenticated only.

-- ---------------------------------------------------------------------------
-- 1. Table: one rubric grade per group per ministry year.
-- ---------------------------------------------------------------------------

create table if not exists public.group_rubric_grades (
  id                   uuid primary key default gen_random_uuid(),
  group_id             uuid not null references public.groups(id) on delete cascade,
  -- The Ministry Year (its August-start calendar year); the grade is keyed to it
  -- (ADR 0018 / lib/admin/ministry-year.ts). One grade per group per year.
  ministry_year        integer not null,
  -- Per-criterion 0–100 scores keyed by the rubric criterion key. The
  -- key-by-key 0–100 validity is enforced in TS + the RPC; the column only guards
  -- that the value is a JSON object.
  criterion_scores     jsonb not null default '{}'::jsonb,
  -- Manual override of the letter (nullable — no override by default), under one
  -- of the existing scopes, for the month it was set for.
  override_letter      text,
  override_scope       text,
  override_period_month date,
  -- The letter the rubric engine computed (pre-override), persisted as the
  -- Multiplication pillar's source. Nullable until a grade is entered.
  computed_letter      text,
  created_by           uuid references public.profiles(id) on delete set null,
  updated_by           uuid references public.profiles(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  -- One grade per group per ministry year — the upsert conflict target.
  constraint group_rubric_grades_group_year_unique
    unique (group_id, ministry_year),

  constraint group_rubric_grades_scores_is_object
    check (jsonb_typeof(criterion_scores) = 'object'),
  constraint group_rubric_grades_computed_letter_valid
    check (computed_letter is null or computed_letter in ('A','B','C','D','F')),
  constraint group_rubric_grades_override_letter_valid
    check (override_letter is null or override_letter in ('A','B','C','D','F')),
  constraint group_rubric_grades_override_scope_valid
    check (override_scope is null
           or override_scope in ('this_month','until_cleared'))
);

drop trigger if exists group_rubric_grades_set_updated_at on public.group_rubric_grades;
create trigger group_rubric_grades_set_updated_at
  before update on public.group_rubric_grades
  for each row execute function public.set_updated_at();

alter table public.group_rubric_grades enable row level security;

-- Admin-only read. auth_is_admin() admits super_admin + ministry_admin; the
-- group rubric grade is a pastoral/director signal, never leader-facing.
drop policy if exists group_rubric_grades_admin_read on public.group_rubric_grades;
create policy group_rubric_grades_admin_read
  on public.group_rubric_grades
  for select to authenticated using (public.auth_is_admin());

revoke all    on public.group_rubric_grades from public;
revoke all    on public.group_rubric_grades from anon;
revoke all    on public.group_rubric_grades from authenticated;
grant  select on public.group_rubric_grades to authenticated;

comment on table public.group_rubric_grades is
  'Group-Health Grade by rubric (#377 / ADR 0018): one grade per group per ministry year, scored against the Health Rubric. Admin-only RLS; writes only via admin_set_group_rubric_grade.';

-- ---------------------------------------------------------------------------
-- 2. RPC: upsert a group's rubric grade for a ministry year.
-- ---------------------------------------------------------------------------

create or replace function public.admin_set_group_rubric_grade(
  p_group_id            uuid,
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
  v_group_exists boolean;
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

  -- A ministry year is the August-start calendar year (ADR 0018). Bound it to a
  -- sane window rather than trusting an arbitrary integer.
  if p_ministry_year is null or p_ministry_year < 2000 or p_ministry_year > 2100 then
    raise exception 'invalid_input';
  end if;

  -- The criterion scores must be a JSON object of 0–100 numbers. The RPC is the
  -- DB trust boundary (execute granted to any authenticated admin), so it
  -- re-validates the shape + range here, mirroring the pure facade, so a direct
  -- caller can't persist out-of-range scores that later corrupt a recompute.
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
      -- A bare jsonb scalar can't be cast straight to numeric; extract its text
      -- with #>>'{}' first (mirrors the rubric RPC's ->> on object members).
      if (v_val #>> '{}')::numeric < 0 or (v_val #>> '{}')::numeric > 100 then
        raise exception 'invalid_input';
      end if;
    end loop;
  end;

  -- Letters are A–F (the A–F scale incl. F, ADR 0018). The computed letter is
  -- nullable (a grade with no scores yet); the override letter is nullable (no
  -- override).
  if p_computed_letter is not null
     and p_computed_letter not in ('A','B','C','D','F') then
    raise exception 'invalid_input';
  end if;
  if p_override_letter is not null
     and p_override_letter not in ('A','B','C','D','F') then
    raise exception 'invalid_input';
  end if;
  if p_override_scope is not null
     and p_override_scope not in ('this_month','until_cleared') then
    raise exception 'invalid_input';
  end if;

  select true into v_group_exists from public.groups where id = p_group_id for update;
  if v_group_exists is null then
    raise exception 'missing_group';
  end if;

  -- Snapshot the prior grade (if any) for the audit before/after pair.
  select jsonb_build_object(
           'criterion_scores', criterion_scores,
           'computed_letter', computed_letter,
           'override_letter', override_letter,
           'override_scope', override_scope,
           'override_period_month', override_period_month
         )
    into v_before
    from public.group_rubric_grades
   where group_id = p_group_id and ministry_year = p_ministry_year
   for update;

  insert into public.group_rubric_grades (
    group_id, ministry_year, criterion_scores, computed_letter,
    override_letter, override_scope, override_period_month,
    created_by, updated_by
  )
  values (
    p_group_id, p_ministry_year, p_criterion_scores, p_computed_letter,
    p_override_letter, p_override_scope, p_override_period_month,
    v_actor, v_actor
  )
  on conflict (group_id, ministry_year) do update
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
    'admin.set_group_rubric_grade',
    'group_rubric_grades',
    v_id,
    jsonb_build_object(
      'group_id', p_group_id,
      'ministry_year', p_ministry_year,
      'before', v_before,
      'after', jsonb_build_object(
        'criterion_scores', p_criterion_scores,
        'computed_letter', p_computed_letter,
        'override_letter', p_override_letter,
        'override_scope', p_override_scope,
        'override_period_month', p_override_period_month
      )
    )
  );

  return v_id;
end;
$$;

revoke all on function public.admin_set_group_rubric_grade(
  uuid, integer, jsonb, text, text, text, date
) from public, anon, authenticated;
grant execute on function public.admin_set_group_rubric_grade(
  uuid, integer, jsonb, text, text, text, date
) to authenticated;

comment on function public.admin_set_group_rubric_grade(
  uuid, integer, jsonb, text, text, text, date
) is
  'Group-Health Grade (#377) admin write: upserts a group''s rubric grade for a ministry year (criterion scores + computed letter + optional override). Writes a paired audit_events row.';
