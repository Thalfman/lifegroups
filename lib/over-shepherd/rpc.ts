// Typed wrappers around the Over-Shepherd Postgres RPCs. Each pins the
// function name and argument shape and delegates to `callUuidRpc`, which owns
// the supabase-js `as never` cast and the uuid trust-boundary read. See
// `lib/shared/rpc.ts`. Mirrors lib/leader/rpc.ts.

import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { ShepherdCareInteractionType } from "@/types/enums";
import { callUuidRpc, type UuidRpcResult } from "@/lib/shared/rpc";

type RpcResult = UuidRpcResult;

// Note: there is no admin_summary / current_status / next_touchpoint_due
// argument here by design — an Over-Shepherd logs a broad interaction only.
export type OverShepherdLogCareInteractionArgs = {
  p_shepherd_profile_id: string;
  p_interaction_at: string;
  p_interaction_type: ShepherdCareInteractionType;
  p_notes: string | null;
};

export function rpcOverShepherdLogCareInteraction(
  client: AppSupabaseClient,
  args: OverShepherdLogCareInteractionArgs,
): Promise<RpcResult> {
  return callUuidRpc(client, "over_shepherd_log_care_interaction", args);
}
