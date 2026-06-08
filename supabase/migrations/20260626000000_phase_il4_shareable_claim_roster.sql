-- Phase IL.4: let rostered people claim their account via a shareable link.
--
-- Background. The shareable self-signup link (Phase IL.1-IL.3) provisions a
-- brand-new profile + auth user. Its redeem_invitation RPC rejected ANY email
-- that already had a profiles row (`email_taken`). But the common church
-- workflow imports/adds a roster first, so most invitees ALREADY have a
-- profiles row -- with `auth_user_id IS NULL` (no login yet). Those people
-- could never self-sign-up: the link always answered "email_taken" ->
-- "We couldn't sign you up with that email."
--
-- This migration teaches redeem_invitation to CLAIM such a roster profile:
-- relink it to the freshly-created auth user and activate it, instead of
-- refusing. It mirrors the relink in super_admin_complete_invite
-- (phase5a7 / os4) but with link-appropriate trust scoping, because a
-- shareable link is a low-trust, possibly-shared credential rather than a
-- super_admin action:
--   * Only a profile with `auth_user_id IS NULL` is claimable. A profile that
--     already has a linked login is a genuine identity -> `email_taken`
--     (mapped to the generic `email_unavailable`, so a link holder can't tell
--     a claimable roster row from a real account).
--   * A `super_admin` roster row is NEVER claimable via a link -> `forbidden_target`.
--   * Privilege cap: a link can only claim a profile at or BELOW the
--     invitation's own role (rank super_admin..co_leader). A low-level link
--     therefore can't seize a more-privileged roster row -> `forbidden_target`.
--   * Status allowlist: only a profile awaiting setup is claimable
--     ('active' = imported/roster without a login, or 'invited'). An 'inactive'
--     (deliberately disabled) profile is NOT claimable, so a link can't undo an
--     admin deactivation -> `forbidden_target`.
--   * The claim KEEPS the profile's existing role. A shared link must not be
--     able to elevate (or change) the role of a pre-existing person; the
--     invitation's role only applies when inserting a brand-new profile.
--   * The optional group_leaders assignment runs ONLY on the brand-new insert
--     path. Claiming an existing roster profile never changes its group
--     membership -- group seating for known people is managed by admins.
--
-- Everything else is reproduced verbatim from Phase IL.3
-- (20260604140000_phase_il3_invitation_redemption_cap.sql): the service-role
-- gate, invitation lock + revalidation, the per-invitation hourly cap (step
-- 2b -- the audit action string 'self_signup.redeem_invite' MUST stay
-- unchanged because the cap query keys on it), invitation consumption, and the
-- audit row. Idempotent via create or replace.

set check_function_bodies = off;

create or replace function public.redeem_invitation(
  p_token_hash text,
  p_auth_user_id uuid,
  p_full_name text,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_jwt_role text;
  v_inv public.invitations;
  v_full_name text;
  v_email text;
  v_profile_id uuid;
  v_gl_id uuid;
  v_gl_active boolean;
  v_group_state text := 'none';
  -- Profile resolution (claim-or-insert).
  v_existing_id uuid;
  v_existing_role public.user_role;
  v_existing_status public.profile_status;
  v_existing_auth uuid;
  v_before jsonb;
  v_relinked boolean := false;
  -- Max successful redemptions per invitation per trailing hour.
  v_redeem_cap_per_hour constant integer := 50;
begin
  -- 1. Service-role-only gate (Edge Function `redeem-invite`).
  v_jwt_role := current_setting('request.jwt.claims', true)::jsonb ->> 'role';
  if v_jwt_role is distinct from 'service_role' then
    raise exception 'edge_function_only';
  end if;

  if p_auth_user_id is null then
    raise exception 'invalid_input';
  end if;
  v_full_name := nullif(btrim(coalesce(p_full_name, '')), '');
  v_email     := nullif(lower(btrim(coalesce(p_email, ''))), '');
  if v_full_name is null or v_email is null then
    raise exception 'invalid_input';
  end if;

  -- 2. Lock + re-validate the invitation (defends against double-spend).
  select * into v_inv
    from public.invitations
   where token_hash = btrim(coalesce(p_token_hash, ''))
   for update;
  if not found then
    raise exception 'invitation_not_found';
  end if;
  if v_inv.revoked_at is not null then
    raise exception 'invitation_revoked';
  end if;
  if v_inv.expires_at <= now() then
    raise exception 'invitation_expired';
  end if;
  if v_inv.max_uses is not null and v_inv.used_count >= v_inv.max_uses then
    raise exception 'invitation_used';
  end if;

  -- 2b. Per-invitation hourly cap (IP-independent bound on a leaked reusable
  --     link). The FOR UPDATE lock above serializes same-invitation redemptions,
  --     so this count of prior redemptions in the window is exact.
  if (
    select count(*)
      from public.audit_events
     where action = 'self_signup.redeem_invite'
       and created_at >= now() - interval '1 hour'
       and (metadata ->> 'invitationId') = v_inv.id::text
  ) >= v_redeem_cap_per_hour then
    raise exception 'rate_limited';
  end if;

  -- 3. Resolve the profile by canonical email, locking the row. Email is the
  --    canonical key; the profiles_email_canonical CHECK guarantees a hit when
  --    one exists.
  select id, role, status, auth_user_id
    into v_existing_id, v_existing_role, v_existing_status, v_existing_auth
    from public.profiles
   where email = v_email
   for update;

  if found then
    -- 3a. A profile already linked to a login is a genuine identity. Keep the
    --     generic email_taken token (edge fn -> email_unavailable) so a link
    --     holder can't distinguish "claimable roster row" from "real account".
    if v_existing_auth is not null then
      raise exception 'email_taken';
    end if;

    -- 3b. Never let self-service claim a super_admin roster row.
    if v_existing_role = 'super_admin'::public.user_role then
      raise exception 'forbidden_target';
    end if;

    -- 3b-ii. Privilege cap. A shared link is a low-trust credential with no
    --        email verification, so it must NOT be usable to seize a roster
    --        account MORE privileged than the link itself grants. Rank roles
    --        (super_admin most privileged ... co_leader least) and reject when
    --        the existing profile outranks the invitation's role. A link can
    --        therefore only claim a profile at or below its own level (e.g. a
    --        leader link can claim a leader/co_leader row, never a
    --        ministry_admin/over_shepherd one). The role is kept as-is on claim,
    --        so this is a hard ceiling, not an escalation.
    if (case v_existing_role
          when 'super_admin'::public.user_role    then 0
          when 'ministry_admin'::public.user_role then 1
          when 'over_shepherd'::public.user_role  then 2
          when 'leader'::public.user_role         then 3
          when 'co_leader'::public.user_role      then 4
        end)
       <
       (case v_inv.role
          when 'super_admin'::public.user_role    then 0
          when 'ministry_admin'::public.user_role then 1
          when 'over_shepherd'::public.user_role  then 2
          when 'leader'::public.user_role         then 3
          when 'co_leader'::public.user_role      then 4
        end)
    then
      raise exception 'forbidden_target';
    end if;

    -- 3b-iii. Only a profile awaiting setup is claimable. A shareable link must
    --         NOT be able to undo a deliberate admin deactivation: reject any
    --         status outside the allowlist. 'active' = imported/roster awaiting
    --         login; 'invited' = pending invite. 'inactive' (disabled) is never
    --         claimable; kept generic (forbidden_target -> email_unavailable) so
    --         the link can't reveal that a disabled account exists.
    if v_existing_status not in (
      'active'::public.profile_status,
      'invited'::public.profile_status
    ) then
      raise exception 'forbidden_target';
    end if;

    -- 3c. Claimable roster profile: relink to the new auth user + activate.
    --     KEEP the existing role (do NOT apply the invitation role to a
    --     pre-existing profile). profiles.auth_user_id is UNIQUE: if the
    --     inbound auth user is already linked elsewhere, surface a stable
    --     conflict token (edge fn -> email_unavailable).
    v_before := jsonb_build_object(
      'role', v_existing_role,
      'status', v_existing_status,
      'auth_user_id_set', false,
      'relinked', true
    );
    begin
      update public.profiles
         set auth_user_id = p_auth_user_id,
             full_name    = v_full_name,
             status       = 'active'::public.profile_status
       where id = v_existing_id;
    exception
      when unique_violation then
        raise exception 'profile_write_conflict';
    end;
    v_profile_id := v_existing_id;
    v_relinked := true;
  else
    -- 3d. Brand-new: insert using the invitation's role.
    begin
      insert into public.profiles (
        auth_user_id, full_name, email, role, status
      ) values (
        p_auth_user_id, v_full_name, v_email, v_inv.role,
        'active'::public.profile_status
      )
      returning id into v_profile_id;
    exception
      when unique_violation then
        raise exception 'email_taken';
    end;
    v_before := jsonb_build_object('role', null, 'status', null);
  end if;

  -- 4. Optional group_leaders assignment (leader / co_leader only). Runs ONLY
  --    for a brand-new profile; claiming an existing roster profile never
  --    changes its group membership.
  if not v_relinked
     and v_inv.role in ('leader'::public.user_role, 'co_leader'::public.user_role)
     and v_inv.group_id is not null then
    perform 1 from public.groups where id = v_inv.group_id;
    if not found then
      raise exception 'missing_group';
    end if;

    select id, active
      into v_gl_id, v_gl_active
      from public.group_leaders
     where group_id = v_inv.group_id
       and profile_id = v_profile_id
       and role = v_inv.role::public.role_in_group
     for update;

    if not found then
      begin
        insert into public.group_leaders (group_id, profile_id, role, active)
        values (v_inv.group_id, v_profile_id, v_inv.role::public.role_in_group, true);
        v_group_state := 'created';
      exception
        when unique_violation then
          select active into v_gl_active
            from public.group_leaders
           where group_id = v_inv.group_id
             and profile_id = v_profile_id
             and role = v_inv.role::public.role_in_group;
          if v_gl_active then
            v_group_state := 'already_active';
          else
            update public.group_leaders
               set active = true
             where group_id = v_inv.group_id
               and profile_id = v_profile_id
               and role = v_inv.role::public.role_in_group;
            v_group_state := 'reactivated';
          end if;
      end;
    elsif v_gl_active then
      v_group_state := 'already_active';
    else
      update public.group_leaders set active = true where id = v_gl_id;
      v_group_state := 'reactivated';
    end if;
  end if;

  -- 5. Consume the invitation.
  update public.invitations
     set used_count = used_count + 1
   where id = v_inv.id;

  -- 6. Audit row -- same transaction. The actor is the link's creator; the
  --    redeemer has no profile id of their own until this redemption.
  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_inv.created_by_profile_id,
    'self_signup.redeem_invite',
    'profiles',
    v_profile_id,
    jsonb_build_object(
      'invitationId', v_inv.id,
      'email', v_email,
      'role', coalesce(v_existing_role, v_inv.role),
      'groupId', v_inv.group_id,
      'groupAssignmentState', v_group_state,
      'singleUse', v_inv.single_use,
      'relinked', v_relinked,
      'before', v_before,
      'after', jsonb_build_object(
        'role', coalesce(v_existing_role, v_inv.role),
        'status', 'active'
      )
    )
  );

  return jsonb_build_object(
    'profile_id', v_profile_id,
    'group_assignment_state', v_group_state
  );
end;
$$;

-- Grants: revoke from public/anon/authenticated; grant ONLY to service_role.
-- (create or replace preserves prior grants; re-applied here for parity and
-- so a fresh environment built from this file alone is correct.)
revoke all     on function public.redeem_invitation(text, uuid, text, text) from public;
revoke all     on function public.redeem_invitation(text, uuid, text, text) from anon;
revoke all     on function public.redeem_invitation(text, uuid, text, text) from authenticated;
grant  execute on function public.redeem_invitation(text, uuid, text, text) to service_role;
