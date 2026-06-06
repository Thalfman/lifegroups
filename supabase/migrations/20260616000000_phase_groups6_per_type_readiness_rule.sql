-- Per-TYPE readiness rule: the MIDDLE tier of the three-tier multiplication
-- trigger (#410 / docs/adr/0021-three-tier-multiplication-trigger.md). The
-- readiness rule becomes a cascade — GLOBAL → PER-TYPE (Audience) → PER-CELL —
-- each tier inheriting the one above PER PILLAR unless it overrides. Today only
-- the global rule (20260615000000_phase_groups5_readiness_rule_and_overrides.sql:
-- multiplication_readiness_rule) and the per-cell overrides
-- (category_type_targets.trigger_overrides) exist; THIS migration introduces the
-- middle tier so Julian can set, e.g., Men's interest ≥ 5 while Women's ≥ 3
-- without overriding every cell.
--
-- A per-type rule is a PARTIAL of the global rule (exactly like a per-cell
-- override): a pillar PRESENT here overrides the global rule for every cell of
-- that Audience; an ABSENT pillar inherits the global rule. So an empty `{}` =
-- "this type follows the global rule for every pillar". Interest stays a COUNT at
-- every tier (never a letter). The pillar math + cascade resolution are pure TS
-- (lib/admin/cell-readiness.ts), unit-tested without a DB; this migration
-- persists the per-type partial and gives an admin the audited WRITE PATH.
--
-- Migration is ADDITIVE: the existing global rule and per-cell overrides carry
-- over unchanged; the per-type tier starts EMPTY (no rows ⇒ every type inherits
-- the global rule), so behaviour is identical until a per-type rule is set.
--
-- Architecture parity with multiplication_readiness_rule / multiplication_config:
--   * admin-only RLS read (auth_is_admin())
--   * write only via a SECURITY DEFINER RPC with a pinned search_path
--   * a paired audit_events row, no service-role writes
--   * EXECUTE lockdown (revoke from public/anon/authenticated, grant authenticated)

-- ---------------------------------------------------------------------------
-- 1. Table: the per-TYPE readiness rule, one row per (ministry year, Audience).
-- ---------------------------------------------------------------------------
-- Keyed per ministry year × audience_category so the per-type rule can evolve
-- year to year without losing history, matching multiplication_config's
-- (group_type, ministry_year) keying and multiplication_readiness_rule's per-year
-- keying. The `rule` jsonb is a PARTIAL of the global rule (a present pillar
-- overrides; an absent pillar inherits), the same shape as a per-cell override.

create table if not exists public.audience_readiness_rule (
  id                uuid primary key default gen_random_uuid(),
  -- The ministry year (its August-start calendar year).
  ministry_year     integer not null,
  -- The Audience this per-type rule covers: Men's / Women's / Mixed.
  audience_category text not null,
  -- The per-type rule as a PARTIAL of the global rule: any subset of
  -- {interest:{required,min}, capacity:{required}, groupHealth:{required,min},
  -- leaderHealth:{required,min}}. An absent pillar inherits global; an empty
  -- object inherits every pillar. The shape is enforced in TS + the RPC; the
  -- column only guards that it is a JSON object.
  rule              jsonb not null,
  created_by        uuid references public.profiles(id) on delete set null,
  updated_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- One per-type rule per (Audience, ministry year) — the upsert conflict target.
  constraint audience_readiness_rule_year_type_unique
    unique (ministry_year, audience_category),
  constraint audience_readiness_rule_year_valid
    check (ministry_year >= 2000 and ministry_year <= 3000),
  constraint audience_readiness_rule_audience_valid
    check (audience_category in ('men','women','mixed')),
  constraint audience_readiness_rule_is_object
    check (jsonb_typeof(rule) = 'object')
);

drop trigger if exists audience_readiness_rule_set_updated_at on public.audience_readiness_rule;
create trigger audience_readiness_rule_set_updated_at
  before update on public.audience_readiness_rule
  for each row execute function public.set_updated_at();

alter table public.audience_readiness_rule enable row level security;

-- Admin-only read. auth_is_admin() admits super_admin + ministry_admin; the
-- per-type rule is Julian's group configuration, never leader-facing.
drop policy if exists audience_readiness_rule_admin_read on public.audience_readiness_rule;
create policy audience_readiness_rule_admin_read
  on public.audience_readiness_rule
  for select to authenticated using (public.auth_is_admin());

revoke all    on public.audience_readiness_rule from public;
revoke all    on public.audience_readiness_rule from anon;
revoke all    on public.audience_readiness_rule from authenticated;
grant  select on public.audience_readiness_rule to authenticated;

comment on table public.audience_readiness_rule is
  'Per-TYPE readiness rule (#410 / ADR 0021): the MIDDLE tier of the global → per-type → per-cell multiplication-trigger cascade, one row per (ministry year, audience_category), holding a PARTIAL of the global multiplication_readiness_rule (present pillar overrides, absent inherits). Admin-only RLS; writes only via admin_set_audience_readiness_rule.';

-- ---------------------------------------------------------------------------
-- 2. RPC: upsert/clear a per-type readiness rule for a (ministry year, Audience).
--    Mirrors admin_set_readiness_rule's gates + audit; an empty `{}` clears the
--    per-type rule back to "inherit global for every pillar".
-- ---------------------------------------------------------------------------

create or replace function public.admin_set_audience_readiness_rule(
  p_ministry_year     integer,
  p_audience_category text,
  p_rule              jsonb
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
  if p_audience_category is null
     or p_audience_category not in ('men','women','mixed') then
    raise exception 'invalid_input';
  end if;

  -- The RPC is the DB trust boundary (execute is granted to any authenticated
  -- admin): re-guard the jsonb payload's top-level shape here, mirroring the TS
  -- validator, so a direct caller can't persist a malformed rule that later
  -- corrupts readiness evaluation. The per-type rule (possibly empty `{}` =
  -- clear) must be an object.
  if p_rule is null or jsonb_typeof(p_rule) <> 'object' then
    raise exception 'invalid_input';
  end if;

  -- Serialize concurrent writers to THIS (year, audience) key before reading the
  -- prior rule, so the audited `before` always reflects the row actually being
  -- overwritten. Without it, two admins racing the FIRST insert for a brand-new
  -- key would both pre-read NULL (a SELECT ... FOR UPDATE locks nothing when no
  -- row exists yet), and the ON CONFLICT loser would overwrite the winner while
  -- auditing `before: null`. A per-key advisory xact lock (held to commit) makes
  -- the second writer see the first's committed row. The two int4 keys namespace
  -- the lock to this table + key, avoiding collisions with other advisory locks.
  perform pg_advisory_xact_lock(
    hashtext('audience_readiness_rule'),
    hashtext(p_ministry_year::text || ':' || p_audience_category)
  );

  -- Snapshot the prior rule (if any) for the audit before/after pair.
  select rule into v_before
    from public.audience_readiness_rule
   where ministry_year = p_ministry_year
     and audience_category = p_audience_category
   for update;

  insert into public.audience_readiness_rule (
    ministry_year, audience_category, rule, created_by, updated_by
  )
  values (p_ministry_year, p_audience_category, p_rule, v_actor, v_actor)
  on conflict (ministry_year, audience_category) do update
     set rule       = excluded.rule,
         updated_by = v_actor
  returning id into v_id;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.set_audience_readiness_rule',
    'audience_readiness_rule',
    v_id,
    jsonb_build_object(
      'ministry_year', p_ministry_year,
      'audience_category', p_audience_category,
      'before', v_before,
      'after', p_rule
    )
  );

  return v_id;
end;
$$;

revoke all on function public.admin_set_audience_readiness_rule(integer, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.admin_set_audience_readiness_rule(integer, text, jsonb)
  to authenticated;

comment on function public.admin_set_audience_readiness_rule(integer, text, jsonb) is
  'Per-TYPE readiness rule (#410 / ADR 0021) admin write: upserts the per-type (Audience) rule — a PARTIAL of the global rule, absent pillars inherit — for a (ministry year, audience_category) on the per-(year, type) conflict target. An empty `{}` clears it back to the global rule. Writes a paired audit_events row with before/after rule.';
