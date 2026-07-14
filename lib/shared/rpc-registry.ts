// Hand-pinned RPC contract for every Next-runtime Supabase call. The generated
// Database type intentionally lags the live function surface until #864 lands,
// so this registry is the compile-time source of truth in the meantime: a
// literal Postgres function name selects exactly one argument shape and one
// expected return shape.
//
// Existing surface-specific maps remain useful public APIs and ownership
// boundaries. This module composes them into the one registry consumed by the
// shared gateway, then adds the account, usage, and read-only RPCs that do not
// belong to an admin/leader write surface.

import type {
  AdminJsonRpcArgs,
  AdminTextRpcArgs,
  AdminUuidRpcArgs,
} from "@/lib/admin/rpc";
import type { LeaderUuidRpcArgs } from "@/lib/leader/rpc";
import type { OverShepherdUuidRpcArgs } from "@/lib/over-shepherd/rpc";

export type AccountUuidRpcArgs = {
  set_own_full_name: { p_full_name: string };
  request_own_account_deletion: { p_reason: string | null };
  mark_first_run_orientation_seen: Record<string, never>;
};

export type UsageUuidRpcArgs = {
  log_usage_event: {
    p_event_type: "login" | "area_view";
    p_area: string | null;
  };
};

export type AccountJsonRpcArgs = {
  first_run_orientation_seen: Record<string, never>;
  peek_invitation: { p_token_hash: string };
};

export type ReadOnlyRpcArgs = {
  read_frozen_surface_flag: { p_key: string };
  over_shepherd_caller_coverage: Record<string, never>;
  admin_sealed_note_counts: Record<string, never>;
  admin_group_health_attendance_weeks: {
    p_group_ids: string[];
    p_limit_weeks: number;
  };
  admin_read_feature_flags: Record<string, never>;
};

export type PinnedAdminUuidRpcArgs = AdminUuidRpcArgs;
export type PinnedAdminJsonRpcArgs = AdminJsonRpcArgs;
export type PinnedLeaderUuidRpcArgs = LeaderUuidRpcArgs;
export type PinnedOverShepherdUuidRpcArgs = OverShepherdUuidRpcArgs;

export type PinnedUuidRpcArgs = AdminUuidRpcArgs &
  LeaderUuidRpcArgs &
  OverShepherdUuidRpcArgs &
  AccountUuidRpcArgs &
  UsageUuidRpcArgs;

export type PinnedJsonRpcArgs = AdminJsonRpcArgs & AccountJsonRpcArgs;

export type PinnedTextRpcArgs = AdminTextRpcArgs;

type RpcDefinition<Args, Returns> = {
  readonly Args: Args;
  readonly Returns: Returns;
};

type RpcDefinitions<ArgsMap, Returns> = {
  [Name in keyof ArgsMap]: RpcDefinition<ArgsMap[Name], Returns>;
};

type ReadOnlyRpcRegistry = {
  read_frozen_surface_flag: RpcDefinition<{ p_key: string }, boolean>;
  over_shepherd_caller_coverage: RpcDefinition<Record<string, never>, unknown>;
  admin_sealed_note_counts: RpcDefinition<Record<string, never>, unknown>;
  admin_read_feature_flags: RpcDefinition<Record<string, never>, unknown>;
  admin_group_health_attendance_weeks: RpcDefinition<
    ReadOnlyRpcArgs["admin_group_health_attendance_weeks"],
    unknown
  >;
};

export type PinnedRpcRegistry = RpcDefinitions<PinnedUuidRpcArgs, string> &
  RpcDefinitions<PinnedJsonRpcArgs, unknown> &
  RpcDefinitions<PinnedTextRpcArgs, string> &
  ReadOnlyRpcRegistry;

export type PinnedRpcName = keyof PinnedRpcRegistry;

export type PinnedRpcArgsFor<Name extends PinnedRpcName> =
  PinnedRpcRegistry[Name]["Args"];

export type PinnedRpcReturnFor<Name extends PinnedRpcName> =
  PinnedRpcRegistry[Name]["Returns"];
