"use server";

import { requireSuperAdminSession } from "@/lib/auth/session";
import { type ActionResult } from "@/lib/admin/action-result";
import {
  runAdminWriteAction,
  type AdminWriteActionSpec,
} from "@/lib/admin/run-action";
import {
  validateAssignCoveragePayload,
  validateEndCoveragePayload,
  type AssignCoveragePayload,
  type EndCoveragePayload,
} from "@/lib/admin/validation";
import {
  rpcAdminAssignShepherdToOverShepherd,
  rpcAdminEndShepherdCoverageAssignment,
} from "@/lib/admin/rpc";

const REVALIDATE_PATH = "/admin/super-admin";

// Phase SAC.4 (#164): assign / end over-shepherd → leader coverage from the
// console. Reuses the existing Phase 5D.1 coverage RPCs (they gate on
// auth_is_admin(), which super_admin satisfies). Writes flow to
// shepherd_coverage_assignments — the same table the cadence-tier derivation
// and over-shepherd read scoping already read — so the edits show up on those
// surfaces without rebuilding them. The super-admin gate here keeps the console
// caller boundary consistent with the rest of the console.
const ASSIGN_COVERAGE_SPEC: AdminWriteActionSpec<
  AssignCoveragePayload,
  { id: string }
> = {
  name: "super_admin.assign_coverage",
  auth: requireSuperAdminSession,
  keys: ["shepherd_profile_id", "over_shepherd_id", "assigned_at"],
  validate: validateAssignCoveragePayload,
  fields: (_actor, value) => ({
    shepherd_profile_id: value.shepherd_profile_id,
    over_shepherd_id: value.over_shepherd_id,
  }),
  rpc: (client, value) =>
    rpcAdminAssignShepherdToOverShepherd(client, {
      p_shepherd_profile_id: value.shepherd_profile_id,
      p_over_shepherd_id: value.over_shepherd_id,
      p_assigned_at: value.assigned_at,
    }),
  revalidate: () => REVALIDATE_PATH,
  noDataError: "The coverage assignment was not saved. Please try again.",
};

export async function superAdminAssignCoverage(
  prev: ActionResult<{ id: string }> | undefined,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(ASSIGN_COVERAGE_SPEC, prev, input);
}

const END_COVERAGE_SPEC: AdminWriteActionSpec<
  EndCoveragePayload,
  { id: string }
> = {
  name: "super_admin.end_coverage",
  auth: requireSuperAdminSession,
  keys: ["assignment_id", "ended_at"],
  validate: validateEndCoveragePayload,
  fields: (_actor, value) => ({ assignment_id: value.assignment_id }),
  rpc: (client, value) =>
    rpcAdminEndShepherdCoverageAssignment(client, {
      p_assignment_id: value.assignment_id,
      p_ended_at: value.ended_at,
    }),
  revalidate: () => REVALIDATE_PATH,
  noDataError: "The coverage assignment was not ended. Please try again.",
};

export async function superAdminEndCoverage(
  prev: ActionResult<{ id: string }> | undefined,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(END_COVERAGE_SPEC, prev, input);
}
