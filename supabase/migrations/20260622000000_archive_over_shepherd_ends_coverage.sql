-- #423: the one-click Archive toggle must end an over-shepherd's coverage.
--
-- admin_update_over_shepherd (the edit-form Active flag) already cascades a
-- soft-end of the over-shepherd's active coverage assignments on archive — added
-- in 20260518180000_phase5d1_over_shepherd_coverage_hardening.sql — and
-- admin_deactivate_profile cascades the same way. But the one-click Archive
-- button added in #422 (admin_set_over_shepherd_active,
-- 20260619000000_admin_set_over_shepherd_active.sql) only flips `active`; it
-- never replicated that cascade. So archiving via the button left the coverage
-- rows active, and the Care reads disagreed: delegatedShepherdIds (built from
-- active assignments) still counted those leaders as covered, while the Coverage
-- tab — which buckets only ACTIVE over-shepherds — dropped the archived
-- over-shepherd's bucket entirely. Net: a covered leader silently vanished from
-- coverage while still being treated as delegated everywhere else.
--
-- Fix (issue #423, option 1 "end coverage on archive"): re-create
-- admin_set_over_shepherd_active so the archive transition (active true -> false)
-- soft-ends the over-shepherd's active coverage assignments in the SAME
-- transaction, exactly like admin_update_over_shepherd's cascade — including the
-- ended_at = greatest(current_date, assigned_at) clamp (plain current_date can
-- violate the ended_at >= assigned_at CHECK for an assigned_at set in a
-- UTC-ahead time zone, which would abort the whole archive). The count of ended
-- assignments is folded into the existing audit row's metadata under the same
-- key admin_update_over_shepherd uses (ended_active_assignments_count). Restoring
-- an over-shepherd does NOT re-create coverage — those leaders fall to
-- Unassigned for explicit reassignment.
--
-- Section 2 backfills the rows already left inconsistent by the button between
-- #422 landing and this fix: any currently-active assignment whose over-shepherd
-- is already inactive is soft-ended (same clamp), with one summarizing system
-- audit row (null actor, mirroring the leader-surface verify migration). No hard
-- deletes anywhere — assignments are soft-ended (active=false + ended_at).
--
-- admin_update_over_shepherd is intentionally NOT touched here: its hardened
-- cascade is already correct, and re-creating it would only risk regressing it.

-- ---------------------------------------------------------------------------
-- 1. admin_set_over_shepherd_active — end coverage on archive.
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_over_shepherd_active(
  p_over_shepherd_id uuid,
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

  if p_over_shepherd_id is null or p_active is null then
    raise exception 'invalid_input';
  end if;

  select id, active, archived_at
    into v_existing
    from public.over_shepherds
   where id = p_over_shepherd_id
   for update;
  if v_existing.id is null then
    raise exception 'missing_over_shepherd';
  end if;

  -- Soft archive/restore: archived_at is the "when did this become inactive?"
  -- source of truth, mirroring admin_update_over_shepherd. Stamp it on archive,
  -- clear it on restore, leave it untouched on a no-op.
  if p_active and v_existing.active is not true then
    v_archived_at := null;
  elsif p_active = false and v_existing.active = true then
    v_archived_at := now();
  else
    v_archived_at := v_existing.archived_at;
  end if;

  update public.over_shepherds
     set active = p_active,
         archived_at = v_archived_at,
         updated_at = now()
   where id = p_over_shepherd_id;

  -- #423: on the archive transition, end this over-shepherd's active coverage
  -- assignments so the covered leaders fall to Unassigned instead of silently
  -- vanishing from the Coverage tab. Identical to the cascade in
  -- admin_update_over_shepherd / admin_deactivate_profile, including the
  -- ended_at clamp (greatest(current_date, assigned_at)) that keeps the
  -- ended_at >= assigned_at CHECK from aborting the archive when assigned_at is
  -- a future date for an admin in a UTC-ahead time zone.
  if p_active = false and v_existing.active = true then
    with closed as (
      update public.shepherd_coverage_assignments
         set active = false,
             ended_at = greatest(
               current_date,
               public.shepherd_coverage_assignments.assigned_at
             ),
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
    'admin.set_over_shepherd_active',
    'over_shepherds',
    p_over_shepherd_id,
    jsonb_build_object(
      'before', jsonb_build_object('active', v_existing.active),
      'after',  jsonb_build_object('active', p_active),
      'ended_active_assignments_count', v_ended_active_assignments_count
    )
  );

  return p_over_shepherd_id;
end;
$$;

revoke all on function public.admin_set_over_shepherd_active(uuid, boolean) from public;
revoke all on function public.admin_set_over_shepherd_active(uuid, boolean) from anon;
revoke all on function public.admin_set_over_shepherd_active(uuid, boolean) from authenticated;
grant execute on function public.admin_set_over_shepherd_active(uuid, boolean) to authenticated;

comment on function public.admin_set_over_shepherd_active(uuid, boolean) is
  'Admin write: flips an over_shepherd''s active flag (soft archive/restore, maintaining archived_at). On archive it soft-ends the over-shepherd''s active coverage assignments in the same transaction (#423) so covered leaders fall to Unassigned. Paired audit_events row. No hard delete.';

-- ---------------------------------------------------------------------------
-- 2. Backfill the rows the one-click button already left inconsistent.
-- ---------------------------------------------------------------------------
-- Over-shepherds archived via admin_set_over_shepherd_active before this
-- migration still have active coverage assignments pointing at them. Soft-end
-- them now so the "active assignment => active over-shepherd" invariant holds
-- across history and those leaders surface as Unassigned for reassignment. Same
-- ended_at clamp as the cascade. One summarizing system audit row (null actor,
-- like the leader-surface verify migration); per-assignment detail lives in each
-- row's own ended_at.
do $$
declare
  v_ended integer := 0;
begin
  with closed as (
    update public.shepherd_coverage_assignments sca
       set active = false,
           ended_at = greatest(current_date, sca.assigned_at),
           updated_at = now()
      from public.over_shepherds os
     where sca.over_shepherd_id = os.id
       and sca.active = true
       and os.active is not true
    returning sca.id
  )
  select count(*) into v_ended from closed;

  if v_ended > 0 then
    insert into public.audit_events
      (actor_profile_id, action, entity_type, entity_id, metadata)
    values (
      null,
      'system.backfill_end_coverage_for_archived_over_shepherds',
      'shepherd_coverage_assignments',
      null,
      jsonb_build_object('ended_active_assignments_count', v_ended)
    );
  end if;
end;
$$;
