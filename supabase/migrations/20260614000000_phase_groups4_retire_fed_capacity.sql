-- Retire fed capacity + the offerings concept (#401 / docs/plans/
-- SETTINGS_GROUPS_AND_TRIGGERS_PRD.md §2.4 + §4). The Multiply area's Capacity
-- pillar was a hand-FED numeric (headroom / full-group count / two offerable
-- "options") graded to A–F, persisted as a jsonb `fed_capacity` column on
-- multiplication_config and written through admin_set_multiplication_config's
-- p_fed_capacity argument.
--
-- Per the PRD, capacity is no longer fed and there are no offerings: it is a
-- DERIVED, multi-faceted ISSUE computed PER CELL from group sizes + the joinable-
-- group count (lib/admin/cell-capacity.ts), surfaced alongside the remaining A–F
-- pillars. This migration:
--   1. drops the `fed_capacity` column (and its object check) from
--      multiplication_config; and
--   2. recreates admin_set_multiplication_config WITHOUT the p_fed_capacity
--      argument — dropping the old 5-arg overload first (as the wave-2
--      group-segmentation migration drops/recreates admin_create_group before
--      changing its signature), keeping the audited-write + EXECUTE-lockdown
--      conventions intact.
--
-- The standalone `overflow` pillar (full-group magnitude) is ALSO retired in the
-- same change: it is folded into capacity Facet A (over-capacity). Any stored
-- `overflow` band left in the thresholds jsonb is harmless: that overflow band is
-- no longer read (decodePillarThresholds drops it) or written. The same goes for
-- any stored capacity/overflow condition in the trigger_rubric jsonb: it stays
-- inert.
--
-- Architecture parity is preserved (matching the original pillars migration):
--   * admin-only RLS read (unchanged here)
--   * write only via a SECURITY DEFINER RPC with a pinned search_path
--   * paired audit_events row, no service-role writes
--   * EXECUTE lockdown (revoke from public/anon/authenticated, grant authenticated)

-- ---------------------------------------------------------------------------
-- 1. Drop the fed_capacity column + its object-shape check.
-- ---------------------------------------------------------------------------

alter table public.multiplication_config
  drop constraint if exists multiplication_config_fed_capacity_is_object;

alter table public.multiplication_config
  drop column if exists fed_capacity;

comment on table public.multiplication_config is
  'Multiplication Pillars config (#380 / ADR 0016; fed capacity retired #401): per-type, per-ministry-year pillar thresholds + trigger rubric. Capacity is now a derived per-cell issue, no longer stored here. Admin-only RLS; writes only via admin_set_multiplication_config.';

-- ---------------------------------------------------------------------------
-- 2. Recreate admin_set_multiplication_config WITHOUT p_fed_capacity.
-- ---------------------------------------------------------------------------

-- Drop the old 5-arg overload first so the recreated 4-arg function does not
-- collide with it (Postgres keys functions by their argument types). Mirrors the
-- wave-2 group-segmentation migration's drop-then-recreate of admin_create_group.
drop function if exists public.admin_set_multiplication_config(
  text, integer, jsonb, jsonb, jsonb
);

create or replace function public.admin_set_multiplication_config(
  p_group_type    text,
  p_ministry_year integer,
  p_thresholds    jsonb,
  p_trigger       jsonb
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
  -- corrupts pillar computation. Each jsonb arg must be an object. The old fed
  -- capacity argument is gone (#401): capacity is a derived per-cell issue.
  if p_thresholds is null or jsonb_typeof(p_thresholds) <> 'object' then
    raise exception 'invalid_input';
  end if;
  if p_trigger is null or jsonb_typeof(p_trigger) <> 'object' then
    raise exception 'invalid_input';
  end if;

  -- Snapshot the prior config (if any) for the audit before/after pair.
  select jsonb_build_object(
           'thresholds', thresholds,
           'trigger_rubric', trigger_rubric
         )
    into v_before
    from public.multiplication_config
   where group_type = p_group_type and ministry_year = p_ministry_year
   for update;

  insert into public.multiplication_config (
    group_type, ministry_year, thresholds, trigger_rubric,
    created_by, updated_by
  )
  values (
    p_group_type, p_ministry_year, p_thresholds, p_trigger,
    v_actor, v_actor
  )
  on conflict (group_type, ministry_year) do update
     set thresholds     = excluded.thresholds,
         trigger_rubric = excluded.trigger_rubric,
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
        'trigger_rubric', p_trigger
      )
    )
  );

  return v_id;
end;
$$;

revoke all on function public.admin_set_multiplication_config(text, integer, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.admin_set_multiplication_config(text, integer, jsonb, jsonb)
  to authenticated;

comment on function public.admin_set_multiplication_config(text, integer, jsonb, jsonb) is
  'Multiplication Pillars (#380; fed capacity retired #401) admin write: upserts one group type''s pillar config (thresholds + trigger) for a ministry year. Capacity is a derived per-cell issue, no longer fed. Writes a paired audit_events row.';
