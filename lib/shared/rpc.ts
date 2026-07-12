// Single runtime gateway for the hand-pinned RPC registry. The generated
// Database function map is incomplete until #864, so supabase-js cannot type
// every live RPC directly. `rpcMethod` is the one explicit adapter from that
// incomplete generated surface to our complete pinned registry; every exported
// caller still pins the literal function name to its exact args at compile time.
// The per-channel helpers also preserve the existing uuid/jsonb/text trust-
// boundary reads.

import type { AppSupabaseClient } from "@/lib/supabase/types";
import { readUuidRpcData } from "@/lib/shared/uuid";
import type {
  AccountJsonRpcArgs,
  AccountUuidRpcArgs,
  PinnedAdminJsonRpcArgs,
  PinnedAdminUuidRpcArgs,
  PinnedLeaderUuidRpcArgs,
  PinnedOverShepherdUuidRpcArgs,
  PinnedRpcArgsFor,
  PinnedRpcName,
  PinnedTextRpcArgs,
  UsageUuidRpcArgs,
} from "@/lib/shared/rpc-registry";

export type RpcBoundaryError = {
  message: string;
  code?: string;
};

export type RawRpcResult = {
  data: unknown;
  error: RpcBoundaryError | null;
};

type RpcRangeBuilder = PromiseLike<RawRpcResult> & {
  range(from: number, to: number): PromiseLike<RawRpcResult>;
};

type RpcBoundaryMethod = (name: string, args: unknown) => RpcRangeBuilder;

function rpcMethod(client: AppSupabaseClient): RpcBoundaryMethod {
  // Keep the receiver bound: supabase-js reads client state through `this`.
  // The assertion is confined to this adapter; callers cannot supply an
  // unregistered name or a mismatched args object.
  return client.rpc.bind(client) as unknown as RpcBoundaryMethod;
}

async function invokeRpc(
  client: AppSupabaseClient,
  name: string,
  args: unknown
): Promise<RawRpcResult> {
  return rpcMethod(client)(name, args);
}

function invokeRpcRange(
  client: AppSupabaseClient,
  name: string,
  args: unknown,
  from: number,
  to: number
): PromiseLike<RawRpcResult> {
  return rpcMethod(client)(name, args).range(from, to);
}

export function callPinnedRpc<Name extends PinnedRpcName>(
  client: AppSupabaseClient,
  name: Name,
  args: PinnedRpcArgsFor<Name>
): Promise<RawRpcResult> {
  return invokeRpc(client, name, args);
}

export function callPinnedRpcRange<Name extends PinnedRpcName>(
  client: AppSupabaseClient,
  name: Name,
  args: PinnedRpcArgsFor<Name>,
  from: number,
  to: number
): PromiseLike<RawRpcResult> {
  return invokeRpcRange(client, name, args, from, to);
}

export type UuidRpcResult = {
  data: string | null;
  error: { message: string } | null;
};

export function callUuidRpc<Name extends keyof PinnedAdminUuidRpcArgs>(
  client: AppSupabaseClient,
  name: Name,
  args: PinnedAdminUuidRpcArgs[Name]
): Promise<UuidRpcResult>;
export function callUuidRpc<Name extends keyof PinnedLeaderUuidRpcArgs>(
  client: AppSupabaseClient,
  name: Name,
  args: PinnedLeaderUuidRpcArgs[Name]
): Promise<UuidRpcResult>;
export function callUuidRpc<Name extends keyof PinnedOverShepherdUuidRpcArgs>(
  client: AppSupabaseClient,
  name: Name,
  args: PinnedOverShepherdUuidRpcArgs[Name]
): Promise<UuidRpcResult>;
export function callUuidRpc<Name extends keyof AccountUuidRpcArgs>(
  client: AppSupabaseClient,
  name: Name,
  args: AccountUuidRpcArgs[Name]
): Promise<UuidRpcResult>;
export function callUuidRpc<Name extends keyof UsageUuidRpcArgs>(
  client: AppSupabaseClient,
  name: Name,
  args: UsageUuidRpcArgs[Name]
): Promise<UuidRpcResult>;
export async function callUuidRpc(
  client: AppSupabaseClient,
  name: string,
  args: unknown
): Promise<UuidRpcResult> {
  const r = await invokeRpc(client, name, args);
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

export function callJsonRpc<Name extends keyof PinnedAdminJsonRpcArgs>(
  client: AppSupabaseClient,
  name: Name,
  args: PinnedAdminJsonRpcArgs[Name]
): Promise<JsonRpcResult>;
export function callJsonRpc<Name extends keyof AccountJsonRpcArgs>(
  client: AppSupabaseClient,
  name: Name,
  args: AccountJsonRpcArgs[Name]
): Promise<JsonRpcResult>;
export async function callJsonRpc(
  client: AppSupabaseClient,
  name: string,
  args: unknown
): Promise<JsonRpcResult> {
  const r = await invokeRpc(client, name, args);
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

export async function callTextRpc<Name extends keyof PinnedTextRpcArgs>(
  client: AppSupabaseClient,
  name: Name,
  args: PinnedTextRpcArgs[Name]
): Promise<TextRpcResult> {
  const r = await invokeRpc(client, name, args);
  const data: unknown = r.data ?? null;
  return { data: typeof data === "string" ? data : null, error: r.error };
}
