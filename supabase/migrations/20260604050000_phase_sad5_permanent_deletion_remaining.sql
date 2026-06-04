-- ADR 0014 (#316): Permanent deletion — remaining curated entities.
--
-- Completes the curated permanent-deletion set by registering the remaining
-- operational entities against the proven engine (#312–#315). Each registration
-- is mechanical: adding the entity_type -> table branch makes it a selectable
-- target that reuses the same block/report (super_admin_collect_dependents),
-- snapshot-then-delete + tombstone spine, and re-import recovery:
--
--   * calendar_event           -> group_calendar_events
--   * multiplication_candidate -> multiplication_candidates
--   * apprentice               -> leader_pipeline (the leader pipeline)
--   * over_shepherd            -> over_shepherds
--   * clean_slate_snapshot     -> clean_slate_snapshots
--
-- Off-limits, by omission from this allowlist (confirmed by tests): Private Care
-- Notes (shepherd_care_private_notes), audit-log rows (audit_events /
-- audit_events_archive), and Tombstone rows (tombstones) are NOT valid delete
-- targets — the engine raises forbidden_target for any unregistered type. This
-- closes the "anything except the documented exceptions" boundary from ADR 0014.

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
    -- #316: the remaining curated operational entities.
    when 'calendar_event' then 'group_calendar_events'
    when 'multiplication_candidate' then 'multiplication_candidates'
    when 'apprentice' then 'leader_pipeline'
    when 'over_shepherd' then 'over_shepherds'
    when 'clean_slate_snapshot' then 'clean_slate_snapshots'
    -- Off-limits (never registered): shepherd_care_private_notes, audit_events,
    -- audit_events_archive, tombstones.
    else null
  end;
$$;

revoke all on function public.super_admin_deletable_table(text) from public;
revoke all on function public.super_admin_deletable_table(text) from anon;
revoke all on function public.super_admin_deletable_table(text) from authenticated;

comment on function public.super_admin_deletable_table(text) is
  'ADR 0014 (#312–#316): curated permanent-deletion allowlist (complete set). Maps an entity_type token to its table, or null if not a registered target. Private care notes, audit rows, and tombstones are deliberately absent — they are never deletable.';
