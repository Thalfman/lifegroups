// Leader-safe frozen-surface flag read (#376).
//
// The leader guards (requireLeader / requireLeaderActor) must consult the
// `leader_surface` flag, but they run for LEADERS — not admins — so they cannot
// use isFrozenSurfaceLive (lib/admin/frozen-surface), whose admin_read_feature_flags
// RPC gates on auth_is_admin() and returns an empty map to a leader. Reading
// platform_config directly is also out: it is Super-Admin-only by RLS.
//
// Instead this calls the leader-safe read_frozen_surface_flag(p_key) RPC
// (20260608040000): a SECURITY DEFINER function executable by any authenticated
// user that returns ONLY the RESOLVED boolean (enabled AND verified, ADR 0009)
// for a frozen-surface key. It exposes the single boolean the guard needs, never
// the flag map.
//
// Fails safe to false — no client, a read error, or a malformed response leaves
// the surface frozen (the guard then admits no leader) rather than silently
// admitting one.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { log } from "@/lib/observability/logger";

// Resolve a frozen-surface flag (enabled AND verified) for a leader-context
// caller. `flagKey` must be a frozen-surface key; any other key resolves to
// false in the RPC (and therefore here), so this can only ever surface a
// frozen-surface boolean.
export async function readFrozenSurfaceFlagForLeader(
  flagKey: string
): Promise<boolean> {
  const client = await createSupabaseServerClient();
  if (!client) return false;
  // The RPC is not in the generated DB types yet, so the name + args are cast
  // through `never` exactly as the other hand-pinned RPC calls do
  // (lib/shared/rpc.ts, the lib/supabase/*-reads modules).
  const { data, error } = await client.rpc(
    "read_frozen_surface_flag" as never,
    {
      p_key: flagKey,
    } as never
  );
  if (error) {
    log.error({
      event: "leader_surface_flag_read_failed",
      outcome: "fail",
      flag_key: flagKey,
      error_code: error.code ?? "unknown",
      error_message: error.message,
    });
    return false;
  }
  // The RPC returns a plain boolean; treat anything but an exact `true` as off.
  return data === true;
}
