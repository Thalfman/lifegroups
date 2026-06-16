-- Group roster create-and-assign (#643).
--
-- The group roster (group detail → People tab) only offered "assign from
-- existing", which dead-ends when no unassigned eligible person remains. This
-- adds the ONE atomic write that backs an inline "add a brand-new person to
-- this group" path: create the person AND put them on this group's roster in a
-- single transaction with ONE paired audit_events row.
--
-- Why a new RPC instead of chaining admin_create_member/_leader_profile +
-- admin_assign_*_to_group from the action layer: chaining would write two audit
-- rows for what is one ministry action, and would leave a partial-failure
-- window where the person exists but is unassigned (the assign half could fail
-- after the create half committed). A single SECURITY DEFINER function makes the
-- create+assign atomic — both halves and the audit row commit together or roll
-- back together.
--
-- Mirrors the Phase 5A.1 contract (20260518050000): the function is the security
-- boundary, enforces auth_is_admin() + a non-null actor, validates its inputs,
-- and raises the same fixed error tokens the calling action already maps
-- (insufficient_privilege, missing_group, duplicate_email, invalid_role,
-- invalid_input). No new tables, enums, or write RLS policies; no deletes.

create or replace function public.admin_add_person_to_group(
  p_group_id uuid,
  p_kind text,
  p_full_name text,
  p_email text,
  p_phone text,
  p_role public.role_in_group
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_kind text;
  v_full_name text;
  v_email text;
  v_phone text;
  v_lifecycle public.group_lifecycle_status;
  v_person_id uuid;
  v_assignment_id uuid;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;

  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  v_kind := nullif(btrim(coalesce(p_kind, '')), '');
  if v_kind not in ('member', 'leader') then
    raise exception 'invalid_input';
  end if;

  v_full_name := nullif(btrim(coalesce(p_full_name, '')), '');
  if v_full_name is null then
    raise exception 'invalid_input';
  end if;

  -- Canonicalize the email to lowercase so case-only variants don't fork an
  -- identity (Supabase Auth lowercases too; matches admin_create_member /
  -- admin_create_leader_profile).
  v_email := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_phone := nullif(btrim(coalesce(p_phone, '')), '');

  -- Lock the group row (FOR UPDATE) and read its lifecycle so a concurrent
  -- admin_close_group can't slip in between this check and the inserts. A closed
  -- group's roster is read-only in the UI; reject the stale-form / direct-RPC
  -- path here too, before creating an orphan person on a roster that should
  -- require reopening first.
  select lifecycle_status into v_lifecycle
    from public.groups
   where id = p_group_id
   for update;
  if not found then
    raise exception 'missing_group';
  end if;
  if v_lifecycle = 'closed' then
    raise exception 'group_closed';
  end if;

  if v_kind = 'leader' then
    -- Leaders sign in, so an email is required (profiles.email is NOT NULL and
    -- the credential linkage keys on it).
    if v_email is null then
      raise exception 'invalid_input';
    end if;
    if p_role is null or p_role not in ('leader', 'co_leader') then
      raise exception 'invalid_role';
    end if;

    begin
      insert into public.profiles (full_name, email, phone, role, status)
      values (
        v_full_name,
        v_email,
        v_phone,
        'leader'::public.user_role,
        'active'::public.profile_status
      )
      returning id into v_person_id;
    exception
      when unique_violation then
        raise exception 'duplicate_email';
    end;

    -- Brand-new profile, so this assignment cannot already exist; no
    -- duplicate_assignment handling needed.
    insert into public.group_leaders (group_id, profile_id, role, active, assigned_at)
    values (p_group_id, v_person_id, p_role, true, current_date)
    returning id into v_assignment_id;

    insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
    values (
      v_actor,
      'admin.add_person_to_group',
      'profiles',
      v_person_id,
      jsonb_build_object(
        'kind', 'leader',
        'group_id', p_group_id,
        'assignment_id', v_assignment_id,
        'role', p_role,
        'after', jsonb_build_object(
          'role', 'leader',
          'status', 'active',
          'full_name', v_full_name,
          'email', v_email
        )
      )
    );
  else
    -- Member: email is optional (members are non-auth participant records).
    insert into public.members (full_name, email, phone, status, care_sensitivity_flag)
    values (
      v_full_name,
      v_email,
      v_phone,
      'active'::public.membership_status,
      false
    )
    returning id into v_person_id;

    insert into public.group_memberships (group_id, member_id, role, status, joined_at)
    values (
      p_group_id,
      v_person_id,
      'member'::public.role_in_group,
      'active'::public.membership_status,
      current_date
    )
    returning id into v_assignment_id;

    insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
    values (
      v_actor,
      'admin.add_person_to_group',
      'members',
      v_person_id,
      jsonb_build_object(
        'kind', 'member',
        'group_id', p_group_id,
        'assignment_id', v_assignment_id,
        'role', 'member',
        'after', jsonb_build_object(
          'status', 'active',
          'full_name', v_full_name,
          'email_present', v_email is not null,
          'phone_present', v_phone is not null
        )
      )
    );
  end if;

  return v_person_id;
end;
$$;

-- Grants: revoke broadly, then grant execute to authenticated only. The body
-- still enforces auth_is_admin(); the grant only makes the function callable.
revoke all on function public.admin_add_person_to_group(uuid, text, text, text, text, public.role_in_group) from public;
revoke all on function public.admin_add_person_to_group(uuid, text, text, text, text, public.role_in_group) from anon;
revoke all on function public.admin_add_person_to_group(uuid, text, text, text, text, public.role_in_group) from authenticated;
grant  execute on function public.admin_add_person_to_group(uuid, text, text, text, text, public.role_in_group) to authenticated;

comment on function public.admin_add_person_to_group(uuid, text, text, text, text, public.role_in_group) is
  '#643 group roster create-and-assign: in one transaction creates a member (group_memberships) or leader (profiles + group_leaders) and assigns them to p_group_id, plus one paired audit_events row. Admin-gated, no deletes.';
