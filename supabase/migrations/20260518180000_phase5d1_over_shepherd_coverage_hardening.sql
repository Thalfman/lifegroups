-- Phase 5D.1: Over-shepherd coverage hardening (review feedback on PR #65).
--
-- This is a follow-up to 20260518170000_phase5d1_over_shepherd_coverage.sql.
-- It addresses review feedback from PR #65:
--
--   * Add a CHECK constraint so ended_at can never be before assigned_at
--     on shepherd_coverage_assignments. Prevents impossible intervals
--     from any path that bypasses the RPCs in the future.
--
--   * admin_assign_shepherd_to_over_shepherd:
--       - Reject p_assigned_at values in the future (server-side
--         defense matching SC.1A's UTC current_date + 1 pattern).
--       - Reject backdated reassignment dates that would set the prior
--         assignment's ended_at earlier than its assigned_at.
--
--   * admin_end_shepherd_coverage_assignment:
--       - Reject p_ended_at values in the future.
--       - Reject ended_at earlier than the row's assigned_at.
--
--   * admin_update_over_shepherd:
--       - When archiving (active true → false), soft-end every active
--         coverage assignment for that over-shepherd in the same
--         transaction. Records the count in audit metadata so
--         reviewers see the cascade at a glance.
--
-- New error tokens raised by these functions (mapped to friendly
-- messages by lib/admin/action-result.ts):
--   invalid_assigned_at_before_prior, invalid_ended_at_before_start.

-- ---------------------------------------------------------------------------
-- 1. Data-integrity CHECK constraint on shepherd_coverage_assignments.
-- ---------------------------------------------------------------------------

alter table public.shepherd_coverage_assignments
  add constraint shepherd_coverage_assignments_dates_check
  check (ended_at is null or ended_at >= assigned_at);

-- ---------------------------------------------------------------------------
-- 2. admin_assign_shepherd_to_over_shepherd — replace with hardened body.
-- ---------------------------------------------------------------------------
-- Adds:
--   * future-date guard on p_assigned_at (UTC current_date + 1 buffer,
--     matching admin_log_shepherd_care_interaction).
--   * reject when v_assigned_at < prior assignment's assigned_at
--     (raises invalid_assigned_at_before_prior).
create or replace function public.admin_assign_shepherd_to_over_shepherd(
  p_shepherd_profile_id uuid,
  p_over_shepherd_id uuid,
  p_assigned_at date
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_target record;
  v_over_shepherd record;
  v_assigned_at date;
  v_prior record;
  v_new_id uuid;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_shepherd_profile_id is null or p_over_shepherd_id is null then
    raise exception 'invalid_input';
  end if;
  v_assigned_at := coalesce(p_assigned_at, current_date);

  -- Server-side future-date guard matching SC.1A's pattern: the
  -- TypeScript validator caps at UTC today + 1, so a +1 buffer here
  -- accommodates time zones ahead of UTC without rejecting any input
  -- the validator would accept.
  if v_assigned_at > ((now() at time zone 'UTC')::date + 1) then
    raise exception 'invalid_input';
  end if;

  -- Same target gating as SC.1A: only active leader/co_leader profiles
  -- are eligible coverage subjects.
  select id, role, status
    into v_target
    from public.profiles
   where id = p_shepherd_profile_id
   limit 1;
  if v_target.id is null then
    raise exception 'missing_profile';
  end if;
  if v_target.role not in ('leader'::public.user_role, 'co_leader'::public.user_role) then
    raise exception 'missing_profile';
  end if;
  if v_target.status <> 'active'::public.profile_status then
    raise exception 'missing_profile';
  end if;

  select id, active
    into v_over_shepherd
    from public.over_shepherds
   where id = p_over_shepherd_id
   limit 1;
  if v_over_shepherd.id is null then
    raise exception 'missing_over_shepherd';
  end if;
  if v_over_shepherd.active is not true then
    raise exception 'inactive_over_shepherd';
  end if;

  -- Lock the prior active assignment (if any) under the shepherd id so
  -- two concurrent reassigns serialize on the same row. The for-update
  -- + assigned_at comparison rejects backdated reassignments that
  -- would otherwise produce ended_at < assigned_at on the prior row
  -- (and trip the new CHECK constraint with an unfriendly Postgres
  -- error). Raising invalid_assigned_at_before_prior keeps the error
  -- token surface friendly via mapRpcError.
  select id, over_shepherd_id, assigned_at
    into v_prior
    from public.shepherd_coverage_assignments
   where shepherd_profile_id = p_shepherd_profile_id
     and active = true
   for update;
  if v_prior.id is not null and v_assigned_at < v_prior.assigned_at then
    raise exception 'invalid_assigned_at_before_prior';
  end if;

  update public.shepherd_coverage_assignments
     set active = false,
         ended_at = v_assigned_at,
         updated_at = now()
   where id = v_prior.id;

  insert into public.shepherd_coverage_assignments (
    shepherd_profile_id, over_shepherd_id, active, assigned_at
  ) values (
    p_shepherd_profile_id, p_over_shepherd_id, true, v_assigned_at
  )
  returning id into v_new_id;

  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.assign_shepherd_coverage',
    'shepherd_coverage_assignments',
    v_new_id,
    jsonb_build_object(
      'shepherd_profile_id', p_shepherd_profile_id,
      'over_shepherd_id', p_over_shepherd_id,
      'assigned_at', v_assigned_at,
      'replaced_assignment_id', v_prior.id,
      'replaced_over_shepherd_id', v_prior.over_shepherd_id
    )
  );

  return v_new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. admin_end_shepherd_coverage_assignment — replace with hardened body.
-- ---------------------------------------------------------------------------
-- Adds:
--   * future-date guard on p_ended_at (UTC current_date + 1 buffer).
--   * reject when v_ended_at < existing assignment's assigned_at
--     (raises invalid_ended_at_before_start).
create or replace function public.admin_end_shepherd_coverage_assignment(
  p_assignment_id uuid,
  p_ended_at date
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_existing record;
  v_ended_at date;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_assignment_id is null then
    raise exception 'invalid_input';
  end if;
  v_ended_at := coalesce(p_ended_at, current_date);

  if v_ended_at > ((now() at time zone 'UTC')::date + 1) then
    raise exception 'invalid_input';
  end if;

  select id, shepherd_profile_id, over_shepherd_id, active, assigned_at
    into v_existing
    from public.shepherd_coverage_assignments
   where id = p_assignment_id
   for update;
  if v_existing.id is null or v_existing.active is not true then
    raise exception 'missing_assignment';
  end if;
  if v_ended_at < v_existing.assigned_at then
    raise exception 'invalid_ended_at_before_start';
  end if;

  update public.shepherd_coverage_assignments
     set active = false,
         ended_at = v_ended_at,
         updated_at = now()
   where id = p_assignment_id;

  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.end_shepherd_coverage',
    'shepherd_coverage_assignments',
    p_assignment_id,
    jsonb_build_object(
      'shepherd_profile_id', v_existing.shepherd_profile_id,
      'over_shepherd_id', v_existing.over_shepherd_id,
      'ended_at', v_ended_at
    )
  );

  return p_assignment_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. admin_update_over_shepherd — replace with hardened body.
-- ---------------------------------------------------------------------------
-- Adds: when archiving (active true → false), soft-end every active
-- coverage assignment for that over-shepherd in the same transaction
-- (mirrors the deactivate-profile cascade pattern). Records the
-- ended_active_assignments_count in the update audit metadata so a
-- reviewer can see the cascade without trawling per-row audit events.
create or replace function public.admin_update_over_shepherd(
  p_over_shepherd_id uuid,
  p_full_name text,
  p_email text,
  p_phone text,
  p_notes text,
  p_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_existing record;
  v_full_name text;
  v_email text;
  v_phone text;
  v_notes text;
  v_active boolean;
  v_archived_at timestamptz;
  v_ended_active_assignments_count integer := 0;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_over_shepherd_id is null then
    raise exception 'invalid_input';
  end if;

  v_full_name := nullif(btrim(coalesce(p_full_name, '')), '');
  if v_full_name is null or char_length(v_full_name) > 200 then
    raise exception 'invalid_input';
  end if;

  v_email := nullif(btrim(coalesce(p_email, '')), '');
  v_phone := nullif(btrim(coalesce(p_phone, '')), '');
  v_notes := nullif(btrim(coalesce(p_notes, '')), '');
  if v_notes is not null and char_length(v_notes) > 2000 then
    raise exception 'invalid_input';
  end if;
  if p_active is null then
    raise exception 'invalid_input';
  end if;
  v_active := p_active;

  select id, full_name, email, phone, notes, active, archived_at
    into v_existing
    from public.over_shepherds
   where id = p_over_shepherd_id
   for update;
  if v_existing.id is null then
    raise exception 'missing_over_shepherd';
  end if;

  if v_active and v_existing.active is not true then
    v_archived_at := null;
  elsif v_active = false and v_existing.active = true then
    v_archived_at := now();
  else
    v_archived_at := v_existing.archived_at;
  end if;

  update public.over_shepherds
     set full_name = v_full_name,
         email = v_email,
         phone = v_phone,
         notes = v_notes,
         active = v_active,
         archived_at = v_archived_at,
         updated_at = now()
   where id = p_over_shepherd_id;

  -- Cascade: when an over-shepherd is archived, any leader they were
  -- still actively covering becomes orphaned. Closing those rows here
  -- keeps the table consistent with inactive_over_shepherd guards in
  -- admin_assign_shepherd_to_over_shepherd, and matches the broader
  -- "deactivate-profile cascades to group_leaders" pattern. ended_at
  -- is set to current_date (CHECK constraint: ended_at >= assigned_at
  -- always holds because assigned_at <= today by construction).
  if v_active = false and v_existing.active = true then
    with closed as (
      update public.shepherd_coverage_assignments
         set active = false,
             ended_at = current_date,
             updated_at = now()
       where over_shepherd_id = p_over_shepherd_id
         and active = true
      returning id
    )
    select count(*) into v_ended_active_assignments_count from closed;
  end if;

  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.update_over_shepherd',
    'over_shepherds',
    p_over_shepherd_id,
    jsonb_build_object(
      'before', jsonb_build_object(
        'full_name', v_existing.full_name,
        'has_email', v_existing.email is not null,
        'has_phone', v_existing.phone is not null,
        'has_notes', v_existing.notes is not null,
        'active', v_existing.active
      ),
      'after', jsonb_build_object(
        'full_name', v_full_name,
        'has_email', v_email is not null,
        'has_phone', v_phone is not null,
        'has_notes', v_notes is not null,
        'active', v_active
      ),
      'ended_active_assignments_count', v_ended_active_assignments_count
    )
  );

  return p_over_shepherd_id;
end;
$$;
