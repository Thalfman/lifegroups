-- Phase 5A.3: Super admin role-change write.
--
-- This migration introduces one SECURITY DEFINER RPC for the new
-- /admin/super-admin console: super_admin_update_profile_role. It
-- mirrors the Phase 5A.1 / 5A.2 / 5B.0 pattern -- the function body is
-- the security boundary, the data change and the audit row commit in
-- the same transaction, and a fixed-token raise maps to friendly UI
-- copy in lib/admin/action-result.ts.
--
-- Architecture parity:
--   * No new tables, no new enums, no new INSERT/UPDATE/DELETE policies
--     on profiles. RLS stays SELECT-only outside the SECURITY DEFINER
--     surface.
--   * audit_events RLS is unchanged. Phase 5A.2 already restricted
--     reads to super_admin (`audit_events_super_admin_read`).
--   * No hard deletes. Role changes are status-only updates on the
--     existing profiles row.
--   * Each function explicitly enforces auth_role() = 'super_admin'
--     and auth_profile_id() is not null. RLS does NOT protect the
--     UPDATE inside the function body.
--
-- Fixed error tokens raised by this function, mapped to friendly
-- messages by lib/admin/action-result.ts:
--   insufficient_privilege, self_target_not_allowed, forbidden_target,
--   invalid_role, missing_profile, no_role_change.

-- ---------------------------------------------------------------------------
-- super_admin_update_profile_role
-- ---------------------------------------------------------------------------
-- Changes a profile's role. Allowed target roles: ministry_admin, leader,
-- co_leader. super_admin is rejected (forbidden_target) so role escalation
-- cannot happen from the app. staff_viewer is rejected (invalid_role) so
-- the deprecated value cannot be re-introduced through the UI. The actor
-- cannot target themselves (self_target_not_allowed) so a super_admin
-- cannot accidentally lock themselves out.
create or replace function public.super_admin_update_profile_role(
  p_profile_id uuid,
  p_new_role public.user_role
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_old_role public.user_role;
begin
  -- Role gate. auth_role() returns null if the caller has no active
  -- profile, which IS DISTINCT FROM also catches.
  if public.auth_role() is distinct from 'super_admin'::public.user_role then
    raise exception 'insufficient_privilege';
  end if;

  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_profile_id = v_actor then
    raise exception 'self_target_not_allowed';
  end if;

  if p_new_role = 'super_admin'::public.user_role then
    raise exception 'forbidden_target';
  end if;

  if p_new_role = 'staff_viewer'::public.user_role then
    raise exception 'invalid_role';
  end if;

  -- Row-level lock serializes concurrent role changes to the same
  -- profile. If the row was deleted between transactions, the locked
  -- select returns nothing and we raise missing_profile before any
  -- UPDATE or audit insert runs.
  select role into v_old_role
    from public.profiles
   where id = p_profile_id
   for update;
  if v_old_role is null then
    raise exception 'missing_profile';
  end if;

  -- Short-circuit no-op changes. Without this, submitting the same
  -- role would write a misleading "Changed role of X from leader to
  -- leader" audit row and drown real changes in noise.
  if v_old_role = p_new_role then
    raise exception 'no_role_change';
  end if;

  update public.profiles
     set role = p_new_role
   where id = p_profile_id;

  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'super_admin.update_profile_role',
    'profiles',
    p_profile_id,
    jsonb_build_object(
      'before', jsonb_build_object('role', v_old_role),
      'after',  jsonb_build_object('role', p_new_role)
    )
  );

  return p_profile_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants. Revoke from public/anon/authenticated, then grant execute to
-- authenticated only. The function body still enforces super_admin;
-- granting execute to authenticated only makes the function callable.
-- ---------------------------------------------------------------------------

revoke all on function public.super_admin_update_profile_role(uuid, public.user_role) from public;
revoke all on function public.super_admin_update_profile_role(uuid, public.user_role) from anon;
revoke all on function public.super_admin_update_profile_role(uuid, public.user_role) from authenticated;
grant  execute on function public.super_admin_update_profile_role(uuid, public.user_role) to authenticated;

comment on function public.super_admin_update_profile_role(uuid, public.user_role) is
  'Phase 5A.3 super_admin write: updates profiles.role with self-target / super_admin / staff_viewer guards, plus a matching audit_events row in the same transaction.';
