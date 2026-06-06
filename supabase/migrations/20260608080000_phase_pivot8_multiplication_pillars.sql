-- Multiplication Pillars config (#380 / ADR 0016, 0019). Pivot slice 8 builds the
-- Multiply area as three boards by group type (men / women / mixed), each grading
-- four pillars (Capacity, Interest, Group Health, Leader Health) to A–F, with a
-- Julian-configured trigger rubric producing a "ready to multiply this type"
-- signal. The pillar + trigger MATH is pure TS (lib/admin/multiplication-pillars.ts),
-- unit-tested without a DB; this migration persists Julian's per-type config: the
-- pillar thresholds, the trigger rubric, and the Ministry-Admin-FED capacity.
--
-- Architecture parity with health_rubrics / launch_planning_scenarios:
--   * admin-only RLS read (auth_is_admin())
--   * write only via a SECURITY DEFINER RPC with a pinned search_path
--   * paired audit_events rows, no service-role writes
--   * EXECUTE lockdown (revoke from public/anon/authenticated, grant authenticated)
--
-- The config is keyed per group type AND ministry year, so thresholds and the fed
-- capacity can change from one ministry year to the next without losing history.

-- ---------------------------------------------------------------------------
-- 1. Table: one config row per (group_type, ministry_year).
-- ---------------------------------------------------------------------------

create table if not exists public.multiplication_config (
  id            uuid primary key default gen_random_uuid(),
  -- The group type this config grades. Men's / Women's / Mixed boards.
  group_type    text not null,
  -- The ministry year (its August-start calendar year). Lets thresholds + fed
  -- capacity evolve year to year; the upsert conflict target is (type, year).
  ministry_year integer not null,
  -- Pillar thresholds: the A–F cut-lines for the numeric pillars (Capacity,
  -- Interest), as {capacity:{a,b,c,d}, interest:{a,b,c,d}}. The validity of the
  -- shape is enforced in TS + the RPC; the column only guards it is a JSON object.
  thresholds    jsonb not null,
  -- The trigger rubric: per-pillar minimum letters the pillars must clear for the
  -- multiply signal, as {minimums:{...}, requireHealthGrades:bool}. JSON object.
  trigger_rubric jsonb not null,
  -- The Ministry-Admin-FED capacity for this type (NOT derived from in-app
  -- counts), as {headroom:number|null, fullGroupCount:number}. JSON object.
  fed_capacity  jsonb not null,
  created_by    uuid references public.profiles(id) on delete set null,
  updated_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- One config per type per ministry year — the upsert conflict target.
  constraint multiplication_config_type_year_unique
    unique (group_type, ministry_year),
  constraint multiplication_config_group_type_valid
    check (group_type in ('men','women','mixed')),
  constraint multiplication_config_thresholds_is_object
    check (jsonb_typeof(thresholds) = 'object'),
  constraint multiplication_config_trigger_is_object
    check (jsonb_typeof(trigger_rubric) = 'object'),
  constraint multiplication_config_fed_capacity_is_object
    check (jsonb_typeof(fed_capacity) = 'object')
);

drop trigger if exists multiplication_config_set_updated_at on public.multiplication_config;
create trigger multiplication_config_set_updated_at
  before update on public.multiplication_config
  for each row execute function public.set_updated_at();

alter table public.multiplication_config enable row level security;

-- Admin-only read. auth_is_admin() admits super_admin + ministry_admin; the
-- Multiply config is Julian's pastoral copy, never leader-facing.
drop policy if exists multiplication_config_admin_read on public.multiplication_config;
create policy multiplication_config_admin_read
  on public.multiplication_config
  for select to authenticated using (public.auth_is_admin());

revoke all    on public.multiplication_config from public;
revoke all    on public.multiplication_config from anon;
revoke all    on public.multiplication_config from authenticated;
grant  select on public.multiplication_config to authenticated;

comment on table public.multiplication_config is
  'Multiplication Pillars config (#380 / ADR 0016): per-type, per-ministry-year pillar thresholds + trigger rubric + Ministry-Admin-fed capacity. Admin-only RLS; writes only via admin_set_multiplication_config.';

-- ---------------------------------------------------------------------------
-- 2. RPC: upsert one type's config for a ministry year.
-- ---------------------------------------------------------------------------

create or replace function public.admin_set_multiplication_config(
  p_group_type    text,
  p_ministry_year integer,
  p_thresholds    jsonb,
  p_trigger       jsonb,
  p_fed_capacity  jsonb
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

  -- Validate the group type + ministry year. The type mirrors the
  -- GroupAudienceCategory ('men','women','mixed'); the year is a plain integer.
  if p_group_type is null or p_group_type not in ('men','women','mixed') then
    raise exception 'invalid_input';
  end if;
  if p_ministry_year is null or p_ministry_year < 2000 or p_ministry_year > 3000 then
    raise exception 'invalid_input';
  end if;

  -- The RPC is the DB trust boundary (execute is granted to any authenticated
  -- admin): re-guard each jsonb payload's top-level shape here, mirroring the TS
  -- validators, so a direct caller can't persist a malformed config that later
  -- corrupts pillar computation. Each of the three jsonb args must be an object.
  if p_thresholds is null or jsonb_typeof(p_thresholds) <> 'object' then
    raise exception 'invalid_input';
  end if;
  if p_trigger is null or jsonb_typeof(p_trigger) <> 'object' then
    raise exception 'invalid_input';
  end if;
  if p_fed_capacity is null or jsonb_typeof(p_fed_capacity) <> 'object' then
    raise exception 'invalid_input';
  end if;

  -- Snapshot the prior config (if any) for the audit before/after pair.
  select jsonb_build_object(
           'thresholds', thresholds,
           'trigger_rubric', trigger_rubric,
           'fed_capacity', fed_capacity
         )
    into v_before
    from public.multiplication_config
   where group_type = p_group_type and ministry_year = p_ministry_year
   for update;

  insert into public.multiplication_config (
    group_type, ministry_year, thresholds, trigger_rubric, fed_capacity,
    created_by, updated_by
  )
  values (
    p_group_type, p_ministry_year, p_thresholds, p_trigger, p_fed_capacity,
    v_actor, v_actor
  )
  on conflict (group_type, ministry_year) do update
     set thresholds     = excluded.thresholds,
         trigger_rubric = excluded.trigger_rubric,
         fed_capacity   = excluded.fed_capacity,
         updated_by     = v_actor
  returning id into v_id;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.set_multiplication_config',
    'multiplication_config',
    v_id,
    jsonb_build_object(
      'group_type', p_group_type,
      'ministry_year', p_ministry_year,
      'before', v_before,
      'after', jsonb_build_object(
        'thresholds', p_thresholds,
        'trigger_rubric', p_trigger,
        'fed_capacity', p_fed_capacity
      )
    )
  );

  return v_id;
end;
$$;

revoke all on function public.admin_set_multiplication_config(text, integer, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.admin_set_multiplication_config(text, integer, jsonb, jsonb, jsonb)
  to authenticated;

comment on function public.admin_set_multiplication_config(text, integer, jsonb, jsonb, jsonb) is
  'Multiplication Pillars (#380) admin write: upserts one group type''s pillar config (thresholds + trigger + fed capacity) for a ministry year. Writes a paired audit_events row.';
