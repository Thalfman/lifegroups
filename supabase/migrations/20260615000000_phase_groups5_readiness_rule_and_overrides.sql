-- Per-cell readiness rule: global rule + per-cell overrides (#402 / docs/plans/
-- SETTINGS_GROUPS_AND_TRIGGERS_PRD.md §2.4 + §4). Wave 1
-- (20260610000000_phase_groups1_category_catalog_and_matrix.sql) created
-- `category_type_targets.trigger_overrides jsonb not null default '{}'` per the PRD
-- data model but left it unused, noting "LATER SLICE (PRD §2.4): per-cell trigger
-- overrides over the global rule." THIS is that slice.
--
-- The recast multiply readiness trigger reads each pillar in its NATURAL unit
-- (interest = number of people #399; capacity = derived issue #401; group/leader
-- health = A–F letter), evaluated PER CELL, configured once GLOBALLY with per-cell
-- overrides. The pillar math is pure TS (lib/admin/cell-readiness.ts), unit-tested
-- without a DB; this migration persists the GLOBAL rule and gives an admin the
-- WRITE PATH for a cell's overrides:
--   1. table multiplication_readiness_rule (one row per ministry year) + RPC
--      admin_set_readiness_rule(ministry_year, rule);
--   2. RPC admin_set_cell_trigger_overrides(category_id, audience_category,
--      overrides) upserting category_type_targets.trigger_overrides.
--
-- The `overflow` pillar is GONE (folded into capacity Facet A, retired #401): the
-- rule jsonb only ever carries interest / capacity / groupHealth / leaderHealth.
--
-- Architecture parity with multiplication_config / category_type_targets:
--   * admin-only RLS read (auth_is_admin())
--   * write only via SECURITY DEFINER RPCs with a pinned search_path
--   * paired audit_events rows, no service-role writes
--   * EXECUTE lockdown (revoke from public/anon/authenticated, grant authenticated)

-- ---------------------------------------------------------------------------
-- 1. Table: the GLOBAL readiness rule, one row per ministry year.
-- ---------------------------------------------------------------------------
-- The rule is GLOBAL (not per top type): one rule covers every cell, with per-cell
-- overrides layered on top (category_type_targets.trigger_overrides). It is keyed
-- per ministry year so the rule can evolve year to year without losing history,
-- matching multiplication_config's per-year keying.

create table if not exists public.multiplication_readiness_rule (
  id            uuid primary key default gen_random_uuid(),
  -- The ministry year (its August-start calendar year). One global rule per year;
  -- the upsert conflict target is the year alone.
  ministry_year integer not null,
  -- The readiness rule, as {interest:{required,min}, capacity:{required},
  -- groupHealth:{required,min}, leaderHealth:{required,min}}. The shape is enforced
  -- in TS + the RPC; the column only guards that it is a JSON object.
  rule          jsonb not null,
  created_by    uuid references public.profiles(id) on delete set null,
  updated_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- One global rule per ministry year — the upsert conflict target.
  constraint multiplication_readiness_rule_year_unique
    unique (ministry_year),
  constraint multiplication_readiness_rule_year_valid
    check (ministry_year >= 2000 and ministry_year <= 3000),
  constraint multiplication_readiness_rule_is_object
    check (jsonb_typeof(rule) = 'object')
);

drop trigger if exists multiplication_readiness_rule_set_updated_at on public.multiplication_readiness_rule;
create trigger multiplication_readiness_rule_set_updated_at
  before update on public.multiplication_readiness_rule
  for each row execute function public.set_updated_at();

alter table public.multiplication_readiness_rule enable row level security;

-- Admin-only read. auth_is_admin() admits super_admin + ministry_admin; the
-- readiness rule is Julian's group configuration, never leader-facing.
drop policy if exists multiplication_readiness_rule_admin_read on public.multiplication_readiness_rule;
create policy multiplication_readiness_rule_admin_read
  on public.multiplication_readiness_rule
  for select to authenticated using (public.auth_is_admin());

revoke all    on public.multiplication_readiness_rule from public;
revoke all    on public.multiplication_readiness_rule from anon;
revoke all    on public.multiplication_readiness_rule from authenticated;
grant  select on public.multiplication_readiness_rule to authenticated;

comment on table public.multiplication_readiness_rule is
  'Per-cell readiness rule (#402 / PRD §2.4): the GLOBAL multiply-readiness rule, one row per ministry year, in natural units (interest count, capacity boolean, A–F health). Per-cell overrides live on category_type_targets.trigger_overrides. Admin-only RLS; writes only via admin_set_readiness_rule.';

-- ---------------------------------------------------------------------------
-- 2. RPC: upsert the global readiness rule for a ministry year.
-- ---------------------------------------------------------------------------

create or replace function public.admin_set_readiness_rule(
  p_ministry_year integer,
  p_rule          jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor  uuid;
  v_before jsonb;
  v_id     uuid;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_ministry_year is null or p_ministry_year < 2000 or p_ministry_year > 3000 then
    raise exception 'invalid_input';
  end if;

  -- The RPC is the DB trust boundary (execute is granted to any authenticated
  -- admin): re-guard the jsonb payload's top-level shape here, mirroring the TS
  -- validator, so a direct caller can't persist a malformed rule that later
  -- corrupts readiness evaluation. The rule must be an object.
  if p_rule is null or jsonb_typeof(p_rule) <> 'object' then
    raise exception 'invalid_input';
  end if;

  -- Snapshot the prior rule (if any) for the audit before/after pair.
  select rule into v_before
    from public.multiplication_readiness_rule
   where ministry_year = p_ministry_year
   for update;

  insert into public.multiplication_readiness_rule (
    ministry_year, rule, created_by, updated_by
  )
  values (p_ministry_year, p_rule, v_actor, v_actor)
  on conflict (ministry_year) do update
     set rule       = excluded.rule,
         updated_by = v_actor
  returning id into v_id;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.set_readiness_rule',
    'multiplication_readiness_rule',
    v_id,
    jsonb_build_object(
      'ministry_year', p_ministry_year,
      'before', v_before,
      'after', p_rule
    )
  );

  return v_id;
end;
$$;

revoke all on function public.admin_set_readiness_rule(integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.admin_set_readiness_rule(integer, jsonb)
  to authenticated;

comment on function public.admin_set_readiness_rule(integer, jsonb) is
  'Per-cell readiness rule (#402 / PRD §2.4) admin write: upserts the GLOBAL readiness rule (interest/capacity/group+leader health in natural units) for a ministry year. Writes a paired audit_events row with before/after rule.';

-- ---------------------------------------------------------------------------
-- 3. RPC: set a cell's trigger overrides. Upserts the (audience_category ×
--    category) row's trigger_overrides jsonb, creating the cell row if needed.
--    Mirrors admin_set_category_type_target_count's gates + conflict target.
-- ---------------------------------------------------------------------------

create or replace function public.admin_set_cell_trigger_overrides(
  p_category_id       uuid,
  p_audience_category text,
  p_overrides         jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor  uuid;
  v_before jsonb;
  v_id     uuid;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_category_id is null then
    raise exception 'invalid_input';
  end if;
  if p_audience_category is null
     or p_audience_category not in ('men','women','mixed') then
    raise exception 'invalid_input';
  end if;
  -- The overrides payload is a JSON object (possibly empty `{}` = clear). The
  -- column carries the same CHECK, but we reject up front with a stable token
  -- rather than leaking the constraint error.
  if p_overrides is null or jsonb_typeof(p_overrides) <> 'object' then
    raise exception 'invalid_input';
  end if;

  -- The cell can only override a LIVE category. Lock the catalog row so an archive
  -- racing this set can't leave overrides pointing at an archived category.
  if not exists (
    select 1 from public.group_categories
     where id = p_category_id and archived_at is null
     for update
  ) then
    raise exception 'missing_category';
  end if;

  -- Snapshot the prior overrides (if the cell exists) for the audit pair.
  select trigger_overrides into v_before
    from public.category_type_targets
   where audience_category = p_audience_category
     and category_id = p_category_id
   for update;

  -- Upsert the cell's overrides. A brand-new row is created INACTIVE (active =
  -- false) so this RPC never implicitly APPLIES a category to a top type — that
  -- is admin_set_category_type_cell's job + audit trail. On conflict only
  -- trigger_overrides (+ updated_by) change, so an already-active cell keeps its
  -- active flag; overrides on a not-yet-applied cell sit dormant until it is
  -- applied (the readiness reads only surface active cells).
  insert into public.category_type_targets (
    audience_category, category_id, active, trigger_overrides, created_by, updated_by
  )
  values (p_audience_category, p_category_id, false, p_overrides, v_actor, v_actor)
  on conflict (audience_category, category_id) do update
     set trigger_overrides = excluded.trigger_overrides,
         updated_by        = v_actor
  returning id into v_id;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.set_cell_trigger_overrides',
    'category_type_target',
    v_id,
    jsonb_build_object(
      'category_id', p_category_id,
      'audience_category', p_audience_category,
      'before', v_before,
      'after', p_overrides
    )
  );

  return v_id;
end;
$$;

revoke all on function public.admin_set_cell_trigger_overrides(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.admin_set_cell_trigger_overrides(uuid, text, jsonb)
  to authenticated;

comment on function public.admin_set_cell_trigger_overrides(uuid, text, jsonb) is
  'Per-cell readiness rule (#402 / PRD §2.4) admin write: sets a (audience_category × category) cell''s trigger_overrides (a partial of the global rule; absent pillars inherit) by upserting on the per-(type, category) conflict target. Validates a live category and a JSON object (empty `{}` clears). Writes a paired audit_events row with before/after overrides.';
