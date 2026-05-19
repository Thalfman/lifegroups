-- Phase 5C.0: Guest pipeline + follow-up writes.
--
-- Five SECURITY DEFINER RPC functions for the new guest pipeline and
-- follow-up workflows. Mirrors the Phase 5A.1 / 5A.2 / 5A.3 / 5B.0
-- pattern verbatim: the function body is the security boundary; each
-- function explicitly enforces auth_is_admin() (or auth_profile_id() +
-- assignment check for the leader-only RPC), checks target existence,
-- and writes the data change AND the matching public.audit_events row
-- in a single transaction. RLS stays SELECT-only on guests /
-- follow_ups / audit_events; this migration does not add any
-- INSERT/UPDATE/DELETE policies, any new tables, or any new enums.
-- No hard deletes anywhere.
--
-- The leader follow-up read path does *not* select admin_private_note,
-- so leaders never see admin-only notes even though the table-level
-- RLS policy currently exposes the column. Column-level redaction is
-- intentionally deferred -- see docs/PHASE_5C_0_GUEST_PIPELINE_FOLLOWUPS.md.
--
-- Fixed error tokens raised by these functions, mapped to friendly
-- messages by lib/admin/action-result.ts (admin RPCs) or
-- lib/leader/action-result.ts (leader RPC):
--   insufficient_privilege, invalid_input, missing_group, missing_profile,
--   missing_member, missing_guest, missing_follow_up, group_closed,
--   invalid_status, invalid_status_transition, forbidden_target.

-- ---------------------------------------------------------------------------
-- 1. admin_create_guest
-- ---------------------------------------------------------------------------
create or replace function public.admin_create_guest(
  p_full_name text,
  p_email text,
  p_phone text,
  p_first_attended_group_id uuid,
  p_first_attended_date date,
  p_pipeline_stage public.guest_pipeline_stage,
  p_assigned_group_id uuid,
  p_follow_up_owner_id uuid,
  p_notes text
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
  v_notes text;
  v_pipeline_stage public.guest_pipeline_stage;
  v_lifecycle public.group_lifecycle_status;
  v_owner_status public.profile_status;
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
  -- guests.email is plain text without a unique constraint, but we still
  -- lowercase so admin search and downstream linkage stay consistent
  -- with profiles.email.
  v_email     := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_phone     := nullif(btrim(coalesce(p_phone, '')), '');
  v_notes     := nullif(btrim(coalesce(p_notes, '')), '');
  v_pipeline_stage := coalesce(p_pipeline_stage, 'new'::public.guest_pipeline_stage);

  if v_full_name is null then
    raise exception 'invalid_input';
  end if;
  if v_notes is not null and length(v_notes) > 1000 then
    raise exception 'invalid_input';
  end if;

  -- first_attended_group_id is a *historical* link; allow even if the
  -- group is now closed (the visit happened before it closed).
  if p_first_attended_group_id is not null then
    select lifecycle_status into v_lifecycle
      from public.groups where id = p_first_attended_group_id limit 1;
    if v_lifecycle is null then
      raise exception 'missing_group';
    end if;
  end if;

  -- assigned_group_id places the guest *now*; reject if the group is closed.
  if p_assigned_group_id is not null then
    select lifecycle_status into v_lifecycle
      from public.groups where id = p_assigned_group_id limit 1;
    if v_lifecycle is null then
      raise exception 'missing_group';
    end if;
    if v_lifecycle = 'closed'::public.group_lifecycle_status then
      raise exception 'group_closed';
    end if;
  end if;

  if p_follow_up_owner_id is not null then
    select status into v_owner_status
      from public.profiles where id = p_follow_up_owner_id limit 1;
    if v_owner_status is null then
      raise exception 'missing_profile';
    end if;
    if v_owner_status <> 'active'::public.profile_status then
      raise exception 'missing_profile';
    end if;
  end if;

  insert into public.guests (
    full_name, email, phone,
    first_attended_group_id, first_attended_date,
    pipeline_stage, assigned_group_id, follow_up_owner_id, notes
  )
  values (
    v_full_name, v_email, v_phone,
    p_first_attended_group_id, p_first_attended_date,
    v_pipeline_stage, p_assigned_group_id, p_follow_up_owner_id, v_notes
  )
  returning id into v_new_id;

  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.create_guest',
    'guests',
    v_new_id,
    jsonb_build_object(
      'after', jsonb_build_object(
        'full_name', v_full_name,
        'email_present', v_email is not null,
        'phone_present', v_phone is not null,
        'pipeline_stage', v_pipeline_stage,
        'first_attended_group_id', p_first_attended_group_id,
        'assigned_group_id', p_assigned_group_id,
        'follow_up_owner_id', p_follow_up_owner_id,
        'has_notes', v_notes is not null
      )
    )
  );

  return v_new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. admin_update_guest_pipeline
-- ---------------------------------------------------------------------------
-- Updates a guest's pipeline_stage and (optionally) reassigns their group,
-- follow-up owner, or notes. The three _set_ flags let the caller change
-- *just* the pipeline stage without accidentally clearing assigned_group_id
-- or follow_up_owner_id; when a _set_ flag is true the corresponding value
-- is written (null clears it).
--
-- If the resulting pipeline_stage is 'not_now', a SECOND audit row is
-- written with action='admin.mark_guest_not_now' so the super-admin audit
-- view can filter the archival action distinctly without the app having
-- to expose a separate RPC.
create or replace function public.admin_update_guest_pipeline(
  p_guest_id uuid,
  p_pipeline_stage public.guest_pipeline_stage,
  p_set_assigned_group_id boolean,
  p_assigned_group_id uuid,
  p_set_follow_up_owner_id boolean,
  p_follow_up_owner_id uuid,
  p_set_notes boolean,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_guest record;
  v_lifecycle public.group_lifecycle_status;
  v_owner_status public.profile_status;
  v_notes text;
  v_new_assigned uuid;
  v_new_owner uuid;
  v_new_notes text;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_pipeline_stage is null then
    raise exception 'invalid_input';
  end if;

  -- Row-level lock so a concurrent stage change can't be lost to LWW.
  select id, full_name, pipeline_stage, assigned_group_id, follow_up_owner_id, notes
    into v_guest
    from public.guests
   where id = p_guest_id
   for update;
  if v_guest.id is null then
    raise exception 'missing_guest';
  end if;

  -- Resolve target values for nullable fields.
  v_new_assigned := case when p_set_assigned_group_id then p_assigned_group_id else v_guest.assigned_group_id end;
  v_new_owner    := case when p_set_follow_up_owner_id then p_follow_up_owner_id else v_guest.follow_up_owner_id end;

  if p_set_notes then
    v_notes := nullif(btrim(coalesce(p_notes, '')), '');
    if v_notes is not null and length(v_notes) > 1000 then
      raise exception 'invalid_input';
    end if;
    v_new_notes := v_notes;
  else
    v_new_notes := v_guest.notes;
  end if;

  -- Validate the target group / owner only when they're being set to
  -- something other than null (clearing is always permitted).
  if p_set_assigned_group_id and p_assigned_group_id is not null then
    select lifecycle_status into v_lifecycle
      from public.groups where id = p_assigned_group_id limit 1;
    if v_lifecycle is null then
      raise exception 'missing_group';
    end if;
    if v_lifecycle = 'closed'::public.group_lifecycle_status then
      raise exception 'group_closed';
    end if;
  end if;

  if p_set_follow_up_owner_id and p_follow_up_owner_id is not null then
    select status into v_owner_status
      from public.profiles where id = p_follow_up_owner_id limit 1;
    if v_owner_status is null then
      raise exception 'missing_profile';
    end if;
    if v_owner_status <> 'active'::public.profile_status then
      raise exception 'missing_profile';
    end if;
  end if;

  update public.guests
     set pipeline_stage     = p_pipeline_stage,
         assigned_group_id  = v_new_assigned,
         follow_up_owner_id = v_new_owner,
         notes              = v_new_notes
   where id = p_guest_id;

  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.update_guest_pipeline',
    'guests',
    p_guest_id,
    jsonb_build_object(
      'before', jsonb_build_object(
        'pipeline_stage', v_guest.pipeline_stage,
        'assigned_group_id', v_guest.assigned_group_id,
        'follow_up_owner_id', v_guest.follow_up_owner_id,
        'has_notes', v_guest.notes is not null
      ),
      'after', jsonb_build_object(
        'pipeline_stage', p_pipeline_stage,
        'assigned_group_id', v_new_assigned,
        'follow_up_owner_id', v_new_owner,
        'has_notes', v_new_notes is not null
      ),
      'full_name', v_guest.full_name
    )
  );

  -- Companion audit row for the archival action so super_admin can
  -- filter "marked as not now" distinctly. Only written when the new
  -- stage is not_now AND the previous stage was something else.
  if p_pipeline_stage = 'not_now'::public.guest_pipeline_stage
     and v_guest.pipeline_stage is distinct from 'not_now'::public.guest_pipeline_stage then
    insert into public.audit_events
      (actor_profile_id, action, entity_type, entity_id, metadata)
    values (
      v_actor,
      'admin.mark_guest_not_now',
      'guests',
      p_guest_id,
      jsonb_build_object(
        'before', jsonb_build_object('pipeline_stage', v_guest.pipeline_stage),
        'full_name', v_guest.full_name
      )
    );
  end if;

  return p_guest_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. admin_create_follow_up
-- ---------------------------------------------------------------------------
-- Creates a follow_ups row. Admin-side workflow only; leaders cannot
-- create follow-ups in Phase 5C.0. Closed groups are *allowed* as
-- related_group_id so admins can record wrap-up tasks on closed groups
-- (consistent with the Phase 5A.2 close-group behavior preserving
-- history).
create or replace function public.admin_create_follow_up(
  p_type public.follow_up_type,
  p_title text,
  p_related_group_id uuid,
  p_related_member_id uuid,
  p_related_guest_id uuid,
  p_assigned_to uuid,
  p_priority public.follow_up_priority,
  p_due_date date,
  p_leader_visible_note text,
  p_admin_private_note text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_title text;
  v_leader_note text;
  v_admin_note text;
  v_priority public.follow_up_priority;
  v_owner_status public.profile_status;
  v_member_status public.membership_status;
  v_new_id uuid;
  v_exists boolean;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_type is null then
    raise exception 'invalid_input';
  end if;

  v_title := nullif(btrim(coalesce(p_title, '')), '');
  if v_title is null then
    raise exception 'invalid_input';
  end if;
  if length(v_title) > 200 then
    raise exception 'invalid_input';
  end if;

  v_leader_note := nullif(btrim(coalesce(p_leader_visible_note, '')), '');
  if v_leader_note is not null and length(v_leader_note) > 1000 then
    raise exception 'invalid_input';
  end if;
  v_admin_note := nullif(btrim(coalesce(p_admin_private_note, '')), '');
  if v_admin_note is not null and length(v_admin_note) > 1000 then
    raise exception 'invalid_input';
  end if;

  v_priority := coalesce(p_priority, 'normal'::public.follow_up_priority);

  if p_related_group_id is not null then
    select true into v_exists from public.groups where id = p_related_group_id limit 1;
    if v_exists is null then
      raise exception 'missing_group';
    end if;
    -- Closed groups are permitted here on purpose.
  end if;

  if p_related_member_id is not null then
    select status into v_member_status from public.members where id = p_related_member_id limit 1;
    if v_member_status is null then
      raise exception 'missing_member';
    end if;
  end if;

  if p_related_guest_id is not null then
    select true into v_exists from public.guests where id = p_related_guest_id limit 1;
    if v_exists is null then
      raise exception 'missing_guest';
    end if;
  end if;

  if p_assigned_to is not null then
    select status into v_owner_status from public.profiles where id = p_assigned_to limit 1;
    if v_owner_status is null then
      raise exception 'missing_profile';
    end if;
    if v_owner_status <> 'active'::public.profile_status then
      raise exception 'missing_profile';
    end if;
  end if;

  insert into public.follow_ups (
    type, title,
    related_group_id, related_member_id, related_guest_id,
    assigned_to, priority, due_date, status,
    leader_visible_note, admin_private_note
  ) values (
    p_type, v_title,
    p_related_group_id, p_related_member_id, p_related_guest_id,
    p_assigned_to, v_priority, p_due_date, 'open'::public.follow_up_status,
    v_leader_note, v_admin_note
  )
  returning id into v_new_id;

  -- Note bodies are intentionally NOT stored in the audit metadata. We
  -- only record presence so the audit log is shareable without leaking
  -- pastoral context.
  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.create_follow_up',
    'follow_ups',
    v_new_id,
    jsonb_build_object(
      'after', jsonb_build_object(
        'type', p_type,
        'title', v_title,
        'priority', v_priority,
        'status', 'open',
        'related_group_id', p_related_group_id,
        'related_member_id', p_related_member_id,
        'related_guest_id', p_related_guest_id,
        'assigned_to', p_assigned_to,
        'due_date', p_due_date,
        'has_leader_visible_note', v_leader_note is not null,
        'has_admin_private_note', v_admin_note is not null
      )
    )
  );

  return v_new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. admin_update_follow_up_status
-- ---------------------------------------------------------------------------
-- Admins can move a follow_up to any valid status. completed_at is
-- populated when the new status is 'done' and cleared when transitioning
-- away from 'done'. Optionally updates either note when the matching
-- _set_ flag is true.
create or replace function public.admin_update_follow_up_status(
  p_follow_up_id uuid,
  p_status public.follow_up_status,
  p_set_leader_visible_note boolean,
  p_leader_visible_note text,
  p_set_admin_private_note boolean,
  p_admin_private_note text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_existing record;
  v_new_leader_note text;
  v_new_admin_note text;
  v_clean_leader_note text;
  v_clean_admin_note text;
  v_new_completed_at timestamptz;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_status is null then
    raise exception 'invalid_input';
  end if;

  select id, title, status, completed_at, leader_visible_note, admin_private_note
    into v_existing
    from public.follow_ups
   where id = p_follow_up_id
   for update;
  if v_existing.id is null then
    raise exception 'missing_follow_up';
  end if;

  if p_set_leader_visible_note then
    v_clean_leader_note := nullif(btrim(coalesce(p_leader_visible_note, '')), '');
    if v_clean_leader_note is not null and length(v_clean_leader_note) > 1000 then
      raise exception 'invalid_input';
    end if;
    v_new_leader_note := v_clean_leader_note;
  else
    v_new_leader_note := v_existing.leader_visible_note;
  end if;

  if p_set_admin_private_note then
    v_clean_admin_note := nullif(btrim(coalesce(p_admin_private_note, '')), '');
    if v_clean_admin_note is not null and length(v_clean_admin_note) > 1000 then
      raise exception 'invalid_input';
    end if;
    v_new_admin_note := v_clean_admin_note;
  else
    v_new_admin_note := v_existing.admin_private_note;
  end if;

  if p_status = 'done'::public.follow_up_status then
    v_new_completed_at := coalesce(v_existing.completed_at, now());
  elsif v_existing.status = 'done'::public.follow_up_status then
    v_new_completed_at := null;
  else
    v_new_completed_at := v_existing.completed_at;
  end if;

  update public.follow_ups
     set status              = p_status,
         leader_visible_note = v_new_leader_note,
         admin_private_note  = v_new_admin_note,
         completed_at        = v_new_completed_at
   where id = p_follow_up_id;

  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.update_follow_up_status',
    'follow_ups',
    p_follow_up_id,
    jsonb_build_object(
      'before', jsonb_build_object(
        'status', v_existing.status,
        'completed_at', v_existing.completed_at
      ),
      'after', jsonb_build_object(
        'status', p_status,
        'completed_at', v_new_completed_at
      ),
      'title', v_existing.title,
      'leader_note_updated', p_set_leader_visible_note,
      'admin_note_updated', p_set_admin_private_note
    )
  );

  return p_follow_up_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. leader_update_follow_up_status
-- ---------------------------------------------------------------------------
-- Leaders / co-leaders can move follow-ups they own (assigned_to) or
-- follow-ups tied to a group they actively lead. The only allowed
-- transitions are open->in_progress, open->done, in_progress->done.
-- Leaders cannot reopen, snooze, or edit either note. completed_at is
-- populated when status=done.
create or replace function public.leader_update_follow_up_status(
  p_follow_up_id uuid,
  p_status public.follow_up_status
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_actor_role public.user_role;
  v_existing record;
  v_is_owner boolean;
  v_is_group_leader boolean;
  v_new_completed_at timestamptz;
begin
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;
  v_actor_role := public.auth_role();
  if v_actor_role is null
     or v_actor_role not in ('leader'::public.user_role, 'co_leader'::public.user_role) then
    raise exception 'insufficient_privilege';
  end if;

  if p_status is null
     or p_status not in ('in_progress'::public.follow_up_status, 'done'::public.follow_up_status) then
    raise exception 'invalid_status';
  end if;

  select id, status, completed_at, assigned_to, related_group_id, title
    into v_existing
    from public.follow_ups
   where id = p_follow_up_id
   for update;
  if v_existing.id is null then
    raise exception 'missing_follow_up';
  end if;

  v_is_owner := v_existing.assigned_to is not null and v_existing.assigned_to = v_actor;
  v_is_group_leader := v_existing.related_group_id is not null
                       and public.auth_is_leader_of(v_existing.related_group_id);
  if not (v_is_owner or v_is_group_leader) then
    raise exception 'forbidden_target';
  end if;

  -- Allowed transitions only: open->in_progress, open->done, in_progress->done.
  if v_existing.status = 'open'::public.follow_up_status then
    if p_status not in ('in_progress'::public.follow_up_status, 'done'::public.follow_up_status) then
      raise exception 'invalid_status_transition';
    end if;
  elsif v_existing.status = 'in_progress'::public.follow_up_status then
    if p_status <> 'done'::public.follow_up_status then
      raise exception 'invalid_status_transition';
    end if;
  else
    -- done or snoozed: leader cannot touch.
    raise exception 'invalid_status_transition';
  end if;

  if p_status = 'done'::public.follow_up_status then
    v_new_completed_at := coalesce(v_existing.completed_at, now());
  else
    v_new_completed_at := v_existing.completed_at;
  end if;

  update public.follow_ups
     set status       = p_status,
         completed_at = v_new_completed_at
   where id = p_follow_up_id;

  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'leader.update_follow_up_status',
    'follow_ups',
    p_follow_up_id,
    jsonb_build_object(
      'before', jsonb_build_object('status', v_existing.status),
      'after', jsonb_build_object(
        'status', p_status,
        'completed_at', v_new_completed_at
      ),
      'title', v_existing.title,
      'related_group_id', v_existing.related_group_id,
      'was_assigned_to_caller', v_is_owner
    )
  );

  return p_follow_up_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants. Revoke from public/anon/authenticated, then grant execute to
-- authenticated only. The function body still enforces auth_is_admin()
-- (or the leader-specific gate); granting execute to authenticated only
-- makes the function *callable*.
-- ---------------------------------------------------------------------------

revoke all on function public.admin_create_guest(
  text, text, text, uuid, date,
  public.guest_pipeline_stage, uuid, uuid, text
) from public;
revoke all on function public.admin_create_guest(
  text, text, text, uuid, date,
  public.guest_pipeline_stage, uuid, uuid, text
) from anon;
revoke all on function public.admin_create_guest(
  text, text, text, uuid, date,
  public.guest_pipeline_stage, uuid, uuid, text
) from authenticated;
grant execute on function public.admin_create_guest(
  text, text, text, uuid, date,
  public.guest_pipeline_stage, uuid, uuid, text
) to authenticated;

revoke all on function public.admin_update_guest_pipeline(
  uuid, public.guest_pipeline_stage, boolean, uuid, boolean, uuid, boolean, text
) from public;
revoke all on function public.admin_update_guest_pipeline(
  uuid, public.guest_pipeline_stage, boolean, uuid, boolean, uuid, boolean, text
) from anon;
revoke all on function public.admin_update_guest_pipeline(
  uuid, public.guest_pipeline_stage, boolean, uuid, boolean, uuid, boolean, text
) from authenticated;
grant execute on function public.admin_update_guest_pipeline(
  uuid, public.guest_pipeline_stage, boolean, uuid, boolean, uuid, boolean, text
) to authenticated;

revoke all on function public.admin_create_follow_up(
  public.follow_up_type, text, uuid, uuid, uuid, uuid,
  public.follow_up_priority, date, text, text
) from public;
revoke all on function public.admin_create_follow_up(
  public.follow_up_type, text, uuid, uuid, uuid, uuid,
  public.follow_up_priority, date, text, text
) from anon;
revoke all on function public.admin_create_follow_up(
  public.follow_up_type, text, uuid, uuid, uuid, uuid,
  public.follow_up_priority, date, text, text
) from authenticated;
grant execute on function public.admin_create_follow_up(
  public.follow_up_type, text, uuid, uuid, uuid, uuid,
  public.follow_up_priority, date, text, text
) to authenticated;

revoke all on function public.admin_update_follow_up_status(
  uuid, public.follow_up_status, boolean, text, boolean, text
) from public;
revoke all on function public.admin_update_follow_up_status(
  uuid, public.follow_up_status, boolean, text, boolean, text
) from anon;
revoke all on function public.admin_update_follow_up_status(
  uuid, public.follow_up_status, boolean, text, boolean, text
) from authenticated;
grant execute on function public.admin_update_follow_up_status(
  uuid, public.follow_up_status, boolean, text, boolean, text
) to authenticated;

revoke all on function public.leader_update_follow_up_status(
  uuid, public.follow_up_status
) from public;
revoke all on function public.leader_update_follow_up_status(
  uuid, public.follow_up_status
) from anon;
revoke all on function public.leader_update_follow_up_status(
  uuid, public.follow_up_status
) from authenticated;
grant execute on function public.leader_update_follow_up_status(
  uuid, public.follow_up_status
) to authenticated;

comment on function public.admin_create_guest(
  text, text, text, uuid, date,
  public.guest_pipeline_stage, uuid, uuid, text
) is
  'Phase 5C.0 admin write: inserts a guests row plus an audit_events row in the same transaction. Closed assigned_group_id is rejected with group_closed; first_attended_group_id may reference a closed group.';

comment on function public.admin_update_guest_pipeline(
  uuid, public.guest_pipeline_stage, boolean, uuid, boolean, uuid, boolean, text
) is
  'Phase 5C.0 admin write: updates pipeline_stage and optionally assigned_group_id / follow_up_owner_id / notes (selected via _set_ flags). Writes a companion audit row for admin.mark_guest_not_now when archiving.';

comment on function public.admin_create_follow_up(
  public.follow_up_type, text, uuid, uuid, uuid, uuid,
  public.follow_up_priority, date, text, text
) is
  'Phase 5C.0 admin write: inserts a follow_ups row plus an audit_events row. Note bodies are intentionally omitted from audit metadata; only presence is recorded.';

comment on function public.admin_update_follow_up_status(
  uuid, public.follow_up_status, boolean, text, boolean, text
) is
  'Phase 5C.0 admin write: updates a follow_ups row''s status with completed_at handling, plus an audit_events row. Optionally updates either note via _set_ flags.';

comment on function public.leader_update_follow_up_status(
  uuid, public.follow_up_status
) is
  'Phase 5C.0 leader write: lets a leader / co_leader move an assigned (or group-tied) follow_up open->in_progress, open->done, or in_progress->done. No note edits; no admin_private_note exposure.';
