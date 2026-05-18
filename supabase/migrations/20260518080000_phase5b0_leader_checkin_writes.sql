-- Phase 5B.0: Leader weekly check-in writes.
--
-- This migration introduces the ONLY write path for the Phase 5B.0 leader
-- check-in workflow: one narrow SECURITY DEFINER RPC function. As with
-- Phase 5A.1 / 5A.2, the function is the security boundary -- RLS does NOT
-- protect writes inside the function body. The function therefore
-- explicitly enforces:
--   * auth_profile_id() not null (signed-in, active profile)
--   * auth_is_leader_of(p_group_id) (active leader/co_leader of THIS group)
--   * group exists and is not closed
--   * meeting_week + status validated
--   * every attendance member belongs to the group via active membership
--
-- No new tables, no new enums, no new broad INSERT/UPDATE/DELETE policies
-- on the underlying tables. RLS stays SELECT-only outside the SECURITY
-- DEFINER surface.
--
-- Attendance records are replaced atomically: any prior records for the
-- weekly session are deleted INSIDE the RPC, then the new ones inserted.
-- This is a "controlled" delete (the RPC vets the leader and group before
-- touching anything) -- the client-side code never issues a .delete().
-- The parent attendance_sessions row is NEVER hard-deleted; duplicate
-- submits update the same row.
--
-- Fixed error tokens raised by the function, mapped to friendly UI text
-- by the calling server action:
--   insufficient_privilege, invalid_input, missing_group, group_closed,
--   not_leader_of_group, invalid_member.

-- ---------------------------------------------------------------------------
-- leader_submit_group_checkin
-- ---------------------------------------------------------------------------
create or replace function public.leader_submit_group_checkin(
  p_group_id uuid,
  p_meeting_week date,
  p_meeting_date date,
  p_status text,
  p_leader_note text,
  p_pulse text,
  p_follow_up_needed boolean,
  p_attendance jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_status_enum public.attendance_session_status;
  v_pulse_enum public.group_health_status;
  v_group_lifecycle public.group_lifecycle_status;
  v_session_id uuid;
  v_was_existing boolean := false;
  v_previous_status public.attendance_session_status;
  v_audit_action text;
  v_attendance_count integer := 0;
  v_invalid_count integer := 0;
  v_leader_note text;
  v_follow_up boolean;
begin
  -- 1. Auth: must have an active profile linked to this session.
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  -- 2. Basic input validation.
  if p_group_id is null or p_meeting_week is null then
    raise exception 'invalid_input';
  end if;
  if p_status is null or p_status not in ('submitted', 'did_not_meet', 'planned_pause') then
    raise exception 'invalid_input';
  end if;
  v_status_enum := p_status::public.attendance_session_status;

  v_leader_note := nullif(btrim(coalesce(p_leader_note, '')), '');
  v_follow_up   := coalesce(p_follow_up_needed, false);

  -- Cap leader_note length so a paste-bomb can't fill the column. The
  -- form validates first (max 1000 chars); this is defense-in-depth.
  if v_leader_note is not null and length(v_leader_note) > 1000 then
    raise exception 'invalid_input';
  end if;

  -- 3. Pulse validation. Phase 5B.0 only supports the three "live" pulses
  --    that the leader form exposes; admin-managed pulses such as
  --    healthy_paused / capacity_full are set elsewhere and not part of
  --    the leader contract.
  if p_pulse is not null then
    if p_pulse not in ('healthy', 'watch', 'needs_follow_up') then
      raise exception 'invalid_input';
    end if;
    v_pulse_enum := p_pulse::public.group_health_status;
  end if;

  -- 4. Group must exist and be non-closed. We don't lock the row here;
  --    admin_close_group will serialize through its own FOR UPDATE, and
  --    the worst case is a race where the leader's submit lands a moment
  --    before the close commits -- still a valid pre-close submission.
  select lifecycle_status into v_group_lifecycle
    from public.groups
   where id = p_group_id
   limit 1;
  if v_group_lifecycle is null then
    raise exception 'missing_group';
  end if;
  if v_group_lifecycle = 'closed' then
    raise exception 'group_closed';
  end if;

  -- 5. Authorization: the caller must be an active leader / co_leader of
  --    this specific group. auth_is_leader_of already requires
  --    status='active' on the underlying profile.
  if not public.auth_is_leader_of(p_group_id) then
    raise exception 'not_leader_of_group';
  end if;

  -- 6. Lock-or-insert the per-week session row. The unique constraint
  --    `(group_id, meeting_week)` prevents duplicates; the FOR UPDATE
  --    serializes concurrent submits from the leader and co-leader
  --    of the same group.
  select id, status into v_session_id, v_previous_status
    from public.attendance_sessions
   where group_id = p_group_id
     and meeting_week = p_meeting_week
   for update;

  v_was_existing := v_session_id is not null;

  if v_was_existing then
    update public.attendance_sessions
       set meeting_date = p_meeting_date,
           status       = v_status_enum,
           submitted_by = v_actor,
           submitted_at = now(),
           leader_note  = v_leader_note
     where id = v_session_id;
  else
    insert into public.attendance_sessions (
      group_id, meeting_week, meeting_date, status,
      submitted_by, submitted_at, leader_note
    ) values (
      p_group_id, p_meeting_week, p_meeting_date, v_status_enum,
      v_actor, now(), v_leader_note
    ) returning id into v_session_id;
  end if;

  -- 7. Replace attendance records for the session. Wiping first then
  --    inserting is the canonical "controlled replace" pattern. The
  --    DELETE is confined to this single session, never touches other
  --    sessions, and never hard-deletes the parent attendance_sessions
  --    row. attendance_records.session_id has ON DELETE CASCADE in the
  --    Phase 2 schema, but we don't rely on that here -- we always
  --    leave the parent session in place so historical metadata
  --    (created_at, meeting_date, leader_note) survives.
  delete from public.attendance_records where session_id = v_session_id;

  if v_status_enum = 'submitted'
     and p_attendance is not null
     and jsonb_typeof(p_attendance) = 'array' then
    -- Reject any attendance row that references a member outside this
    -- group's active roster, has a bad status enum, or is missing fields.
    -- This is the "members belong to the group" guarantee called out in
    -- the Phase 5B.0 spec.
    select count(*) into v_invalid_count
      from jsonb_to_recordset(p_attendance)
        as a(member_id uuid, attendance_status text)
     where a.member_id is null
        or a.attendance_status is null
        or a.attendance_status not in ('present', 'absent', 'excused')
        or not exists (
          select 1
            from public.group_memberships gm
           where gm.group_id  = p_group_id
             and gm.member_id = a.member_id
             and gm.status    = 'active'
        );

    if v_invalid_count > 0 then
      raise exception 'invalid_member';
    end if;

    -- De-duplicate within the submitted payload so two records can never
    -- collide on the (session_id, member_id) unique constraint. The
    -- "last entry wins" via distinct on (member_id) ordered by ordinality
    -- desc, which matches how the form-state itself overwrites earlier
    -- selections client-side.
    insert into public.attendance_records (session_id, member_id, attendance_status)
    select distinct on (a.member_id)
      v_session_id,
      a.member_id,
      a.attendance_status::public.attendance_status
    from jsonb_to_recordset(p_attendance)
        with ordinality
        as a(member_id uuid, attendance_status text, ord int)
    order by a.member_id, a.ord desc;

    get diagnostics v_attendance_count = row_count;
  end if;

  -- 8. Health pulse upsert. The Phase 2 schema declares
  --    unique(group_id, update_week) on group_health_updates, so the
  --    upsert below is safe. We deliberately leave `admin_note` alone;
  --    only the leader-facing columns are written.
  if v_pulse_enum is not null then
    insert into public.group_health_updates (
      group_id, submitted_by, update_week, pulse, follow_up_needed, leader_note
    ) values (
      p_group_id, v_actor, p_meeting_week, v_pulse_enum, v_follow_up, v_leader_note
    )
    on conflict (group_id, update_week) do update
      set submitted_by      = excluded.submitted_by,
          pulse             = excluded.pulse,
          follow_up_needed  = excluded.follow_up_needed,
          leader_note       = excluded.leader_note;
    -- admin_note: intentionally untouched.
  end if;

  -- 9. Choose audit action. The spec calls out three actions; the
  --    function maps deterministically:
  --      * status=did_not_meet            -> leader.mark_did_not_meet
  --      * status=submitted/planned_pause AND row was new -> leader.submit_checkin
  --      * otherwise (row already existed) -> leader.update_checkin
  if v_status_enum = 'did_not_meet' then
    v_audit_action := 'leader.mark_did_not_meet';
  elsif v_was_existing then
    v_audit_action := 'leader.update_checkin';
  else
    v_audit_action := 'leader.submit_checkin';
  end if;

  -- 10. Audit row written in the same transaction as the data change.
  --     If this insert fails (RLS / privilege issue), the entire submit
  --     rolls back -- matches Phase 5A.1/5A.2 behaviour.
  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    v_audit_action,
    'attendance_sessions',
    v_session_id,
    jsonb_build_object(
      'group_id', p_group_id,
      'meeting_week', p_meeting_week,
      'meeting_date', p_meeting_date,
      'status', v_status_enum,
      'before_status', v_previous_status,
      'was_existing', v_was_existing,
      'attendance_count', v_attendance_count,
      'pulse_set', v_pulse_enum is not null,
      'follow_up_needed', v_follow_up
    )
  );

  return v_session_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants. Revoke first, then grant execute to authenticated only. The
-- function body still enforces auth_profile_id() and
-- auth_is_leader_of(); granting execute to authenticated only makes the
-- function callable. Admins who happen to also be a leader of the group
-- can use it; pure ministry_admin / staff_viewer callers will be rejected
-- at the auth_is_leader_of step.
-- ---------------------------------------------------------------------------
revoke all on function public.leader_submit_group_checkin(
  uuid, date, date, text, text, text, boolean, jsonb
) from public;
revoke all on function public.leader_submit_group_checkin(
  uuid, date, date, text, text, text, boolean, jsonb
) from anon;
revoke all on function public.leader_submit_group_checkin(
  uuid, date, date, text, text, text, boolean, jsonb
) from authenticated;
grant execute on function public.leader_submit_group_checkin(
  uuid, date, date, text, text, text, boolean, jsonb
) to authenticated;

comment on function public.leader_submit_group_checkin(
  uuid, date, date, text, text, text, boolean, jsonb
) is
  'Phase 5B.0 leader write: upserts the weekly attendance_sessions row for the caller''s assigned group, replaces attendance_records for that session, upserts the matching group_health_updates row when a pulse is supplied, and writes an audit_events row.';
