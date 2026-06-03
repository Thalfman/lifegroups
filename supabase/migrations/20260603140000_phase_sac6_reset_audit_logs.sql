-- PRD-SAC6 Feature 3 (#290): Reset audit logs — standalone archive-then-purge.
--
-- A Super-Admin Danger-Zone action to reset the audit log, INDEPENDENT of Clean
-- Slate (no shared RPC or transaction). Default behavior is archive-then-purge
-- (reversible): the current audit_events rows are copied into a backup table
-- before they are deleted, and the purge itself stays auditable by writing one
-- fresh audit_events row that records the prior count.

set check_function_bodies = off;

-- Backup of purged audit rows. Mirrors audit_events' columns (id is kept as a
-- plain column, not a PK, so repeated resets can accumulate here) plus the time
-- the rows were archived. Super-admin-only SELECT RLS, no write policy — only
-- the SECURITY DEFINER RPC writes here.
create table if not exists public.audit_events_archive (
  id uuid not null,
  actor_profile_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null,
  archived_at timestamptz not null default now()
);

create index if not exists idx_audit_events_archive_archived_at
  on public.audit_events_archive (archived_at desc);

alter table public.audit_events_archive enable row level security;

create policy audit_events_archive_super_admin_read
  on public.audit_events_archive
  for select to authenticated using (public.auth_role() = 'super_admin');

revoke all    on public.audit_events_archive from public;
revoke all    on public.audit_events_archive from anon;
revoke all    on public.audit_events_archive from authenticated;
grant  select on public.audit_events_archive to authenticated;

-- super_admin_reset_audit_logs(): gate super_admin; copy current audit_events
-- into the archive; delete audit_events; then insert ONE fresh audit_events row
-- recording the prior count, so the purge is itself auditable. One atomic
-- transaction. Returns the id of that fresh row.
create or replace function public.super_admin_reset_audit_logs()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_count bigint;
  v_new_id uuid := gen_random_uuid();
begin
  if public.auth_role() <> 'super_admin' then
    raise exception 'insufficient_privilege';
  end if;

  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  select count(*) into v_count from public.audit_events;

  insert into public.audit_events_archive
    (id, actor_profile_id, action, entity_type, entity_id, metadata, created_at)
  select id, actor_profile_id, action, entity_type, entity_id, metadata, created_at
  from public.audit_events;

  delete from public.audit_events;

  insert into public.audit_events
    (id, actor_profile_id, action, entity_type, entity_id, metadata)
  values
    (v_new_id, v_actor, 'super_admin.reset_audit_logs', 'audit_events', null,
     jsonb_build_object('archived_count', v_count));

  return v_new_id;
end;
$$;

revoke all     on function public.super_admin_reset_audit_logs() from public;
revoke all     on function public.super_admin_reset_audit_logs() from anon;
revoke all     on function public.super_admin_reset_audit_logs() from authenticated;
grant  execute on function public.super_admin_reset_audit_logs() to authenticated;

comment on function public.super_admin_reset_audit_logs() is
  'PRD-SAC6 (#290): super-admin standalone audit-log reset. Archives current audit_events into audit_events_archive, purges audit_events, then writes one fresh super_admin.reset_audit_logs row carrying the prior count. Independent of Clean Slate.';
