"use server";

// Canonical home — do NOT retire or warn-log on invoke (ADR 0033). Although this
// file lives in the pre-pivot-named /admin/shepherd-care folder, these actions
// are imported by the canonical Care surface (components/admin/shepherd-care/*),
// so any deprecation here would fire on canonical use.

// Subject scoping is enforced by the RPC + RLS (over_shepherd coverage /
// auth_is_admin), not a client-side `guard`. If a scoped admin tier ever lands,
// add a `guard` to the subject-scoped specs so an out-of-coverage target is a
// clean logged denial rather than a generic RPC error (ARCH-5).

import {
  validateLogShepherdCareInteractionPayload,
  validateUpsertShepherdCareProfilePayload,
  type LogShepherdCareInteractionPayload,
  type UpsertShepherdCareProfilePayload,
} from "@/lib/admin/validation";
import { type ActionResult } from "@/lib/admin/action-result";
import {
  runAdminWriteAction,
  type ActionInput,
  type AdminWriteActionSpec,
} from "@/lib/admin/run-action";
import { adminRpc } from "@/lib/admin/rpc";
import { toRpcArgs } from "@/lib/shared/rpc-args";

// Form-key lists double as toRpcArgs key lists where they match the RPC's
// p_* args exactly; specs whose form carries extra revalidation-only fields
// (shepherd_profile_id) declare a dedicated *_ARG_KEYS const instead.

// Kept file-local (duplicated across the shepherd-care `*-actions.ts`
// siblings, like care-notes-actions.ts's careSubjectPaths): the
// revalidate-path fitness extractor resolves same-file declarations only.
function shepherdCarePaths(shepherdProfileId?: string): string[] {
  return [
    "/admin/shepherd-care",
    ...(shepherdProfileId ? [`/admin/shepherd-care/${shepherdProfileId}`] : []),
  ];
}

const UPSERT_KEYS = [
  "shepherd_profile_id",
  "set_current_status",
  "current_status",
  "set_next_touchpoint_due",
  "next_touchpoint_due",
  "set_admin_summary",
  "admin_summary",
] as const;

const LOG_INTERACTION_KEYS = [
  "shepherd_profile_id",
  "interaction_at",
  "interaction_type",
  "notes",
  "set_next_touchpoint_due",
  "next_touchpoint_due",
  "set_current_status",
  "current_status",
] as const;

// ----- adminUpsertShepherdCareProfile -------------------------------------

const UPSERT_PROFILE_SPEC: AdminWriteActionSpec<
  UpsertShepherdCareProfilePayload,
  { id: string }
> = {
  name: "admin.shepherd_care.upsert_profile",
  keys: UPSERT_KEYS,
  validate: validateUpsertShepherdCareProfilePayload,
  fields: (_actor, value) => ({
    target_shepherd_profile_id: value.shepherd_profile_id,
  }),
  okFields: (value) => ({
    status_set: value.set_current_status,
    next_touchpoint_set: value.set_next_touchpoint_due,
    summary_set: value.set_admin_summary,
  }),
  rpc: (client, value) =>
    adminRpc(
      client,
      "admin_upsert_shepherd_care_profile",
      toRpcArgs(value, UPSERT_KEYS)
    ),
  // Care status feeds the Home dashboard's care cell (needs-attention count),
  // so revalidate "/admin" alongside the care surfaces.
  revalidate: (value) => [
    ...shepherdCarePaths(value.shepherd_profile_id),
    "/admin",
  ],
  noDataError: "The care profile wasn't saved. Please try again.",
};

export async function adminUpsertShepherdCareProfile(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<UpsertShepherdCareProfilePayload>
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(UPSERT_PROFILE_SPEC, prev, input);
}

// ----- adminLogShepherdCareInteraction ------------------------------------

const LOG_INTERACTION_SPEC: AdminWriteActionSpec<
  LogShepherdCareInteractionPayload,
  { id: string }
> = {
  name: "admin.shepherd_care.log_interaction",
  keys: LOG_INTERACTION_KEYS,
  validate: validateLogShepherdCareInteractionPayload,
  fields: (_actor, value) => ({
    target_shepherd_profile_id: value.shepherd_profile_id,
  }),
  okFields: (value) => ({
    interaction_type: value.interaction_type,
    has_notes: value.notes !== null,
  }),
  rpc: (client, value) =>
    adminRpc(
      client,
      "admin_log_shepherd_care_interaction",
      toRpcArgs(value, LOG_INTERACTION_KEYS)
    ),
  // last_contact_at feeds the Home dashboard's care cell (needs-attention
  // count), so revalidate "/admin" alongside the care surfaces.
  revalidate: (value) => [
    ...shepherdCarePaths(value.shepherd_profile_id),
    "/admin",
  ],
  noDataError: "The interaction wasn't saved. Please try again.",
};

export async function adminLogShepherdCareInteraction(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<LogShepherdCareInteractionPayload>
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(LOG_INTERACTION_SPEC, prev, input);
}
