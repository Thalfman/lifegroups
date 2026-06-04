-- Phase IL.1: Shareable self-signup invite links.
--
-- Adds a token-based invite model alongside the existing email/action_link
-- invite (phase 5A.7 / OS.4). A super_admin generates a link that carries a
-- role (+ optional group) and an expiry but NO invitee identity. The invited
-- person opens `${SITE_URL}/invite/<token>` and supplies their own full name,
-- email, and password; redeeming the link creates/relinks their profile with
-- the invitation's role and (optionally) group, and sets their login
-- credentials.
--
-- Only the sha256 hash of the raw token is stored; the raw token lives only in
-- the URL the super_admin copies. Three RPCs back the flow:
--   * super_admin_create_invitation  — authenticated, super_admin-gated mint.
--   * peek_invitation                — anon-callable validity probe for the
--                                      public landing page (no mutation).
--   * redeem_invitation              — service-role-only atomic consume +
--                                      profile/group write + audit, mirroring
--                                      super_admin_complete_invite.
--
-- Architecture parity with phase 5A.7: RLS stays SELECT-only outside the
-- SECURITY DEFINER surface; no hard deletes; data change + audit row commit in
-- the same transaction.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- (a) invitations table
-- ---------------------------------------------------------------------------
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  -- sha256 hex of the raw token; the raw token is never stored.
  token_hash text not null unique,
  role public.user_role not null,
  group_id uuid references public.groups(id) on delete cascade,
  single_use boolean not null default true,
  -- 1 when single_use, NULL = unlimited until expiry.
  max_uses int,
  used_count int not null default 0,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by_profile_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint invitations_role_allowed
    check (role in ('ministry_admin','over_shepherd','leader','co_leader')),
  -- Only group-leading roles can carry a group assignment.
  constraint invitations_group_role
    check (group_id is null or role in ('leader','co_leader')),
  constraint invitations_used_count_nonneg check (used_count >= 0),
  constraint invitations_max_uses_positive check (max_uses is null or max_uses >= 1)
);

create index invitations_expires_at_idx on public.invitations (expires_at);

alter table public.invitations enable row level security;

-- SELECT-only for super_admin (supports a future "manage links" surface). All
-- writes happen through the SECURITY DEFINER RPCs below; no INSERT/UPDATE/DELETE
-- policies, matching the rest of the schema.
create policy invitations_super_admin_select on public.invitations
  for select to authenticated
  using (public.auth_role() = 'super_admin');

-- ---------------------------------------------------------------------------
-- (b) super_admin_create_invitation — mint a link (authenticated super_admin).
-- ---------------------------------------------------------------------------
-- Same gate shape as super_admin_set_profile_status (phase SAC.3): SECURITY
-- DEFINER behind auth_role() = 'super_admin', paired audit row in the same txn,
-- no service-role write. The raw token is generated + hashed in the Next server
-- action; only its hash crosses the boundary here.
create or replace function public.super_admin_create_invitation(
  p_token_hash text,
  p_role public.user_role,
  p_group_id uuid,
  p_single_use boolean,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_id uuid;
  v_max_uses int;
  v_single_use boolean := coalesce(p_single_use, true);
begin
  if public.auth_role() <> 'super_admin' then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_token_hash is null or btrim(p_token_hash) = '' then
    raise exception 'invalid_input';
  end if;

  if p_role not in (
    'ministry_admin'::public.user_role,
    'over_shepherd'::public.user_role,
    'leader'::public.user_role,
    'co_leader'::public.user_role
  ) then
    raise exception 'invalid_role';
  end if;

  -- Only leaders / co-leaders carry a group assignment.
  if p_group_id is not null
     and p_role not in ('leader'::public.user_role, 'co_leader'::public.user_role) then
    raise exception 'group_not_allowed';
  end if;
  if p_group_id is not null then
    perform 1 from public.groups where id = p_group_id;
    if not found then
      raise exception 'missing_group';
    end if;
  end if;

  if p_expires_at is null
     or p_expires_at <= now()
     or p_expires_at > now() + interval '90 days' then
    raise exception 'invalid_expiry';
  end if;

  v_max_uses := case when v_single_use then 1 else null end;

  insert into public.invitations (
    token_hash, role, group_id, single_use, max_uses, expires_at, created_by_profile_id
  ) values (
    btrim(p_token_hash), p_role, p_group_id, v_single_use, v_max_uses, p_expires_at, v_actor
  )
  returning id into v_id;

  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'super_admin.create_invite_link',
    'invitations',
    v_id,
    jsonb_build_object(
      'role', p_role,
      'groupId', p_group_id,
      'singleUse', v_single_use,
      'expiresAt', p_expires_at
    )
  );

  return v_id;
end;
$$;

revoke all     on function public.super_admin_create_invitation(text, public.user_role, uuid, boolean, timestamptz) from public;
revoke all     on function public.super_admin_create_invitation(text, public.user_role, uuid, boolean, timestamptz) from anon;
revoke all     on function public.super_admin_create_invitation(text, public.user_role, uuid, boolean, timestamptz) from authenticated;
grant  execute on function public.super_admin_create_invitation(text, public.user_role, uuid, boolean, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- (c) peek_invitation — public validity probe for the landing page.
-- ---------------------------------------------------------------------------
-- Returns only the link's validity + role. Reading anything requires possessing
-- the raw token (the caller hashes it), and the hash is over a 256-bit secret,
-- so exposing this to anon does not leak invite contents to a blind probe.
create or replace function public.peek_invitation(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inv public.invitations;
begin
  if p_token_hash is null or btrim(p_token_hash) = '' then
    return jsonb_build_object('status', 'not_found');
  end if;

  select * into v_inv
    from public.invitations
   where token_hash = btrim(p_token_hash);

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_inv.revoked_at is not null then
    return jsonb_build_object('status', 'revoked');
  end if;
  if v_inv.expires_at <= now() then
    return jsonb_build_object('status', 'expired');
  end if;
  if v_inv.max_uses is not null and v_inv.used_count >= v_inv.max_uses then
    return jsonb_build_object('status', 'used');
  end if;

  return jsonb_build_object('status', 'valid', 'role', v_inv.role);
end;
$$;

revoke all     on function public.peek_invitation(text) from public;
grant  execute on function public.peek_invitation(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- (d) redeem_invitation — service-role-only atomic consume + profile write.
-- ---------------------------------------------------------------------------
-- Mirrors super_admin_complete_invite (phase 5A.7 / OS.4): service-role gate,
-- relink-by-canonical-email or insert, optional group_leaders upsert, audit row,
-- all in one transaction. Additionally locks + consumes the invitation row so a
-- single-use link can't be double-spent under concurrency.
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
  v_existing_id uuid;
  v_existing_role public.user_role;
  v_existing_status public.profile_status;
  v_existing_auth uuid;
  v_before jsonb;
  v_gl_id uuid;
  v_gl_active boolean;
  v_group_state text := 'none';
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

  -- 3. Profile resolution. Canonical email is the key; the lowercase CHECK on
  --    profiles.email guarantees a hit when a row already exists.
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
      'auth_user_id_set', v_existing_auth is not null
    );
    begin
      update public.profiles
         set auth_user_id = p_auth_user_id,
             full_name    = v_full_name,
             role         = v_inv.role,
             status       = 'active'::public.profile_status
       where id = v_existing_id;
    exception
      when unique_violation then
        raise exception 'profile_write_conflict';
    end;
    v_profile_id := v_existing_id;
  else
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
        raise exception 'profile_write_conflict';
    end;
    v_before := jsonb_build_object('role', null, 'status', null);
  end if;

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
      'before', v_before,
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

comment on table public.invitations is
  'Phase IL.1 shareable self-signup invite links. Stores only the sha256 hash of the raw token; role (+ optional group) and expiry are set by a super_admin, the invitee supplies their own identity + password on redemption.';
