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
import { rpcAdminSetLeaderRubricGrade } from "@/lib/admin/rpc";
import { resolveLeaderGrade } from "@/lib/admin/leader-rubric-grade";
import { fetchLeaderHealthRubric } from "@/lib/admin/leader-health-read";
import { currentPeriodMonthIso } from "@/lib/admin/ministry-year";

// Leader-Health Grade write action (#378 / ADR 0018, pivot slice 5). The Care
// grade-entry editor posts the per-criterion scores + ministry year + optional
// override; this action reads the current Leader-Health Rubric, recomputes the
// resolved grade via the pure facade (resolveLeaderGrade — the shared engine +
// override resolver, no second math), and persists the computed letter (+ raw
// scores and override) through the audited RPC. Ministry-Admin-owned, so the
// default requireAdminSession path applies.
//
// The recompute lives server-side so the persisted computed_letter always agrees
// with the rubric the server holds — a stale client letter can never be trusted.
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
  rpc: async (client, value) => {
    const rubricRes = await fetchLeaderHealthRubric(client);
    if (rubricRes.error)
      return { data: null, error: { message: "rubric_read_failed" } };

    const periodMonth = currentPeriodMonthIso();
    const resolved = resolveLeaderGrade({
      rubric: rubricRes.data,
      scores: value.criterion_scores,
      override:
        value.override_letter !== null && value.override_scope !== null
          ? {
              letter: value.override_letter,
              scope: value.override_scope,
              period_month: periodMonth,
            }
          : null,
      ministryYear: value.ministry_year,
      currentPeriodMonth: periodMonth,
    });

    return rpcAdminSetLeaderRubricGrade(client, {
      p_profile_id: value.profile_id,
      p_ministry_year: value.ministry_year,
      p_criterion_scores: value.criterion_scores,
      // Persist the rubric-computed letter (not the override) as computed_letter;
      // the override letter + scope are persisted separately so the surface can
      // resolve the effective letter and still show what the rubric said.
      p_computed_letter: resolved.computed_letter,
      p_override_letter: value.override_letter,
      p_override_scope: value.override_scope,
      p_override_period_month:
        value.override_letter !== null ? periodMonth : null,
    });
  },
  revalidate: (value) => [
    `/admin/shepherd-care/${value.profile_id}`,
    "/admin/care",
  ],
  noDataError: "The Leader-Health Grade wasn't saved. Please try again.",
};

export async function adminSetLeaderRubricGrade(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<LeaderHealthGradePayload>
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(SET_LEADER_GRADE_SPEC, prev, input);
}
