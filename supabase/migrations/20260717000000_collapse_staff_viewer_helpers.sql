-- Issue #866: remove the retired staff-viewer helper indirection from every
-- SELECT policy that still depends on it, then drop the dead helpers.
--
-- `20260531140000_remove_staff_viewer_role.sql` made
-- `auth_is_admin_or_staff()` exactly equivalent to `auth_is_admin()` and made
-- `auth_is_staff_viewer()` return constant false. `20260714010000` then wrapped
-- the in-force no-argument helper calls as `(select ...)` InitPlans. The policy
-- predicates below are copied verbatim from that last-writer migration with
-- only this semantics-preserving substitution:
--
--   (select public.auth_is_admin_or_staff())
--   -> (select public.auth_is_admin())
--
-- Keeping the existing InitPlan form avoids reintroducing per-row helper calls.
-- The transaction and dependency-restricted function drops make the migration
-- fail closed if any policy dependency was missed.

begin;

drop policy if exists attendance_records_read on public.attendance_records;
create policy attendance_records_read on public.attendance_records
  for select to authenticated
  using (
    (select public.auth_is_admin())
    or exists (
      select 1
        from public.attendance_sessions s
       where s.id = attendance_records.session_id
         and public.auth_is_leader_of(s.group_id)
    )
  );

drop policy if exists attendance_sessions_read on public.attendance_sessions;
create policy attendance_sessions_read on public.attendance_sessions
  for select to authenticated
  using (
    (select public.auth_is_admin())
    or public.auth_is_leader_of(group_id)
  );

drop policy if exists follow_ups_read on public.follow_ups;
create policy follow_ups_read on public.follow_ups
  for select to authenticated
  using (
    (select public.auth_is_admin())
    or (
      (related_group_id is not null and public.auth_is_leader_of(related_group_id))
      or assigned_to = (select public.auth_profile_id())
    )
  );

drop policy if exists group_calendar_events_read on public.group_calendar_events;
create policy group_calendar_events_read on public.group_calendar_events
  for select to authenticated
  using (
    (select public.auth_is_admin())
    or public.auth_is_leader_of(group_id)
  );

drop policy if exists group_health_updates_read on public.group_health_updates;
create policy group_health_updates_read on public.group_health_updates
  for select to authenticated
  using (
    (select public.auth_is_admin())
    or public.auth_is_leader_of(group_id)
  );

drop policy if exists group_leaders_read on public.group_leaders;
create policy group_leaders_read on public.group_leaders
  for select to authenticated
  using (
    (select public.auth_is_admin())
    or public.auth_is_leader_of(group_id)
    or profile_id = (select public.auth_profile_id())
  );

drop policy if exists group_memberships_read on public.group_memberships;
create policy group_memberships_read on public.group_memberships
  for select to authenticated
  using (
    (select public.auth_is_admin())
    or public.auth_is_leader_of(group_id)
  );

drop policy if exists group_status_history_read on public.group_status_history;
create policy group_status_history_read on public.group_status_history
  for select to authenticated
  using (
    (select public.auth_is_admin())
    or public.auth_is_leader_of(group_id)
  );

drop policy if exists groups_read on public.groups;
create policy groups_read on public.groups
  for select to authenticated
  using (
    (select public.auth_is_admin())
    or public.auth_is_leader_of(id)
  );

drop policy if exists guests_read on public.guests;
create policy guests_read on public.guests
  for select to authenticated
  using (
    (select public.auth_is_admin())
    or (
      (first_attended_group_id is not null and public.auth_is_leader_of(first_attended_group_id))
      or (assigned_group_id is not null and public.auth_is_leader_of(assigned_group_id))
    )
  );

drop policy if exists members_read on public.members;
create policy members_read on public.members
  for select to authenticated
  using (
    (select public.auth_is_admin())
    or exists (
      select 1
        from public.group_memberships gm
       where gm.member_id = members.id
         and gm.status = 'active'::public.membership_status
         and public.auth_is_leader_of(gm.group_id)
    )
  );

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select to authenticated
  using (
    (select public.auth_is_admin())
    or auth_user_id = (select auth.uid())
    or id in (select public.over_shepherd_covered_profile_ids())
  );

drop function if exists public.auth_is_admin_or_staff() restrict;
drop function if exists public.auth_is_staff_viewer() restrict;

commit;
