-- Admin RLS visibility audit: seal app_settings SELECT to admins.
--
-- Bug being fixed: app_settings was readable by ANY authenticated user
-- (`app_settings_auth_read` → `using ((select auth.uid()) is not null)`, last
-- re-created in 20260601010000). But the table stores the
-- `launch_planning_assumptions` row whose `notes` field is admin-only — the
-- LP.1/LP.2 RPCs deliberately redact it from audit metadata
-- (`lp2_redact_assumptions_for_audit`, has_notes only). A world-readable SELECT
-- policy therefore exposed admin-only planning notes to any signed-in session.
-- Once the leader / over-shepherd surfaces flip on, those lower tiers would be
-- able to read those notes straight from the table.
--
-- Why sealing the whole table to admins is safe today: only `/admin` surfaces
-- read app_settings (the `metric_defaults`, `group_health_rubric`, and
-- `launch_planning_assumptions` keys, all via lib/supabase reads consumed under
-- requireAdmin pages). lib/over-shepherd/ and lib/leader/ have zero app_settings
-- reads, so narrowing the policy breaks no current read path.
--
-- If a lower tier ever needs a specific key (e.g. a leader dashboard reading
-- metric thresholds once the leader surface flips on), expose that narrow slice
-- through a SECURITY DEFINER RPC — the precedent is admin_read_feature_flags(),
-- which lets a ministry_admin read the flags it needs out of the super-admin-only
-- platform_config table without widening the table's SELECT policy. Do NOT widen
-- this policy back to all-authenticated.
--
-- This is a pure RLS/DDL change: no data write, so no paired audit_events row
-- (consistent with the other policy-only migrations, e.g. 20260601010000).

drop policy if exists app_settings_auth_read on public.app_settings;

create policy app_settings_admin_read on public.app_settings
  for select to authenticated using (public.auth_is_admin());

-- The table-level grant stays as-is (already granted to authenticated in
-- 20260518070000); RLS narrows it to admins. No INSERT/UPDATE/DELETE policy —
-- writes continue to flow only through the SECURITY DEFINER admin_* RPCs.
