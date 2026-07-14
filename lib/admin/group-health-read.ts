import "server-only";

import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { GroupHealthLatestFollowUpRow } from "@/types/database";
import type { GroupHealthLetter } from "@/types/enums";
import type {
  AttendanceWeekTally,
  GroupHealthRubricConfig,
} from "@/lib/admin/group-health";
import {
  attendanceConsistency,
  attendanceTrend,
  computeGrade,
  decodeGroupHealthRubric,
  dimensionScoresFromInputs,
  ATTENDANCE_TREND_WINDOW_WEEKS,
  BUILT_IN_GROUP_HEALTH_RUBRIC,
} from "@/lib/admin/group-health";
import { decodeMetricDefaults } from "@/lib/admin/metrics";
import { type ReadResult } from "@/lib/supabase/read-core";
import { bindReads, type BoundReads } from "@/lib/supabase/reads-seam";
import { fetchAllGroups, fetchGroupsByIds } from "@/lib/supabase/group-reads";
import {
  fetchAttendanceRecordsForSessions,
  fetchAttendanceSessions,
  fetchGroupAttendanceWeeksForGroups,
} from "@/lib/supabase/attendance-reads";
import { fetchGroupHealthRubricSetting } from "@/lib/supabase/settings-reads";
import { fetchMetricDefaultsCached } from "@/lib/supabase/cached-config";
import { currentPeriodMonthIso } from "@/lib/admin/ministry-year";

// Read side for the group-health tracer (#127). Admin-only data; these run
// behind the admin layout guard and the table's admin-only RLS. Reads go
// through the typed read-model helpers (which already return ReadResult and
// propagate Supabase errors) rather than re-rolling queries here.
//
// Per the locked rubric, the *current* month recomputes on read: the overview
// computes each active group's live attendance grade from the configured rubric
// rather than trusting a possibly-stale persisted row. The persisted
// group_health_assessments table is the audit trail + frozen-history of closed
// months (and the home of #129's override); the manual Recompute action writes
// the same numbers through the audited RPC.
//
// ADR 0015: the orchestration is split into pure `build*` functions over the
// `GroupHealthRecomputeReads` seam, so the grading fold, error precedence, and fallback
// rules are testable through an in-memory adapter. The exported client-bound
// entry points (`fetchGroupHealthRubric`, `listGroupHealthOverview`, …) keep
// their signatures and are thin bindings of the live client onto those builds.

export type { ReadResult } from "@/lib/supabase/read-core";

function wrapError(prefix: string, err: unknown): Error {
  if (err instanceof Error) return new Error(`${prefix}: ${err.message}`);
  return new Error(`${prefix}: ${String(err)}`);
}

// Normalize a raw PostgREST error to an Error at the leaf, so every seam
// fetcher returns the ReadResult shape. The build functions add their
// call-site prefix via wrapError; because an Error instance passes through
// unchanged, the wrapped messages are byte-identical to the pre-seam inline
// reads.
function toError(err: unknown): Error {
  if (err instanceof Error) return err;
  return new Error(String(err));
}

export type GroupHealthOverviewRow = {
  group_id: string;
  group_name: string;
  attendance_pct: number | null;
  attendance_weeks_counted: number;
  // The two admin-entered 1–5 ratings (#128), carried from the month's
  // persisted assessment so the surface can show them and pre-fill the editor.
  spiritual_growth_score: number | null;
  spiritual_growth_note: string | null;
  group_question_score: number | null;
  group_question_leader_reported: boolean;
  computed_letter: GroupHealthLetter | null;
  // Most recent recorded attendance week (ISO YYYY-MM-DD) for the group — the
  // triage table's "last check-in" column, derived from the attendance the
  // grade already reads (a director-approved source, not invented). Null when
  // the group has no attendance on record or the live read fell back to stale.
  last_check_in_week: string | null;
  // When the month's assessment was last persisted (group_health_assessments.
  // updated_at), or null when nothing has been saved yet — the "last saved"
  // column. A live recompute on read does not move this; only a save does.
  last_saved_at: string | null;
  // True when the live attendance read failed and we fell back to the last
  // persisted assessment (so the surface can flag it rather than mislead).
  stale: boolean;
  // True when there is neither a live grade nor a persisted row yet.
  unassessed: boolean;
  // Admin IM 05 (#265): the director's open follow-up flag from the group's
  // latest assessment of any month — the "Needs follow-up" triage filter. It
  // carries across month boundaries until cleared, so it is not necessarily the
  // current period's value. False until set.
  needs_follow_up: boolean;
  // Admin IM 05 (#265): attendance is declining when the recent 4-week average
  // is below the prior 4-week average by ≥ the director's decline margin. One
  // honest input to the Watch filter; false on insufficient data or a stale
  // read (no fresh window to compare).
  attendance_declining: boolean;
};

type PersistedAssessment = {
  group_id: string;
  attendance_pct: number | null;
  attendance_weeks_counted: number;
  spiritual_growth_score: number | null;
  spiritual_growth_note: string | null;
  group_question_score: number | null;
  group_question_leader_reported: boolean;
  computed_letter: GroupHealthLetter | null;
  needs_follow_up: boolean;
  updated_at: string | null;
};

const ASSESSMENT_COLUMNS =
  "group_id, attendance_pct, attendance_weeks_counted, spiritual_growth_score, " +
  "spiritual_growth_note, group_question_score, group_question_leader_reported, " +
  "computed_letter, needs_follow_up, updated_at";

// One row per group from the group_health_latest_follow_up view: the group's
// latest assessment flag, carried across months. Exported so the types-drift
// guard (tests/integration/support/types-drift-manifest.ts) can pin this
// view row against the live view's column set.
export type LatestFollowUpRow = GroupHealthLatestFollowUpRow;

// The two admin-entered 1–5 ratings (and the spiritual-growth note) for a
// group's month, or nulls when no assessment row exists yet. The write action
// reads this to merge a single-dimension edit without clobbering the other.
export type GroupHealthRatings = {
  spiritual_growth_score: number | null;
  spiritual_growth_note: string | null;
  group_question_score: number | null;
};

// ---------------------------------------------------------------------------
// Leaf fetchers for this module's own tables.
//
// Both sources are represented in the pinned Database read types, so their
// names, columns, and filters stay typed.
// ---------------------------------------------------------------------------

// The persisted assessment for one group + period (the ratings + last-saved
// audit row), or null when nothing has been saved for the month yet.
async function fetchGroupHealthAssessment(
  client: AppSupabaseClient,
  groupId: string,
  periodMonthIso: string
): Promise<ReadResult<PersistedAssessment | null>> {
  const { data, error } = await client
    .from("group_health_assessments")
    .select(ASSESSMENT_COLUMNS)
    .eq("group_id", groupId)
    .eq("period_month", periodMonthIso)
    .maybeSingle<PersistedAssessment>();
  if (error) return { data: null, error: toError(error) };
  return { data: data ?? null, error: null };
}

// Every group's persisted assessment for one period — the overview's
// last-known-good fallback and the source of the month's saved ratings.
async function fetchGroupHealthAssessmentsForPeriod(
  client: AppSupabaseClient,
  periodMonthIso: string
): Promise<ReadResult<PersistedAssessment[]>> {
  const { data, error } = await client
    .from("group_health_assessments")
    .select(ASSESSMENT_COLUMNS)
    .eq("period_month", periodMonthIso)
    .returns<PersistedAssessment[]>();
  if (error) return { data: null, error: toError(error) };
  return { data: data ?? [], error: null };
}

// Every group's latest follow-up flag from the group_health_latest_follow_up
// view (one row per group; see the carry-across-months note in the overview
// build).
async function fetchLatestFollowUpFlags(
  client: AppSupabaseClient
): Promise<ReadResult<LatestFollowUpRow[]>> {
  const { data, error } = await client
    .from("group_health_latest_follow_up")
    .select("group_id, needs_follow_up")
    .returns<LatestFollowUpRow[]>();
  if (error) return { data: null, error: toError(error) };
  return { data: data ?? [], error: null };
}

// The cross-month "needs follow-up" flag for just one group (its latest
// assessment of any month), via the same view the bulk read uses.
async function fetchLatestFollowUpFlagForGroup(
  client: AppSupabaseClient,
  groupId: string
): Promise<ReadResult<LatestFollowUpRow | null>> {
  const { data, error } = await client
    .from("group_health_latest_follow_up")
    .select("group_id, needs_follow_up")
    .eq("group_id", groupId)
    .maybeSingle<LatestFollowUpRow>();
  if (error) return { data: null, error: toError(error) };
  return { data: data ?? null, error: null };
}

// ---------------------------------------------------------------------------
// The reads seam (ADR 0015): every leaf read this module's orchestration
// consumes, in one fetcher map. Production binds the live client below; a test
// binds an in-memory adapter satisfying GroupHealthRecomputeReads.
// ---------------------------------------------------------------------------

const GROUP_HEALTH_READ_FETCHERS = {
  fetchAllGroups,
  fetchGroupsByIds,
  fetchAttendanceSessions,
  fetchAttendanceRecordsForSessions,
  fetchGroupAttendanceWeeksForGroups,
  fetchGroupHealthRubricSetting,
  fetchMetricDefaultsCached,
  fetchGroupHealthAssessment,
  fetchGroupHealthAssessmentsForPeriod,
  fetchLatestFollowUpFlags,
  fetchLatestFollowUpFlagForGroup,
};

export type GroupHealthRecomputeReads = BoundReads<
  typeof GROUP_HEALTH_READ_FETCHERS
>;

function bindGroupHealthReads(
  client: AppSupabaseClient
): GroupHealthRecomputeReads {
  return bindReads(client, GROUP_HEALTH_READ_FETCHERS, "group_health_read");
}

// ---------------------------------------------------------------------------
// Pure builds: the orchestration as functions of the seam.
// ---------------------------------------------------------------------------

// Build the live rubric from the audited settings: the admin-tuned weights /
// cut-lines / attendance window (group_health_rubric, decoded with per-field
// defaults + validation), with the healthy-attendance threshold overlaid from
// its canonical home (metric_defaults.default_healthy_attendance_pct). A missing
// row on either side decodes to the documented defaults; read failures propagate
// rather than silently falling back, so a transient error can't quietly grade on
// the wrong rubric.
export async function buildGroupHealthRubric(
  reads: GroupHealthRecomputeReads
): Promise<ReadResult<GroupHealthRubricConfig>> {
  const rubricRes = await reads.fetchGroupHealthRubricSetting();
  if (rubricRes.error)
    return {
      data: null,
      error: wrapError("fetchGroupHealthRubric", rubricRes.error),
    };

  const defaultsRes = await reads.fetchMetricDefaultsCached();
  if (defaultsRes.error)
    return {
      data: null,
      error: wrapError("fetchGroupHealthRubric", defaultsRes.error),
    };

  const tuned = decodeGroupHealthRubric(rubricRes.data?.setting_value ?? null);
  const metricDefaults = decodeMetricDefaults(defaultsRes.data);
  return {
    data: {
      ...tuned,
      healthy_attendance_pct: metricDefaults.default_healthy_attendance_pct,
    },
    error: null,
  };
}

// Aggregate the most-recent `limitWeeks` attendance sessions for a group into
// per-week present/absent/excused tallies the pure module can grade. Read
// failures propagate: a caller must not treat an errored read as "no
// attendance" and overwrite a previously valid grade.
export async function buildGroupAttendanceWeeks(
  reads: GroupHealthRecomputeReads,
  groupId: string,
  limitWeeks: number = BUILT_IN_GROUP_HEALTH_RUBRIC.attendance_window_weeks
): Promise<ReadResult<AttendanceWeekTally[]>> {
  const sessionsRes = await reads.fetchAttendanceSessions({
    groupId,
    limit: limitWeeks,
  });
  if (sessionsRes.error) {
    return {
      data: null,
      error: wrapError("fetchGroupAttendanceWeeks/sessions", sessionsRes.error),
    };
  }
  const sessions = sessionsRes.data;
  if (sessions.length === 0) return { data: [], error: null };

  const byId = new Map<string, AttendanceWeekTally>();
  for (const session of sessions) {
    byId.set(session.id, {
      meeting_week: session.meeting_week,
      present: 0,
      absent: 0,
      excused: 0,
    });
  }

  const recordsRes = await reads.fetchAttendanceRecordsForSessions([
    ...byId.keys(),
  ]);
  if (recordsRes.error) {
    return {
      data: null,
      error: wrapError("fetchGroupAttendanceWeeks/records", recordsRes.error),
    };
  }

  for (const record of recordsRes.data) {
    const tally = byId.get(record.session_id);
    if (!tally) continue;
    if (record.attendance_status === "present") tally.present += 1;
    else if (record.attendance_status === "absent") tally.absent += 1;
    else if (record.attendance_status === "excused") tally.excused += 1;
  }

  return { data: [...byId.values()], error: null };
}

export async function buildGroupHealthRatings(
  reads: GroupHealthRecomputeReads,
  groupId: string,
  periodMonthIso: string = currentPeriodMonthIso()
): Promise<ReadResult<GroupHealthRatings>> {
  const { data, error } = await reads.fetchGroupHealthAssessment(
    groupId,
    periodMonthIso
  );

  if (error) {
    return { data: null, error: wrapError("fetchGroupHealthRatings", error) };
  }
  return {
    data: {
      spiritual_growth_score: data?.spiritual_growth_score ?? null,
      spiritual_growth_note: data?.spiritual_growth_note ?? null,
      group_question_score: data?.group_question_score ?? null,
    },
    error: null,
  };
}

// Overview for the admin surface: every active group with its current-month
// grade, recomputed live from the configured rubric. On a per-group attendance
// read error we fall back to the last persisted assessment and flag it stale.
export async function buildGroupHealthOverview(
  reads: GroupHealthRecomputeReads,
  periodMonthIso: string = currentPeriodMonthIso()
): Promise<ReadResult<GroupHealthOverviewRow[]>> {
  const groupsRes = await reads.fetchAllGroups();
  if (groupsRes.error) return { data: null, error: groupsRes.error };
  // Active groups only; fetchAllGroups already sorts by name.
  const groups = groupsRes.data.filter((g) => g.lifecycle_status !== "closed");
  if (groups.length === 0) return { data: [], error: null };

  const rubricRes = await buildGroupHealthRubric(reads);
  if (rubricRes.error) return { data: null, error: rubricRes.error };
  const rubric = rubricRes.data;

  // The attendance-decline margin (Admin IM 05 / #265) is a director-tuned
  // metric default, sourced here rather than hard-coded. A read failure
  // propagates rather than silently grading the trend on a wrong margin.
  const defaultsRes = await reads.fetchMetricDefaultsCached();
  if (defaultsRes.error)
    return {
      data: null,
      error: wrapError(
        "listGroupHealthOverview/metricDefaults",
        defaultsRes.error
      ),
    };
  const declineMargin = decodeMetricDefaults(
    defaultsRes.data
  ).group_health_attendance_decline_margin_pct;

  const { data: assessments, error: assessmentsError } =
    await reads.fetchGroupHealthAssessmentsForPeriod(periodMonthIso);

  if (assessmentsError) {
    return {
      data: null,
      error: wrapError("listGroupHealthOverview/assessments", assessmentsError),
    };
  }

  const persisted = new Map<string, PersistedAssessment>();
  for (const row of assessments ?? []) {
    persisted.set(row.group_id, row);
  }

  // The "Needs follow-up" flag carries across months: an open flag persists past
  // a month boundary until an admin clears it (#265, director "latest
  // assessment" / drawer "until the action is closed"). So the flag reflects the
  // most recent assessment of any month — not just the current period. The
  // group_health_latest_follow_up view returns exactly one row per group (its
  // latest assessment, via distinct on), so this read is bounded to the group
  // count and can't be truncated by PostgREST's row cap as history grows. A
  // current-month row, being the max period_month, naturally supersedes (its
  // unchecked box clears a prior flag). Independent of the attendance fan-out,
  // so run them concurrently.
  const latestFollowUpPromise = reads.fetchLatestFollowUpFlags();

  // The normal path loads every group's attendance in one bulk RPC. Fetch at
  // least the trend's 8-week span even when the rubric window is smaller, or the
  // declining leg can never fill its prior half-window; attendanceConsistency
  // re-slices to the rubric window, so the grade is unaffected.
  const weeksToFetch = Math.max(
    rubric.attendance_window_weeks,
    ATTENDANCE_TREND_WINDOW_WEEKS
  );
  const attendancePromise = reads.fetchGroupAttendanceWeeksForGroups(
    groups.map((group) => group.id),
    weeksToFetch
  );

  const [attendanceResult, followUpResult] = await Promise.all([
    attendancePromise,
    latestFollowUpPromise,
  ]);
  const { data: followUpRows, error: followUpError } = followUpResult;
  if (followUpError) {
    return {
      data: null,
      error: wrapError("listGroupHealthOverview/followUp", followUpError),
    };
  }
  // The view yields one row per group already, so map it straight through.
  const latestFollowUp = new Map<string, boolean>();
  for (const row of followUpRows ?? []) {
    latestFollowUp.set(row.group_id, row.needs_follow_up);
  }

  // Keep the one-request normal path. If the bulk request fails, fall back to
  // the prior per-group seam so independent failures remain independent.
  const fallbackWeeksByGroup = new Map<
    string,
    ReadResult<AttendanceWeekTally[]>
  >();
  if (attendanceResult.error) {
    const fallbackResults = await Promise.all(
      groups.map(
        async (group) =>
          [
            group.id,
            await buildGroupAttendanceWeeks(reads, group.id, weeksToFetch),
          ] as const
      )
    );
    for (const [groupId, result] of fallbackResults) {
      fallbackWeeksByGroup.set(groupId, result);
    }
  }

  const weeksByGroup = new Map<string, AttendanceWeekTally[]>();
  if (!attendanceResult.error) {
    for (const week of attendanceResult.data) {
      const weeks = weeksByGroup.get(week.group_id) ?? [];
      weeks.push({
        meeting_week: week.meeting_week,
        present: week.present,
        absent: week.absent,
        excused: week.excused,
      });
      weeksByGroup.set(week.group_id, weeks);
    }
  }

  const rows: GroupHealthOverviewRow[] = [];
  for (const group of groups) {
    const weeksRes: ReadResult<AttendanceWeekTally[]> = attendanceResult.error
      ? (fallbackWeeksByGroup.get(group.id) ?? {
          data: null,
          error: attendanceResult.error,
        })
      : { data: weeksByGroup.get(group.id) ?? [], error: null };
    rows.push(
      buildOverviewRow({
        group,
        weeksRes,
        prior: persisted.get(group.id),
        needsFollowUp: latestFollowUp.get(group.id) ?? false,
        rubric,
        declineMargin,
      })
    );
  }

  return { data: rows, error: null };
}

// Assemble one group's overview row from its attendance read + persisted
// assessment. Pure given its inputs — the single source for the row shape so
// the bulk overview and the single-group read (getGroupHealthOverviewForGroup)
// can never disagree about how a row is graded.
function buildOverviewRow(args: {
  group: { id: string; name: string };
  weeksRes: ReadResult<AttendanceWeekTally[]>;
  prior: PersistedAssessment | undefined;
  needsFollowUp: boolean;
  rubric: GroupHealthRubricConfig;
  declineMargin: number;
}): GroupHealthOverviewRow {
  const { group, weeksRes, prior, needsFollowUp, rubric, declineMargin } = args;

  if (weeksRes.error) {
    // Don't fail the whole page for one group's read; show last-known-good.
    // Only flag stale when there is actually a prior row to fall back to — a
    // group with no persisted assessment has nothing "last saved" to show.
    return {
      group_id: group.id,
      group_name: group.name,
      attendance_pct: prior?.attendance_pct ?? null,
      attendance_weeks_counted: prior?.attendance_weeks_counted ?? 0,
      spiritual_growth_score: prior?.spiritual_growth_score ?? null,
      spiritual_growth_note: prior?.spiritual_growth_note ?? null,
      group_question_score: prior?.group_question_score ?? null,
      group_question_leader_reported:
        prior?.group_question_leader_reported ?? false,
      computed_letter: prior?.computed_letter ?? null,
      // The live attendance read failed, so we have no fresh check-in week to
      // show; don't guess one.
      last_check_in_week: null,
      last_saved_at: prior?.updated_at ?? null,
      stale: prior !== undefined,
      unassessed: prior === undefined,
      needs_follow_up: needsFollowUp,
      // No fresh attendance window on a failed read, so we can't honestly
      // claim a trend.
      attendance_declining: false,
    };
  }

  const attendance = attendanceConsistency(weeksRes.data, rubric);
  const trend = attendanceTrend(weeksRes.data, declineMargin);
  // Latest recorded attendance week = the group's last check-in. Weeks are
  // ISO YYYY-MM-DD, which sorts lexically, so the max string is the newest.
  const lastCheckInWeek =
    weeksRes.data.length === 0
      ? null
      : weeksRes.data.reduce(
          (latest, w) => (w.meeting_week > latest ? w.meeting_week : latest),
          weeksRes.data[0].meeting_week
        );
  // Recompute live: the rolling attendance dimension plus whatever 1–5
  // ratings the admin has already entered for the month.
  const ratings = {
    spiritual_growth_score: prior?.spiritual_growth_score ?? null,
    group_question_score: prior?.group_question_score ?? null,
  };
  const grade = computeGrade(
    dimensionScoresFromInputs({
      attendance_pct: attendance.rolling_pct,
      ...ratings,
    }),
    rubric
  );
  return {
    group_id: group.id,
    group_name: group.name,
    attendance_pct: attendance.rolling_pct,
    attendance_weeks_counted: attendance.weeks_counted,
    spiritual_growth_score: prior?.spiritual_growth_score ?? null,
    spiritual_growth_note: prior?.spiritual_growth_note ?? null,
    group_question_score: prior?.group_question_score ?? null,
    group_question_leader_reported:
      prior?.group_question_leader_reported ?? false,
    computed_letter: grade.letter,
    last_check_in_week: lastCheckInWeek,
    last_saved_at: prior?.updated_at ?? null,
    unassessed:
      attendance.rolling_pct === null &&
      ratings.spiritual_growth_score === null &&
      ratings.group_question_score === null &&
      prior === undefined,
    stale: false,
    needs_follow_up: needsFollowUp,
    attendance_declining: trend.declining,
  };
}

// Single-group health overview for the group detail route (#308). Runs the
// SAME grade computation as listGroupHealthOverview but does O(1) work: it reads
// only this group, its assessment, its latest follow-up flag, and its own
// attendance window — instead of fetching every active group and fanning out an
// attendance read per group just to keep one row. The bulk overview keeps using
// the list path; this is the targeted variant for a single record.
export async function buildGroupHealthOverviewForGroup(
  reads: GroupHealthRecomputeReads,
  groupId: string,
  periodMonthIso: string = currentPeriodMonthIso()
): Promise<ReadResult<GroupHealthOverviewRow | null>> {
  const groupRes = await reads.fetchGroupsByIds([groupId]);
  if (groupRes.error)
    return {
      data: null,
      error: wrapError("getGroupHealthOverviewForGroup/group", groupRes.error),
    };
  const group = (groupRes.data ?? [])[0];
  // Match the bulk overview's scope: closed groups are not assessed.
  if (!group || group.lifecycle_status === "closed")
    return { data: null, error: null };

  const rubricRes = await buildGroupHealthRubric(reads);
  if (rubricRes.error) return { data: null, error: rubricRes.error };
  const rubric = rubricRes.data;

  const defaultsRes = await reads.fetchMetricDefaultsCached();
  if (defaultsRes.error)
    return {
      data: null,
      error: wrapError(
        "getGroupHealthOverviewForGroup/metricDefaults",
        defaultsRes.error
      ),
    };
  const declineMargin = decodeMetricDefaults(
    defaultsRes.data
  ).group_health_attendance_decline_margin_pct;

  // The persisted assessment for this group + period (the ratings + last-saved
  // audit row), scoped to the one group instead of the whole month.
  const { data: assessment, error: assessmentError } =
    await reads.fetchGroupHealthAssessment(groupId, periodMonthIso);
  if (assessmentError)
    return {
      data: null,
      error: wrapError(
        "getGroupHealthOverviewForGroup/assessment",
        assessmentError
      ),
    };

  // The cross-month "needs follow-up" flag for just this group (its latest
  // assessment of any month), via the same view the bulk read uses.
  const { data: followUpRow, error: followUpError } =
    await reads.fetchLatestFollowUpFlagForGroup(groupId);
  if (followUpError)
    return {
      data: null,
      error: wrapError(
        "getGroupHealthOverviewForGroup/followUp",
        followUpError
      ),
    };

  const weeksToFetch = Math.max(
    rubric.attendance_window_weeks,
    ATTENDANCE_TREND_WINDOW_WEEKS
  );
  const weeksRes = await buildGroupAttendanceWeeks(
    reads,
    groupId,
    weeksToFetch
  );

  return {
    data: buildOverviewRow({
      group,
      weeksRes,
      prior: assessment ?? undefined,
      needsFollowUp: followUpRow?.needs_follow_up ?? false,
      rubric,
      declineMargin,
    }),
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Client-bound entry points. Signatures are unchanged (client first); each
// binds the live client onto the seam and delegates to its pure build above.
// ---------------------------------------------------------------------------

export async function fetchGroupHealthRubric(
  client: AppSupabaseClient
): Promise<ReadResult<GroupHealthRubricConfig>> {
  return buildGroupHealthRubric(bindGroupHealthReads(client));
}

export async function fetchGroupAttendanceWeeks(
  client: AppSupabaseClient,
  groupId: string,
  limitWeeks: number = BUILT_IN_GROUP_HEALTH_RUBRIC.attendance_window_weeks
): Promise<ReadResult<AttendanceWeekTally[]>> {
  return buildGroupAttendanceWeeks(
    bindGroupHealthReads(client),
    groupId,
    limitWeeks
  );
}

export async function fetchGroupHealthRatings(
  client: AppSupabaseClient,
  groupId: string,
  periodMonthIso: string = currentPeriodMonthIso()
): Promise<ReadResult<GroupHealthRatings>> {
  return buildGroupHealthRatings(
    bindGroupHealthReads(client),
    groupId,
    periodMonthIso
  );
}

export async function listGroupHealthOverview(
  client: AppSupabaseClient,
  periodMonthIso: string = currentPeriodMonthIso()
): Promise<ReadResult<GroupHealthOverviewRow[]>> {
  return buildGroupHealthOverview(bindGroupHealthReads(client), periodMonthIso);
}

export async function getGroupHealthOverviewForGroup(
  client: AppSupabaseClient,
  groupId: string,
  periodMonthIso: string = currentPeriodMonthIso()
): Promise<ReadResult<GroupHealthOverviewRow | null>> {
  return buildGroupHealthOverviewForGroup(
    bindGroupHealthReads(client),
    groupId,
    periodMonthIso
  );
}
