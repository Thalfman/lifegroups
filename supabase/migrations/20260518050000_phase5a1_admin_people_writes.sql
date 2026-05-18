-- Phase 5A.1: Admin people & assignment writes.
--
-- This migration introduces the ONLY write path for the Phase 5A.1 admin
-- workflows: six narrow SECURITY DEFINER RPC functions. Each function is
-- the security boundary -- RLS does NOT protect writes inside the
-- function body. Every function therefore explicitly enforces:
--   * auth_is_admin() (or raise insufficient_privilege)
--   * auth_profile_id() is not null
--   * target existence
--   * self-target / role / forbidden-target guards
--
-- No new tables, no new enums, no new INSERT/UPDATE/DELETE policies on
-- the underlying tables. Phase 4 RLS stays SELECT-only. Each function
-- writes its data change AND the matching public.audit_events row in a
-- single transaction; if the audit insert fails, the data change rolls
-- back. No deletes anywhere -- deactivation only.
--
-- Fixed error tokens raised by these functions, mapped to friendly
-- messages by the calling server action:
--   insufficient_privilege, duplicate_email, duplicate_assignment,
--   missing_group, missing_profile, missing_member, forbidden_target,
--   self_target_not_allowed, invalid_role, inactive_target.

-- ---------------------------------------------------------------------------
-- 1. admin_create_leader_profile
-- ---------------------------------------------------------------------------
create or replace function public.admin_create_leader_profile(
  p_full_name text,
  p_email text,
  p_phone text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_full_name text;
  v_email text;
  v_phone text;
  v_new_id uuid;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;

  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  v_full_name := nullif(btrim(coalesce(p_full_name, '')), '');
  v_email     := nullif(btrim(coalesce(p_email, '')), '');
  v_phone     := nullif(btrim(coalesce(p_phone, '')), '');

  if v_full_name is null or v_email is null then
    raise exception 'invalid_input';
  end if;

  begin
    insert into public.profiles (full_name, email, phone, role, status)
    values (v_full_name, v_email, v_phone, 'leader'::public.user_role, 'active'::public.profile_status)
    returning id into v_new_id;
  exception
    when unique_violation then
      raise exception 'duplicate_email';
  end;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.create_leader_profile',
    'profiles',
    v_new_id,
    jsonb_build_object(
      'after',
      jsonb_build_object(
        'role', 'leader',
        'status', 'active',
        'full_name', v_full_name,
        'email', v_email
      )
    )
  );

  return v_new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. admin_create_member
-- ---------------------------------------------------------------------------
create or replace function public.admin_create_member(
  p_full_name text,
  p_email text,
  p_phone text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_full_name text;
  v_email text;
  v_phone text;
  v_new_id uuid;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;

  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  v_full_name := nullif(btrim(coalesce(p_full_name, '')), '');
  v_email     := nullif(btrim(coalesce(p_email, '')), '');
  v_phone     := nullif(btrim(coalesce(p_phone, '')), '');

  if v_full_name is null then
    raise exception 'invalid_input';
  end if;

  insert into public.members (full_name, email, phone, status, care_sensitivity_flag)
  values (v_full_name, v_email, v_phone, 'active'::public.membership_status, false)
  returning id into v_new_id;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.create_member',
    'members',
    v_new_id,
    jsonb_build_object(
      'after',
      jsonb_build_object(
        'status', 'active',
        'full_name', v_full_name,
        'email_present', v_email is not null,
        'phone_present', v_phone is not null
      )
    )
  );

  return v_new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. admin_assign_leader_to_group
-- ---------------------------------------------------------------------------
create or replace function public.admin_assign_leader_to_group(
  p_group_id uuid,
  p_profile_id uuid,
  p_role public.role_in_group
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_target_role public.user_role;
  v_target_status public.profile_status;
  v_group_exists boolean;
  v_new_id uuid;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;

  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_role not in ('leader', 'co_leader') then
    raise exception 'invalid_role';
  end if;

  if p_profile_id = v_actor then
    raise exception 'self_target_not_allowed';
  end if;

  select true into v_group_exists
    from public.groups
   where id = p_group_id
   limit 1;
  if v_group_exists is null then
    raise exception 'missing_group';
  end if;

  select role, status into v_target_role, v_target_status
    from public.profiles
   where id = p_profile_id
   limit 1;
  if v_target_role is null then
    raise exception 'missing_profile';
  end if;
  if v_target_role not in ('leader', 'co_leader') then
    raise exception 'invalid_role';
  end if;
  if v_target_status <> 'active' then
    raise exception 'inactive_target';
  end if;

  begin
    insert into public.group_leaders (group_id, profile_id, role, active, assigned_at)
    values (p_group_id, p_profile_id, p_role, true, current_date)
    returning id into v_new_id;
  exception
    when unique_violation then
      raise exception 'duplicate_assignment';
  end;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.assign_leader_to_group',
    'group_leaders',
    v_new_id,
    jsonb_build_object(
      'group_id', p_group_id,
      'profile_id', p_profile_id,
      'role', p_role,
      'active', true
    )
  );

  return v_new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. admin_assign_member_to_group
-- ---------------------------------------------------------------------------
create or replace function public.admin_assign_member_to_group(
  p_group_id uuid,
  p_member_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_group_exists boolean;
  v_member_exists boolean;
  v_new_id uuid;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;

  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  select true into v_group_exists
    from public.groups
   where id = p_group_id
   limit 1;
  if v_group_exists is null then
    raise exception 'missing_group';
  end if;

  select true into v_member_exists
    from public.members
   where id = p_member_id
   limit 1;
  if v_member_exists is null then
    raise exception 'missing_member';
  end if;

  begin
    insert into public.group_memberships (group_id, member_id, role, status, joined_at)
    values (
      p_group_id,
      p_member_id,
      'member'::public.role_in_group,
      'active'::public.membership_status,
      current_date
    )
    returning id into v_new_id;
  exception
    when unique_violation then
      raise exception 'duplicate_assignment';
  end;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.assign_member_to_group',
    'group_memberships',
    v_new_id,
    jsonb_build_object(
      'group_id', p_group_id,
      'member_id', p_member_id,
      'role', 'member',
      'status', 'active'
    )
  );

  return v_new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. admin_deactivate_profile
-- ---------------------------------------------------------------------------
create or replace function public.admin_deactivate_profile(
  p_profile_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_actor_role public.user_role;
  v_target_role public.user_role;
  v_previous_status public.profile_status;
  v_assignments_deactivated integer;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;

  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_profile_id = v_actor then
    raise exception 'self_target_not_allowed';
  end if;

  v_actor_role := public.auth_role();

  select role, status into v_target_role, v_previous_status
    from public.profiles
   where id = p_profile_id
   limit 1;
  if v_target_role is null then
    raise exception 'missing_profile';
  end if;

  -- ministry_admin cannot deactivate super_admin.
  if v_actor_role = 'ministry_admin' and v_target_role = 'super_admin' then
    raise exception 'forbidden_target';
  end if;

  -- Status-only update (updated_at handled by the existing trigger).
  update public.profiles
     set status = 'inactive'::public.profile_status
   where id = p_profile_id;

  -- Cascade: deactivate any active group_leaders assignments.
  with cleaned as (
    update public.group_leaders
       set active = false
     where profile_id = p_profile_id
       and active = true
    returning 1
  )
  select count(*) into v_assignments_deactivated from cleaned;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.deactivate_profile',
    'profiles',
    p_profile_id,
    jsonb_build_object(
      'before', jsonb_build_object('status', v_previous_status),
      'after',  jsonb_build_object('status', 'inactive'),
      'deactivated_group_leader_assignments_count', coalesce(v_assignments_deactivated, 0)
    )
  );

  return p_profile_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. admin_deactivate_member
-- ---------------------------------------------------------------------------
create or replace function public.admin_deactivate_member(
  p_member_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_previous_status public.membership_status;
  v_memberships_deactivated integer;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;

  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  select status into v_previous_status
    from public.members
   where id = p_member_id
   limit 1;
  if v_previous_status is null then
    raise exception 'missing_member';
  end if;

  -- Status-only update (updated_at handled by the existing trigger).
  update public.members
     set status = 'inactive'::public.membership_status
   where id = p_member_id;

  -- Cascade: close active group memberships.
  with cleaned as (
    update public.group_memberships
       set status = 'inactive'::public.membership_status,
           ended_at = current_date
     where member_id = p_member_id
       and status = 'active'
    returning 1
  )
  select count(*) into v_memberships_deactivated from cleaned;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.deactivate_member',
    'members',
    p_member_id,
    jsonb_build_object(
      'before', jsonb_build_object('status', v_previous_status),
      'after',  jsonb_build_object('status', 'inactive'),
      'deactivated_group_memberships_count', coalesce(v_memberships_deactivated, 0)
    )
  );

  return p_member_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants. Revoke from public/anon/authenticated, then grant execute to
-- authenticated only. The function body still enforces auth_is_admin();
-- granting execute to authenticated only makes the function callable.
-- ---------------------------------------------------------------------------

revoke all on function public.admin_create_leader_profile(text, text, text) from public;
revoke all on function public.admin_create_leader_profile(text, text, text) from anon;
revoke all on function public.admin_create_leader_profile(text, text, text) from authenticated;
grant  execute on function public.admin_create_leader_profile(text, text, text) to authenticated;

revoke all on function public.admin_create_member(text, text, text) from public;
revoke all on function public.admin_create_member(text, text, text) from anon;
revoke all on function public.admin_create_member(text, text, text) from authenticated;
grant  execute on function public.admin_create_member(text, text, text) to authenticated;

revoke all on function public.admin_assign_leader_to_group(uuid, uuid, public.role_in_group) from public;
revoke all on function public.admin_assign_leader_to_group(uuid, uuid, public.role_in_group) from anon;
revoke all on function public.admin_assign_leader_to_group(uuid, uuid, public.role_in_group) from authenticated;
grant  execute on function public.admin_assign_leader_to_group(uuid, uuid, public.role_in_group) to authenticated;

revoke all on function public.admin_assign_member_to_group(uuid, uuid) from public;
revoke all on function public.admin_assign_member_to_group(uuid, uuid) from anon;
revoke all on function public.admin_assign_member_to_group(uuid, uuid) from authenticated;
grant  execute on function public.admin_assign_member_to_group(uuid, uuid) to authenticated;

revoke all on function public.admin_deactivate_profile(uuid) from public;
revoke all on function public.admin_deactivate_profile(uuid) from anon;
revoke all on function public.admin_deactivate_profile(uuid) from authenticated;
grant  execute on function public.admin_deactivate_profile(uuid) to authenticated;

revoke all on function public.admin_deactivate_member(uuid) from public;
revoke all on function public.admin_deactivate_member(uuid) from anon;
revoke all on function public.admin_deactivate_member(uuid) from authenticated;
grant  execute on function public.admin_deactivate_member(uuid) to authenticated;

comment on function public.admin_create_leader_profile(text, text, text) is
  'Phase 5A.1 admin write: inserts a profiles row with role=leader, status=active, plus an audit_events row in the same transaction.';
comment on function public.admin_create_member(text, text, text) is
  'Phase 5A.1 admin write: inserts a members row with status=active, care_sensitivity_flag=false, plus an audit_events row.';
comment on function public.admin_assign_leader_to_group(uuid, uuid, public.role_in_group) is
  'Phase 5A.1 admin write: inserts a group_leaders row (active=true, assigned_at=current_date), plus an audit_events row.';
comment on function public.admin_assign_member_to_group(uuid, uuid) is
  'Phase 5A.1 admin write: inserts a group_memberships row (role=member, status=active, joined_at=current_date), plus an audit_events row.';
comment on function public.admin_deactivate_profile(uuid) is
  'Phase 5A.1 admin write: flips profiles.status to inactive and cascades active group_leaders to active=false, plus an audit_events row.';
comment on function public.admin_deactivate_member(uuid) is
  'Phase 5A.1 admin write: flips members.status to inactive and cascades active group_memberships to inactive with ended_at=current_date, plus an audit_events row.';
