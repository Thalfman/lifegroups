"use server";

import {
  runAdminWriteAction,
  type AdminWriteActionSpec,
  type ActionInput,
} from "@/lib/admin/run-action";
import type { ActionResult } from "@/lib/admin/action-result";
import { validateGroupIdPayload, type GroupIdPayload } from "@/lib/admin/validation";
import { rpcAdminUpsertGroupHealthAssessment } from "@/lib/admin/rpc";
import {
  attendanceConsistency,
  computeGrade,
} from "@/lib/admin/group-health";
import {
  currentPeriodMonthIso,
  fetchGroupAttendanceWeeks,
} from "@/lib/admin/group-health-read";

// #127 tracer write: recompute a group's current-month attendance dimension +
// A-D grade and persist the snapshot through the audited admin runner. The
// rolling-window math is done in the unit-tested pure module before the RPC.
const RECOMPUTE_SPEC: AdminWriteActionSpec<GroupIdPayload, { id: string }> = {
  name: "admin.group_health.recompute_assessment",
  keys: ["group_id"],
  validate: validateGroupIdPayload,
  fields: (_actor, value) => ({ target_group_id: value.group_id }),
  rpc: async (client, value) => {
    const weeks = await fetchGroupAttendanceWeeks(client, value.group_id);
    const attendance = attendanceConsistency(weeks);
    const grade = computeGrade(
      attendance.rolling_pct === null
        ? {}
        : { attendance: attendance.rolling_pct },
    );
    return rpcAdminUpsertGroupHealthAssessment(client, {
      p_group_id: value.group_id,
      p_period_month: currentPeriodMonthIso(),
      p_attendance_pct: attendance.rolling_pct,
      p_attendance_weeks_counted: attendance.weeks_counted,
      p_computed_numeric: grade.numeric,
      p_computed_letter: grade.letter,
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
