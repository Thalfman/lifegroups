// Launch-optics mutes (#reset-attention-metrics) — server glue.
//
// A brand-new ministry has no contact history, no submitted check-ins, and no
// follow-ups, so the time-based "Needs attention" categories on the admin Home
// page read as "already behind" on day one. A Super Admin can mute those
// categories via the feature flags in the Super-Admin-only platform_config
// store (mute_care_attention / mute_health_checks / mute_follow_ups).
//
// This module is the thin server glue that asks the pure resolver
// (lib/admin/feature-flags resolveMutedAttentionKeys) which dashboard categories
// are muted. It mirrors lib/admin/frozen-surface exactly: the flag state is
// loaded once per request through the shared, React.cache-wrapped
// loadAdminFeatureFlags (lib/admin/feature-flags-read), which reads it via the
// admin-readable admin_read_feature_flags() RPC rather than platform_config
// directly, because platform_config is Super-Admin-only by RLS but
// requireAdmin() admits ministry_admin too. The RPC returns only the
// feature_flags sub-object to both admin roles, so the mute resolves identically
// for the whole admin team's Home view — which is the point: ministry admins
// should not see the new ministry as behind either.

import { loadAdminFeatureFlags } from "@/lib/admin/feature-flags-read";
import { resolveMutedAttentionKeys } from "@/lib/admin/feature-flags";

// The "Needs attention" category keys a Super Admin has currently muted, as a
// serializable array (so a Server Component can hand it to a client child).
// Fails safe to "nothing muted" — an unconfigured DB, a read error, or a
// non-admin caller (the loader returns an empty flag map) shows every category
// rather than silently hiding work.
export async function getMutedAttentionKeys(): Promise<string[]> {
  return Array.from(resolveMutedAttentionKeys(await loadAdminFeatureFlags()));
}
