// Phase USAGE.1: typed wrapper around the log_usage_event RPC, mirroring the
// admin/leader RPC wrappers (lib/admin/rpc.ts). The RPC self-gates on the
// usage_tracking flag and returns null (no-op) when the flag is off or there is
// no active profile, so every caller treats this as best-effort: a null/error
// result is never surfaced to the user.

import type { AppSupabaseClient } from "@/lib/supabase/types";
import { callUuidRpc, type UuidRpcResult } from "@/lib/shared/rpc";

export type UsageEventType = "login" | "area_view";

export function rpcLogUsageEvent(
  client: AppSupabaseClient,
  args: { p_event_type: UsageEventType; p_area: string | null }
): Promise<UuidRpcResult> {
  return callUuidRpc(client, "log_usage_event", args);
}
