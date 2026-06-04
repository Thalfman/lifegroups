-- Phase IL.3: per-invitation redemption rate cap.
--
-- IP-based throttling on the public redeem endpoint (Phase IL.2) can't fully
-- bound a determined attacker with many IPs who holds a leaked REUSABLE link.
-- This adds an IP-independent ceiling: a single invitation can be redeemed at
-- most N times per trailing hour, enforced inside redeem_invitation under the
-- invitation row's FOR UPDATE lock (so concurrent redemptions of the same link
-- are serialized and the count is exact — no race). Single-use links hit
-- invitation_used first, so this only bites reusable links being drained at
-- machine speed; the cap is generous enough that a normal group signing up
-- together is unaffected.
--
-- The recent-redemption count comes from the existing audit trail
-- (action = 'self_signup.redeem_invite', metadata.invitationId), so no new
-- table is needed. Reproduces redeem_invitation verbatim from phase IL.1 with
-- the single cap check added (step 2b); idempotent via create or replace.

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

  -- 3. Self-signup never claims an existing identity. If ANY profile already
  --    uses this canonical email, reject: a shared link must not be usable to
  --    seize a pre-created profile/login by typing its address. The link only
  --    ever provisions a brand-new profile + auth user.
  perform 1 from public.profiles where email = v_email;
  if found then
    raise exception 'email_taken';
  end if;

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

  -- 4. Optional group_leaders assignment (leader / co_leader only).
  if v_inv.role in ('leader'::public.user_role, 'co_leader'::public.user_role)
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
  --    redeemer has no profile id until this row creates it.
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
      'role', v_inv.role,
      'groupId', v_inv.group_id,
      'groupAssignmentState', v_group_state,
      'singleUse', v_inv.single_use,
      'before', jsonb_build_object('role', null, 'status', null),
      'after', jsonb_build_object('role', v_inv.role, 'status', 'active')
    )
  );

  return jsonb_build_object(
    'profile_id', v_profile_id,
    'group_assignment_state', v_group_state
  );
end;
$$;

revoke all     on function public.redeem_invitation(text, uuid, text, text) from public;
revoke all     on function public.redeem_invitation(text, uuid, text, text) from anon;
revoke all     on function public.redeem_invitation(text, uuid, text, text) from authenticated;
grant  execute on function public.redeem_invitation(text, uuid, text, text) to service_role;
