// Frozen-surface gating (#191 / ADR 0009).
//
// ADR 0002 froze three surfaces — the Leader surface, weekly check-ins, and
// guests. They still resolve behind their `requireLeader()` / `requireAdmin()`
// gates but carried no visible "frozen" signal, so they could be re-discovered
// or accidentally re-exposed. This helper routes each through its default-off
// feature flag so the freeze is enforced (and signalled), not merely implied by
// nav omission.
//
// The pure verify-before-flip rule lives in lib/admin/feature-flags
// (`resolveFlag`): a frozen-surface flag is live only when it is enabled AND a
// `verified` marker is present. This module is the thin server glue that loads
// the stored flag state and asks that pure resolver.
//
// The flag state is read through the admin-readable admin_read_feature_flags()
// RPC rather than the platform_config table directly: platform_config is
// Super-Admin-only by RLS, but requireAdmin() admits ministry_admin too, so a
// table read would resolve every frozen surface as off for ministry admins even
// after a Super Admin re-enabled one (#256). The RPC returns only the
// feature_flags sub-object to both admin roles, so the gate resolves the same
// for both.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchAdminFeatureFlags } from "@/lib/supabase/read-models";
import { decodeFeatureFlags } from "@/lib/admin/app-config-decode";
import { resolveFlag } from "@/lib/admin/feature-flags";

// Whether an ADR-0002-frozen surface is currently live: its feature flag is
// enabled AND re-verified (resolveFlag encodes ADR 0009's verify-before-flip
// rule). Fails safe to false — an unconfigured DB, a read error, or a non-admin
// caller (the RPC returns an empty flag map) leaves the surface frozen rather
// than silently live.
export async function isFrozenSurfaceLive(flagKey: string): Promise<boolean> {
  const client = await createSupabaseServerClient();
  if (!client) return false;
  const { data } = await fetchAdminFeatureFlags(client);
  return resolveFlag(decodeFeatureFlags(data), flagKey);
}
