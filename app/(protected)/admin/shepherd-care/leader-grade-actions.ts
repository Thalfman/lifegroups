"use server";

import {
  runAdminWriteAction,
  type AdminWriteActionSpec,
  type ActionInput,
} from "@/lib/admin/run-action";
import type { ActionResult } from "@/lib/admin/action-result";
import {
  validateLeaderHealthGradePayload,
  type LeaderHealthGradePayload,
} from "@/lib/admin/validation";
import { writeRubricGrade } from "@/lib/admin/write-rubric-grade";

// Leader-Health Grade write action (#378 / ADR 0018, pivot slice 5). The Care
// grade-entry editor posts the per-criterion scores + ministry year + optional
// override; the read-rubric → recompute-letter → map-args → audited-RPC pipeline
// is owned by the shared writeRubricGrade module (#791/#792) and reached here via
// a one-line delegation keyed by the "leader" discriminator. Ministry-Admin-
// owned, so the default requireAdminSession path applies.
//
// The recompute lives server-side (inside the module) so the persisted
// computed_letter always agrees with the rubric the server holds — a stale client
// letter can never be trusted.
const SET_LEADER_GRADE_SPEC: AdminWriteActionSpec<
  LeaderHealthGradePayload,
  { id: string }
> = {
  name: "admin.care.set_leader_rubric_grade",
  keys: [
    "profile_id",
    "ministry_year",
    "criterion_scores",
    "override_letter",
    "override_scope",
  ],
  validate: validateLeaderHealthGradePayload,
  fields: (_actor, value) => ({
    target_profile_id: value.profile_id,
    ministry_year: value.ministry_year,
    scores_count: Object.keys(value.criterion_scores).length,
    overridden: value.override_letter !== null,
  }),
  rpc: (client, value) => writeRubricGrade(client, "leader", value),
  revalidate: (value) => [
    "/admin/care",
    "/admin/shepherd-care",
    `/admin/shepherd-care/${value.profile_id}`,
  ],
  noDataError: "The Shepherd-Health Grade wasn't saved. Please try again.",
};

export async function adminSetLeaderRubricGrade(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<LeaderHealthGradePayload>
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(SET_LEADER_GRADE_SPEC, prev, input);
}
