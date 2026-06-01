-- L4 (#223): one-time backfill so collapsing the church-attendance surface to
-- the single `current_church_attendance` assumption does NOT silently change
-- any church's participation percentage.
--
-- Before this change the "% of the church in a group" headline divided current
-- participants by the LATEST church_attendance_snapshots row's attendance_count,
-- while `current_church_attendance` (seeded at 100) was used only by the
-- forecast. Repointing the headline at `current_church_attendance` would reset
-- the denominator for any church that had recorded snapshots.
--
-- The mandated path (owner-confirmed 2026-06-01):
--   1. Key off snapshot PRESENCE, not "unset". The assumptions row is seeded
--      with current_church_attendance: 100, so an unset value is
--      indistinguishable from a real 100. Gating on a missing JSON key would be
--      a no-op for every seeded church and the bug would persist. Instead, when
--      at least one snapshot exists, set current_church_attendance to the latest
--      snapshot's attendance_count — that count IS today's headline denominator,
--      so the displayed percentage is preserved exactly.
--   2. Audit the write. admin_update_launch_planning_assumptions normally pairs
--      every write with an audit_events row in the same transaction. A migration
--      has no admin auth context, so it cannot call that SECURITY DEFINER RPC;
--      instead it performs the equivalent UPDATE + audit_events insert in this
--      same (transactional) migration. No raw, unaudited UPDATE.
--
-- The church_attendance_snapshots table and admin_record_church_attendance_snapshot
-- RPC are intentionally retained (history preserved); they simply stop being read
-- by the forecast/headline. This migration drops nothing.

do $$
declare
  v_latest_count integer;
  v_row_id       uuid;
  v_before       jsonb;
  v_after        jsonb;
  v_before_red   jsonb;
  v_after_red    jsonb;
begin
  -- Latest church attendance on record (most recent snapshot date wins; ties
  -- broken by created_at). This is exactly today's headline denominator.
  select attendance_count
    into v_latest_count
    from public.church_attendance_snapshots
   order by snapshot_date desc, created_at desc
   limit 1;

  -- No snapshots -> nothing to preserve. Such a church shows no percentage
  -- today, so its current_church_attendance assumption is left as-is.
  if v_latest_count is null then
    return;
  end if;

  select id, setting_value
    into v_row_id, v_before
    from public.app_settings
   where setting_key = 'launch_planning_assumptions';

  -- The seed migration creates this row; guard anyway so the backfill is safe
  -- if it has not run for some reason.
  if v_row_id is null then
    return;
  end if;

  -- Idempotent: if the assumption already equals the latest snapshot count,
  -- skip the write so a re-run produces no spurious audit row.
  if (v_before ->> 'current_church_attendance')::int
       is not distinct from v_latest_count then
    return;
  end if;

  update public.app_settings
     set setting_value =
       setting_value
       || jsonb_build_object('current_church_attendance', v_latest_count)
   where id = v_row_id
   returning setting_value into v_after;

  -- Mirror admin_update_launch_planning_assumptions' audit contract: the notes
  -- body is never written to audit metadata; only whether one was present.
  v_before_red := (v_before - 'notes') || jsonb_build_object(
    'has_notes',
    coalesce(
      (jsonb_typeof(v_before -> 'notes') = 'string'
         and char_length(coalesce(v_before ->> 'notes', '')) > 0),
      false
    )
  );
  v_after_red := (v_after - 'notes') || jsonb_build_object(
    'has_notes',
    coalesce(
      (jsonb_typeof(v_after -> 'notes') = 'string'
         and char_length(coalesce(v_after ->> 'notes', '')) > 0),
      false
    )
  );

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    null, -- system backfill, no human actor (actor_profile_id is nullable)
    'admin.update_launch_planning_assumptions',
    'app_settings',
    v_row_id,
    jsonb_build_object(
      'before', v_before_red,
      'after',  v_after_red,
      'submitted_keys', jsonb_build_array('current_church_attendance'),
      'source', 'migration:20260601000000_l4_backfill_church_attendance_assumption'
    )
  );
end $$;
