// Typed wrapper for the one self-service SECURITY DEFINER RPC (ADR 0032).
// Same boundary idiom as lib/admin/rpc.ts: the wrapper pins the function
// name and argument shape; callUuidRpc owns the casts and the uuid
// trust-boundary read.

import type { AppSupabaseClient } from "@/lib/supabase/types";
import { callUuidRpc, type UuidRpcResult } from "@/lib/shared/rpc";

// Sets the caller's OWN profile name, only while full_name_pending is true.
// Raises invalid_input / insufficient_privilege / name_not_pending.
export const rpcSetOwnFullName = (
  client: AppSupabaseClient,
  args: { p_full_name: string }
): Promise<UuidRpcResult> => callUuidRpc(client, "set_own_full_name", args);

// Requests deletion of the caller's OWN account (#563): archives their profile
// (revoking access) and records a pending deletion request. Raises
// invalid_input / insufficient_privilege / forbidden_target /
// deletion_already_requested.
export const rpcRequestOwnAccountDeletion = (
  client: AppSupabaseClient,
  args: { p_reason: string | null }
): Promise<UuidRpcResult> =>
  callUuidRpc(client, "request_own_account_deletion", args);

// Records that the caller dismissed their first-run orientation card (#560).
// Idempotent; raises insufficient_privilege with no active own profile.
export const rpcMarkFirstRunOrientationSeen = (
  client: AppSupabaseClient
): Promise<UuidRpcResult> =>
  callUuidRpc(client, "mark_first_run_orientation_seen", {});
