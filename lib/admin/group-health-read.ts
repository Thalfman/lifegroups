import "server-only";

import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { AttendanceWeekTally, GroupHealthRubricConfig } from "@/lib/admin/group-health";
import {
  attendanceConsistency,
  computeGrade,
  rubricFromMetricDefaults,
  BUILT_IN_GROUP_HEALTH_RUBRIC,
} from "@/lib/admin/group-health";
import { decodeMetricDefaults } from "@/lib/admin/metrics";
import { fetchMetricDefaults } from "@/lib/supabase/read-models";

// Read side for the group-health tracer (#127). Admin-only data; these run
// behind the admin layout guard and the table's admin-only RLS.
//
// Per the locked rubric, the *current* month recomputes on read: the overview
// computes each active group's live attendance grade from the configured rubric
// rather than trusting a possibly-stale persisted row. The persisted
// group_health_assessments table is the audit trail + frozen-history of closed
// months (and the home of #129's override); the manual Recompute action writes
// the same numbers through the audited RPC.

export type ReadResult<T> = { data: T; error: null } | { data: null; error: Error };

function wrapError(prefix: string, err: unknown): Error {
  if (err instanceof Error) return new Error(`${prefix}: ${err.message}`);
  return new Error(`${prefix}: ${String(err)}`);
}

// First day of the current month, UTC. The assessment period key.
export function currentPeriodMonthIso(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

// Build the rubric from the existing audited metric defaults so a tuned
// healthy-attendance threshold is honored (a missing settings row decodes to
// the documented defaults). Read failures propagate rather than silently
// falling back, so a transient error can't quietly grade on the wrong rubric.
export async function fetchGroupHealthRubric(
  client: AppSupabaseClient,
): Promise<ReadResult<GroupHealthRubricConfig>> {
  const res = await fetchMetricDefaults(client);
  if (res.error) return { data: null, error: wrapError("fetchGroupHealthRubric", res.error) };
  const defaults = decodeMetricDefaults(res.data);
  return { data: rubricFromMetricDefaults(defaults), error: null };
}

// Aggregate the most-recent `limitWeeks` attendance sessions for a group into
// per-week present/absent/excused tallies the pure module can grade. Read
// failures propagate: a caller must not treat an errored read as "no
// attendance" and overwrite a previously valid grade.
export async function fetchGroupAttendanceWeeks(
  client: AppSupabaseClient,
  groupId: string,
  limitWeeks: number = BUILT_IN_GROUP_HEALTH_RUBRIC.attendance_window_weeks,
): Promise<ReadResult<AttendanceWeekTally[]>> {
  const { data: sessions, error: sessionsError } = await client
    .from("attendance_sessions")
    .select("id, meeting_week")
    .eq("group_id", groupId)
    .order("meeting_week", { ascending: false })
    .limit(limitWeeks);

  if (sessionsError) {
    return { data: null, error: wrapError("fetchGroupAttendanceWeeks/sessions", sessionsError) };
  }
  if (!sessions || sessions.length === 0) return { data: [], error: null };

  const byId = new Map<string, AttendanceWeekTally>();
  for (const session of sessions) {
    byId.set(session.id, {
      meeting_week: session.meeting_week,
      present: 0,
      absent: 0,
      excused: 0,
    });
  }

  const { data: records, error: recordsError } = await client
    .from("attendance_records")
    .select("session_id, attendance_status")
    .in("session_id", [...byId.keys()]);

  if (recordsError) {
    return { data: null, error: wrapError("fetchGroupAttendanceWeeks/records", recordsError) };
  }

  for (const record of records ?? []) {
    const tally = byId.get(record.session_id);
    if (!tally) continue;
    if (record.attendance_status === "present") tally.present += 1;
    else if (record.attendance_status === "absent") tally.absent += 1;
    else if (record.attendance_status === "excused") tally.excused += 1;
  }

  return { data: [...byId.values()], error: null };
}

export type GroupHealthOverviewRow = {
  group_id: string;
  group_name: string;
  attendance_pct: number | null;
  attendance_weeks_counted: number;
  computed_letter: string | null;
  // True when the live attendance read failed and we fell back to the last
  // persisted assessment (so the surface can flag it rather than mislead).
  stale: boolean;
  // True when there is neither a live grade nor a persisted row yet.
  unassessed: boolean;
};

type PersistedAssessment = {
  group_id: string;
  attendance_pct: number | null;
  attendance_weeks_counted: number;
  computed_letter: string | null;
};

// Overview for the admin surface: every active group with its current-month
// grade, recomputed live from the configured rubric. On a per-group attendance
// read error we fall back to the last persisted assessment and flag it stale.
//
// The new group_health_assessments table is not in the generated supabase
// schema types, so its select is cast in this one place — the same trust seam
// callUuidRpc uses for admin RPCs. Columns are listed explicitly (never *).
export async function listGroupHealthOverview(
  client: AppSupabaseClient,
  periodMonthIso: string = currentPeriodMonthIso(),
): Promise<ReadResult<GroupHealthOverviewRow[]>> {
  const { data: groups, error: groupsError } = await client
    .from("groups")
    .select("id, name")
    .neq("lifecycle_status", "closed")
    .order("name", { ascending: true });

  if (groupsError) return { data: null, error: wrapError("listGroupHealthOverview/groups", groupsError) };
  if (!groups || groups.length === 0) return { data: [], error: null };

  const rubricRes = await fetchGroupHealthRubric(client);
  if (rubricRes.error) return { data: null, error: rubricRes.error };
  const rubric = rubricRes.data;

  const { data: assessments, error: assessmentsError } = await (client as AppSupabaseClient)
    .from("group_health_assessments" as never)
    .select(
      "group_id, attendance_pct, attendance_weeks_counted, computed_letter" as never,
    )
    .eq("period_month" as never, periodMonthIso as never);

  if (assessmentsError) {
    return { data: null, error: wrapError("listGroupHealthOverview/assessments", assessmentsError) };
  }

  const persisted = new Map<string, PersistedAssessment>();
  for (const row of (assessments as PersistedAssessment[] | null) ?? []) {
    persisted.set(row.group_id, row);
  }

  const rows: GroupHealthOverviewRow[] = [];
  for (const group of groups) {
    const weeksRes = await fetchGroupAttendanceWeeks(
      client,
      group.id,
      rubric.attendance_window_weeks,
    );

    if (weeksRes.error) {
      // Don't fail the whole page for one group's read; show last-known-good.
      const prior = persisted.get(group.id);
      rows.push({
        group_id: group.id,
        group_name: group.name,
        attendance_pct: prior?.attendance_pct ?? null,
        attendance_weeks_counted: prior?.attendance_weeks_counted ?? 0,
        computed_letter: prior?.computed_letter ?? null,
        stale: true,
        unassessed: prior === undefined,
      });
      continue;
    }

    const attendance = attendanceConsistency(weeksRes.data, rubric);
    const grade = computeGrade(
      attendance.rolling_pct === null ? {} : { attendance: attendance.rolling_pct },
      rubric,
    );
    rows.push({
      group_id: group.id,
      group_name: group.name,
      attendance_pct: attendance.rolling_pct,
      attendance_weeks_counted: attendance.weeks_counted,
      computed_letter: grade.letter,
      stale: false,
      unassessed: attendance.rolling_pct === null && !persisted.has(group.id),
    });
  }

  return { data: rows, error: null };
}
