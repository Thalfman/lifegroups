-- Security P3 polish from the 2026-07-03 audit (#819): SEC-3 + SEC-5.
--
-- 1. admin_set_group_types (SEC-3). The whole-list replace RPC was the only
--    pre-read+upsert admin RPC that did not take an advisory lock BEFORE its
--    snapshot pre-read, per the lock-before-snapshot pattern established by
--    20260617000000_phase_groups7 (#415 / ADR 0031). For the first writer the
--    group_types row may not exist yet, so SELECT ... FOR UPDATE locks nothing
--    and two racers could both audit an empty `before` (mitigated today by the
--    same-migration seed; the racing failure mode is a unique-violation abort,
--    never a wrong `before` image — this closes the asymmetry, not a hole).
--    Recreated verbatim plus the lock, using the SAME key pair as
--    admin_add_group_type (20260711000000) so list REPLACE and list APPEND
--    serialize against each other, not just against themselves.
--
-- 2. admin_add_person_to_group (SEC-5). The leader branch wrote plaintext
--    `email` into audit_events.metadata where the member branch of the same RPC
--    uses presence flags. In-policy (audit_events is Super-Admin-only and PII in
--    audit is a documented exception) — but the asymmetry invites copy-paste
--    into stricter contexts. Recreated verbatim with the leader branch aligned
--    on `email_present` / `phone_present`, matching the member branch.
--
-- No schema, RLS, or grant changes; both functions keep their SECURITY DEFINER
-- + pinned search_path envelope, their auth_is_admin() guard, their error
-- tokens, and their paired audit_events row.

-- ===========================================================================
-- 1. admin_set_group_types — take the list advisory lock before the snapshot.
-- ===========================================================================

create or replace function public.admin_set_group_types(p_types jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor  uuid;
  v_row_id uuid;
  v_before jsonb;
  v_after  jsonb;
  v_elem   jsonb;
  v_name   text;
  v_types  jsonb := '[]'::jsonb;
  v_seen   text[] := array[]::text[];
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_types is null or jsonb_typeof(p_types) <> 'array' then
    raise exception 'invalid_input';
  end if;

  for v_elem in select * from jsonb_array_elements(p_types) loop
    if jsonb_typeof(v_elem) <> 'string' then
      raise exception 'invalid_input';
    end if;
    v_name := btrim(v_elem #>> '{}');
    if v_name = '' then
      continue;
    end if;
    if char_length(v_name) > 80 then
      raise exception 'invalid_input';
    end if;
    if lower(v_name) = any(v_seen) then
      continue;
    end if;
    v_seen  := array_append(v_seen, lower(v_name));
    v_types := v_types || to_jsonb(v_name);
  end loop;

  if jsonb_array_length(v_types) > 100 then
    raise exception 'invalid_input';
  end if;

  -- Serialize concurrent writers against the single group_types row BEFORE the
  -- snapshot (the row may not exist yet, so FOR UPDATE locks nothing for the
  -- first writer) — the same pattern as 20260617000000_phase_groups7. The key
  -- pair is deliberately identical to admin_add_group_type's (20260711000000;
  -- the 'append' literal is historical) so a whole-list replace and a
  -- single-name append serialize against each other too.
  perform pg_advisory_xact_lock(hashtext('group_types'), hashtext('append'));

  select id, setting_value into v_row_id, v_before
    from public.app_settings
   where setting_key = 'group_types'
   for update;

  if v_row_id is null then
    insert into public.app_settings (setting_key, setting_value)
    values ('group_types', jsonb_build_object('types', v_types))
    returning id, '{}'::jsonb into v_row_id, v_before;
  else
    update public.app_settings
       set setting_value = jsonb_build_object('types', v_types)
     where id = v_row_id;
  end if;

  v_after := jsonb_build_object('types', v_types);

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.set_group_types',
    'app_settings',
    v_row_id,
    jsonb_build_object('before', v_before, 'after', v_after)
  );

  return v_row_id;
end;
$$;

-- ===========================================================================
-- 2. admin_add_person_to_group — leader-branch audit metadata on presence
--    flags, matching the member branch.
-- ===========================================================================

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
  -- Guard NULL explicitly: `null not in (...)` is NULL, not true, so without
  -- this a blank/missing kind would skip both branches' raises and fall through
  -- to member creation. This is the write boundary, so reject it outright.
  if v_kind is null or v_kind not in ('member', 'leader') then
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

    -- Presence flags, not values, for the contact fields — matching the member
    -- branch below (email is required on this branch, so email_present is
    -- always true; recorded anyway so both branches audit the same shape).
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
          'email_present', v_email is not null,
          'phone_present', v_phone is not null
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
