-- Default-ON seeds: leader_surface + the Groups/People nav tabs (ADR 0024,
-- amending ADR 0016's hidden-by-default posture; operates under ADR 0009).
--
-- 1. `leader_surface` — the frozen-surface flag gating Leader logins. The
--    verify-before-flip checkpoint already happened: 20260608040000 set
--    `verified = true` IN THE SAME MIGRATION as the re-audited guards
--    (requireLeader/requireLeaderActor consult the flag; check-ins stay behind
--    their own `check_ins` gate; leader RLS re-asserted group-scoped). This
--    migration only flips the operator default (`enabled = true`), so
--    resolveFlag() — enabled AND verified — now returns true and Leaders can
--    sign in to write their group-scoped Care Notes / Prayer Requests.
--
-- 2. `nav_show_groups` / `nav_show_people` — nav-visibility flags (ON ⇒ the
--    tab shows). The Groups and People management surfaces have existed all
--    along (routes resolve by direct URL per ADR 0008/0009); the pivot hid
--    them from nav. Default-ON puts both back in the admin spine.
--
-- The Super-Admin console keeps the off-switch for all three: its writes go
-- through super_admin_set_platform_config, whose per-flag deep-merge
-- (20260627010000) preserves sibling keys — flipping `enabled` off never
-- clobbers `verified`. The code-level fail-safe is unchanged: a failed flag
-- read still resolves to hidden/frozen (DEFAULT_HIDDEN_ADMIN_AREAS;
-- read_frozen_surface_flag fails closed), so this migration widens nothing on
-- error paths. `nav_show_planning` deliberately stays off.
--
-- The deep-merge below copies the exact per-flag
-- coalesce(...,'{}') || jsonb_build_object(...) nesting of 20260608040000 so
-- each flag's existing keys (notably leader_surface.verified) are preserved.
-- Idempotent: re-running re-asserts enabled=true. Safe to re-run.

update public.platform_config
   set setting_value = setting_value || jsonb_build_object(
     'feature_flags',
     coalesce(setting_value -> 'feature_flags', '{}'::jsonb)
       || jsonb_build_object(
            'leader_surface',
            coalesce(
              setting_value -> 'feature_flags' -> 'leader_surface',
              '{}'::jsonb
            ) || jsonb_build_object('enabled', true),
            'nav_show_groups',
            coalesce(
              setting_value -> 'feature_flags' -> 'nav_show_groups',
              '{}'::jsonb
            ) || jsonb_build_object('enabled', true),
            'nav_show_people',
            coalesce(
              setting_value -> 'feature_flags' -> 'nav_show_people',
              '{}'::jsonb
            ) || jsonb_build_object('enabled', true)
          )
   )
 where setting_key = 'platform_config';

-- Audit the default flip in the SAME transaction (the precedent set by
-- system.verify_leader_surface_flag in 20260608040000: platform-config /
-- security-flag mutations are audit-critical). Migration-time system change,
-- no auth caller — actor_profile_id is null; the metadata pins exactly which
-- flags changed and why.
insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
select
  null,
  'system.default_on_flags',
  'platform_config',
  pc.id,
  jsonb_build_object(
    'flags', jsonb_build_array(
      'leader_surface', 'nav_show_groups', 'nav_show_people'
    ),
    'set', jsonb_build_object('enabled', true),
    'reason', 'ADR 0024: leader surface live (verified by 20260608040000) and Groups/People back in the admin nav by default; the Super-Admin console keeps the off-switch'
  )
from public.platform_config pc
where pc.setting_key = 'platform_config';
