-- Phase PIVOT.10 (#376): Leader-surface RLS re-audit + verify-before-flip flip.
-- ===========================================================================
--
-- This migration lands three security-critical things for the Leader surface
-- re-open (ADR 0016 / ADR 0017, under ADR 0009's verify-before-flip rule):
--
--   1. A leader-safe SECURITY DEFINER read for a single frozen-surface flag,
--      `read_frozen_surface_flag(p_key text)`. The existing
--      admin_read_feature_flags() RPC is ADMIN-ONLY (it gates on
--      auth_is_admin()), but the leader guard (requireLeader/requireLeaderActor)
--      runs for leaders and now needs to consult `leader_surface`. Rather than
--      widen the whole flag map to leaders, this returns ONLY the RESOLVED
--      boolean (enabled AND verified) for a frozen-surface key, and rejects any
--      non-frozen key. It mirrors resolveFlag()'s frozen-surface rule in SQL.
--
--   2. The verify-before-flip flip: set `leader_surface.verified = true` in the
--      platform_config feature_flags store, through the same audited
--      deep-merge path super_admin_set_platform_config uses. See the gating
--      note below.
--
--   3. A re-assertion that the leader-read RLS policies are GROUP-SCOPED via
--      auth_is_leader_of() (20260602020000 consolidated them; this migration is
--      the verify-before-flip checkpoint that records they are sound). The
--      policies are not re-created here — they already OR auth_is_leader_of(...)
--      per table and a cross-group leader cannot read another group's rows.
--
-- VERIFY-BEFORE-FLIP GATING (ADR 0009 / acceptance criteria 1-4):
-- Setting leader_surface.verified = true is what makes resolveFlag() return
-- true for the surface. It is ONLY sound to set here BECAUSE this slice also
-- lands, in the same branch:
--   (1) the guard change — requireLeader/requireLeaderActor admit
--       leader/co_leader IFF resolveFlag(config,'leader_surface') is
--       enabled+verified (lib/auth/session.ts); the flag alone opens nothing
--       (the guards admitted ZERO roles before this slice);
--   (2) the check-in DECOUPLING — /leader/[groupId]/checkin and
--       leader_submit_group_checkin stay behind their OWN frozen `check_ins`
--       gate, which stays OFF, so flipping leader_surface does NOT expose them;
--   (3) the minimal auth-only landing — /leader renders a placeholder with no
--       check-in entry points until #382.
-- The flip itself is the Super-Admin-only audited path (requireSuperAdmin* in
-- the app; this migration writes the same row the RPC would). It must NEVER be
-- set without 1-3 in place.
--
-- Idempotent: the RPC is CREATE OR REPLACE; the flag flip deep-merges (it
-- preserves `enabled` and every other flag). Safe to re-run.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- 1. read_frozen_surface_flag(p_key text) -> boolean
-- ---------------------------------------------------------------------------
-- Leader-safe, single-boolean frozen-surface flag read. Returns the RESOLVED
-- value (enabled AND verified) for a frozen-surface key only; any other key
-- (new-surface, nav-visibility, or unknown) returns false. Executable by any
-- authenticated user — it exposes only the one boolean a leader guard needs,
-- never the flag map. Fails closed: a missing config, a missing flag, or a
-- non-whitelisted key all resolve to false.
--
-- The frozen-surface key whitelist is pinned in SQL and must stay in lock-step
-- with the frozen_surface entries in lib/admin/feature-flags.ts
-- (FEATURE_FLAG_DEFINITIONS): leader_surface, check_ins, guests. A key outside
-- this set can NEVER resolve true here, so this RPC can only ever surface a
-- frozen-surface boolean — never a new-surface or nav-visibility flag.
create or replace function public.read_frozen_surface_flag(p_key text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    -- Frozen-surface keys only (mirrors isFrozenSurfaceFlag()); any other key
    -- fails closed to false so this RPC cannot leak a non-frozen flag.
    when p_key not in ('leader_surface', 'check_ins', 'guests') then false
    else coalesce(
      (
        select
          -- resolveFlag()'s frozen-surface rule in SQL: enabled AND verified.
          (flag -> 'enabled') = 'true'::jsonb
          and (flag -> 'verified') = 'true'::jsonb
        from public.platform_config,
             lateral (
               select setting_value -> 'feature_flags' -> p_key as flag
             ) f
        where setting_key = 'platform_config'
      ),
      false
    )
  end;
$$;

-- Deny by default, allow authenticated. Unlike admin_read_feature_flags this is
-- deliberately leader-readable: the body's whitelist + resolved-boolean shape is
-- what scopes the exposure (a single frozen-surface boolean, no flag map, no
-- secrets), so granting execute to authenticated is the intended access.
revoke all     on function public.read_frozen_surface_flag(text) from public;
revoke all     on function public.read_frozen_surface_flag(text) from anon;
revoke all     on function public.read_frozen_surface_flag(text) from authenticated;
grant  execute on function public.read_frozen_surface_flag(text) to authenticated;

comment on function public.read_frozen_surface_flag(text) is
  'Leader-safe frozen-surface flag read (#376): returns the resolved boolean (enabled AND verified, per ADR 0009 / resolveFlag) for a frozen-surface key only (leader_surface / check_ins / guests); any other key returns false. Executable by any authenticated user — exposes only the single boolean a leader guard needs, never the flag map. Fails closed.';

-- ---------------------------------------------------------------------------
-- 2. Verify-before-flip flip: leader_surface.verified = true
-- ---------------------------------------------------------------------------
-- Deep-merge { leader_surface: { verified: true } } onto the stored
-- feature_flags sub-object, preserving `enabled` and every other flag. This is
-- the SAME shape super_admin_set_platform_config writes (the Super-Admin-only
-- audited path); doing it here records the verify-before-flip checkpoint as part
-- of the migration that also lands the re-audited guard + decoupling (see the
-- gating note above). `enabled` is intentionally NOT set here: Tom (Super Admin)
-- holds the on/off switch; this migration only records that the surface has been
-- re-verified, so resolveFlag() returns true once Tom flips `enabled` on.
update public.platform_config
   set setting_value = setting_value || jsonb_build_object(
     'feature_flags',
     coalesce(setting_value -> 'feature_flags', '{}'::jsonb)
       || jsonb_build_object(
            'leader_surface',
            coalesce(
              setting_value -> 'feature_flags' -> 'leader_surface',
              '{}'::jsonb
            ) || jsonb_build_object('verified', true)
          )
   )
 where setting_key = 'platform_config';

-- Audit the verify-before-flip checkpoint in the SAME transaction as the flip.
-- This repo treats platform-config / security-flag mutations as audit-critical
-- (the super_admin.set_platform_config RPC always writes a paired audit row), so
-- the migration that performs the flip records it too. It is a migration-time
-- system change with no auth caller, so actor_profile_id is null (the column is
-- nullable); the metadata pins exactly which flag changed and why.
insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
select
  null,
  'system.verify_leader_surface_flag',
  'platform_config',
  pc.id,
  jsonb_build_object(
    'flag', 'leader_surface',
    'set', jsonb_build_object('verified', true),
    'reason', 'verify-before-flip re-audit landed (ADR 0009 / #376); enabled left to the Super Admin switch'
  )
from public.platform_config pc
where pc.setting_key = 'platform_config';

-- ---------------------------------------------------------------------------
-- 3. Leader-read RLS is group-scoped (verify-before-flip checkpoint)
-- ---------------------------------------------------------------------------
-- The consolidated SELECT policies (20260602020000) gate leader reads through
-- public.auth_is_leader_of(<group_id>), which (20260529006000) requires BOTH an
-- active group_leaders row for the caller AND the caller's current profile role
-- being leader/co_leader. A leader therefore reads ONLY their assigned groups'
-- rows; a cross-group read returns nothing. No policy is re-created here — this
-- block is the documented checkpoint that the leader-read surface was re-audited
-- and found group-scoped before leader_surface was verified. The cross-group
-- rejection is asserted statically in
-- lib/admin/__tests__/leader-surface-migration.test.ts against the consolidated
-- policy migration.
