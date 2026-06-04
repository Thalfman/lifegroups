-- PRD-SAC6 follow-up: one-click launch prep — atomic mute + history wipe +
-- category-snapshot purge.
--
-- The "Prepare for launch — clean slate" card presents a single guarded step,
-- so its mutations must be ALL-OR-NOTHING. Composing the mute write and the
-- history wipe as two separate RPC calls from the server action left two gaps a
-- reviewer correctly flagged:
--   1. atomicity — if the wipe failed after the mute write committed, Home
--      warnings were hidden while history was NOT cleared.
--   2. lingering recovery — the full wipe overwrites clean_slate_snapshots but
--      leaves un-restored history_reset_snapshots (from prior Reset-by-category
--      runs) intact, so the Reset-by-category Revert could re-inject pre-launch
--      rows into the otherwise-clean launch database.
--
-- This RPC folds all three operations into one transaction:
--   a. deep-merge the three launch-optics mute flags into platform_config (the
--      same feature_flags sub-key the per-flag toggle writes, so unrelated flags
--      are never clobbered).
--   b. run the existing Clean Slate history wipe (a recoverable snapshot is
--      captured first). An already-empty history is not an error here — launch
--      prep is idempotent — so nothing_to_wipe is swallowed and the snapshot id
--      is null.
--   c. purge ALL history_reset_snapshots so no category-scoped Revert can bring
--      pre-launch rows back after launch. The wipe's own snapshot remains the
--      single recovery point for everything cleared in this step.
-- A wipe failure (lock timeout, etc.) rolls the WHOLE function back, so the mute
-- never sticks without the wipe. People, groups, leaders, memberships, settings,
-- care profiles & notes, and the audit log are kept (the wipe is history-only).

set check_function_bodies = off;

create or replace function public.super_admin_launch_prep()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor       uuid;
  v_cfg_id      uuid;
  v_cfg         jsonb;
  v_snapshot_id uuid;
  v_purged      bigint;
begin
  if public.auth_role() <> 'super_admin' then
    raise exception 'insufficient_privilege';
  end if;

  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  -- (a) Deep-merge the three launch-optics mute flags into platform_config.
  -- Mirrors super_admin_set_platform_config's feature_flags merge: read the
  -- single config row FOR UPDATE, overlay the three flag keys onto the existing
  -- feature_flags object (|| merges keys; unrelated flags survive), write back.
  select id, setting_value into v_cfg_id, v_cfg
    from public.platform_config
   where setting_key = 'platform_config'
   for update;
  if v_cfg_id is null then
    raise exception 'missing_settings';
  end if;

  update public.platform_config
     set setting_value = v_cfg || jsonb_build_object(
       'feature_flags',
       coalesce(v_cfg -> 'feature_flags', '{}'::jsonb) || jsonb_build_object(
         'mute_care_attention', jsonb_build_object('enabled', true),
         'mute_health_checks',  jsonb_build_object('enabled', true),
         'mute_follow_ups',     jsonb_build_object('enabled', true)
       )
     )
   where id = v_cfg_id;

  -- (b) Clear all accumulated history (recoverable snapshot captured first).
  -- Reuse the audited Clean Slate wipe so the delete order + snapshot logic stay
  -- in one place. nothing_to_wipe (already-clean history) is not a failure for
  -- launch prep; the sub-transaction this exception block opens rolls back only
  -- the (no-op) wipe attempt, never the mute write above.
  begin
    v_snapshot_id := public.super_admin_clean_slate_wipe();
  exception
    when others then
      if sqlerrm = 'nothing_to_wipe' then
        v_snapshot_id := null;
      else
        raise;
      end if;
  end;

  -- (c) Retire every per-category history-reset snapshot so its Revert can't
  -- re-inject pre-launch rows into the clean launch database. The wipe's own
  -- snapshot (clean_slate_snapshots) is left as the single recovery point.
  delete from public.history_reset_snapshots;
  get diagnostics v_purged = row_count;

  -- One paired audit row summarising the whole guarded step. The reused wipe
  -- writes its own super_admin.clean_slate_wipe row when it actually cleared
  -- rows; this row records the launch-prep envelope regardless.
  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values
    (v_actor, 'super_admin.launch_prep', 'platform_config', v_cfg_id,
     jsonb_build_object(
       'muted_flags', jsonb_build_array(
         'mute_care_attention', 'mute_health_checks', 'mute_follow_ups'),
       'history_snapshot_id', v_snapshot_id,
       'purged_category_snapshots', v_purged
     ));

  return v_snapshot_id;
end;
$$;

revoke all     on function public.super_admin_launch_prep() from public;
revoke all     on function public.super_admin_launch_prep() from anon;
revoke all     on function public.super_admin_launch_prep() from authenticated;
grant  execute on function public.super_admin_launch_prep() to authenticated;

comment on function public.super_admin_launch_prep() is
  'PRD-SAC6 follow-up: super-admin one-click launch prep. In one transaction: deep-merges the three launch-optics mute flags into platform_config, runs the Clean Slate history wipe (recoverable snapshot first; nothing_to_wipe swallowed as idempotent), purges all history_reset_snapshots so no per-category Revert can re-inject pre-launch rows, and writes a paired super_admin.launch_prep audit row. Returns the wipe snapshot id, or null when history was already clear.';
