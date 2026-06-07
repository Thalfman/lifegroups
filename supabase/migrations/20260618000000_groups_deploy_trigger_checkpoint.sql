-- Supabase GitHub integration deploy trigger — groups overhaul checkpoint.
--
-- This migration intentionally performs no schema changes. Like the original
-- github_integration_deploy_trigger, its purpose is to give the Supabase GitHub
-- integration a fresh file to apply, confirming the deploy pipeline is healthy
-- again and that the groups-overhaul slice set (phase_groups1..7) is fully
-- present on the remote project.
--
-- Rather than only checking that the four new tables exist, it also verifies the
-- key NON-table effects of the slice set, so a migration ledger that marked the
-- files applied while any slice's effect is actually missing fails loudly here
-- instead of reporting a healthy pipeline over a drifted schema:
--   * tables            group_categories, category_type_targets,
--                       multiplication_readiness_rule, audience_readiness_rule
--   * added column      groups.category_id            (phase_groups2 / #398)
--   * retired columns   groups.life_stage             (dropped, phase_groups2)
--                       multiplication_config.fed_capacity (dropped, phase_groups4)
--   * write-path RPCs   the create/cell/target/readiness/override admin RPCs
--                       (phase_groups1, 3, 5, 6)
--
-- The advisory-lock hardening (phase_groups7) is internal function logic rather
-- than a schema object, so it is covered transitively by the RPC presence check.
-- The block is read-only against the catalog and safe to re-run.

do $$
declare
  v_missing text;
begin
  -- New tables (phase_groups1, 5, 6).
  select string_agg(t, ', ')
    into v_missing
    from unnest(array[
      'group_categories',
      'category_type_targets',
      'multiplication_readiness_rule',
      'audience_readiness_rule'
    ]) as t
   where to_regclass('public.' || t) is null;
  if v_missing is not null then
    raise exception 'Groups overhaul schema is missing table(s): %', v_missing;
  end if;

  -- Added column: groups.category_id (phase_groups2).
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'groups' and column_name = 'category_id'
  ) then
    raise exception 'Groups overhaul schema is missing column public.groups.category_id (phase_groups2).';
  end if;

  -- Retired columns must be gone: groups.life_stage (phase_groups2),
  -- multiplication_config.fed_capacity (phase_groups4).
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'groups' and column_name = 'life_stage'
  ) then
    raise exception 'Groups overhaul incomplete: public.groups.life_stage should have been dropped (phase_groups2).';
  end if;
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'multiplication_config' and column_name = 'fed_capacity'
  ) then
    raise exception 'Groups overhaul incomplete: public.multiplication_config.fed_capacity should have been dropped (phase_groups4).';
  end if;

  -- Write-path RPCs introduced across the slice set (phase_groups1, 3, 5, 6).
  select string_agg(p, ', ')
    into v_missing
    from unnest(array[
      'admin_create_group_category',
      'admin_set_category_type_cell',
      'admin_set_category_type_target_count',
      'admin_set_readiness_rule',
      'admin_set_cell_trigger_overrides',
      'admin_set_audience_readiness_rule'
    ]) as p
   where not exists (
     select 1 from pg_proc pr
       join pg_namespace n on n.oid = pr.pronamespace
      where n.nspname = 'public' and pr.proname = p
   );
  if v_missing is not null then
    raise exception 'Groups overhaul schema is missing RPC(s): %', v_missing;
  end if;

  raise notice 'Groups overhaul schema (phase_groups1..7) is present. GitHub integration deploy checkpoint migration completed.';
end $$;
