// Typed wrapper around the over-shepherd Postgres RPC. Mirrors lib/admin/rpc.ts:
// pins the exact function name + argument shape and delegates to callUuidRpc,
// which owns the supabase-js cast and the uuid trust-boundary read. The wrapper
// does no validation of its own — the action layer validates first. The RPC
// itself is the security boundary (over-shepherd identity + coverage gate).

import type { AppSupabaseClient } from "@/lib/supabase/types";
import { callUuidRpc, type UuidRpcResult } from "@/lib/shared/rpc";

export type OverShepherdLogBroadNoteArgs = {
  p_shepherd_profile_id: string;
  p_note: string;
};

export function rpcOverShepherdLogBroadNote(
  client: AppSupabaseClient,
  args: OverShepherdLogBroadNoteArgs,
): Promise<UuidRpcResult> {
  return callUuidRpc(client, "over_shepherd_log_broad_note", args);
}
