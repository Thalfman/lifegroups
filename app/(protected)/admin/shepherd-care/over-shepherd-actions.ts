"use server";

// Canonical home — do NOT retire or warn-log on invoke (ADR 0033). Although this
// file lives in the pre-pivot-named /admin/shepherd-care folder, these actions
// are imported by the canonical Care surface (components/admin/shepherd-care/*),
// so any deprecation here would fire on canonical use.

// Phase 5D.1 — over-shepherd + coverage actions.

import {
  validateAssignShepherdCoveragePayload,
  validateCreateOverShepherdPayload,
  validateEndShepherdCoverageAssignmentPayload,
  validateSetOverShepherdActivePayload,
  validateUpdateOverShepherdPayload,
  type AssignShepherdCoveragePayload,
  type CreateOverShepherdPayload,
  type EndShepherdCoverageAssignmentPayload,
  type SetOverShepherdActivePayload,
  type UpdateOverShepherdPayload,
} from "@/lib/admin/validation";
import { type ActionResult } from "@/lib/admin/action-result";
import {
  runAdminWriteAction,
  type ActionInput,
  type AdminWriteActionSpec,
} from "@/lib/admin/run-action";
import { adminRpc } from "@/lib/admin/rpc";
import { toRpcArgs } from "@/lib/shared/rpc-args";

const CREATE_OVER_SHEPHERD_KEYS = [
  "full_name",
  "email",
  "phone",
  "notes",
] as const;

const UPDATE_OVER_SHEPHERD_KEYS = [
  "over_shepherd_id",
  "full_name",
  "email",
  "phone",
  "notes",
  "active",
] as const;

const SET_OVER_SHEPHERD_ACTIVE_KEYS = ["over_shepherd_id", "active"] as const;

const ASSIGN_COVERAGE_KEYS = [
  "shepherd_profile_id",
  "over_shepherd_id",
  "assigned_at",
] as const;

// end_coverage forms attach the shepherd_profile_id alongside the
// assignment id so the action can revalidate the right detail page on
// success. It is intentionally optional and NOT passed to the RPC -- the
// RPC reads the canonical shepherd_profile_id from the assignment row.
const END_COVERAGE_KEYS = [
  "assignment_id",
  "ended_at",
  "shepherd_profile_id",
] as const;

// Kept file-local (duplicated across the shepherd-care `*-actions.ts`
// siblings, like care-notes-actions.ts's careSubjectPaths): the
// revalidate-path fitness extractor resolves same-file declarations only.
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
    ...(overShepherdId
      ? [`/admin/shepherd-care/over-shepherds/${overShepherdId}`]
      : []),
  ];
}

// Archiving an over-shepherd ends coverage for every leader they covered (#423),
// so each of those leaders' detail pages now shows the wrong coverage. We don't
// know that (unbounded) set of leader ids in the action, and the pages are
// force-dynamic so the server re-renders fresh — but the client Router Cache can
// still serve a stale copy. Invalidate the whole leader-detail route in one call
// so they refresh, mirroring how the assign/end-coverage actions revalidate the
// specific leader they touch. (PR #428 review.)
const LEADER_DETAIL_ROUTE = {
  path: "/admin/shepherd-care/[profileId]",
  type: "page",
} as const;

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
    adminRpc(
      client,
      "admin_create_over_shepherd",
      toRpcArgs(value, CREATE_OVER_SHEPHERD_KEYS)
    ),
  revalidate: () => overShepherdPaths(),
  noDataError: "The over-shepherd wasn't saved. Please try again.",
};

export async function adminCreateOverShepherd(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<CreateOverShepherdPayload>
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
  fields: (_actor, value) => ({
    target_over_shepherd_id: value.over_shepherd_id,
  }),
  okFields: (value) => ({
    active: value.active,
    has_email: value.email !== null,
    has_phone: value.phone !== null,
    has_notes: value.notes !== null,
  }),
  rpc: (client, value) =>
    adminRpc(
      client,
      "admin_update_over_shepherd",
      toRpcArgs(value, UPDATE_OVER_SHEPHERD_KEYS)
    ),
  revalidate: (value) => [
    ...overShepherdPaths(value.over_shepherd_id),
    ...(value.active === false ? [LEADER_DETAIL_ROUTE] : []),
  ],
  noDataError: "The over-shepherd wasn't updated. Please try again.",
};

export async function adminUpdateOverShepherd(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<UpdateOverShepherdPayload>
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(UPDATE_OVER_SHEPHERD_SPEC, prev, input);
}

// ----- adminSetOverShepherdActive -----------------------------------------
// Focused archive/restore toggle for the list + detail buttons — flips only the
// active flag (the RPC maintains archived_at) without re-sending the record.

const SET_OVER_SHEPHERD_ACTIVE_SPEC: AdminWriteActionSpec<
  SetOverShepherdActivePayload,
  { id: string }
> = {
  name: "admin.over_shepherd.set_active",
  keys: SET_OVER_SHEPHERD_ACTIVE_KEYS,
  validate: validateSetOverShepherdActivePayload,
  fields: (_actor, value) => ({
    target_over_shepherd_id: value.over_shepherd_id,
  }),
  okFields: (value) => ({ active: value.active }),
  rpc: (client, value) =>
    adminRpc(client, "admin_set_over_shepherd_active", {
      p_over_shepherd_id: value.over_shepherd_id,
      p_active: value.active,
    }),
  revalidate: (value) => [
    ...overShepherdPaths(value.over_shepherd_id),
    ...(value.active === false ? [LEADER_DETAIL_ROUTE] : []),
  ],
  noDataError: "The over-shepherd wasn't updated. Please try again.",
};

export async function adminSetOverShepherdActive(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<SetOverShepherdActivePayload>
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(SET_OVER_SHEPHERD_ACTIVE_SPEC, prev, input);
}

// ----- adminAssignShepherdCoverage ----------------------------------------

const ASSIGN_COVERAGE_SPEC: AdminWriteActionSpec<
  AssignShepherdCoveragePayload,
  { id: string }
> = {
  name: "admin.shepherd_coverage.assign",
  keys: ASSIGN_COVERAGE_KEYS,
  validate: validateAssignShepherdCoveragePayload,
  fields: (_actor, value) => ({
    target_shepherd_profile_id: value.shepherd_profile_id,
  }),
  okFields: (value) => ({ over_shepherd_id: value.over_shepherd_id }),
  rpc: (client, value) =>
    adminRpc(client, "admin_assign_shepherd_to_over_shepherd", {
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
  input: ActionInput<AssignShepherdCoveragePayload>
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
    adminRpc(client, "admin_end_shepherd_coverage_assignment", {
      p_assignment_id: value.assignment_id,
      p_ended_at: value.ended_at,
    }),
  revalidate: (_value, raw) => {
    const shepherdProfileId =
      typeof raw.shepherd_profile_id === "string"
        ? raw.shepherd_profile_id
        : undefined;
    return [...shepherdCarePaths(shepherdProfileId), ...overShepherdPaths()];
  },
  noDataError: "The coverage assignment wasn't ended. Please try again.",
};

export async function adminEndShepherdCoverage(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<EndShepherdCoverageAssignmentPayload>
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(END_COVERAGE_SPEC, prev, input);
}
