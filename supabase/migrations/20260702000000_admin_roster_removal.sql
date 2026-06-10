-- Groups/People overhaul: group-scoped roster removal + assign-revive.
--
-- Two new narrow SECURITY DEFINER RPCs let an admin take ONE person off ONE
-- group's roster without touching the person's status (deactivate_* ends a
-- person everywhere — wrong for someone simply moving groups):
--   * admin_unassign_leader_from_group  — group_leaders.active := false
--   * admin_end_group_membership        — group_memberships → inactive + ended_at
--
-- Both follow the phase 5A.1 conventions: auth_is_admin() guard, fixed error
-- tokens, a paired public.audit_events row in the same transaction, soft flags
-- only (no deletes), revoke-then-grant to authenticated.
--
-- The two phase 5A.1 assign RPCs are also amended (create or replace, grants
-- preserved) to REVIVE an inactive row on unique-constraint conflict instead
-- of failing. group_leaders has a full unique(group_id, profile_id, role) and
-- group_memberships a full unique(group_id, member_id) — both cover inactive
-- rows — so without the revive, a person removed from (or deactivated out of)
-- a group could never be re-assigned to it: the insert would always raise
-- duplicate_assignment. An *active* conflicting row still raises
-- duplicate_assignment.
--
-- Error tokens raised here (mapped to friendly copy in the action layer):
--   insufficient_privilege, missing_group, missing_profile, missing_member,
--   missing_assignment, self_target_not_allowed, duplicate_assignment,
--   invalid_role, inactive_target.
--
-- Rollback: drop the two new functions and re-apply the phase 5A.1 bodies of
-- admin_assign_leader_to_group / admin_assign_member_to_group from
-- 20260518050000_phase5a1_admin_people_writes.sql. No table, RLS, or data
-- changes; rows touched by the new RPCs are recoverable by re-assigning.

-- ---------------------------------------------------------------------------
-- 1. admin_unassign_leader_from_group
-- ---------------------------------------------------------------------------
create or replace function public.admin_unassign_leader_from_group(
  p_group_id uuid,
  p_profile_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_group_exists boolean;
  v_profile_exists boolean;
  v_first_id uuid;
  v_count integer;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;

  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  -- Mirrors the assign RPC's self guard: an admin manages others' roster
  -- standing through this screen, never their own.
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

  select true into v_profile_exists
    from public.profiles
   where id = p_profile_id
   limit 1;
  if v_profile_exists is null then
    raise exception 'missing_profile';
  end if;

  -- The unique constraint is (group_id, profile_id, role), so a person can
  -- hold both a leader and a co-leader row on one group; "remove from this
  -- group" ends every active one — that is what the operator means.
  with cleaned as (
    update public.group_leaders
       set active = false
     where group_id = p_group_id
       and profile_id = p_profile_id
       and active = true
    returning id
  )
  select min(id::text)::uuid, count(*) into v_first_id, v_count from cleaned;

  if coalesce(v_count, 0) = 0 then
    raise exception 'missing_assignment';
  end if;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.unassign_leader_from_group',
    'group_leaders',
    v_first_id,
    jsonb_build_object(
      'group_id', p_group_id,
      'profile_id', p_profile_id,
      'deactivated_assignments_count', v_count
    )
  );

  return v_first_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. admin_end_group_membership
-- ---------------------------------------------------------------------------
create or replace function public.admin_end_group_membership(
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
  v_membership_id uuid;
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

  update public.group_memberships
     set status = 'inactive'::public.membership_status,
         ended_at = current_date
   where group_id = p_group_id
     and member_id = p_member_id
     and status = 'active'
  returning id into v_membership_id;

  if v_membership_id is null then
    raise exception 'missing_assignment';
  end if;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.end_group_membership',
    'group_memberships',
    v_membership_id,
    jsonb_build_object(
      'group_id', p_group_id,
      'member_id', p_member_id,
      'ended_at', current_date
    )
  );

  return v_membership_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. admin_assign_leader_to_group — amended: revive an inactive row on
--    conflict instead of failing. Behaviour is otherwise byte-identical to
--    the phase 5A.1 definition.
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
  v_revived boolean := false;
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
      -- The full unique(group_id, profile_id, role) covers inactive rows: a
      -- previously removed assignment would otherwise make this pair
      -- permanently un-reassignable. Revive the inactive row; an active row
      -- is a real duplicate.
      update public.group_leaders
         set active = true,
             assigned_at = current_date
       where group_id = p_group_id
         and profile_id = p_profile_id
         and role = p_role
         and active = false
      returning id into v_new_id;
      if v_new_id is null then
        raise exception 'duplicate_assignment';
      end if;
      v_revived := true;
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
      'active', true,
      'revived', v_revived
    )
  );

  return v_new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. admin_assign_member_to_group — amended the same way.
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
  v_member_status public.membership_status;
  v_new_id uuid;
  v_revived boolean := false;
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

  select status into v_member_status
    from public.members
   where id = p_member_id
   limit 1;
  if v_member_status is null then
    raise exception 'missing_member';
  end if;
  -- Reject stale submissions that would re-add a just-deactivated member to
  -- an active roster. Matches the inactive_target guard already on
  -- admin_assign_leader_to_group.
  if v_member_status <> 'active' then
    raise exception 'inactive_target';
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
      -- The full unique(group_id, member_id) covers inactive rows: an ended
      -- membership would otherwise make this pair permanently un-reassignable.
      -- Revive the inactive row; an active row is a real duplicate.
      update public.group_memberships
         set status = 'active'::public.membership_status,
             joined_at = current_date,
             ended_at = null
       where group_id = p_group_id
         and member_id = p_member_id
         and status <> 'active'
      returning id into v_new_id;
      if v_new_id is null then
        raise exception 'duplicate_assignment';
      end if;
      v_revived := true;
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
      'status', 'active',
      'revived', v_revived
    )
  );

  return v_new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants for the NEW functions only. The amended assign functions keep their
-- existing grants (create or replace preserves ACLs).
-- ---------------------------------------------------------------------------

revoke all on function public.admin_unassign_leader_from_group(uuid, uuid) from public;
revoke all on function public.admin_unassign_leader_from_group(uuid, uuid) from anon;
revoke all on function public.admin_unassign_leader_from_group(uuid, uuid) from authenticated;
grant  execute on function public.admin_unassign_leader_from_group(uuid, uuid) to authenticated;

revoke all on function public.admin_end_group_membership(uuid, uuid) from public;
revoke all on function public.admin_end_group_membership(uuid, uuid) from anon;
revoke all on function public.admin_end_group_membership(uuid, uuid) from authenticated;
grant  execute on function public.admin_end_group_membership(uuid, uuid) to authenticated;

comment on function public.admin_unassign_leader_from_group(uuid, uuid) is
  'Roster removal: flips every active group_leaders row for (group, profile) to active=false, plus an audit_events row in the same transaction. The person''s profile status is untouched.';
comment on function public.admin_end_group_membership(uuid, uuid) is
  'Roster removal: ends the active group_memberships row for (group, member) — status=inactive, ended_at=current_date — plus an audit_events row. The member''s status is untouched.';
comment on function public.admin_assign_leader_to_group(uuid, uuid, public.role_in_group) is
  'Phase 5A.1 admin write, amended by the roster-removal migration: inserts a group_leaders row, or revives the inactive row the full unique constraint would otherwise block on; plus an audit_events row.';
comment on function public.admin_assign_member_to_group(uuid, uuid) is
  'Phase 5A.1 admin write, amended by the roster-removal migration: inserts a group_memberships row, or revives the inactive row the full unique constraint would otherwise block on; plus an audit_events row.';
