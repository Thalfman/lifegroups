"use server";

// Canonical home — do NOT retire or warn-log on invoke (ADR 0033). Although this
// file lives in the pre-pivot-named /admin/group-health folder, this action is
// imported by the canonical Care surface
// (components/admin/care/group-rubric-grade-entry.tsx), so any deprecation here
// would fire on canonical use.

import {
  runAdminWriteAction,
  type AdminWriteActionSpec,
  type ActionInput,
} from "@/lib/admin/run-action";
import type { ActionResult } from "@/lib/admin/action-result";
import {
  validateGroupRubricGradePayload,
  type GroupRubricGradePayload,
} from "@/lib/admin/validation";
import { writeRubricGrade } from "@/lib/admin/write-rubric-grade";

// Group-Health Grade entry in Care (#377 / ADR 0018, Pivot slice 4). The grader
// posts per-criterion 0–100 scores + an optional letter override for a group's
// ministry year; the write recomputes the A–F letter SERVER-SIDE via the pure
// facade (over the configured rubric) so the persisted letter is always the
// engine's output and never a client-supplied letter, then goes through the
// audited SECURITY DEFINER RPC. That read-rubric → recompute → map-args → RPC
// pipeline lives in the writeRubricGrade module (#791), so the spec's `rpc`
// field is a one-line delegation keyed by the "group" discriminator.

const SET_GRADE_SPEC: AdminWriteActionSpec<
  GroupRubricGradePayload,
  { id: string }
> = {
  name: "admin.group_health.set_rubric_grade",
  // The form posts the scores JSON + ministry year alongside group_id and the
  // optional override letter/scope; name every lifted field.
  keys: [
    "group_id",
    "ministry_year",
    "criterion_scores",
    "override_letter",
    "override_scope",
  ],
  validate: validateGroupRubricGradePayload,
  fields: (_actor, value) => ({
    target_group_id: value.group_id,
    ministry_year: value.ministry_year,
  }),
  rpc: (client, value) => writeRubricGrade(client, "group", value),
  // The grade-entry control lives on the per-leader Care surface (the group
  // panel of /admin/shepherd-care/[id]) and surfaces on the Care area; revalidate
  // both so a saved grade shows immediately.
  revalidate: () => ["/admin/care", "/admin/shepherd-care"],
  noDataError: "The grade wasn't saved. Please try again.",
};

export async function adminSetGroupRubricGrade(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<GroupRubricGradePayload>
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(SET_GRADE_SPEC, prev, input);
}
