"use server";

import {
  validateAssignShepherdCoveragePayload,
  validateCreateOverShepherdPayload,
  validateEndShepherdCoverageAssignmentPayload,
  validateLogShepherdCareInteractionPayload,
  validateUpdateOverShepherdPayload,
  validateUpsertShepherdCareProfilePayload,
  type AssignShepherdCoveragePayload,
  type CreateOverShepherdPayload,
  type EndShepherdCoverageAssignmentPayload,
  type LogShepherdCareInteractionPayload,
  type UpdateOverShepherdPayload,
  type UpsertShepherdCareProfilePayload,
} from "@/lib/admin/validation";
import { type ActionResult } from "@/lib/admin/action-result";
import {
  runAdminWriteAction,
  type ActionInput,
  type AdminWriteActionSpec,
} from "@/lib/admin/run-action";
import {
  rpcAdminAssignShepherdToOverShepherd,
  rpcAdminCreateOverShepherd,
  rpcAdminEndShepherdCoverageAssignment,
  rpcAdminLogShepherdCareInteraction,
  rpcAdminUpdateOverShepherd,
  rpcAdminUpsertShepherdCareProfile,
} from "@/lib/admin/rpc";

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

const CREATE_OVER_SHEPHERD_KEYS = ["full_name", "email", "phone", "notes"] as const;

const UPDATE_OVER_SHEPHERD_KEYS = [
  "over_shepherd_id",
  "full_name",
  "email",
  "phone",
  "notes",
  "active",
] as const;

const ASSIGN_COVERAGE_KEYS = [
  "shepherd_profile_id",
  "over_shepherd_id",
  "assigned_at",
] as const;

// end_coverage forms attach the shepherd_profile_id alongside the
// assignment id so the action can revalidate the right detail page on
// success. It is intentionally optional and NOT passed to the RPC -- the
// RPC reads the canonical shepherd_profile_id from the assignment row.
const END_COVERAGE_KEYS = ["assignment_id", "ended_at", "shepherd_profile_id"] as const;

function shepherdCarePaths(shepherdProfileId?: string): string[] {
  return [
    "/admin/shepherd-care",
    ...(shepherdProfileId ? [`/admin/shepherd-care/${shepherdProfileId}`] : []),
  ];
}

function overShepherdPaths(overShepherdId?: string): string[] {
  return [
    "/admin/shepherd-care",
    "/admin/shepherd-care/over-shepherds",
    ...(overShepherdId ? [`/admin/shepherd-care/over-shepherds/${overShepherdId}`] : []),
  ];
}

// ----- adminUpsertShepherdCareProfile -------------------------------------

const UPSERT_PROFILE_SPEC: AdminWriteActionSpec<
  UpsertShepherdCareProfilePayload,
  { id: string }
> = {
  name: "admin.shepherd_care.upsert_profile",
  keys: UPSERT_KEYS,
  validate: validateUpsertShepherdCareProfilePayload,
  fields: (_actor, value) => ({ target_shepherd_profile_id: value.shepherd_profile_id }),
  okFields: (value) => ({
    status_set: value.set_current_status,
    next_touchpoint_set: value.set_next_touchpoint_due,
    summary_set: value.set_admin_summary,
  }),
  rpc: (client, value) =>
    rpcAdminUpsertShepherdCareProfile(client, {
      p_shepherd_profile_id: value.shepherd_profile_id,
      p_current_status: value.current_status,
      p_set_current_status: value.set_current_status,
      p_next_touchpoint_due: value.next_touchpoint_due,
      p_set_next_touchpoint_due: value.set_next_touchpoint_due,
      p_admin_summary: value.admin_summary,
      p_set_admin_summary: value.set_admin_summary,
    }),
  revalidate: (value) => shepherdCarePaths(value.shepherd_profile_id),
  noDataError: "The care profile wasn't saved. Please try again.",
};

export async function adminUpsertShepherdCareProfile(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<UpsertShepherdCareProfilePayload>,
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
  fields: (_actor, value) => ({ target_shepherd_profile_id: value.shepherd_profile_id }),
  okFields: (value) => ({
    interaction_type: value.interaction_type,
    has_notes: value.notes !== null,
  }),
  rpc: (client, value) =>
    rpcAdminLogShepherdCareInteraction(client, {
      p_shepherd_profile_id: value.shepherd_profile_id,
      p_interaction_at: value.interaction_at,
      p_interaction_type: value.interaction_type,
      p_notes: value.notes,
      p_set_next_touchpoint_due: value.set_next_touchpoint_due,
      p_next_touchpoint_due: value.next_touchpoint_due,
      p_set_current_status: value.set_current_status,
      p_current_status: value.current_status,
    }),
  revalidate: (value) => shepherdCarePaths(value.shepherd_profile_id),
  noDataError: "The interaction wasn't saved. Please try again.",
};

export async function adminLogShepherdCareInteraction(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<LogShepherdCareInteractionPayload>,
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(LOG_INTERACTION_SPEC, prev, input);
}

// ----- Phase 5D.1 — over-shepherd coverage actions ------------------------

// ----- adminCreateOverShepherd --------------------------------------------

const CREATE_OVER_SHEPHERD_SPEC: AdminWriteActionSpec<
  CreateOverShepherdPayload,
  { id: string }
> = {
  name: "admin.over_shepherd.create",
  keys: CREATE_OVER_SHEPHERD_KEYS,
  validate: validateCreateOverShepherdPayload,
  okFields: (value) => ({
    has_email: value.email !== null,
    has_phone: value.phone !== null,
    has_notes: value.notes !== null,
  }),
  rpc: (client, value) =>
    rpcAdminCreateOverShepherd(client, {
      p_full_name: value.full_name,
      p_email: value.email,
      p_phone: value.phone,
      p_notes: value.notes,
    }),
  revalidate: () => overShepherdPaths(),
  noDataError: "The over-shepherd wasn't saved. Please try again.",
};

export async function adminCreateOverShepherd(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<CreateOverShepherdPayload>,
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(CREATE_OVER_SHEPHERD_SPEC, prev, input);
}

// ----- adminUpdateOverShepherd --------------------------------------------

const UPDATE_OVER_SHEPHERD_SPEC: AdminWriteActionSpec<
  UpdateOverShepherdPayload,
  { id: string }
> = {
  name: "admin.over_shepherd.update",
  keys: UPDATE_OVER_SHEPHERD_KEYS,
  validate: validateUpdateOverShepherdPayload,
  fields: (_actor, value) => ({ target_over_shepherd_id: value.over_shepherd_id }),
  okFields: (value) => ({
    active: value.active,
    has_email: value.email !== null,
    has_phone: value.phone !== null,
    has_notes: value.notes !== null,
  }),
  rpc: (client, value) =>
    rpcAdminUpdateOverShepherd(client, {
      p_over_shepherd_id: value.over_shepherd_id,
      p_full_name: value.full_name,
      p_email: value.email,
      p_phone: value.phone,
      p_notes: value.notes,
      p_active: value.active,
    }),
  revalidate: (value) => overShepherdPaths(value.over_shepherd_id),
  noDataError: "The over-shepherd wasn't updated. Please try again.",
};

export async function adminUpdateOverShepherd(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<UpdateOverShepherdPayload>,
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(UPDATE_OVER_SHEPHERD_SPEC, prev, input);
}

// ----- adminAssignShepherdCoverage ----------------------------------------

const ASSIGN_COVERAGE_SPEC: AdminWriteActionSpec<
  AssignShepherdCoveragePayload,
  { id: string }
> = {
  name: "admin.shepherd_coverage.assign",
  keys: ASSIGN_COVERAGE_KEYS,
  validate: validateAssignShepherdCoveragePayload,
  fields: (_actor, value) => ({ target_shepherd_profile_id: value.shepherd_profile_id }),
  okFields: (value) => ({ over_shepherd_id: value.over_shepherd_id }),
  rpc: (client, value) =>
    rpcAdminAssignShepherdToOverShepherd(client, {
      p_shepherd_profile_id: value.shepherd_profile_id,
      p_over_shepherd_id: value.over_shepherd_id,
      p_assigned_at: value.assigned_at,
    }),
  revalidate: (value) => [
    ...shepherdCarePaths(value.shepherd_profile_id),
    ...overShepherdPaths(value.over_shepherd_id),
  ],
  noDataError: "The coverage assignment wasn't saved. Please try again.",
};

export async function adminAssignShepherdCoverage(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<AssignShepherdCoveragePayload>,
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(ASSIGN_COVERAGE_SPEC, prev, input);
}

// ----- adminEndShepherdCoverage -------------------------------------------

const END_COVERAGE_SPEC: AdminWriteActionSpec<
  EndShepherdCoverageAssignmentPayload,
  { id: string }
> = {
  name: "admin.shepherd_coverage.end",
  keys: END_COVERAGE_KEYS,
  validate: validateEndShepherdCoverageAssignmentPayload,
  fields: (_actor, value) => ({ target_assignment_id: value.assignment_id }),
  rpc: (client, value) =>
    rpcAdminEndShepherdCoverageAssignment(client, {
      p_assignment_id: value.assignment_id,
      p_ended_at: value.ended_at,
    }),
  revalidate: (_value, raw) => {
    const shepherdProfileId =
      typeof raw.shepherd_profile_id === "string" ? raw.shepherd_profile_id : undefined;
    return [...shepherdCarePaths(shepherdProfileId), ...overShepherdPaths()];
  },
  noDataError: "The coverage assignment wasn't ended. Please try again.",
};

export async function adminEndShepherdCoverage(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<EndShepherdCoverageAssignmentPayload>,
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(END_COVERAGE_SPEC, prev, input);
}
