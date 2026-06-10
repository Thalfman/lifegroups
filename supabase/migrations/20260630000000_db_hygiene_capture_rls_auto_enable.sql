-- Database hygiene pass from the production launch-readiness review.
--
-- 1. Capture the `rls_auto_enable` safety net in the repo. The live database
--    carries an `ensure_rls` event trigger + SECURITY DEFINER function that
--    auto-enables row level security on any table created in `public`. It was
--    added operationally and never committed, so a database rebuilt from this
--    directory silently lacked it (schema drift). Codifying it makes the repo
--    reproduce production and keeps the net for future migrations: a table
--    that forgets `enable row level security` becomes default-deny for the
--    API roles instead of world-readable. The function returns
--    `event_trigger`, so it was never callable through the Data API; the
--    revoke below drops the pointless default EXECUTE grant (and the Supabase
--    advisor warning that came with it).
--
-- 2. Pin `set_updated_at`'s search_path (advisor lint 0011): the Phase 2
--    trigger function was the only remaining function with a role-mutable
--    search_path. Body unchanged.
--
-- 3. Give `audit_events_archive` a primary key (advisor lint 0004): archive
--    rows carry the original `audit_events.id`, unique by construction — the
--    source table is purged in the same transaction that archives it
--    (super_admin_reset_audit_logs), so an id can never be archived twice.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- 1. rls_auto_enable() + ensure_rls event trigger (mirrors production).
-- ---------------------------------------------------------------------------

create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  cmd record;
begin
  for cmd in
    select *
    from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and object_type in ('table','partitioned table')
  loop
     if cmd.schema_name is not null and cmd.schema_name in ('public') and cmd.schema_name not in ('pg_catalog','information_schema') and cmd.schema_name not like 'pg_toast%' and cmd.schema_name not like 'pg_temp%' then
      begin
        execute format('alter table if exists %s enable row level security', cmd.object_identity);
        raise log 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      exception
        when others then
          raise log 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      end;
     else
        raise log 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     end if;
  end loop;
end;
$$;

comment on function public.rls_auto_enable() is
  'Safety net: event-trigger function that enables row level security on any table created in public, so a migration that forgets `enable row level security` yields a default-deny table instead of a world-readable one. Returns event_trigger, so it is not callable through the Data API.';

-- Not callable via PostgREST anyway (event_trigger return type), but the
-- default PUBLIC grant is noise — lock it down like every other function.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- CREATE EVENT TRIGGER has no IF NOT EXISTS; production already has it.
do $$
begin
  if not exists (select 1 from pg_event_trigger where evtname = 'ensure_rls') then
    execute $ddl$
      create event trigger ensure_rls
        on ddl_command_end
        when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
        execute function public.rls_auto_enable()
    $ddl$;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Pin set_updated_at's search_path.
-- ---------------------------------------------------------------------------

alter function public.set_updated_at() set search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- 3. Primary key on audit_events_archive.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.audit_events_archive'::regclass and contype = 'p'
  ) then
    alter table public.audit_events_archive add primary key (id);
  end if;
end
$$;
