-- Phase OS.4: provision the Over-Shepherd login tier from the app.
--
-- The role-change RPC (super_admin_update_profile_role, phase5a3) already
-- accepts over_shepherd — it only rejects super_admin / staff_viewer — so
-- converting an existing profile into the coach tier works once the role
-- appears in the role-change select. The invite RPC, however, carries a
-- POSITIVE allowlist (ministry_admin / leader / co_leader) and rejects every
-- other role with invalid_role. This migration re-creates
-- super_admin_complete_invite with over_shepherd added to that allowlist so a
-- coach can be invited directly, per Codex review #3 on PR #106
-- (docs/adr/0002-oversight-ladder-and-leader-gating.md).
--
-- CREATE OR REPLACE preserves the existing EXECUTE grants (service_role only),
-- so no re-grant is needed. The function body is reproduced verbatim from
-- 20260518150000_phase5a7_super_admin_invite.sql with the single allowlist
-- change; over_shepherd is not a group leader, so it falls through the
-- leader/co_leader-only group-assignment block exactly like ministry_admin.

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
  --    these as well; this is the security boundary. over_shepherd is
  --    invitable per docs/adr/0002-oversight-ladder-and-leader-gating.md.
  if p_role not in (
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
    -- profiles.auth_user_id is UNIQUE. If the resolved auth user is
    -- already linked to a different profile row, this update will fail
    -- with unique_violation; surface a stable conflict token so the UI
    -- offers retry / manual fixup guidance instead of a generic db_error.
    begin
      update public.profiles
         set auth_user_id = p_auth_user_id,
             full_name    = v_full_name,
             phone        = v_phone,
             role         = p_role,
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
