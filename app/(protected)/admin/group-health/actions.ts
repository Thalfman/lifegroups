"use server";

import {
  runAdminWriteAction,
  type AdminWriteActionSpec,
  type ActionInput,
} from "@/lib/admin/run-action";
import type { ActionResult } from "@/lib/admin/action-result";
import {
  validateGroupIdPayload,
  validateGroupHealthRatingsPayload,
  type GroupIdPayload,
  type GroupHealthRatingsPayload,
} from "@/lib/admin/validation";
import {
  rpcAdminUpsertGroupHealthAssessment,
  rpcAdminSetGroupHealthRatings,
} from "@/lib/admin/rpc";
import {
  attendanceConsistency,
  computeGrade,
  dimensionScoresFromInputs,
  type GroupHealthRubricConfig,
} from "@/lib/admin/group-health";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import {
  currentPeriodMonthIso,
  fetchGroupAttendanceWeeks,
  fetchGroupHealthRatings,
  fetchGroupHealthRubric,
} from "@/lib/admin/group-health-read";

// Shared recompute: read the configured rubric and the group's rolling
// attendance, fold them with the supplied 1–5 ratings into the composite grade.
// The rolling-window and weighting math live in the unit-tested pure module; a
// failed rubric/attendance read returns an error rather than grading on a null.
type Recomputed = {
  rubric: GroupHealthRubricConfig;
  attendance_pct: number | null;
  attendance_weeks_counted: number;
  computed_numeric: number | null;
  computed_letter: string | null;
};

async function recomputeGrade(
  client: AppSupabaseClient,
  groupId: string,
  ratings: { spiritual_growth_score: number | null; group_question_score: number | null },
): Promise<{ data: Recomputed; error: null } | { data: null; error: { message: string } }> {
  const rubricRes = await fetchGroupHealthRubric(client);
  if (rubricRes.error) return { data: null, error: { message: "rubric_read_failed" } };
  const weeksRes = await fetchGroupAttendanceWeeks(
    client,
    groupId,
    rubricRes.data.attendance_window_weeks,
  );
  if (weeksRes.error) return { data: null, error: { message: "attendance_read_failed" } };

  const attendance = attendanceConsistency(weeksRes.data, rubricRes.data);
  const grade = computeGrade(
    dimensionScoresFromInputs({ attendance_pct: attendance.rolling_pct, ...ratings }),
    rubricRes.data,
  );

  return {
    data: {
      rubric: rubricRes.data,
      attendance_pct: attendance.rolling_pct,
      attendance_weeks_counted: attendance.weeks_counted,
      computed_numeric: grade.numeric,
      computed_letter: grade.letter,
    },
    error: null,
  };
}

// #127 tracer write, now folding in any 1–5 ratings already on the month's row
// so a Recompute keeps the composite grade coherent with what the admin entered.
const RECOMPUTE_SPEC: AdminWriteActionSpec<GroupIdPayload, { id: string }> = {
  name: "admin.group_health.recompute_assessment",
  keys: ["group_id"],
  validate: validateGroupIdPayload,
  fields: (_actor, value) => ({ target_group_id: value.group_id }),
  rpc: async (client, value) => {
    const ratingsRes = await fetchGroupHealthRatings(client, value.group_id);
    if (ratingsRes.error) {
      return { data: null, error: { message: "ratings_read_failed" } };
    }
    const recomputed = await recomputeGrade(client, value.group_id, {
      spiritual_growth_score: ratingsRes.data.spiritual_growth_score,
      group_question_score: ratingsRes.data.group_question_score,
    });
    if (recomputed.error) return { data: null, error: recomputed.error };
    return rpcAdminUpsertGroupHealthAssessment(client, {
      p_group_id: value.group_id,
      p_period_month: currentPeriodMonthIso(),
      p_attendance_pct: recomputed.data.attendance_pct,
      p_attendance_weeks_counted: recomputed.data.attendance_weeks_counted,
      p_computed_numeric: recomputed.data.computed_numeric,
      p_computed_letter: recomputed.data.computed_letter,
    });
  },
  revalidate: () => "/admin/group-health",
  noDataError: "The assessment wasn't saved. Please try again.",
};

export async function adminRecomputeGroupHealthAssessment(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<GroupIdPayload>,
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(RECOMPUTE_SPEC, prev, input);
}

// Plain-form wrapper so the surface can recompute from a server component
// <form action={...}> without a client island.
export async function recomputeGroupHealthFormAction(
  formData: FormData,
): Promise<void> {
  await adminRecomputeGroupHealthAssessment(undefined, formData);
}

// #128 ratings write: capture the admin-entered spiritual-growth and/or relayed
// group-question 1–5 ratings for the current month, recompute the composite, and
// persist through the audited runner. Each dimension carries a `set_` flag; an
// untouched dimension keeps its prior value (merged from the persisted row) so a
// single-dimension edit never clobbers the other. The RPC forces the
// group-question leader-reported provenance flag server-side.
const RATINGS_SPEC: AdminWriteActionSpec<GroupHealthRatingsPayload, { id: string }> = {
  name: "admin.group_health.set_ratings",
  keys: ["group_id"],
  validate: validateGroupHealthRatingsPayload,
  fields: (_actor, value) => ({ target_group_id: value.group_id }),
  rpc: async (client, value) => {
    const priorRes = await fetchGroupHealthRatings(client, value.group_id);
    if (priorRes.error) {
      return { data: null, error: { message: "ratings_read_failed" } };
    }
    // Merge the edit onto the persisted values: a set dimension takes the new
    // value (including an explicit clear to null); an untouched one is preserved.
    const spiritualScore = value.set_spiritual_growth
      ? value.spiritual_growth_score
      : priorRes.data.spiritual_growth_score;
    const spiritualNote = value.set_spiritual_growth
      ? value.spiritual_growth_note
      : priorRes.data.spiritual_growth_note;
    const questionScore = value.set_group_question
      ? value.group_question_score
      : priorRes.data.group_question_score;

    const recomputed = await recomputeGrade(client, value.group_id, {
      spiritual_growth_score: spiritualScore,
      group_question_score: questionScore,
    });
    if (recomputed.error) return { data: null, error: recomputed.error };

    return rpcAdminSetGroupHealthRatings(client, {
      p_group_id: value.group_id,
      p_period_month: currentPeriodMonthIso(),
      p_spiritual_growth_score: spiritualScore,
      p_spiritual_growth_note: spiritualNote,
      p_group_question_score: questionScore,
      p_attendance_pct: recomputed.data.attendance_pct,
      p_attendance_weeks_counted: recomputed.data.attendance_weeks_counted,
      p_computed_numeric: recomputed.data.computed_numeric,
      p_computed_letter: recomputed.data.computed_letter,
    });
  },
  revalidate: () => "/admin/group-health",
  noDataError: "The ratings weren't saved. Please try again.",
};

export async function adminSetGroupHealthRatings(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<GroupHealthRatingsPayload>,
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(RATINGS_SPEC, prev, input);
}

// Plain-form wrapper for the server-component rating editor.
export async function setGroupHealthRatingsFormAction(
  formData: FormData,
): Promise<void> {
  await adminSetGroupHealthRatings(undefined, formData);
}
