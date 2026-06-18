// Nav-visibility resolution glue (ADR 0016).
//
// The Care/Plan/Multiply pivot hides three top-level tabs (Groups, People,
// Planning) by default; a Super Admin can re-show any of them by flipping its
// nav-visibility flag. The pure rule lives in lib/admin/feature-flags
// (`resolveHiddenNav`): hidden unless the flag is on. This module is the thin
// server glue that asks that pure resolver against the stored flag state, so
// every admin nav surface (sidebar, Home Hub tiles, bottom nav) hides the same
// tabs for the same config.
//
// The flag state is loaded once per request through the shared, React.cache-
// wrapped loadAdminFeatureFlags (lib/admin/feature-flags-read), which reads it
// via the admin-readable admin_read_feature_flags() RPC, NOT the platform_config
// table directly: platform_config is Super-Admin-only by RLS but requireAdmin()
// admits ministry_admin too, so a table read would resolve every nav flag as off
// for ministry admins even after a Super Admin re-showed a tab (mirrors the
// frozen-surface gate, #256). The RPC returns the same feature_flags sub-object
// to both admin roles, so the nav resolves identically for both.

import { loadAdminFeatureFlags } from "@/lib/admin/feature-flags-read";
import { resolveHiddenNav } from "@/lib/admin/feature-flags";

// The set of top-level area hrefs currently hidden from nav. Fails safe to the
// pivot default (all three hidden): an unconfigured DB, a read error, or a
// non-admin caller (the loader returns an empty flag map) leaves the tabs hidden
// rather than silently re-showing a surface the operator chose to retire.
//
// The per-request dedup now lives in loadAdminFeatureFlags (React.cache), so the
// admin layout and the child page it wraps — which both call this on every admin
// navigation — share one nav-flag RPC with the frozen-surface and mute reads.
export async function loadHiddenNavAreas(): Promise<Set<string>> {
  return resolveHiddenNav(await loadAdminFeatureFlags());
}
