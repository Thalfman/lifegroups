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

export type UuidRpcResult = {
  data: string | null;
  error: { message: string } | null;
};

export async function callUuidRpc(
  client: AppSupabaseClient,
  name: string,
  args: unknown = {}
): Promise<UuidRpcResult> {
  const r = await client.rpc(name as never, args as never);
  return { data: readUuidRpcData(r.data), error: r.error };
}

// Some RPCs return a structured jsonb document (e.g. the permanent-deletion
// preflight returns a blockers/set-null report) rather than a single uuid. This
// passes the parsed data through untouched as `unknown`; the caller validates
// its shape at the trust boundary, exactly as the action layer already does for
// other reads.
export type JsonRpcResult = {
  data: unknown;
  error: { message: string } | null;
};

export async function callJsonRpc(
  client: AppSupabaseClient,
  name: string,
  args: unknown = {}
): Promise<JsonRpcResult> {
  const r = await client.rpc(name as never, args as never);
  return { data: r.data ?? null, error: r.error };
}

// A few RPCs return a plain `text` scalar that is NOT a uuid — e.g. the bulk
// people-import returns a created COUNT ("0", "3"). Those must not go through
// `callUuidRpc`: `readUuidRpcData` rejects any non-uuid string as null, which a
// "did it succeed?" caller would misread as a failure even though the RPC
// committed. This keeps the value as a string (or null when the driver returns a
// non-string), and the caller parses it.
export type TextRpcResult = {
  data: string | null;
  error: { message: string } | null;
};

export async function callTextRpc(
  client: AppSupabaseClient,
  name: string,
  args: unknown = {}
): Promise<TextRpcResult> {
  const r = await client.rpc(name as never, args as never);
  const data: unknown = r.data ?? null;
  return { data: typeof data === "string" ? data : null, error: r.error };
}
