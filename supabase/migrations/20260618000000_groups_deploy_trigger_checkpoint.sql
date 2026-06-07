-- Supabase GitHub integration deploy trigger — groups overhaul checkpoint.
--
-- This migration intentionally performs no schema changes. Like the original
-- github_integration_deploy_trigger, its sole purpose is to give the Supabase
-- GitHub integration a fresh file to apply, confirming the deploy pipeline is
-- healthy again and that the groups-overhaul schema (phase_groups1..7) is
-- present on the remote project.
--
-- It verifies that the four groups-overhaul tables exist. If any are missing,
-- the deploy aborts with a clear message so the operator can re-check the
-- migration history. If all are present, it emits a notice and exits cleanly.
-- The block is read-only against the schema and safe to re-run.

do $$
begin
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'group_categories'
  ) then
    raise exception 'Groups overhaul schema is missing. Expected public.group_categories to exist before this deployment checkpoint migration.';
  end if;

  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'category_type_targets'
  ) then
    raise exception 'Groups overhaul schema is missing. Expected public.category_type_targets to exist before this deployment checkpoint migration.';
  end if;

  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'multiplication_readiness_rule'
  ) then
    raise exception 'Groups overhaul schema is missing. Expected public.multiplication_readiness_rule to exist before this deployment checkpoint migration.';
  end if;

  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'audience_readiness_rule'
  ) then
    raise exception 'Groups overhaul schema is missing. Expected public.audience_readiness_rule to exist before this deployment checkpoint migration.';
  end if;

  raise notice 'Groups overhaul schema is present. GitHub integration deploy checkpoint migration completed.';
end $$;
