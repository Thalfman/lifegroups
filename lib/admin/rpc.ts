// Declarative RPC gateway for the admin surface (the "RPC gateway" half of
// ADR 0001). One typed table per channel maps each LITERAL Postgres function
// name to its argument shape; the generic entry points (`adminRpc`,
// `adminJsonRpc`, `adminTextRpc`) pin name + args together at the call site
// and delegate to `lib/shared/rpc.ts`, which owns the pinned boundary adapter
// and the per-channel trust-boundary read. The gateway does no
// validation of its own -- the action layer validates first.
//
// This module is now a thin BARREL: the named argument shapes and the per-
// channel args-map slices live in the domain-grouped rpc-*.ts modules
// (rpc-groups, rpc-people, rpc-care, rpc-planning, rpc-super-admin). Here we
// compose those slices into the full per-channel maps, keep the generic entry
// points, and re-export every name so the public API is identical — call sites
// keep importing from "@/lib/admin/rpc" unchanged.

import type { AppSupabaseClient } from "@/lib/supabase/types";
import {
  callUuidRpc,
  callJsonRpc,
  callTextRpc,
  type UuidRpcResult,
  type JsonRpcResult,
  type TextRpcResult,
} from "@/lib/shared/rpc";

import type { GroupUuidRpcArgs } from "./rpc-groups";
import type { PeopleUuidRpcArgs } from "./rpc-people";
import type { CareUuidRpcArgs } from "./rpc-care";
import type { PlanningUuidRpcArgs } from "./rpc-planning";
import type {
  SuperAdminUuidRpcArgs,
  SuperAdminJsonRpcArgs,
  SuperAdminTextRpcArgs,
} from "./rpc-super-admin";

// Re-export every named argument shape so the public API is identical to the
// pre-split module. These predate the args maps and are imported directly by
// action / validation modules.
export type {
  GroupRpcArgs,
  AdminCreateGroupCalendarEventArgs,
  AdminUpdateGroupCalendarEventArgs,
} from "./rpc-groups";
export type {
  AdminCreateGuestArgs,
  AdminUpdateGuestPipelineArgs,
  AdminCreateFollowUpArgs,
  AdminUpdateFollowUpStatusArgs,
} from "./rpc-people";
export type {
  AdminUpsertShepherdCareProfileArgs,
  AdminLogShepherdCareInteractionArgs,
  AdminCreateShepherdCareFollowUpArgs,
  AdminUpdateShepherdCareFollowUpStatusArgs,
  AdminUpdateShepherdCareFollowUpArgs,
  AdminEnrollPrivateNoteKeysArgs,
  AdminUpsertShepherdCarePrivateNoteArgs,
  AdminAddPrivateNoteKeySlotArgs,
  AdminRotatePrivateNoteRecoveryArgs,
  AdminCreateOverShepherdArgs,
  AdminUpdateOverShepherdArgs,
  AdminAssignShepherdToOverShepherdArgs,
  AdminEndShepherdCoverageAssignmentArgs,
  AdminWriteCareNoteArgs,
  AdminWritePrayerRequestArgs,
  SetNoteTransparencyGrantArgs,
} from "./rpc-care";
export type {
  AdminCreateLaunchPlanningScenarioArgs,
  AdminUpdateLaunchPlanningScenarioArgs,
  AdminUpsertGroupHealthAssessmentArgs,
  AdminSetGroupHealthRatingsArgs,
  AdminSetLeaderRubricGradeArgs,
  AdminSetGroupRubricGradeArgs,
} from "./rpc-planning";

// ---------------------------------------------------------------------------
// The composed uuid-channel args map. Keys are the LITERAL Postgres function
// names; every RPC here returns a uuid on success (read through
// `readUuidRpcData`). No-argument RPCs take `Record<string, never>` -- pass
// `{}` at the call site. Composed from the per-domain slices so the shape stays
// structurally identical to the pre-split single map.
// ---------------------------------------------------------------------------

export type AdminUuidRpcArgs = GroupUuidRpcArgs &
  PeopleUuidRpcArgs &
  CareUuidRpcArgs &
  PlanningUuidRpcArgs &
  SuperAdminUuidRpcArgs;

// ---------------------------------------------------------------------------
// The composed jsonb-channel args map. These RPCs return a structured jsonb
// document (passed through as `unknown`; the action layer validates its shape).
// ---------------------------------------------------------------------------

export type AdminJsonRpcArgs = SuperAdminJsonRpcArgs;

// ---------------------------------------------------------------------------
// The composed text-channel args map. These RPCs return a plain `text` scalar
// that is NOT a uuid, so they must not go through the uuid trust-boundary read.
// ---------------------------------------------------------------------------

export type AdminTextRpcArgs = SuperAdminTextRpcArgs;

// ---------------------------------------------------------------------------
// Generic entry points. The literal key pins the Postgres function name and
// its argument shape together at the call site.
// ---------------------------------------------------------------------------

export function adminRpc<K extends keyof AdminUuidRpcArgs>(
  client: AppSupabaseClient,
  name: K,
  args: AdminUuidRpcArgs[K]
): Promise<UuidRpcResult> {
  return callUuidRpc(client, name, args);
}

export function adminJsonRpc<K extends keyof AdminJsonRpcArgs>(
  client: AppSupabaseClient,
  name: K,
  args: AdminJsonRpcArgs[K]
): Promise<JsonRpcResult> {
  return callJsonRpc(client, name, args);
}

export function adminTextRpc<K extends keyof AdminTextRpcArgs>(
  client: AppSupabaseClient,
  name: K,
  args: AdminTextRpcArgs[K]
): Promise<TextRpcResult> {
  return callTextRpc(client, name, args);
}
