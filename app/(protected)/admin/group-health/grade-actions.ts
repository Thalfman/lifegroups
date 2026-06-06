"use server";

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
import { rpcAdminSetGroupRubricGrade } from "@/lib/admin/rpc";
import { decodeRubricCriteria } from "@/lib/admin/health-rubric";
import { resolveGroupRubricGrade } from "@/lib/admin/group-rubric-grade";
import { fetchHealthRubric } from "@/lib/supabase/health-rubric-reads";
import { currentPeriodMonthIso } from "@/lib/admin/ministry-year";

// Group-Health Grade entry in Care (#377 / ADR 0018, Pivot slice 4). The grader
// posts per-criterion 0–100 scores + an optional letter override for a group's
// ministry year; this action recomputes the A–F letter SERVER-SIDE via the pure
// facade (over the configured rubric) before writing, so the persisted letter is
// always the engine's output and never a client-supplied letter. The write goes
// through the audited SECURITY DEFINER RPC.

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
  rpc: async (client, value) => {
    // Read the configured group rubric and recompute the effective letter via
    // the pure facade, so the persisted computed_letter is the engine's output.
    const rubricRes = await fetchHealthRubric(client, "group");
    if (rubricRes.error)
      return { data: null, error: { message: "rubric_read_failed" } };
    const criteria = decodeRubricCriteria(rubricRes.data?.criteria ?? null);

    const periodMonth = currentPeriodMonthIso();
    const resolved = resolveGroupRubricGrade({
      rubric: { criteria },
      scores: value.criterion_scores,
      override:
        value.override_letter && value.override_scope
          ? { letter: value.override_letter, scope: value.override_scope }
          : null,
      periodMonth,
    });

    return rpcAdminSetGroupRubricGrade(client, {
      p_group_id: value.group_id,
      p_ministry_year: value.ministry_year,
      p_criterion_scores: value.criterion_scores,
      // The engine's computed letter (pre-override) — the Multiplication pillar
      // source. The override is persisted separately below.
      p_computed_letter: resolved.computed_letter,
      p_override_letter: value.override_letter,
      p_override_scope: value.override_scope,
      // A this-month override expires by the month it was set for; persist that
      // month so the read-time resolution can apply the scope. Null when there
      // is no override.
      p_override_period_month:
        value.override_letter && value.override_scope ? periodMonth : null,
    });
  },
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
