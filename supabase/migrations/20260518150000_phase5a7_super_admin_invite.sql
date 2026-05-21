-- Phase 5A.7: Super admin invite user workflow.
--
-- Backs the new /admin/super-admin "Invite user" card. The form posts to a
-- thin Next server action that invokes the Supabase Edge Function
-- `invite-user`. The Edge Function holds the service-role key, calls
-- Supabase Auth Admin (`inviteUserByEmail` / `listUsers`), and then makes
-- one transactional RPC call here to write the profile, the optional
-- group_leaders assignment, and the audit row in a single transaction.
--
-- Architecture parity with Phase 5A.1 / 5A.3:
--   * No new tables, no new enums, no new INSERT/UPDATE/DELETE policies
--     on profiles or group_leaders. RLS stays SELECT-only outside the
--     SECURITY DEFINER surface.
--   * audit_events RLS is unchanged.
--   * No hard deletes anywhere.
--   * The function body is the security boundary: it requires the JWT
--     `role` claim to be `service_role` (Edge Function only) AND
--     re-verifies that the passed actor profile is an active super_admin.
--   * The data change and the matching audit_events row commit in the
--     same transaction.
--
-- Fixed error tokens raised, mapped to friendly messages by the Edge
-- Function and `app/(protected)/admin/super-admin/invite-user-actions.ts`:
--   edge_function_only, invalid_actor, invalid_role, invalid_input,
--   group_not_allowed_for_ministry_admin, forbidden_target,
--   missing_group, profile_write_conflict.

-- ---------------------------------------------------------------------------
-- (a) Email canonicalization on profiles.
-- ---------------------------------------------------------------------------
-- Existing admin_* RPCs already lowercase on insert. This backfills any
-- historical row (manual bootstrap inserts, Supabase Studio edits) and
-- adds a CHECK constraint so the email-based relink path in
-- super_admin_complete_invite cannot miss matches due to mixed case.
update public.profiles
   set email = lower(email)
 where email is not null and email <> lower(email);

alter table public.profiles
  add constraint profiles_email_lowercase
  check (email = lower(email)) not valid;

alter table public.profiles
  validate constraint profiles_email_lowercase;

-- ---------------------------------------------------------------------------
-- (b) super_admin_complete_invite
-- ---------------------------------------------------------------------------
-- Atomic write paired to the Edge Function's auth.admin.inviteUserByEmail
-- / findAuthUserByEmail result. Resolves a profile row (relink existing
-- by canonical email, or insert), optionally upserts group_leaders, and
-- writes a single audit_events row -- all in one transaction.
--
-- Security:
--   1. JWT `role` claim must be 'service_role'. Only the Edge Function
--      (which uses the service-role key) can call. anon / authenticated
--      sessions are rejected.
--   2. Re-verify the actor profile (defense in depth): the Edge Function
--      has already gated on super_admin, but the RPC remains safe even
--      if someone with service-role access tries to call it directly
--      with the wrong actor id.
create or replace function public.super_admin_complete_invite(
  p_actor_profile_id uuid,
  p_auth_user_id uuid,
  p_full_name text,
  p_email text,
  p_role public.user_role,
  p_phone text,
  p_group_id uuid,
  p_auth_user_state text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_jwt_role text;
  v_actor_role public.user_role;
  v_actor_status public.profile_status;
  v_full_name text;
  v_email text;
  v_phone text;
  v_profile_id uuid;
  v_existing_id uuid;
  v_existing_role public.user_role;
  v_existing_status public.profile_status;
  v_existing_auth uuid;
  v_before jsonb;
  v_gl_id uuid;
  v_gl_active boolean;
  v_group_state text := 'none';
begin
  -- 1. Service-role-only gate.
  v_jwt_role := current_setting('request.jwt.claims', true)::jsonb ->> 'role';
  if v_jwt_role is distinct from 'service_role' then
    raise exception 'edge_function_only';
  end if;

  -- 2. Actor re-verification.
  if p_actor_profile_id is null then
    raise exception 'invalid_actor';
  end if;
  select role, status
    into v_actor_role, v_actor_status
    from public.profiles
   where id = p_actor_profile_id
   for share;
  if v_actor_role is null
     or v_actor_role is distinct from 'super_admin'::public.user_role
     or v_actor_status is distinct from 'active'::public.profile_status then
    raise exception 'invalid_actor';
  end if;

  -- 3. Input validation. The Edge Function and TS validator both check
  --    these as well; this is the security boundary.
  if p_role not in (
    'ministry_admin'::public.user_role,
    'leader'::public.user_role,
    'co_leader'::public.user_role
  ) then
    raise exception 'invalid_role';
  end if;

  if p_auth_user_id is null then
    raise exception 'invalid_input';
  end if;

  v_full_name := nullif(btrim(coalesce(p_full_name, '')), '');
  v_email     := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_phone     := nullif(btrim(coalesce(p_phone, '')), '');
  if v_full_name is null or v_email is null then
    raise exception 'invalid_input';
  end if;

  if p_role = 'ministry_admin'::public.user_role and p_group_id is not null then
    raise exception 'group_not_allowed_for_ministry_admin';
  end if;

  -- 4. Profile resolution. Email is the canonical key; the lowercase
  --    CHECK constraint above guarantees a hit when one exists.
  select id, role, status, auth_user_id
    into v_existing_id, v_existing_role, v_existing_status, v_existing_auth
    from public.profiles
   where email = v_email
   for update;

  if found then
    if v_existing_role = 'super_admin'::public.user_role then
      raise exception 'forbidden_target';
    end if;
    v_before := jsonb_build_object(
      'role', v_existing_role,
      'status', v_existing_status,
      'auth_user_id_set', v_existing_auth is not null,
      'auth_user_id_changed', v_existing_auth is distinct from p_auth_user_id
    );
    update public.profiles
       set auth_user_id = p_auth_user_id,
           full_name    = v_full_name,
           phone        = v_phone,
           role         = p_role,
           status       = 'active'::public.profile_status
     where id = v_existing_id;
    v_profile_id := v_existing_id;
  else
    begin
      insert into public.profiles (
        auth_user_id, full_name, email, phone, role, status
      ) values (
        p_auth_user_id, v_full_name, v_email, v_phone, p_role,
        'active'::public.profile_status
      )
      returning id into v_profile_id;
    exception
      when unique_violation then
        -- Race: a parallel writer inserted between SELECT and INSERT,
        -- OR another profile is already linked to this auth_user_id
        -- (profiles.auth_user_id is UNIQUE). Either way the caller
        -- should retry.
        raise exception 'profile_write_conflict';
    end;
    v_before := jsonb_build_object('role', null, 'status', null);
  end if;

  -- 5. Optional group_leaders assignment.
  if p_role in ('leader'::public.user_role, 'co_leader'::public.user_role)
     and p_group_id is not null then
    perform 1 from public.groups where id = p_group_id;
    if not found then
      raise exception 'missing_group';
    end if;

    select id, active
      into v_gl_id, v_gl_active
      from public.group_leaders
     where group_id = p_group_id
       and profile_id = v_profile_id
       and role = p_role::public.role_in_group
     for update;

    if not found then
      insert into public.group_leaders (group_id, profile_id, role, active)
      values (p_group_id, v_profile_id, p_role::public.role_in_group, true);
      v_group_state := 'created';
    elsif v_gl_active then
      v_group_state := 'already_active';
    else
      update public.group_leaders set active = true where id = v_gl_id;
      v_group_state := 'reactivated';
    end if;
  end if;

  -- 6. Audit row -- same transaction as the writes above.
  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    p_actor_profile_id,
    'super_admin.invite_user',
    'profiles',
    v_profile_id,
    jsonb_build_object(
      'email', v_email,
      'role', p_role,
      'authUserState', p_auth_user_state,
      'groupAssignmentState', v_group_state,
      'groupId', p_group_id,
      'method', 'edge_function',
      'before', v_before,
      'after', jsonb_build_object('role', p_role, 'status', 'active')
    )
  );

  return jsonb_build_object(
    'profile_id', v_profile_id,
    'group_assignment_state', v_group_state
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants. Revoke from public/anon/authenticated; grant ONLY to service_role.
-- The function body's JWT-role gate is the security boundary, but limiting
-- EXECUTE prevents accidental exposure via PostgREST.
-- ---------------------------------------------------------------------------
revoke all on function public.super_admin_complete_invite(
  uuid, uuid, text, text, public.user_role, text, uuid, text
) from public;
revoke all on function public.super_admin_complete_invite(
  uuid, uuid, text, text, public.user_role, text, uuid, text
) from anon;
revoke all on function public.super_admin_complete_invite(
  uuid, uuid, text, text, public.user_role, text, uuid, text
) from authenticated;
grant execute on function public.super_admin_complete_invite(
  uuid, uuid, text, text, public.user_role, text, uuid, text
) to service_role;

comment on function public.super_admin_complete_invite(
  uuid, uuid, text, text, public.user_role, text, uuid, text
) is
  'Phase 5A.7 super_admin write: relinks or inserts a profiles row (status=active), optionally upserts group_leaders for leader/co_leader, and writes a matching super_admin.invite_user audit_events row in a single transaction. Service-role-only; called by supabase/functions/invite-user/index.ts after Supabase Auth invite/lookup.';
