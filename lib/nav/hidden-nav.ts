// Nav-visibility resolution glue (ADR 0016).
//
// The Care/Plan/Multiply pivot hides three top-level tabs (Groups, People,
// Planning) by default; a Super Admin can re-show any of them by flipping its
// nav-visibility flag. The pure rule lives in lib/admin/feature-flags
// (`resolveHiddenNav`): hidden unless the flag is on. This module is the thin
// server glue that loads the stored flag state and asks that pure resolver, so
// every admin nav surface (sidebar, Home Hub tiles, bottom nav) hides the same
// tabs for the same config.
//
// The flag state is read through the admin-readable admin_read_feature_flags()
// RPC (fetchAdminFeatureFlags), NOT the platform_config table directly:
// platform_config is Super-Admin-only by RLS but requireAdmin() admits
// ministry_admin too, so a table read would resolve every nav flag as off for
// ministry admins even after a Super Admin re-showed a tab (mirrors the
// frozen-surface gate, #256). The RPC returns the same feature_flags sub-object
// to both admin roles, so the nav resolves identically for both.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchAdminFeatureFlags } from "@/lib/supabase/read-models";
import { decodeFeatureFlags } from "@/lib/admin/app-config-decode";
import { resolveHiddenNav } from "@/lib/admin/feature-flags";

// The set of top-level area hrefs currently hidden from nav. Fails safe to the
// pivot default (all three hidden): an unconfigured DB, a read error, or a
// non-admin caller (the RPC returns an empty flag map) leaves the tabs hidden
// rather than silently re-showing a surface the operator chose to retire.
export async function loadHiddenNavAreas(): Promise<Set<string>> {
  const client = await createSupabaseServerClient();
  if (!client) return resolveHiddenNav({});
  const { data } = await fetchAdminFeatureFlags(client);
  return resolveHiddenNav(decodeFeatureFlags(data));
}
