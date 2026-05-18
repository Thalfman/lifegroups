-- Supabase GitHub integration deploy trigger.
--
-- This migration intentionally performs no schema changes. Its sole purpose
-- is to give the Supabase GitHub integration a new file to apply so that the
-- prior baseline migrations (phase2_schema, phase4_rls) actually run against
-- the remote project, and to fail loudly if they did not.
--
-- It verifies that the core baseline tables exist. If any are missing, the
-- deploy aborts with a clear message so the operator can re-check the
-- Supabase GitHub integration settings. If all are present, it emits a
-- notice and exits cleanly. The block is read-only against the schema and
-- safe to re-run.

do $$
begin
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'profiles'
  ) then
    raise exception 'Life Groups baseline schema is missing. Expected public.profiles to exist before this deployment trigger migration.';
  end if;

  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'groups'
  ) then
    raise exception 'Life Groups baseline schema is missing. Expected public.groups to exist before this deployment trigger migration.';
  end if;

  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'members'
  ) then
    raise exception 'Life Groups baseline schema is missing. Expected public.members to exist before this deployment trigger migration.';
  end if;

  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'group_leaders'
  ) then
    raise exception 'Life Groups baseline schema is missing. Expected public.group_leaders to exist before this deployment trigger migration.';
  end if;

  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'group_memberships'
  ) then
    raise exception 'Life Groups baseline schema is missing. Expected public.group_memberships to exist before this deployment trigger migration.';
  end if;

  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'attendance_sessions'
  ) then
    raise exception 'Life Groups baseline schema is missing. Expected public.attendance_sessions to exist before this deployment trigger migration.';
  end if;

  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'attendance_records'
  ) then
    raise exception 'Life Groups baseline schema is missing. Expected public.attendance_records to exist before this deployment trigger migration.';
  end if;

  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'audit_events'
  ) then
    raise exception 'Life Groups baseline schema is missing. Expected public.audit_events to exist before this deployment trigger migration.';
  end if;

  raise notice 'Life Groups baseline schema is present. GitHub integration deploy trigger migration completed.';
end $$;
