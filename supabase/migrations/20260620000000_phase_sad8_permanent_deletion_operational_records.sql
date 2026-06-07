-- ADR 0014 (#316 follow-up): Permanent deletion — operational record types.
--
-- The Super Admin needs to clear out test records through the UI without
-- out-of-band tools. The permanent-deletion engine (#312–#315) is already
-- generic; the only thing scoping what a Super Admin can target is the curated
-- allowlist resolver super_admin_deletable_table(), kept in lockstep with the
-- TS registry PERMANENT_DELETION_ENTITIES. This slice registers the remaining
-- operational entities so they become selectable delete targets that reuse the
-- same block/report (super_admin_collect_dependents), snapshot-then-delete +
-- tombstone spine, audit row, and re-import recovery. No engine change:
--
--   * member                      -> members
--   * group_membership            -> group_memberships
--   * group_leader                -> group_leaders
--   * attendance_session          -> attendance_sessions
--   * attendance_record           -> attendance_records
--   * guest                       -> guests
--   * follow_up                   -> follow_ups
--   * group_health_update         -> group_health_updates
--   * group_health_assessment     -> group_health_assessments
--   * invitation                  -> invitations
--   * shepherd_coverage_assignment-> shepherd_coverage_assignments
--   * church_attendance_snapshot  -> church_attendance_snapshots
--
-- Registering the junction/child tables (group_memberships, group_leaders,
-- attendance_records, ...) is deliberate: with the "refuse + list" dependency
-- rule (no cascade), a Super Admin clears blockers bottom-up, so every blocker a
-- preflight names must itself be a deletable target. group_metric_settings is
-- intentionally NOT registered — its primary key is group_id (no `id` column),
-- so the engine's `where t.id = $1` delete/snapshot cannot target it.
--
-- Off-limits, by omission (unchanged from #316 / #388): Private Care Notes,
-- author-private Care Notes / Prayer Requests (opaque confidential block),
-- audit_events / audit_events_archive, and tombstones are never registered — the
-- engine raises forbidden_target for any unregistered type. group_categories is
-- also deliberately left out: the category catalog is archive-only by design (a
-- category leaves via soft delete so its cells + audit are never orphaned), and
-- its cascade child category_type_targets is not itself a deletable target.

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
  'ADR 0014 (#312–#316 + operational records): curated permanent-deletion allowlist. Maps an entity_type token to its table, or null if not a registered target. Private/author-private care notes, audit rows, tombstones, and id-less tables (group_metric_settings) are deliberately absent — they are never deletable.';
