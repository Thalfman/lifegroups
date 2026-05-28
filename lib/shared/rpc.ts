// Single gateway for the narrow SECURITY DEFINER RPCs. Every
// admin_*/leader_*/super_admin_* wrapper repeated the same two boundary
// casts: the `as never` that sidesteps supabase-js' generic resolution
// (our hand-rolled Database type doesn't structurally match its internal
// GenericSchema, in ways that don't affect `.from()` calls), and the
// `readUuidRpcData` trust-boundary read of the uuid the RPC returns on
// success. This collapses both into one place; the per-RPC wrappers in
// `lib/admin/rpc.ts` and `lib/leader/rpc.ts` are now typed one-line
// aliases that pin the function name and argument shape.

import type { AppSupabaseClient } from "@/lib/supabase/types";
import { readUuidRpcData } from "@/lib/shared/uuid";

export type UuidRpcResult = { data: string | null; error: { message: string } | null };

export async function callUuidRpc(
  client: AppSupabaseClient,
  name: string,
  args: unknown = {},
): Promise<UuidRpcResult> {
  const r = await client.rpc(name as never, args as never);
  return { data: readUuidRpcData(r.data), error: r.error };
}
