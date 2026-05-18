// Typed wrappers around the Phase 5A.1 admin Postgres RPCs. The
// @supabase/supabase-js `.rpc()` generic resolution chokes when the
// Database type doesn't structurally match its internal GenericSchema
// (which our hand-rolled Database type doesn't, in subtle ways that
// don't affect `.from()` calls). Rather than rewrite the entire
// database typing surface, we wrap each RPC in a tiny typed helper
// and pass the args via a single `as never` cast at the boundary.
//
// Each helper:
//   * accepts the exact param types we need.
//   * returns a tuple of `{ data, error }` shape (data is the RPC's
//     uuid return value or null on failure; error is whatever
//     PostgrestError surfaced).
//   * does no validation of its own — the action layer validates first.

import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { RoleInGroup } from "@/types/enums";

type RpcResult = { data: string | null; error: { message: string } | null };

export async function rpcAdminCreateLeaderProfile(
  client: AppSupabaseClient,
  args: { p_full_name: string; p_email: string; p_phone: string | null },
): Promise<RpcResult> {
  const r = await client.rpc("admin_create_leader_profile" as never, args as never);
  return { data: (r.data as string | null) ?? null, error: r.error };
}

export async function rpcAdminCreateMember(
  client: AppSupabaseClient,
  args: { p_full_name: string; p_email: string | null; p_phone: string | null },
): Promise<RpcResult> {
  const r = await client.rpc("admin_create_member" as never, args as never);
  return { data: (r.data as string | null) ?? null, error: r.error };
}

export async function rpcAdminAssignLeaderToGroup(
  client: AppSupabaseClient,
  args: { p_group_id: string; p_profile_id: string; p_role: RoleInGroup },
): Promise<RpcResult> {
  const r = await client.rpc("admin_assign_leader_to_group" as never, args as never);
  return { data: (r.data as string | null) ?? null, error: r.error };
}

export async function rpcAdminAssignMemberToGroup(
  client: AppSupabaseClient,
  args: { p_group_id: string; p_member_id: string },
): Promise<RpcResult> {
  const r = await client.rpc("admin_assign_member_to_group" as never, args as never);
  return { data: (r.data as string | null) ?? null, error: r.error };
}

export async function rpcAdminDeactivateProfile(
  client: AppSupabaseClient,
  args: { p_profile_id: string },
): Promise<RpcResult> {
  const r = await client.rpc("admin_deactivate_profile" as never, args as never);
  return { data: (r.data as string | null) ?? null, error: r.error };
}

export async function rpcAdminDeactivateMember(
  client: AppSupabaseClient,
  args: { p_member_id: string },
): Promise<RpcResult> {
  const r = await client.rpc("admin_deactivate_member" as never, args as never);
  return { data: (r.data as string | null) ?? null, error: r.error };
}

// Phase 5A.2 group management RPCs.

export type GroupRpcArgs = {
  p_name: string;
  p_description: string | null;
  p_meeting_day: string | null;
  p_meeting_time: string | null;
  p_location_area: string | null;
  p_address_optional: string | null;
  p_capacity: number | null;
};

export async function rpcAdminCreateGroup(
  client: AppSupabaseClient,
  args: GroupRpcArgs,
): Promise<RpcResult> {
  const r = await client.rpc("admin_create_group" as never, args as never);
  return { data: (r.data as string | null) ?? null, error: r.error };
}

export async function rpcAdminUpdateGroup(
  client: AppSupabaseClient,
  args: GroupRpcArgs & { p_group_id: string },
): Promise<RpcResult> {
  const r = await client.rpc("admin_update_group" as never, args as never);
  return { data: (r.data as string | null) ?? null, error: r.error };
}

export async function rpcAdminCloseGroup(
  client: AppSupabaseClient,
  args: { p_group_id: string },
): Promise<RpcResult> {
  const r = await client.rpc("admin_close_group" as never, args as never);
  return { data: (r.data as string | null) ?? null, error: r.error };
}

export async function rpcAdminReopenGroup(
  client: AppSupabaseClient,
  args: { p_group_id: string },
): Promise<RpcResult> {
  const r = await client.rpc("admin_reopen_group" as never, args as never);
  return { data: (r.data as string | null) ?? null, error: r.error };
}
