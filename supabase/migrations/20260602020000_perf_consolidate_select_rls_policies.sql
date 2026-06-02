-- Performance: collapse the duplicate permissive SELECT policies the advisor
-- flagged (multiple_permissive_policies -- the one outstanding WARN).
--
-- Postgres evaluates EVERY permissive policy for a (role, command) pair against
-- EVERY candidate row on EVERY read. 15 tables carried 2-3 permissive SELECT
-- policies for `authenticated`, so each read paid an O(policies x rows) tax that
-- grows with the directory and rosters. profiles (read on every authenticated
-- request) and the group-scoped tables are the hot paths.
--
-- Fix: per table, replace the per-tier SELECT policies with ONE policy whose
-- USING is the tiers OR'd together. This is semantically identical -- multiple
-- permissive policies already combine with OR (a row is visible if ANY policy
-- passes) -- but it is evaluated as a single predicate per row instead of N.
-- Nothing is broadened or narrowed.
--
-- The tier expressions are copied verbatim from the live policies so the
-- InitPlan optimizations from the prior perf migrations are preserved exactly:
--   * (select auth.uid())                          -- 20260601010000
--   * (select public.over_shepherd_covered_profile_ids())
--   * (select public.auth_over_shepherd_id())      -- 20260602010000
-- These scalar/set subqueries don't reference the outer row, so the planner
-- resolves them once per query rather than once per row.
--
-- Only permissive SELECT policies for `authenticated` are touched. INSERT /
-- UPDATE / DELETE policies, and any non-`authenticated` policies, are left
-- untouched. (docs/adr/0002-oversight-ladder-and-leader-gating.md: the oversight
-- ladder's access *tiers* are unchanged -- they are merged into one predicate,
-- not removed.)
--
-- Also adds the two real unindexed-FK join columns the advisor flagged that
-- post-date the last FK-index migration (leader_pipeline.member_id,
-- multiplication_candidates.leader_pipeline_id).
--
-- Re-runnable: every drop uses `if exists`, the indexes use `if not exists`,
-- and -- because Postgres has no IF-NOT-EXISTS form for policy creation -- each
-- new consolidated policy is itself dropped-if-exists immediately before it is
-- (re)created, so a re-apply replaces rather than erroring on 42710.

-- ===========================================================================
-- Group / roster tables: admin-or-staff OR leader-scope [OR self/peer]
-- ===========================================================================

-- groups: admin/staff read all; a leader reads groups they lead.
drop policy if exists groups_admin_staff_read on public.groups;
drop policy if exists groups_leader_read on public.groups;
drop policy if exists groups_read on public.groups;
create policy groups_read on public.groups
  for select to authenticated
  using (
    public.auth_is_admin_or_staff()
    or public.auth_is_leader_of(id)
  );

-- group_memberships: admin/staff read all; a leader reads their groups' rows.
drop policy if exists group_memberships_admin_staff_read on public.group_memberships;
drop policy if exists group_memberships_leader_read on public.group_memberships;
drop policy if exists group_memberships_read on public.group_memberships;
create policy group_memberships_read on public.group_memberships
  for select to authenticated
  using (
    public.auth_is_admin_or_staff()
    or public.auth_is_leader_of(group_id)
  );

-- attendance_sessions: admin/staff read all; a leader reads their groups' rows.
drop policy if exists attendance_sessions_admin_staff_read on public.attendance_sessions;
drop policy if exists attendance_sessions_leader_read on public.attendance_sessions;
drop policy if exists attendance_sessions_read on public.attendance_sessions;
create policy attendance_sessions_read on public.attendance_sessions
  for select to authenticated
  using (
    public.auth_is_admin_or_staff()
    or public.auth_is_leader_of(group_id)
  );

-- attendance_records: admin/staff read all; a leader reads rows whose parent
-- session belongs to a group they lead.
drop policy if exists attendance_records_admin_staff_read on public.attendance_records;
drop policy if exists attendance_records_leader_read on public.attendance_records;
drop policy if exists attendance_records_read on public.attendance_records;
create policy attendance_records_read on public.attendance_records
  for select to authenticated
  using (
    public.auth_is_admin_or_staff()
    or exists (
      select 1
        from public.attendance_sessions s
       where s.id = attendance_records.session_id
         and public.auth_is_leader_of(s.group_id)
    )
  );

-- group_health_updates: admin/staff read all; a leader reads their groups' rows.
drop policy if exists group_health_updates_admin_staff_read on public.group_health_updates;
drop policy if exists group_health_updates_leader_read on public.group_health_updates;
drop policy if exists group_health_updates_read on public.group_health_updates;
create policy group_health_updates_read on public.group_health_updates
  for select to authenticated
  using (
    public.auth_is_admin_or_staff()
    or public.auth_is_leader_of(group_id)
  );

-- group_calendar_events: admin/staff read all; a leader reads their groups' rows.
drop policy if exists group_calendar_events_admin_staff_read on public.group_calendar_events;
drop policy if exists group_calendar_events_leader_read on public.group_calendar_events;
drop policy if exists group_calendar_events_read on public.group_calendar_events;
create policy group_calendar_events_read on public.group_calendar_events
  for select to authenticated
  using (
    public.auth_is_admin_or_staff()
    or public.auth_is_leader_of(group_id)
  );

-- group_status_history: admin/staff read all; a leader reads their groups' rows.
drop policy if exists group_status_history_admin_staff_read on public.group_status_history;
drop policy if exists group_status_history_leader_read on public.group_status_history;
drop policy if exists group_status_history_read on public.group_status_history;
create policy group_status_history_read on public.group_status_history
  for select to authenticated
  using (
    public.auth_is_admin_or_staff()
    or public.auth_is_leader_of(group_id)
  );

-- group_leaders: admin/staff read all; a leader reads co-leaders of their own
-- groups (peer) and always their own leadership rows (self).
drop policy if exists group_leaders_admin_staff_read on public.group_leaders;
drop policy if exists group_leaders_peer_read on public.group_leaders;
drop policy if exists group_leaders_self_read on public.group_leaders;
drop policy if exists group_leaders_read on public.group_leaders;
create policy group_leaders_read on public.group_leaders
  for select to authenticated
  using (
    public.auth_is_admin_or_staff()
    or public.auth_is_leader_of(group_id)
    or profile_id = public.auth_profile_id()
  );

-- guests: admin/staff read all; a leader reads guests tied to a group they lead
-- (first-attended or assigned).
drop policy if exists guests_admin_staff_read on public.guests;
drop policy if exists guests_leader_read on public.guests;
drop policy if exists guests_read on public.guests;
create policy guests_read on public.guests
  for select to authenticated
  using (
    public.auth_is_admin_or_staff()
    or (
      (first_attended_group_id is not null and public.auth_is_leader_of(first_attended_group_id))
      or (assigned_group_id is not null and public.auth_is_leader_of(assigned_group_id))
    )
  );

-- members: admin/staff read all; a leader reads members with an active
-- membership in a group they lead.
drop policy if exists members_admin_staff_read on public.members;
drop policy if exists members_leader_read on public.members;
drop policy if exists members_read on public.members;
create policy members_read on public.members
  for select to authenticated
  using (
    public.auth_is_admin_or_staff()
    or exists (
      select 1
        from public.group_memberships gm
       where gm.member_id = members.id
         and gm.status = 'active'::public.membership_status
         and public.auth_is_leader_of(gm.group_id)
    )
  );

-- follow_ups: admin/staff read all; a leader reads follow-ups for a group they
-- lead or any assigned to them.
drop policy if exists follow_ups_admin_staff_read on public.follow_ups;
drop policy if exists follow_ups_leader_read on public.follow_ups;
drop policy if exists follow_ups_read on public.follow_ups;
create policy follow_ups_read on public.follow_ups
  for select to authenticated
  using (
    public.auth_is_admin_or_staff()
    or (
      (related_group_id is not null and public.auth_is_leader_of(related_group_id))
      or assigned_to = public.auth_profile_id()
    )
  );

-- profiles: admin/staff read all; a user always reads their own row; an
-- Over-Shepherd reads the profiles of the Shepherds they actively cover.
drop policy if exists profiles_admin_staff_read on public.profiles;
drop policy if exists profiles_self_read on public.profiles;
drop policy if exists profiles_over_shepherd_read on public.profiles;
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select to authenticated
  using (
    public.auth_is_admin_or_staff()
    or auth_user_id = (select auth.uid())
    or id in (select public.over_shepherd_covered_profile_ids())
  );

-- ===========================================================================
-- Shepherd-care tables: admin OR Over-Shepherd coverage
-- ===========================================================================

-- shepherd_care_profiles: admin reads all; an Over-Shepherd reads care profiles
-- of the Shepherds they actively cover.
drop policy if exists shepherd_care_profiles_admin_select on public.shepherd_care_profiles;
drop policy if exists shepherd_care_profiles_over_shepherd_select on public.shepherd_care_profiles;
drop policy if exists shepherd_care_profiles_select on public.shepherd_care_profiles;
create policy shepherd_care_profiles_select on public.shepherd_care_profiles
  for select to authenticated
  using (
    public.auth_is_admin()
    or shepherd_profile_id in (select public.over_shepherd_covered_profile_ids())
  );

-- shepherd_care_interactions: admin reads all; an Over-Shepherd reads
-- interactions whose parent care profile's Shepherd they actively cover. The
-- EXISTS still correlates only on the indexed care_profile_id; the coverage set
-- is resolved once by the set-returning helper.
drop policy if exists shepherd_care_interactions_admin_select on public.shepherd_care_interactions;
drop policy if exists shepherd_care_interactions_over_shepherd_select on public.shepherd_care_interactions;
drop policy if exists shepherd_care_interactions_select on public.shepherd_care_interactions;
create policy shepherd_care_interactions_select on public.shepherd_care_interactions
  for select to authenticated
  using (
    public.auth_is_admin()
    or exists (
      select 1
        from public.shepherd_care_profiles scp
       where scp.id = shepherd_care_interactions.care_profile_id
         and scp.shepherd_profile_id in (
           select public.over_shepherd_covered_profile_ids()
         )
    )
  );

-- shepherd_coverage_assignments: admin reads all; an Over-Shepherd reads only
-- their OWN active assignments.
drop policy if exists shepherd_coverage_assignments_admin_select on public.shepherd_coverage_assignments;
drop policy if exists shepherd_coverage_assignments_over_shepherd_select on public.shepherd_coverage_assignments;
drop policy if exists shepherd_coverage_assignments_select on public.shepherd_coverage_assignments;
create policy shepherd_coverage_assignments_select on public.shepherd_coverage_assignments
  for select to authenticated
  using (
    public.auth_is_admin()
    or (
      over_shepherd_id = (select public.auth_over_shepherd_id())
      and active
    )
  );

-- ===========================================================================
-- Covering indexes for the two real FK joins added after 20260601010000.
-- ===========================================================================

-- leader_pipeline.member_id: FK to members; joined when resolving the linked
-- member for a pipeline row.
create index if not exists idx_leader_pipeline_member
  on public.leader_pipeline (member_id);

-- multiplication_candidates.leader_pipeline_id: FK to leader_pipeline (CAP.2);
-- joined when surfacing the apprentice linked to a multiplication candidate.
create index if not exists idx_multiplication_candidates_leader_pipeline
  on public.multiplication_candidates (leader_pipeline_id);
