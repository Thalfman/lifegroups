-- Phase 5A.2: Admin group management writes + super_admin audit visibility.
--
-- This migration introduces:
--   * Four narrow SECURITY DEFINER RPC functions for admin-managed group
--     workflows: create, update, close (soft), reopen.
--   * A tightened audit_events SELECT policy: only super_admin can read.
--     ministry_admin and staff_viewer lose read access to the audit log.
--
-- Architecture mirrors Phase 5A.1:
--   * Each function is the security boundary — RLS does NOT protect writes
--     inside the function body. Each function explicitly enforces:
--       - auth_is_admin() (or raise insufficient_privilege)
--       - auth_profile_id() is not null
--       - required fields validated
--       - target existence checked where relevant
--   * Each function writes its data change AND the matching
--     public.audit_events row in a single transaction; if the audit insert
--     fails, the data change rolls back.
--   * No new tables, no new enums, no new INSERT/UPDATE/DELETE policies on
--     groups. RLS stays SELECT-only outside the SECURITY DEFINER surface.
--   * No hard deletes. "Close" sets lifecycle_status='closed' and
--     closed_at=now(). "Reopen" restores lifecycle_status='active' and
--     clears closed_at.
--
-- Fixed error tokens raised by these functions, mapped to friendly UI
-- messages by the calling server action:
--   insufficient_privilege, invalid_input, missing_group,
--   group_already_closed, group_not_closed.

-- ---------------------------------------------------------------------------
-- 1. admin_create_group
-- ---------------------------------------------------------------------------
create or replace function public.admin_create_group(
  p_name text,
  p_description text,
  p_meeting_day text,
  p_meeting_time time,
  p_location_area text,
  p_address_optional text,
  p_capacity integer
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_name text;
  v_description text;
  v_meeting_day text;
  v_location_area text;
  v_address text;
  v_new_id uuid;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;

  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  v_name          := nullif(btrim(coalesce(p_name, '')), '');
  v_description   := nullif(btrim(coalesce(p_description, '')), '');
  v_meeting_day   := nullif(btrim(coalesce(p_meeting_day, '')), '');
  v_location_area := nullif(btrim(coalesce(p_location_area, '')), '');
  v_address       := nullif(btrim(coalesce(p_address_optional, '')), '');

  if v_name is null then
    raise exception 'invalid_input';
  end if;

  if p_capacity is not null and p_capacity < 0 then
    raise exception 'invalid_input';
  end if;

  insert into public.groups (
    name,
    description,
    meeting_day,
    meeting_time,
    location_area,
    address_optional,
    capacity,
    lifecycle_status,
    health_status
  )
  values (
    v_name,
    v_description,
    v_meeting_day,
    p_meeting_time,
    v_location_area,
    v_address,
    p_capacity,
    'active'::public.group_lifecycle_status,
    'healthy'::public.group_health_status
  )
  returning id into v_new_id;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.create_group',
    'groups',
    v_new_id,
    jsonb_build_object(
      'after',
      jsonb_build_object(
        'name', v_name,
        'lifecycle_status', 'active',
        'health_status', 'healthy',
        'meeting_day', v_meeting_day,
        'location_area', v_location_area,
        'capacity', p_capacity
      )
    )
  );

  return v_new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. admin_update_group
-- ---------------------------------------------------------------------------
-- Edits the editable descriptive columns on a group. Does NOT change
-- lifecycle_status, health_status, closed_at, or pause-related columns:
-- closing/reopening flow through dedicated RPCs so the audit log is
-- expressive.
create or replace function public.admin_update_group(
  p_group_id uuid,
  p_name text,
  p_description text,
  p_meeting_day text,
  p_meeting_time time,
  p_location_area text,
  p_address_optional text,
  p_capacity integer
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_name text;
  v_description text;
  v_meeting_day text;
  v_location_area text;
  v_address text;
  v_before jsonb;
  v_after jsonb;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;

  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  v_name          := nullif(btrim(coalesce(p_name, '')), '');
  v_description   := nullif(btrim(coalesce(p_description, '')), '');
  v_meeting_day   := nullif(btrim(coalesce(p_meeting_day, '')), '');
  v_location_area := nullif(btrim(coalesce(p_location_area, '')), '');
  v_address       := nullif(btrim(coalesce(p_address_optional, '')), '');

  if v_name is null then
    raise exception 'invalid_input';
  end if;

  if p_capacity is not null and p_capacity < 0 then
    raise exception 'invalid_input';
  end if;

  -- Row-level lock serializes concurrent admin_update_group / admin_close_group
  -- / admin_reopen_group calls against the same group. If the row was deleted
  -- between transactions, the locked select returns nothing and we raise
  -- missing_group before any UPDATE or audit insert runs.
  select jsonb_build_object(
           'name', name,
           'description', description,
           'meeting_day', meeting_day,
           'meeting_time', meeting_time,
           'location_area', location_area,
           'address_optional', address_optional,
           'capacity', capacity
         )
    into v_before
    from public.groups
   where id = p_group_id
   for update;

  if v_before is null then
    raise exception 'missing_group';
  end if;

  update public.groups
     set name             = v_name,
         description      = v_description,
         meeting_day      = v_meeting_day,
         meeting_time     = p_meeting_time,
         location_area    = v_location_area,
         address_optional = v_address,
         capacity         = p_capacity
   where id = p_group_id;

  v_after := jsonb_build_object(
    'name', v_name,
    'description', v_description,
    'meeting_day', v_meeting_day,
    'meeting_time', p_meeting_time,
    'location_area', v_location_area,
    'address_optional', v_address,
    'capacity', p_capacity
  );

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.update_group',
    'groups',
    p_group_id,
    jsonb_build_object('before', v_before, 'after', v_after)
  );

  return p_group_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. admin_close_group  (soft close — no hard delete)
-- ---------------------------------------------------------------------------
create or replace function public.admin_close_group(
  p_group_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_previous_lifecycle public.group_lifecycle_status;
  v_previous_closed_at timestamptz;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;

  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  -- Row-level lock serializes concurrent close attempts on the same group.
  -- The second transaction blocks on FOR UPDATE until the first commits,
  -- then re-reads lifecycle_status='closed' and exits via group_already_closed
  -- without a duplicate closed_at stamp or duplicate audit event.
  select lifecycle_status, closed_at
    into v_previous_lifecycle, v_previous_closed_at
    from public.groups
   where id = p_group_id
   for update;

  if v_previous_lifecycle is null then
    raise exception 'missing_group';
  end if;

  if v_previous_lifecycle = 'closed' then
    raise exception 'group_already_closed';
  end if;

  update public.groups
     set lifecycle_status = 'closed'::public.group_lifecycle_status,
         closed_at        = now()
   where id = p_group_id;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.close_group',
    'groups',
    p_group_id,
    jsonb_build_object(
      'before', jsonb_build_object(
        'lifecycle_status', v_previous_lifecycle,
        'closed_at', v_previous_closed_at
      ),
      'after', jsonb_build_object(
        'lifecycle_status', 'closed'
      )
    )
  );

  return p_group_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. admin_reopen_group
-- ---------------------------------------------------------------------------
-- Reopens a previously soft-closed group. Sets lifecycle_status='active'
-- and clears closed_at. Pause-related columns are not touched here; if a
-- group needs a paused/seasonal status after reopen, it will be edited
-- through the dedicated workflows we ship later.
create or replace function public.admin_reopen_group(
  p_group_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_previous_lifecycle public.group_lifecycle_status;
  v_previous_closed_at timestamptz;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;

  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  -- Row-level lock serializes concurrent reopen attempts on the same group.
  -- The second transaction blocks on FOR UPDATE until the first commits,
  -- then re-reads lifecycle_status='active' and exits via group_not_closed
  -- without writing a duplicate reopen audit event.
  select lifecycle_status, closed_at
    into v_previous_lifecycle, v_previous_closed_at
    from public.groups
   where id = p_group_id
   for update;

  if v_previous_lifecycle is null then
    raise exception 'missing_group';
  end if;

  if v_previous_lifecycle <> 'closed' then
    raise exception 'group_not_closed';
  end if;

  update public.groups
     set lifecycle_status = 'active'::public.group_lifecycle_status,
         closed_at        = null
   where id = p_group_id;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.reopen_group',
    'groups',
    p_group_id,
    jsonb_build_object(
      'before', jsonb_build_object(
        'lifecycle_status', v_previous_lifecycle,
        'closed_at', v_previous_closed_at
      ),
      'after', jsonb_build_object(
        'lifecycle_status', 'active',
        'closed_at', null
      )
    )
  );

  return p_group_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants. Revoke from public/anon/authenticated, then grant execute to
-- authenticated only. The function body still enforces auth_is_admin();
-- granting execute to authenticated only makes the function callable.
-- ---------------------------------------------------------------------------

revoke all on function public.admin_create_group(text, text, text, time, text, text, integer) from public;
revoke all on function public.admin_create_group(text, text, text, time, text, text, integer) from anon;
revoke all on function public.admin_create_group(text, text, text, time, text, text, integer) from authenticated;
grant  execute on function public.admin_create_group(text, text, text, time, text, text, integer) to authenticated;

revoke all on function public.admin_update_group(uuid, text, text, text, time, text, text, integer) from public;
revoke all on function public.admin_update_group(uuid, text, text, text, time, text, text, integer) from anon;
revoke all on function public.admin_update_group(uuid, text, text, text, time, text, text, integer) from authenticated;
grant  execute on function public.admin_update_group(uuid, text, text, text, time, text, text, integer) to authenticated;

revoke all on function public.admin_close_group(uuid) from public;
revoke all on function public.admin_close_group(uuid) from anon;
revoke all on function public.admin_close_group(uuid) from authenticated;
grant  execute on function public.admin_close_group(uuid) to authenticated;

revoke all on function public.admin_reopen_group(uuid) from public;
revoke all on function public.admin_reopen_group(uuid) from anon;
revoke all on function public.admin_reopen_group(uuid) from authenticated;
grant  execute on function public.admin_reopen_group(uuid) to authenticated;

comment on function public.admin_create_group(text, text, text, time, text, text, integer) is
  'Phase 5A.2 admin write: inserts a groups row with lifecycle_status=active and health_status=healthy, plus an audit_events row in the same transaction.';
comment on function public.admin_update_group(uuid, text, text, text, time, text, text, integer) is
  'Phase 5A.2 admin write: updates a groups row''s descriptive columns; does not touch lifecycle_status / closed_at. Writes an audit_events row.';
comment on function public.admin_close_group(uuid) is
  'Phase 5A.2 admin write: soft-closes a group by setting lifecycle_status=closed and closed_at=now(). No hard delete. Writes an audit_events row.';
comment on function public.admin_reopen_group(uuid) is
  'Phase 5A.2 admin write: reopens a previously closed group by setting lifecycle_status=active and clearing closed_at. Writes an audit_events row.';

-- ---------------------------------------------------------------------------
-- Tighten audit_events visibility.
--
-- Phase 4 created `audit_events_admin_read` which exposed audit rows to
-- both super_admin and ministry_admin via auth_is_admin(). Phase 5A.2
-- restricts the audit log to super_admin only. ministry_admin retains
-- every other admin workflow but loses audit-trail visibility.
-- ---------------------------------------------------------------------------

drop policy if exists audit_events_admin_read on public.audit_events;

create policy audit_events_super_admin_read on public.audit_events
  for select to authenticated using (public.auth_role() = 'super_admin');
