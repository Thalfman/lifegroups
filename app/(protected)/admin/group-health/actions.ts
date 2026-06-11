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
import { adminRpc } from "@/lib/admin/rpc";
import {
  attendanceConsistency,
  computeGrade,
  dimensionScoresFromInputs,
  type GroupHealthRubricConfig,
} from "@/lib/admin/group-health";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import {
  fetchGroupAttendanceWeeks,
  fetchGroupHealthRatings,
  fetchGroupHealthRubric,
} from "@/lib/admin/group-health-read";
import { currentPeriodMonthIso } from "@/lib/admin/ministry-year";

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
  ratings: {
    spiritual_growth_score: number | null;
    group_question_score: number | null;
  }
): Promise<
  { data: Recomputed; error: null } | { data: null; error: { message: string } }
> {
  const rubricRes = await fetchGroupHealthRubric(client);
  if (rubricRes.error)
    return { data: null, error: { message: "rubric_read_failed" } };
  const weeksRes = await fetchGroupAttendanceWeeks(
    client,
    groupId,
    rubricRes.data.attendance_window_weeks
  );
  if (weeksRes.error)
    return { data: null, error: { message: "attendance_read_failed" } };

  const attendance = attendanceConsistency(weeksRes.data, rubricRes.data);
  const grade = computeGrade(
    dimensionScoresFromInputs({
      attendance_pct: attendance.rolling_pct,
      ...ratings,
    }),
    rubricRes.data
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
    return adminRpc(client, "admin_upsert_group_health_assessment", {
      p_group_id: value.group_id,
      p_period_month: currentPeriodMonthIso(),
      p_attendance_pct: recomputed.data.attendance_pct,
      p_attendance_weeks_counted: recomputed.data.attendance_weeks_counted,
      p_computed_numeric: recomputed.data.computed_numeric,
      p_computed_letter: recomputed.data.computed_letter,
    });
  },
  // The shared editor drawer also opens from the group detail Health tab, so
  // refresh that route too — otherwise its server-rendered grade goes stale.
  revalidate: (value) => [
    "/admin/group-health",
    `/admin/groups/${value.group_id}`,
  ],
  noDataError: "The assessment wasn't saved. Please try again.",
};

export async function adminRecomputeGroupHealthAssessment(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<GroupIdPayload>
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(RECOMPUTE_SPEC, prev, input);
}

// #128 ratings write: capture the admin-entered spiritual-growth + relayed
// group-question 1–5 ratings (+ note) for the current month, recompute the
// composite, and persist through the audited runner. The editor submits the
// full state of both dimensions, so the validated payload IS the desired row (an
// empty score is an explicit clear) — no merge-from-prior needed. The RPC forces
// the group-question leader-reported provenance flag server-side.
const RATINGS_SPEC: AdminWriteActionSpec<
  GroupHealthRatingsPayload,
  { id: string }
> = {
  name: "admin.group_health.set_ratings",
  // The form posts both scores and the note alongside group_id; the runner's
  // default lift forwards only the listed FormData fields, so name them all.
  keys: [
    "group_id",
    "spiritual_growth_score",
    "spiritual_growth_note",
    "group_question_score",
    // Always lifted (the runner sets the key even when the checkbox is
    // unchecked), so the validator can tell a real drawer save — which may be
    // clearing the flag — from a legacy no-op object.
    "needs_follow_up",
    // The displayed (possibly carried) flag, so unchecking it on a group with
    // no current-month ratings still saves (clears the carried flag) instead of
    // being rejected as an empty no-op.
    "prior_needs_follow_up",
  ],
  validate: validateGroupHealthRatingsPayload,
  fields: (_actor, value) => ({ target_group_id: value.group_id }),
  rpc: async (client, value) => {
    const recomputed = await recomputeGrade(client, value.group_id, {
      spiritual_growth_score: value.spiritual_growth_score,
      group_question_score: value.group_question_score,
    });
    if (recomputed.error) return { data: null, error: recomputed.error };

    return adminRpc(client, "admin_set_group_health_ratings", {
      p_group_id: value.group_id,
      p_period_month: currentPeriodMonthIso(),
      p_spiritual_growth_score: value.spiritual_growth_score,
      p_spiritual_growth_note: value.spiritual_growth_note,
      p_group_question_score: value.group_question_score,
      p_needs_follow_up: value.needs_follow_up,
      p_attendance_pct: recomputed.data.attendance_pct,
      p_attendance_weeks_counted: recomputed.data.attendance_weeks_counted,
      p_computed_numeric: recomputed.data.computed_numeric,
      p_computed_letter: recomputed.data.computed_letter,
    });
  },
  // The shared editor drawer also opens from the group detail Health tab, so
  // refresh that route too — otherwise its server-rendered grade goes stale.
  revalidate: (value) => [
    "/admin/group-health",
    `/admin/groups/${value.group_id}`,
  ],
  noDataError: "The ratings weren't saved. Please try again.",
};

export async function adminSetGroupHealthRatings(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<GroupHealthRatingsPayload>
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(RATINGS_SPEC, prev, input);
}
