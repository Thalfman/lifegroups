-- Invitee chooses their own name (ADR 0025).
--
-- The named invite flows (email invite / copy invite link) used to require
-- the Super Admin to type the invitee's full name, which the invite RPC then
-- wrote into profiles.full_name (overwriting the existing name on the relink
-- path). Per ADR 0025 the invitee now chooses their own name when they set
-- their password (/reset-password), with a post-login /welcome gate as the
-- fallback for sessions that never pass through it (e.g. an invited email
-- that already had a login). The anonymous shareable-link flow (IL.1) already
-- collects the name from the invitee and is unchanged.
--
-- Three pieces:
--   (a) profiles.full_name_pending — tracks "this person hasn't chosen their
--       name yet". Default false is the backfill: every existing row carries a
--       real (inviter- or self-chosen) name, and redeem_invitation / roster
--       creation keep writing non-pending rows implicitly.
--   (b) super_admin_complete_invite re-created with p_full_name optional and
--       IGNORED. Kept in the signature (default null) deliberately: CREATE OR
--       REPLACE with the identical arg-type list preserves the existing
--       service_role-only EXECUTE grants, and an already-deployed Edge
--       Function still sending p_full_name keeps resolving during the deploy
--       window. Insert path stores the canonical email as the display-name
--       placeholder (full_name stays NOT NULL); relink path keeps the
--       existing name (no more overwrite). Both mark full_name_pending so
--       the invitee confirms or edits it.
--   (c) set_own_full_name — the one self-service write: an authenticated user
--       sets their OWN profile's name, only while it is pending. Not a
--       general rename surface; once chosen, name edits stay an admin
--       operation.

-- ---------------------------------------------------------------------------
-- (a) profiles.full_name_pending
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column full_name_pending boolean not null default false;

comment on column public.profiles.full_name_pending is
  'True while an invited person has not yet chosen their own display name (ADR 0025). While pending, full_name holds a placeholder (the canonical email on freshly inserted invites) or the pre-invite roster name on relinks. Cleared by set_own_full_name.';

-- ---------------------------------------------------------------------------
-- (b) super_admin_complete_invite — invitee-owned name
-- ---------------------------------------------------------------------------
-- Body reproduced from 20260529003000_phase_os4_over_shepherd_provisioning.sql
-- with three changes: p_full_name is optional and ignored, the insert path
-- stores the canonical email as the placeholder name + full_name_pending=true,
-- and the relink path stops overwriting full_name and marks it pending.
-- CREATE OR REPLACE with the same arg types preserves the service_role-only
-- EXECUTE grants from 20260518150000_phase5a7_super_admin_invite.sql.
create or replace function public.super_admin_complete_invite(
  p_actor_profile_id uuid,
  p_auth_user_id uuid,
  p_full_name text default null,
  p_email text default null,
  p_role public.user_role default null,
  p_phone text default null,
  p_group_id uuid default null,
  p_auth_user_state text default null
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
  v_email text;
  v_phone text;
  v_profile_id uuid;
  v_existing_id uuid;
  v_existing_role public.user_role;
  v_existing_status public.profile_status;
  v_existing_auth uuid;
  v_existing_pending boolean;
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
  --    these as well; this is the security boundary. over_shepherd is
  --    invitable per docs/adr/0002-oversight-ladder-and-leader-gating.md.
  --    p_full_name is intentionally NOT read: the invitee chooses their own
  --    name (ADR 0025); the inviter can never set it.
  if p_role is null or p_role not in (
    'ministry_admin'::public.user_role,
    'over_shepherd'::public.user_role,
    'leader'::public.user_role,
    'co_leader'::public.user_role
  ) then
    raise exception 'invalid_role';
  end if;

  if p_auth_user_id is null then
    raise exception 'invalid_input';
  end if;

  v_email := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_phone := nullif(btrim(coalesce(p_phone, '')), '');
  if v_email is null then
    raise exception 'invalid_input';
  end if;

  if p_role = 'ministry_admin'::public.user_role and p_group_id is not null then
    raise exception 'group_not_allowed_for_ministry_admin';
  end if;

  -- 4. Profile resolution. Email is the canonical key; the lowercase
  --    CHECK constraint (phase5a7) guarantees a hit when one exists.
  select id, role, status, auth_user_id, full_name_pending
    into v_existing_id, v_existing_role, v_existing_status, v_existing_auth,
         v_existing_pending
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
      'auth_user_id_changed', v_existing_auth is distinct from p_auth_user_id,
      'full_name_pending', v_existing_pending
    );
    -- Keep the existing full_name: the invitee confirms or edits it at
    -- /reset-password (prefilled), so the relink no longer overwrites a
    -- name already in use on roster surfaces.
    -- profiles.auth_user_id is UNIQUE. If the resolved auth user is
    -- already linked to a different profile row, this update will fail
    -- with unique_violation; surface a stable conflict token so the UI
    -- offers retry / manual fixup guidance instead of a generic db_error.
    begin
      update public.profiles
         set auth_user_id      = p_auth_user_id,
             phone             = v_phone,
             role              = p_role,
             status            = 'active'::public.profile_status,
             full_name_pending = true
       where id = v_existing_id;
    exception
      when unique_violation then
        raise exception 'profile_write_conflict';
    end;
    v_profile_id := v_existing_id;
  else
    begin
      -- Placeholder display name until the invitee chooses one: the
      -- canonical email, so admin lists stay recognizable while pending.
      insert into public.profiles (
        auth_user_id, full_name, email, phone, role, status,
        full_name_pending
      ) values (
        p_auth_user_id, v_email, v_email, v_phone, p_role,
        'active'::public.profile_status, true
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
    v_before := jsonb_build_object(
      'role', null, 'status', null, 'full_name_pending', null
    );
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
      -- The (group_id, profile_id, role) UNIQUE constraint means a
      -- parallel writer could insert the same triple between our SELECT
      -- and INSERT. Catch the race, re-read the row state, and report
      -- the correct outcome instead of bubbling unique_violation as a
      -- generic db_error.
      begin
        insert into public.group_leaders (group_id, profile_id, role, active)
        values (p_group_id, v_profile_id, p_role::public.role_in_group, true);
        v_group_state := 'created';
      exception
        when unique_violation then
          select active into v_gl_active
            from public.group_leaders
           where group_id = p_group_id
             and profile_id = v_profile_id
             and role = p_role::public.role_in_group;
          if v_gl_active then
            v_group_state := 'already_active';
          else
            update public.group_leaders
               set active = true
             where group_id = p_group_id
               and profile_id = v_profile_id
               and role = p_role::public.role_in_group;
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

  -- 6. Audit row -- same transaction as the writes above. Keys consumed by
  --    lib/admin/audit-summary.ts (email, role, groupAssignmentState,
  --    groupId, after.role) are preserved; no name text is recorded.
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
      'namePolicy', 'invitee_chooses',
      'before', v_before,
      'after', jsonb_build_object(
        'role', p_role, 'status', 'active', 'full_name_pending', true
      )
    )
  );

  return jsonb_build_object(
    'profile_id', v_profile_id,
    'group_assignment_state', v_group_state
  );
end;
$$;

comment on function public.super_admin_complete_invite(
  uuid, uuid, text, text, public.user_role, text, uuid, text
) is
  'Super_admin invite write (ADR 0025): relinks or inserts a profiles row (status=active, full_name_pending=true; fresh inserts use the canonical email as the display-name placeholder, relinks keep the existing name), optionally upserts group_leaders for leader/co_leader, and writes a matching super_admin.invite_user audit_events row in a single transaction. p_full_name is accepted for call compatibility but ignored — the invitee chooses their own name via set_own_full_name. Service-role-only; called by supabase/functions/invite-user/index.ts after Supabase Auth invite/lookup.';

-- ---------------------------------------------------------------------------
-- (c) set_own_full_name — the invitee picks their display name
-- ---------------------------------------------------------------------------
-- Called from /reset-password (name + password on one screen) and the
-- /welcome fallback gate. Locks the caller's own profile row, requires the
-- name to still be pending, writes the chosen name, clears the flag, and
-- records a content-free audit row — all in one transaction.
create or replace function public.set_own_full_name(
  p_full_name text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text;
  v_profile_id uuid;
  v_pending boolean;
begin
  v_name := nullif(btrim(coalesce(p_full_name, '')), '');
  if v_name is null or char_length(v_name) > 200 then
    raise exception 'invalid_input';
  end if;

  select id, full_name_pending
    into v_profile_id, v_pending
    from public.profiles
   where auth_user_id = auth.uid()
     and status = 'active'::public.profile_status
   for update;

  if v_profile_id is null then
    raise exception 'insufficient_privilege';
  end if;
  -- Only-while-pending: this is not a general rename surface. Once chosen,
  -- name edits stay an admin operation.
  if not v_pending then
    raise exception 'name_not_pending';
  end if;

  update public.profiles
     set full_name = v_name,
         full_name_pending = false
   where id = v_profile_id;

  -- Content-free audit metadata: entity_id identifies the row; the chosen
  -- name itself is not recorded.
  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_profile_id,
    'account.set_own_full_name',
    'profiles',
    v_profile_id,
    jsonb_build_object(
      'before', jsonb_build_object('full_name_pending', true),
      'after', jsonb_build_object('full_name_pending', false)
    )
  );

  return v_profile_id;
end;
$$;

revoke all on function public.set_own_full_name(text) from public;
revoke all on function public.set_own_full_name(text) from anon;
revoke all on function public.set_own_full_name(text) from authenticated;
grant execute on function public.set_own_full_name(text) to authenticated;

comment on function public.set_own_full_name(text) is
  'Self-service write (ADR 0025): an authenticated user sets their OWN profile''s full_name, only while full_name_pending is true. Clears the flag and writes a paired account.set_own_full_name audit_events row (content-free metadata) in the same transaction. Raises invalid_input (empty or >200 chars), insufficient_privilege (no active own profile), name_not_pending.';
