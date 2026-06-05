-- Danger-Zone consolidation: one-click "reset everything to a clean launch
-- state".
--
-- The Danger Zone offers several granular resets (Clean Slate, Reset-by-category,
-- Reset Attention care/health, Launch Prep). Operators preparing for launch want
-- a single guarded step that leaves the app reading as a true fresh start —
-- without losing the granular cards for fine control. This RPC COMPOSES the
-- existing audited RPCs rather than re-implementing them, so the snapshot,
-- field-wipe, and audit logic stays in one place and can't drift:
--   1. super_admin_launch_prep()            — mute the three launch-optics flags,
--      run the Clean Slate history wipe (recoverable snapshot first;
--      nothing_to_wipe swallowed as idempotent), and purge the per-category
--      history-reset snapshots. Returns the wipe snapshot id, or null when
--      history was already clear.
--   2. super_admin_reset_care_attention('global', null)   — reset the leader-care
--      "Needs attention" card to a clean global baseline (recoverable).
--   3. super_admin_reset_health_attention('global', null) — reset the health-check
--      "Needs attention" card to a clean global baseline (recoverable).
--
-- Idempotency is the whole point: launch_prep returns null on empty history and
-- neither attention reset raises when nothing changes, so re-running on a clean
-- database succeeds as a neutral no-op rather than erroring.
--
-- Recovery is per-piece by design: each composed step writes its own recoverable
-- snapshot, so the history wipe reverts from the Clean Slate card and each
-- attention reset reverts from the Reset-attention card. There is deliberately no
-- single combined undo.
--
-- People, groups, leaders, memberships, settings, care profiles & notes, and the
-- audit log are kept (the wipe is history-only; the attention resets only set a
-- baseline / field-wipe status, never delete profiles).

set check_function_bodies = off;

create or replace function public.super_admin_reset_all()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor       uuid;
  v_snapshot_id uuid;
  v_care        uuid;
  v_health      uuid;
begin
  if public.auth_role() <> 'super_admin' then
    raise exception 'insufficient_privilege';
  end if;

  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  -- Take BOTH shared advisory locks up front, 'clean_slate' BEFORE
  -- 'attention_reset', held to transaction end. The composed RPCs re-grab these
  -- same keys (re-entrant within this session), so fixing the order here means a
  -- concurrent reset_all — or a launch_prep racing an attention reset — can never
  -- acquire them in the opposite order, ruling out a lock-ordering deadlock.
  perform pg_advisory_xact_lock(hashtext('clean_slate'));
  perform pg_advisory_xact_lock(hashtext('attention_reset'));

  -- (1) Launch prep: mute flags + history wipe + category-snapshot purge.
  v_snapshot_id := public.super_admin_launch_prep();

  -- (2) Reset the two time-based "Needs attention" Home cards (global scope).
  v_care   := public.super_admin_reset_care_attention('global', null);
  v_health := public.super_admin_reset_health_attention('global', null);

  -- One paired envelope audit row over the whole combined reset. The composed
  -- RPCs each write their own rows for the individual pieces.
  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values
    (v_actor, 'super_admin.reset_all', 'clean_slate_snapshots', v_snapshot_id,
     jsonb_build_object(
       'history_snapshot_id', v_snapshot_id,
       'care_snapshot_id', v_care,
       'health_snapshot_id', v_health
     ));

  return v_snapshot_id;
end;
$$;

revoke all     on function public.super_admin_reset_all() from public;
revoke all     on function public.super_admin_reset_all() from anon;
revoke all     on function public.super_admin_reset_all() from authenticated;
grant  execute on function public.super_admin_reset_all() to authenticated;

comment on function public.super_admin_reset_all() is
  'Danger-Zone consolidation: super-admin one-click "reset everything to a clean launch state". Holds the shared clean_slate and attention_reset advisory locks (clean_slate first) for the whole transaction, then composes super_admin_launch_prep() (mute flags + history wipe + category-snapshot purge) and super_admin_reset_care_attention/super_admin_reset_health_attention(''global'', null), and writes a paired super_admin.reset_all audit row. Idempotent — re-running on a clean database is a neutral no-op. Returns the history wipe snapshot id, or null when history was already clear. Recovery is per-piece from the individual Danger-Zone cards.';
