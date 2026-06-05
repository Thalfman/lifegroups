-- Fix: grant the invitations table privileges the self-signup flow needs.
--
-- Background:
--   Phase IL.1 (20260604120000_phase_il1_shareable_invite_links.sql) created
--   public.invitations, enabled RLS, and added a SELECT policy scoped to
--   `authenticated` super_admins. But it never issued the table-level GRANTs.
--   RLS sits ON TOP of table privileges in Postgres -- if a role has no
--   table-level privilege, the query is denied before any policy is evaluated.
--
--   The public self-signup landing page (/invite/<token>) redeems a link via
--   the `redeem-invite` Edge Function, which runs with the SERVICE ROLE and
--   does a direct PostgREST read:
--       service.from("invitations").select(...).eq("token_hash", ...)
--   service_role bypasses RLS, but it still needs the table SELECT privilege.
--   It was never granted, so every redemption failed at that first read with
--   `ERROR: permission denied for table invitations`, which the function maps
--   to a generic `db_error` (HTTP 500). Result: NO shareable-link signup could
--   ever complete. This is the same "RLS enabled but grant missing" class of
--   bug that 20260518070000_phase5a2_grants_hardening.sql fixed for the
--   authenticated role on the operational tables.
--
-- Scope:
--   * SELECT on public.invitations to service_role -- the actual fix; this is
--     the only path that reads the table outside a SECURITY DEFINER function.
--     (All writes -- create/consume -- already flow through the SECURITY
--     DEFINER RPCs super_admin_create_invitation / redeem_invitation, which run
--     as the function owner and never needed a service_role grant. So no
--     INSERT/UPDATE/DELETE grant is added here, matching IL.1's intent.)
--   * SELECT on public.invitations to authenticated, asserted defensively so a
--     fresh GitHub-integration deploy (where Supabase default privileges do not
--     apply) still satisfies the IL.1 super_admin SELECT policy without manual
--     SQL -- exactly the failure mode documented in the 5A.2 hardening note.
--
-- This migration is idempotent: GRANTs are additive and re-running them
-- produces no diff. It performs no schema changes and changes no RLS policy.

grant select on public.invitations to service_role;
grant select on public.invitations to authenticated;

-- Keep RLS enforced (no-op if already enabled). Belt-and-suspenders so a
-- database that somehow lost the IL.1 ALTER still ends up with RLS on.
alter table public.invitations enable row level security;

-- ---------------------------------------------------------------------------
-- Verification: fail the deploy loudly if the service-role SELECT that the
-- redeem-invite Edge Function depends on is still missing after this runs.
-- has_table_privilege works regardless of the migration runner's visibility
-- into other roles' grants.
-- ---------------------------------------------------------------------------
do $$
begin
  if not has_table_privilege(
    'service_role', 'public.invitations'::regclass, 'SELECT'
  ) then
    raise exception
      'invitations grant fix verification failed: service_role still lacks SELECT on public.invitations';
  end if;
  raise notice
    'invitations grant fix: service_role has SELECT on public.invitations (self-signup redemption unblocked).';
end $$;
