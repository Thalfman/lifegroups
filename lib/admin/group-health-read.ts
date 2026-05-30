import "server-only";

import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { AttendanceWeekTally } from "@/lib/admin/group-health";
import {
  attendanceConsistency,
  computeGrade,
  BUILT_IN_GROUP_HEALTH_RUBRIC,
} from "@/lib/admin/group-health";

// Read side for the group-health tracer (#127). Admin-only data; these run
// behind the admin layout guard and the table's admin-only RLS.

// First day of the current month, UTC. The assessment period key.
export function currentPeriodMonthIso(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

// Aggregate the most-recent `limitWeeks` attendance sessions for a group into
// per-week present/absent/excused tallies the pure module can grade. Reads the
// existing (typed) attendance tables.
export async function fetchGroupAttendanceWeeks(
  client: AppSupabaseClient,
  groupId: string,
  limitWeeks: number = BUILT_IN_GROUP_HEALTH_RUBRIC.attendance_window_weeks,
): Promise<AttendanceWeekTally[]> {
  const { data: sessions } = await client
    .from("attendance_sessions")
    .select("id, meeting_week")
    .eq("group_id", groupId)
    .order("meeting_week", { ascending: false })
    .limit(limitWeeks);

  if (!sessions || sessions.length === 0) return [];

  const byId = new Map<string, AttendanceWeekTally>();
  for (const session of sessions) {
    byId.set(session.id, {
      meeting_week: session.meeting_week,
      present: 0,
      absent: 0,
      excused: 0,
    });
  }

  const { data: records } = await client
    .from("attendance_records")
    .select("session_id, attendance_status")
    .in("session_id", [...byId.keys()]);

  for (const record of records ?? []) {
    const tally = byId.get(record.session_id);
    if (!tally) continue;
    if (record.attendance_status === "present") tally.present += 1;
    else if (record.attendance_status === "absent") tally.absent += 1;
    else if (record.attendance_status === "excused") tally.excused += 1;
  }

  return [...byId.values()];
}

export type GroupHealthOverviewRow = {
  group_id: string;
  group_name: string;
  attendance_pct: number | null;
  attendance_weeks_counted: number;
  computed_letter: string | null;
  assessed: boolean;
};

type AssessmentReadRow = {
  group_id: string;
  attendance_pct: number | null;
  attendance_weeks_counted: number;
  computed_letter: string | null;
};

// Overview for the admin surface: every active group with its current-month
// assessment (if one has been computed yet).
//
// The new group_health_assessments table is not in the generated supabase
// schema types, so the select is cast in this one place — the same trust seam
// callUuidRpc uses for admin RPCs. Columns are listed explicitly (never *).
export async function listGroupHealthOverview(
  client: AppSupabaseClient,
  periodMonthIso: string = currentPeriodMonthIso(),
): Promise<GroupHealthOverviewRow[]> {
  const { data: groups } = await client
    .from("groups")
    .select("id, name")
    .neq("lifecycle_status", "closed")
    .order("name", { ascending: true });

  if (!groups || groups.length === 0) return [];

  const { data: assessments } = await (client as AppSupabaseClient)
    .from("group_health_assessments" as never)
    .select(
      "group_id, attendance_pct, attendance_weeks_counted, computed_letter" as never,
    )
    .eq("period_month" as never, periodMonthIso as never);

  const byGroup = new Map<string, AssessmentReadRow>();
  for (const row of (assessments as AssessmentReadRow[] | null) ?? []) {
    byGroup.set(row.group_id, row);
  }

  return groups.map((group) => {
    const assessment = byGroup.get(group.id);
    return {
      group_id: group.id,
      group_name: group.name,
      attendance_pct: assessment?.attendance_pct ?? null,
      attendance_weeks_counted: assessment?.attendance_weeks_counted ?? 0,
      computed_letter: assessment?.computed_letter ?? null,
      assessed: assessment !== undefined,
    };
  });
}

// Compute (without persisting) the attendance dimension + grade for a group, so
// the surface can preview the live figures. The write path persists the same
// numbers through the audited RPC.
export async function computeGroupHealthPreview(
  client: AppSupabaseClient,
  groupId: string,
) {
  const weeks = await fetchGroupAttendanceWeeks(client, groupId);
  const attendance = attendanceConsistency(weeks);
  const grade = computeGrade(
    attendance.rolling_pct === null ? {} : { attendance: attendance.rolling_pct },
  );
  return { attendance, grade };
}
