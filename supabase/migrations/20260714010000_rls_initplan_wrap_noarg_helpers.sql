-- #860: wrap bare no-argument SECURITY DEFINER helper calls in SELECT-policy
-- USING clauses as `(select public.helper())`.
--
-- The RLS perf consolidation (20260602020000) wrapped `auth.uid()` and the
-- set-returning helpers so Postgres hoists them into a once-per-query
-- InitPlan, but left the no-arg boolean/scalar helpers (`auth_is_admin()`,
-- `auth_is_admin_or_staff()`, `auth_profile_id()`, `auth_role()`) bare in the
-- same clauses — and the single-policy admin/super-admin tables were never
-- touched. Each bare call is a STABLE SECURITY DEFINER `profiles` lookup
-- re-executed PER CANDIDATE ROW on hot directory/roster/care reads. This is
-- the standard Supabase `auth_rls_initplan` finding, applied to every policy
-- in force.
--
-- ZERO visibility change: every predicate below is copied verbatim from its
-- in-force definition with ONLY the `(select …)` wrapping added (generated
-- from the same drop-then-create replay the migration-safety tests use, so
-- nothing else could drift). Row-argument helpers (`auth_is_leader_of(id)`,
-- …) correctly cannot be hoisted and stay bare. Nothing is broadened or
-- narrowed; the oversight ladder (ADR 0002) and the two privacy exceptions
-- are untouched.
--
-- Companion fitness scan: tests/fitness/rls-initplan-wrapped-helpers.test.ts
-- replays the in-force SELECT policies and fails on any bare no-arg helper
-- call, so the pattern can't regress.
--
-- Re-runnable: Postgres has no IF-NOT-EXISTS form for policy creation, so
-- each policy is dropped-if-exists immediately before it is (re)created.

drop policy if exists account_deletion_requests_super_admin_read on public.account_deletion_requests;
create policy account_deletion_requests_super_admin_read on public.account_deletion_requests
  for select to authenticated
  using ((select public.auth_role()) = 'super_admin');

drop policy if exists activity_reset_baselines_admin_read on public.activity_reset_baselines;
create policy activity_reset_baselines_admin_read on public.activity_reset_baselines
  for select to authenticated
  using ((select public.auth_is_admin()));

drop policy if exists app_settings_read on public.app_settings;
create policy app_settings_read on public.app_settings
  for select to authenticated
  using (
    (select public.auth_is_admin())
    or setting_key = 'metric_defaults'
  );

drop policy if exists attendance_records_read on public.attendance_records;
create policy attendance_records_read on public.attendance_records
  for select to authenticated
  using (
    (select public.auth_is_admin_or_staff())
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
    (select public.auth_is_admin_or_staff())
    or public.auth_is_leader_of(group_id)
  );

drop policy if exists attention_reset_baselines_admin_read on public.attention_reset_baselines;
create policy attention_reset_baselines_admin_read on public.attention_reset_baselines
  for select to authenticated
  using ((select public.auth_is_admin()));

drop policy if exists attention_reset_snapshots_super_admin_read on public.attention_reset_snapshots;
create policy attention_reset_snapshots_super_admin_read on public.attention_reset_snapshots
  for select to authenticated
  using ((select public.auth_role()) = 'super_admin');

drop policy if exists audit_events_super_admin_read on public.audit_events;
create policy audit_events_super_admin_read on public.audit_events
  for select to authenticated
  using ((select public.auth_role()) = 'super_admin');

drop policy if exists audit_events_archive_super_admin_read on public.audit_events_archive;
create policy audit_events_archive_super_admin_read on public.audit_events_archive
  for select to authenticated
  using ((select public.auth_role()) = 'super_admin');

drop policy if exists care_notes_author_or_granted_select on public.care_notes;
create policy care_notes_author_or_granted_select on public.care_notes
  for select to authenticated
  using (
    author_profile_id = (select public.auth_profile_id())
    or (
      (select public.auth_is_admin())
      and (
        (
          care_notes.subject_profile_id is not null
          and exists (
            select 1
              from public.note_transparency_grants g
             where g.subject_profile_id = care_notes.subject_profile_id
               and g.granted
          )
        )
        or (
          care_notes.subject_group_id is not null
          and exists (
            select 1
              from public.note_transparency_grants g
             where g.subject_profile_id = care_notes.author_profile_id
               and g.granted
          )
        )
      )
    )
  );

drop policy if exists church_attendance_snapshots_admin_read on public.church_attendance_snapshots;
create policy church_attendance_snapshots_admin_read on public.church_attendance_snapshots
  for select to authenticated
  using ((select public.auth_is_admin()));

drop policy if exists clean_slate_snapshots_super_admin_read on public.clean_slate_snapshots;
create policy clean_slate_snapshots_super_admin_read on public.clean_slate_snapshots
  for select to authenticated
  using ((select public.auth_role()) = 'super_admin');

drop policy if exists follow_ups_read on public.follow_ups;
create policy follow_ups_read on public.follow_ups
  for select to authenticated
  using (
    (select public.auth_is_admin_or_staff())
    or (
      (related_group_id is not null and public.auth_is_leader_of(related_group_id))
      or assigned_to = (select public.auth_profile_id())
    )
  );

drop policy if exists group_calendar_events_read on public.group_calendar_events;
create policy group_calendar_events_read on public.group_calendar_events
  for select to authenticated
  using (
    (select public.auth_is_admin_or_staff())
    or public.auth_is_leader_of(group_id)
  );

drop policy if exists group_health_assessments_admin_read on public.group_health_assessments;
create policy group_health_assessments_admin_read on public.group_health_assessments
  for select to authenticated
  using ((select public.auth_is_admin()));

drop policy if exists group_health_updates_read on public.group_health_updates;
create policy group_health_updates_read on public.group_health_updates
  for select to authenticated
  using (
    (select public.auth_is_admin_or_staff())
    or public.auth_is_leader_of(group_id)
  );

drop policy if exists group_leaders_read on public.group_leaders;
create policy group_leaders_read on public.group_leaders
  for select to authenticated
  using (
    (select public.auth_is_admin_or_staff())
    or public.auth_is_leader_of(group_id)
    or profile_id = (select public.auth_profile_id())
  );

drop policy if exists group_memberships_read on public.group_memberships;
create policy group_memberships_read on public.group_memberships
  for select to authenticated
  using (
    (select public.auth_is_admin_or_staff())
    or public.auth_is_leader_of(group_id)
  );

drop policy if exists group_metric_settings_admin_read on public.group_metric_settings;
create policy group_metric_settings_admin_read on public.group_metric_settings
  for select to authenticated
  using ((select public.auth_is_admin()));

drop policy if exists group_rubric_grades_admin_read on public.group_rubric_grades;
create policy group_rubric_grades_admin_read on public.group_rubric_grades
  for select to authenticated
  using ((select public.auth_is_admin()));

drop policy if exists group_status_history_read on public.group_status_history;
create policy group_status_history_read on public.group_status_history
  for select to authenticated
  using (
    (select public.auth_is_admin_or_staff())
    or public.auth_is_leader_of(group_id)
  );

drop policy if exists group_type_configs_admin_read on public.group_type_configs;
create policy group_type_configs_admin_read on public.group_type_configs
  for select to authenticated
  using ((select public.auth_is_admin()));

drop policy if exists groups_read on public.groups;
create policy groups_read on public.groups
  for select to authenticated
  using (
    (select public.auth_is_admin_or_staff())
    or public.auth_is_leader_of(id)
  );

drop policy if exists guests_read on public.guests;
create policy guests_read on public.guests
  for select to authenticated
  using (
    (select public.auth_is_admin_or_staff())
    or (
      (first_attended_group_id is not null and public.auth_is_leader_of(first_attended_group_id))
      or (assigned_group_id is not null and public.auth_is_leader_of(assigned_group_id))
    )
  );

drop policy if exists health_rubrics_admin_read on public.health_rubrics;
create policy health_rubrics_admin_read on public.health_rubrics
  for select to authenticated
  using ((select public.auth_is_admin()));

drop policy if exists history_reset_snapshots_super_admin_read on public.history_reset_snapshots;
create policy history_reset_snapshots_super_admin_read on public.history_reset_snapshots
  for select to authenticated
  using ((select public.auth_role()) = 'super_admin');

drop policy if exists invitations_super_admin_select on public.invitations;
create policy invitations_super_admin_select on public.invitations
  for select to authenticated
  using ((select public.auth_role()) = 'super_admin');

drop policy if exists launch_planning_scenarios_admin_select on public.launch_planning_scenarios;
create policy launch_planning_scenarios_admin_select on public.launch_planning_scenarios
  for select to authenticated
  using ((select public.auth_is_admin()));

drop policy if exists leader_pipeline_admin_read on public.leader_pipeline;
create policy leader_pipeline_admin_read on public.leader_pipeline
  for select to authenticated
  using ((select public.auth_is_admin()));

drop policy if exists leader_rubric_grades_admin_read on public.leader_rubric_grades;
create policy leader_rubric_grades_admin_read on public.leader_rubric_grades
  for select to authenticated
  using ((select public.auth_is_admin()));

drop policy if exists member_care_interactions_admin_select on public.member_care_interactions;
create policy member_care_interactions_admin_select on public.member_care_interactions
  for select to authenticated
  using ((select public.auth_is_admin()));

drop policy if exists member_care_profiles_admin_select on public.member_care_profiles;
create policy member_care_profiles_admin_select on public.member_care_profiles
  for select to authenticated
  using ((select public.auth_is_admin()));

drop policy if exists members_read on public.members;
create policy members_read on public.members
  for select to authenticated
  using (
    (select public.auth_is_admin_or_staff())
    or exists (
      select 1
        from public.group_memberships gm
       where gm.member_id = members.id
         and gm.status = 'active'::public.membership_status
         and public.auth_is_leader_of(gm.group_id)
    )
  );

drop policy if exists multiplication_candidates_admin_read on public.multiplication_candidates;
create policy multiplication_candidates_admin_read on public.multiplication_candidates
  for select to authenticated
  using ((select public.auth_is_admin()));

drop policy if exists multiplication_readiness_rule_admin_read on public.multiplication_readiness_rule;
create policy multiplication_readiness_rule_admin_read on public.multiplication_readiness_rule
  for select to authenticated
  using ((select public.auth_is_admin()));

drop policy if exists note_transparency_grants_admin_select on public.note_transparency_grants;
create policy note_transparency_grants_admin_select on public.note_transparency_grants
  for select to authenticated
  using ((select public.auth_is_admin()));

drop policy if exists over_shepherds_admin_select on public.over_shepherds;
create policy over_shepherds_admin_select on public.over_shepherds
  for select to authenticated
  using ((select public.auth_is_admin()));

drop policy if exists platform_config_super_admin_read on public.platform_config;
create policy platform_config_super_admin_read on public.platform_config
  for select to authenticated
  using ((select public.auth_role()) = 'super_admin');

drop policy if exists prayer_requests_author_or_granted_select on public.prayer_requests;
create policy prayer_requests_author_or_granted_select on public.prayer_requests
  for select to authenticated
  using (
    author_profile_id = (select public.auth_profile_id())
    or (
      (select public.auth_is_admin())
      and (
        (
          prayer_requests.subject_profile_id is not null
          and exists (
            select 1
              from public.note_transparency_grants g
             where g.subject_profile_id = prayer_requests.subject_profile_id
               and g.granted
          )
        )
        or (
          prayer_requests.subject_group_id is not null
          and exists (
            select 1
              from public.note_transparency_grants g
             where g.subject_profile_id = prayer_requests.author_profile_id
               and g.granted
          )
        )
      )
    )
  );

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select to authenticated
  using (
    (select public.auth_is_admin_or_staff())
    or auth_user_id = (select auth.uid())
    or id in (select public.over_shepherd_covered_profile_ids())
  );

drop policy if exists prospects_admin_read on public.prospects;
create policy prospects_admin_read on public.prospects
  for select to authenticated
  using ((select public.auth_is_admin()));

drop policy if exists shepherd_care_admin_notes_admin_select on public.shepherd_care_admin_notes;
create policy shepherd_care_admin_notes_admin_select on public.shepherd_care_admin_notes
  for select to authenticated
  using ((select public.auth_is_admin()));

drop policy if exists shepherd_care_follow_ups_admin_select on public.shepherd_care_follow_ups;
create policy shepherd_care_follow_ups_admin_select on public.shepherd_care_follow_ups
  for select to authenticated
  using ((select public.auth_is_admin()));

drop policy if exists shepherd_care_interactions_select on public.shepherd_care_interactions;
create policy shepherd_care_interactions_select on public.shepherd_care_interactions
  for select to authenticated
  using (
    (select public.auth_is_admin())
    or exists (
      select 1
        from public.shepherd_care_profiles scp
       where scp.id = shepherd_care_interactions.care_profile_id
         and scp.shepherd_profile_id in (
           select public.over_shepherd_covered_profile_ids()
         )
    )
  );

-- DELIBERATELY NOT wrapped: the two SC.4 creator-scoped policies
-- (shepherd_care_private_notes_creator_select,
-- shepherd_care_note_key_slots_creator_select). The adversarial boundary
-- proof (lib/admin/__tests__/sc4-boundary-proof.test.ts) pins each table to
-- EXACTLY ONE create-policy statement across all migrations with a
-- byte-exact USING clause — recreating them here would weaken that proof for
-- a negligible win (creator-only reads over tiny tables). They are
-- allowlisted, with this rationale, in the companion fitness scan.

drop policy if exists shepherd_care_profiles_select on public.shepherd_care_profiles;
create policy shepherd_care_profiles_select on public.shepherd_care_profiles
  for select to authenticated
  using (
    (select public.auth_is_admin())
    or shepherd_profile_id in (select public.over_shepherd_covered_profile_ids())
  );

drop policy if exists shepherd_coverage_assignments_select on public.shepherd_coverage_assignments;
create policy shepherd_coverage_assignments_select on public.shepherd_coverage_assignments
  for select to authenticated
  using (
    (select public.auth_is_admin())
    or (
      over_shepherd_id = (select public.auth_over_shepherd_id())
      and active
    )
  );

drop policy if exists tombstones_super_admin_read on public.tombstones;
create policy tombstones_super_admin_read on public.tombstones
  for select to authenticated
  using ((select public.auth_role()) = 'super_admin');

drop policy if exists usage_events_super_admin_read on public.usage_events;
create policy usage_events_super_admin_read on public.usage_events
  for select to authenticated
  using ((select public.auth_role()) = 'super_admin');
