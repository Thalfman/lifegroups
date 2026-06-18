// Request-scoped feature-flag read (perf: collapse duplicate flag RPCs).
//
// Three admin-Home consumers each need the stored feature-flag state on the same
// render: the frozen-surface gate (lib/admin/frozen-surface), the launch-optics
// mutes (lib/admin/needs-attention-mutes), and the nav-visibility resolver
// (lib/nav/hidden-nav). Each used to build its own Supabase server client and
// call admin_read_feature_flags() itself, so opening /admin issued the SAME flag
// RPC up to three times per request. This module owns one client + one RPC + one
// decode, wrapped in React.cache (mirroring getCurrentSession) so all three
// consumers share a single round-trip per request.
//
// The state is still read through the admin-readable admin_read_feature_flags()
// RPC (not platform_config directly): platform_config is Super-Admin-only by RLS
// but requireAdmin() admits ministry_admin too, so a table read would resolve
// every flag as off for ministry admins even after a Super Admin flipped one
// (#256). The RPC returns the same feature_flags sub-object to both admin roles,
// so the flags resolve identically for the whole admin team.
//
// Fails safe to an empty config (every flag off ⇒ surface frozen / tab hidden /
// nothing muted): an unconfigured DB, a read error, or a non-admin caller (the
// RPC returns an empty map, decoded to {}) leaves each consumer on its safe
// default, exactly as the per-module reads did before.

import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchAdminFeatureFlags } from "@/lib/supabase/read-models";
import { decodeFeatureFlags } from "@/lib/admin/app-config-decode";
import type { FeatureFlagsConfig } from "@/lib/admin/feature-flags";

// The decoded feature-flag config for the current request, read once and shared.
// Callers pass the result to the pure resolvers (resolveFlag /
// resolveMutedAttentionKeys / resolveHiddenNav in lib/admin/feature-flags).
export const loadAdminFeatureFlags = cache(
  async (): Promise<FeatureFlagsConfig> => {
    const client = await createSupabaseServerClient();
    if (!client) return {};
    const { data } = await fetchAdminFeatureFlags(client);
    return decodeFeatureFlags(data);
  }
);
