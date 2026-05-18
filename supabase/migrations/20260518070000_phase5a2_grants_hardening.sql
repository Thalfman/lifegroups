-- Phase 5A.2 hardening: explicit table grants for the authenticated role.
--
-- Background:
--   During Phase 5A.1 manual testing on a freshly-deployed Supabase
--   project, the app's read paths failed with "permission denied for
--   table ..." errors. The Phase 4 RLS migration enabled row-level
--   security and added SELECT policies, but it never issued
--   `grant select on public.<table> to authenticated`. RLS sits ON TOP
--   of table-level privileges in Postgres -- if the role has no SELECT
--   privilege on the table, the policy is never evaluated.
--
--   Supabase Studio projects often inherit these grants from the
--   project's default privileges, which is why local Studio testing
--   worked while a fresh GitHub-integration deploy did not. To make a
--   fresh Supabase project work without manual SQL, this migration
--   adds the missing grants explicitly.
--
-- Scope:
--   * Schema USAGE for authenticated (and anon, defensively -- the
--     RLS policies are all scoped `to authenticated`, so anon will
--     still be denied at the policy layer).
--   * SELECT on every operational table the app reads via PostgREST.
--   * EXECUTE on the Phase 4 helper functions and the Phase 5A.1 /
--     Phase 5A.2 admin RPCs is already granted in those migrations,
--     and is re-asserted here defensively so a re-run guarantees the
--     full set even if a historical migration was edited externally.
--   * NO new INSERT / UPDATE / DELETE grants. Writes continue to flow
--     exclusively through the SECURITY DEFINER admin_* RPCs.
--   * RLS stays enabled on every operational table.
--
-- This migration is idempotent: GRANT statements are additive and
-- re-running them produces no diff. It performs no schema changes.

-- ---------------------------------------------------------------------------
-- Schema usage.
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated;
grant usage on schema public to anon;

-- ---------------------------------------------------------------------------
-- Table SELECT grants for authenticated. RLS policies in
-- 20260518000000_phase4_rls.sql gate row visibility on top of these
-- grants. Anon receives no table grants here -- the policies are scoped
-- `to authenticated`, so anon SELECTs are denied at the policy layer.
-- ---------------------------------------------------------------------------
grant select on public.profiles               to authenticated;
grant select on public.groups                 to authenticated;
grant select on public.group_leaders          to authenticated;
grant select on public.members                to authenticated;
grant select on public.group_memberships      to authenticated;
grant select on public.attendance_sessions    to authenticated;
grant select on public.attendance_records     to authenticated;
grant select on public.guests                 to authenticated;
grant select on public.follow_ups             to authenticated;
grant select on public.group_health_updates   to authenticated;
grant select on public.group_status_history   to authenticated;
grant select on public.audit_events           to authenticated;
grant select on public.app_settings           to authenticated;

-- ---------------------------------------------------------------------------
-- Re-assert RLS on every operational table. Each ALTER TABLE is a no-op
-- if RLS is already enabled (which Phase 4 did). The redundancy is
-- intentional: a fresh database that somehow lost the Phase 4 ALTER
-- statements would still end up with RLS enforced after this migration.
-- ---------------------------------------------------------------------------
alter table public.profiles               enable row level security;
alter table public.groups                 enable row level security;
alter table public.group_leaders          enable row level security;
alter table public.members                enable row level security;
alter table public.group_memberships      enable row level security;
alter table public.attendance_sessions    enable row level security;
alter table public.attendance_records     enable row level security;
alter table public.guests                 enable row level security;
alter table public.follow_ups             enable row level security;
alter table public.group_health_updates   enable row level security;
alter table public.group_status_history   enable row level security;
alter table public.audit_events           enable row level security;
alter table public.app_settings           enable row level security;

-- ---------------------------------------------------------------------------
-- Re-assert EXECUTE grants on the RLS helpers and admin_* RPCs. Each
-- grant is identical to what the source migration already issued; we
-- repeat them here so a fresh project with this hardening migration
-- applied is self-sufficient even if an upstream grant was lost.
-- ---------------------------------------------------------------------------

-- Phase 4 helpers.
grant execute on function public.auth_profile_id()        to authenticated;
grant execute on function public.auth_role()              to authenticated;
grant execute on function public.auth_is_admin()          to authenticated;
grant execute on function public.auth_is_staff_viewer()   to authenticated;
grant execute on function public.auth_is_admin_or_staff() to authenticated;
grant execute on function public.auth_is_leader_of(uuid)  to authenticated;

-- Phase 5A.1 admin write RPCs.
grant execute on function public.admin_create_leader_profile(text, text, text)                 to authenticated;
grant execute on function public.admin_create_member(text, text, text)                         to authenticated;
grant execute on function public.admin_assign_leader_to_group(uuid, uuid, public.role_in_group) to authenticated;
grant execute on function public.admin_assign_member_to_group(uuid, uuid)                       to authenticated;
grant execute on function public.admin_deactivate_profile(uuid)                                 to authenticated;
grant execute on function public.admin_deactivate_member(uuid)                                  to authenticated;

-- Phase 5A.2 admin write RPCs.
grant execute on function public.admin_create_group(text, text, text, time, text, text, integer)                       to authenticated;
grant execute on function public.admin_update_group(uuid, text, text, text, time, text, text, integer)                 to authenticated;
grant execute on function public.admin_close_group(uuid)                                                                to authenticated;
grant execute on function public.admin_reopen_group(uuid)                                                               to authenticated;

-- ---------------------------------------------------------------------------
-- Verification block: raise a clear notice listing the expected grants.
-- If a future change drops one of the SELECTs, the next deploy will at
-- least surface the discrepancy in the migration logs.
-- ---------------------------------------------------------------------------
do $$
declare
  v_missing text[];
  v_expected text[] := array[
    'profiles','groups','group_leaders','members','group_memberships',
    'attendance_sessions','attendance_records','guests','follow_ups',
    'group_health_updates','group_status_history','audit_events','app_settings'
  ];
  v_table text;
begin
  v_missing := array[]::text[];
  foreach v_table in array v_expected loop
    -- has_table_privilege() is preferable to information_schema views for
    -- this check because it works regardless of the migration runner's
    -- visibility into other roles' grants.
    if not has_table_privilege('authenticated', format('public.%I', v_table)::regclass, 'SELECT') then
      v_missing := array_append(v_missing, v_table);
    end if;
  end loop;

  if array_length(v_missing, 1) is not null then
    raise exception 'Phase 5A.2 hardening verification failed: authenticated is missing SELECT on %', v_missing;
  end if;

  raise notice 'Phase 5A.2 hardening: authenticated has SELECT on all expected operational tables.';
end $$;
