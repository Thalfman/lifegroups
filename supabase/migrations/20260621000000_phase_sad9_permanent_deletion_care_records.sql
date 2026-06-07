-- ADR 0014 (SAD9): Permanent deletion — Care operational record types.
--
-- The Super Admin can now delete records inline, super-admin-only, from the Care
-- surface itself (not just the danger zone). The permanent-deletion engine
-- (#312–#316) is already generic; the only thing scoping what is targetable is
-- the curated allowlist resolver super_admin_deletable_table(), kept in lockstep
-- with the TS registry PERMANENT_DELETION_ENTITIES. Two Care leaf tables were
-- never registered as deletable targets:
--
--   * shepherd_care_follow_up    -> shepherd_care_follow_ups
--   * shepherd_care_interaction  -> shepherd_care_interactions
--
-- Both have a uuid `id` primary key and NO inbound foreign keys, so the engine's
-- `where t.id = $1` delete never collides and a preflight reports them safe to
-- delete (no cascade/restrict blockers). Registering them makes "everything under
-- the Care tab except confidential notes & prayer requests" deletable. No engine
-- change — they reuse the same block/report (super_admin_collect_dependents),
-- snapshot-then-delete + tombstone spine, paired audit row, and re-import recovery.
--
-- Still off-limits, by omission (unchanged from #316 / #388): the SC.4 Private
-- Care Notes and the author-private Care Notes / Prayer Requests (opaque
-- confidential block), audit_events / audit_events_archive, tombstones,
-- group_metric_settings (no `id` column), and the archive-only group_categories
-- catalog — the engine raises forbidden_target for any unregistered type.

set check_function_bodies = off;

create or replace function public.super_admin_deletable_table(p_entity_type text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_entity_type
    when 'launch_scenario' then 'launch_planning_scenarios'
    when 'group' then 'groups'
    when 'profile' then 'profiles'
    when 'calendar_event' then 'group_calendar_events'
    when 'multiplication_candidate' then 'multiplication_candidates'
    when 'apprentice' then 'leader_pipeline'
    when 'over_shepherd' then 'over_shepherds'
    when 'clean_slate_snapshot' then 'clean_slate_snapshots'
    -- #316 follow-up: the remaining operational record types.
    when 'member' then 'members'
    when 'group_membership' then 'group_memberships'
    when 'group_leader' then 'group_leaders'
    when 'attendance_session' then 'attendance_sessions'
    when 'attendance_record' then 'attendance_records'
    when 'guest' then 'guests'
    when 'follow_up' then 'follow_ups'
    when 'group_health_update' then 'group_health_updates'
    when 'group_health_assessment' then 'group_health_assessments'
    when 'invitation' then 'invitations'
    when 'shepherd_coverage_assignment' then 'shepherd_coverage_assignments'
    when 'church_attendance_snapshot' then 'church_attendance_snapshots'
    -- SAD9: Care leaf records (inline super-admin Delete). uuid PK, no inbound FKs.
    when 'shepherd_care_follow_up' then 'shepherd_care_follow_ups'
    when 'shepherd_care_interaction' then 'shepherd_care_interactions'
    -- Off-limits (never registered): shepherd_care_private_notes, care_notes,
    -- prayer_requests, audit_events, audit_events_archive, tombstones,
    -- group_metric_settings (no `id` column), and the archive-only category
    -- catalog (group_categories).
    else null
  end;
$$;

revoke all on function public.super_admin_deletable_table(text) from public;
revoke all on function public.super_admin_deletable_table(text) from anon;
revoke all on function public.super_admin_deletable_table(text) from authenticated;

comment on function public.super_admin_deletable_table(text) is
  'ADR 0014 (#312–#316 + operational + care records): curated permanent-deletion allowlist. Maps an entity_type token to its table, or null if not a registered target. Private/author-private care notes, audit rows, tombstones, and id-less tables (group_metric_settings) are deliberately absent — they are never deletable.';
