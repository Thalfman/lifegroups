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
  v_current_monday date;
  v_min_allowed_week date;
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

  -- Restrict p_meeting_week to the current ISO week or the immediately
  -- preceding week. The leader form hard-codes the current week; allowing
  -- one week back covers Monday-morning back-fills for Sunday meetings and
  -- absorbs small UTC-vs-server-timezone drift. Anything older is blocked
  -- so a tampered hidden `meeting_week` field cannot be replayed to rewrite
  -- arbitrary historical attendance sessions.
  v_current_monday   := date_trunc('week', current_date)::date;
  v_min_allowed_week := v_current_monday - 7;
  if p_meeting_week < v_min_allowed_week or p_meeting_week > v_current_monday then
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

  -- If the leader ticked "Group could use a follow-up this week" but did
  -- not choose a pulse, treat that as a "needs_follow_up" pulse so the
  -- escalation signal is not silently dropped. The admin dashboard reads
  -- group_health_updates for the follow-up flag; without this fallback the
  -- whole group_health_updates upsert below would be skipped and the
  -- request would never reach an admin.
  if v_pulse_enum is null and v_follow_up then
    v_pulse_enum := 'needs_follow_up'::public.group_health_status;
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
  -- 6. Snapshot the existing session row (if any) for the audit metadata,
  --    then upsert atomically. The pre-existing-row SELECT uses FOR UPDATE
  --    so a concurrent UPDATE to the same row blocks here, but on a brand
  --    new week the row doesn't exist yet and FOR UPDATE acquires no lock
  --    -- two leaders submitting simultaneously could both see no row.
  --    The ON CONFLICT DO UPDATE on the unique (group_id, meeting_week)
  --    index makes the upsert idempotent under that race: one transaction
  --    inserts, the other one updates via the conflict branch. v_was_existing
  --    reflects the pre-statement view, so under extreme concurrency the
  --    audit action may say "submit_checkin" twice instead of
  --    "submit_checkin + update_checkin"; the underlying data is still
  --    correct (one session row, latest writer wins on the columns).
  select id, status into v_session_id, v_previous_status
    from public.attendance_sessions
   where group_id = p_group_id
     and meeting_week = p_meeting_week
   for update;

  v_was_existing := v_session_id is not null;

  insert into public.attendance_sessions (
    group_id, meeting_week, meeting_date, status,
    submitted_by, submitted_at, leader_note
  ) values (
    p_group_id, p_meeting_week, p_meeting_date, v_status_enum,
    v_actor, now(), v_leader_note
  )
  on conflict (group_id, meeting_week) do update
    set meeting_date = excluded.meeting_date,
        status       = excluded.status,
        submitted_by = excluded.submitted_by,
        submitted_at = excluded.submitted_at,
        leader_note  = excluded.leader_note
  returning id into v_session_id;

  -- 7. Reconcile attendance_records for the session.
  --    History-preserving strategy:
  --      * status in (did_not_meet, planned_pause): the meeting did not
  --        happen, so every record for the session is wiped (including
  --        historical entries for now-inactive members). Retroactively
  --        moving a session from "submitted" to "did_not_meet" is an
  --        explicit correction by the leader; clearing the records is
  --        the right thing to do.
  --      * status = submitted: only touch records for members who are
  --        currently on the group's ACTIVE roster. Records for members
  --        who left the group between the original submit and this edit
  --        are preserved as historical attendance data -- editing the
  --        leader note on a months-old session must not erase someone's
  --        attendance record just because they later moved away.
  --
  --    Validate the attendance payload's *shape* before any destructive
  --    action runs. A submitted check-in with a non-array `p_attendance`
  --    (object, string, number, ...) must fail invalid_input cleanly.
  if v_status_enum = 'submitted'
     and p_attendance is not null
     and jsonb_typeof(p_attendance) <> 'array' then
    raise exception 'invalid_input';
  end if;

  if v_status_enum in ('did_not_meet', 'planned_pause') then
    delete from public.attendance_records where session_id = v_session_id;
  end if;

  if v_status_enum = 'submitted' and p_attendance is not null then
    -- Reject any attendance row that references a member outside this
    -- group's active roster, has a bad status enum, or is missing fields.
    -- This is the "members belong to the group" guarantee called out in
    -- the Phase 5B.0 spec. p_attendance is guaranteed to be a jsonb array
    -- here because the shape check above already rejected anything else.
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

    -- Upsert each submitted attendance row. De-dupe within the payload
    -- so two records can never collide on the (session_id, member_id)
    -- unique constraint -- "last entry wins" via distinct on (member_id)
    -- ordered by ordinality desc, matching how the form-state itself
    -- overwrites earlier selections client-side.
    insert into public.attendance_records (session_id, member_id, attendance_status)
    select distinct on (a.member_id)
      v_session_id,
      a.member_id,
      a.attendance_status::public.attendance_status
    from jsonb_to_recordset(p_attendance)
        with ordinality
        as a(member_id uuid, attendance_status text, ord int)
    order by a.member_id, a.ord desc
    on conflict (session_id, member_id) do update
      set attendance_status = excluded.attendance_status;

    get diagnostics v_attendance_count = row_count;

    -- Delete records for currently-active members who were NOT in the
    -- submitted payload. This lets a leader remove someone's attendance
    -- from this week (e.g. they marked the wrong person), but only for
    -- members still on the active roster. Records for now-inactive
    -- members are preserved -- an edit to a months-old session must not
    -- silently erase historical attendance.
    delete from public.attendance_records ar
     where ar.session_id = v_session_id
       and exists (
         select 1 from public.group_memberships gm
          where gm.group_id  = p_group_id
            and gm.member_id = ar.member_id
            and gm.status    = 'active'
       )
       and not exists (
         select 1 from jsonb_to_recordset(p_attendance)
                as a(member_id uuid, attendance_status text)
          where a.member_id = ar.member_id
       );
  end if;

  -- 8. Health pulse upsert (or controlled clear).
  --    The Phase 2 schema declares unique(group_id, update_week) on
  --    group_health_updates, so the upsert below is safe. We deliberately
  --    leave admin_note alone; only the leader-facing columns are written.
  --
  --    If the leader explicitly picked "No update" (v_pulse_enum is null
  --    -- note that follow_up=true was already promoted to a needs_follow_up
  --    pulse above), and a prior row exists for this group/week without
  --    admin_note set, drop the row so the leader can actually clear a
  --    previously-saved pulse. If the prior row has admin_note populated,
  --    we never delete -- that protects admin work from leader actions.
  --    This DELETE is a scoped, leader-owned-week clear inside the
  --    SECURITY DEFINER boundary; the row is not "historical data" in
  --    the same way an attendance_session is.
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
  else
    delete from public.group_health_updates
     where group_id    = p_group_id
       and update_week = p_meeting_week
       and admin_note is null;
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
