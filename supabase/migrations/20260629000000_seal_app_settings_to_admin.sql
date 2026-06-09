-- Admin RLS visibility audit: scope app_settings reads by setting_key.
--
-- Bug being fixed: app_settings was readable by ANY authenticated user
-- (`app_settings_auth_read` → `using ((select auth.uid()) is not null)`, last
-- re-created in 20260601010000). The table holds the
-- `launch_planning_assumptions` row whose `notes` field is admin-only — the
-- LP.1/LP.2 RPCs deliberately redact it from audit metadata
-- (`lp2_redact_assumptions_for_audit`, has_notes only). A world-readable SELECT
-- therefore exposed admin-only planning context to any signed-in session, and
-- once the leader / over-shepherd surfaces are on, to those lower tiers too.
--
-- The fix is per-key, NOT a blanket seal: admins read every key; non-admins read
-- ONLY the shared operational thresholds in `metric_defaults`. That single key is
-- read under the CALLER's own RLS client by live lower-tier surfaces — the
-- Over-Shepherd care directory (`app/(protected)/over-shepherd/page.tsx`) and the
-- Leader check-in page (`app/(protected)/leader/[groupId]/checkin/page.tsx`) — to
-- honour the admin-configured care-cadence / check-in-due windows. It is also
-- cached cross-request via `unstable_cache` (`lib/supabase/cached-config.ts`), so
-- under a blanket seal a non-admin that filled the cache first after expiry would
-- cache the null fallback for everyone, admins included. Sealing the whole table
-- would silently make those surfaces ignore admin settings; keeping
-- `metric_defaults` readable preserves that path.
--
-- Everything else is admin-only by default (default-deny for non-admins):
-- `launch_planning_assumptions` (the actual leak) and `group_health_rubric` (read
-- only by /admin surfaces today) — plus any future key. If a lower tier ever
-- needs another key, add it to the allowlist here, or expose a narrow slice via a
-- SECURITY DEFINER RPC (precedent: `admin_read_feature_flags()` for the
-- super-admin-only `platform_config`). Do NOT widen this back to all-authenticated.
--
-- Pure RLS/DDL change: no data write, so no paired audit_events row (consistent
-- with the other policy-only migrations, e.g. 20260601010000). The second drop is
-- defensive — it clears an earlier admin-only revision of this policy if one was
-- already applied to a branch before this revision landed.

drop policy if exists app_settings_auth_read on public.app_settings;
drop policy if exists app_settings_admin_read on public.app_settings;

create policy app_settings_read on public.app_settings
  for select to authenticated
  using (
    public.auth_is_admin()
    or setting_key = 'metric_defaults'
  );

-- The table-level grant stays as-is (already granted to authenticated in
-- 20260518070000); RLS narrows it. No INSERT/UPDATE/DELETE policy — writes
-- continue to flow only through the SECURITY DEFINER admin_* RPCs.
