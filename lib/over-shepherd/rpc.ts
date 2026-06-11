// Declarative RPC gateway for the over-shepherd surface (the "RPC gateway"
// half of ADR 0001). Mirrors lib/admin/rpc.ts: a typed table keyed by the
// LITERAL Postgres function name, and a generic entry point
// (`overShepherdRpc`) that pins name + args together at the call site and
// delegates to `callUuidRpc`, which owns the supabase-js cast and the uuid
// trust-boundary read. The gateway does no validation of its own — the action
// layer validates first. The RPC itself is the security boundary
// (over-shepherd identity + coverage gate).

import type { AppSupabaseClient } from "@/lib/supabase/types";
import { callUuidRpc, type UuidRpcResult } from "@/lib/shared/rpc";

export type OverShepherdLogBroadNoteArgs = {
  p_shepherd_profile_id: string;
  p_note: string;
};

// The uuid-channel args map, keyed by the LITERAL Postgres function name.
export type OverShepherdUuidRpcArgs = {
  over_shepherd_log_broad_note: OverShepherdLogBroadNoteArgs;
};

export function overShepherdRpc<K extends keyof OverShepherdUuidRpcArgs>(
  client: AppSupabaseClient,
  name: K,
  args: OverShepherdUuidRpcArgs[K]
): Promise<UuidRpcResult> {
  return callUuidRpc(client, name, args);
}
