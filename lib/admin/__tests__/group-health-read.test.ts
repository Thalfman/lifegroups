import { describe, expect, it, vi } from "vitest";

// The module imports fetchMetricDefaultsCached (which wraps Next's
// unstable_cache) as a seam fetcher; stub the module so importing the read
// layer never touches Next runtime machinery. The tests below always override
// fetchMetricDefaultsCached on the in-memory reads, so the stub is inert.
vi.mock("@/lib/supabase/cached-config", () => ({
  fetchMetricDefaultsCached: vi.fn(async () => ({ data: null, error: null })),
}));

import {
  buildGroupAttendanceWeeks,
  buildGroupHealthOverview,
  buildGroupHealthOverviewForGroup,
  buildGroupHealthRatings,
  buildGroupHealthRubric,
  type GroupHealthReads,
} from "@/lib/admin/group-health-read";
import {
  ATTENDANCE_TREND_WINDOW_WEEKS,
  BUILT_IN_GROUP_HEALTH_RUBRIC,
} from "@/lib/admin/group-health";
import type { ReadResult } from "@/lib/supabase/read-core";
import type {
  AppSettingsRow,
  AttendanceRecordsRow,
  AttendanceSessionsRow,
  GroupsRow,
} from "@/types/database";

const PERIOD = "2026-06-01";

const ok = <T>(data: T): ReadResult<T> => ({ data, error: null });
const fail = (message: string): ReadResult<never> => ({
  data: null,
  error: new Error(message),
});

const group = (id: string, name: string, lifecycle_status = "active") =>
  ({ id, name, lifecycle_status }) as unknown as GroupsRow;

const session = (id: string, meeting_week: string) =>
  ({ id, meeting_week }) as unknown as AttendanceSessionsRow;

const record = (
  session_id: string,
  attendance_status: "present" | "absent" | "excused"
) =>
  ({
    id: `${session_id}-${attendance_status}-${Math.random()}`,
    session_id,
    attendance_status,
  }) as unknown as AttendanceRecordsRow;

const setting = (setting_value: unknown) =>
  ({ setting_key: "test", setting_value }) as unknown as AppSettingsRow;

// The persisted-assessment row shape, derived through the seam so the fixture
// tracks the module's own (unexported) type.
type Assessment = NonNullable<
  Awaited<ReturnType<GroupHealthReads["fetchGroupHealthAssessment"]>>["data"]
>;

const assessment = (
  group_id: string,
  overrides: Partial<Assessment> = {}
): Assessment => ({
  group_id,
  attendance_pct: null,
  attendance_weeks_counted: 0,
  spiritual_growth_score: null,
  spiritual_growth_note: null,
  group_question_score: null,
  group_question_leader_reported: false,
  computed_letter: null,
  needs_follow_up: false,
  updated_at: null,
  ...overrides,
});

function emptyReads(
  overrides: Partial<GroupHealthReads> = {}
): GroupHealthReads {
  return {
    fetchAllGroups: async () => ok([]),
    fetchGroupsByIds: async () => ok([]),
    fetchAttendanceSessions: async () => ok([]),
    fetchAttendanceRecordsForSessions: async () => ok([]),
    fetchGroupHealthRubricSetting: async () => ok(null),
    fetchMetricDefaultsCached: async () => ok(null),
    fetchGroupHealthAssessment: async () => ok(null),
    fetchGroupHealthAssessmentsForPeriod: async () => ok([]),
    fetchLatestFollowUpFlags: async () => ok([]),
    fetchLatestFollowUpFlagForGroup: async () => ok(null),
    ...overrides,
  };
}

describe("buildGroupHealthRubric", () => {
  it("propagates a rubric-setting read failure, never a default rubric", async () => {
    const res = await buildGroupHealthRubric(
      emptyReads({
        fetchGroupHealthRubricSetting: async () => fail("rubric boom"),
      })
    );
    expect(res.data).toBeNull();
    expect(res.error?.message).toBe("fetchGroupHealthRubric: rubric boom");
  });

  it("propagates a metric-defaults read failure, never a default threshold", async () => {
    const res = await buildGroupHealthRubric(
      emptyReads({
        fetchMetricDefaultsCached: async () => fail("defaults boom"),
      })
    );
    expect(res.data).toBeNull();
    expect(res.error?.message).toBe("fetchGroupHealthRubric: defaults boom");
  });

  it("overlays the tuned window and the canonical healthy-attendance pct", async () => {
    const res = await buildGroupHealthRubric(
      emptyReads({
        fetchGroupHealthRubricSetting: async () =>
          ok(setting({ attendance_window_weeks: 12 })),
        fetchMetricDefaultsCached: async () =>
          ok(setting({ default_healthy_attendance_pct: 75 })),
      })
    );
    expect(res.error).toBeNull();
    expect(res.data?.attendance_window_weeks).toBe(12);
    expect(res.data?.healthy_attendance_pct).toBe(75);
    // Untuned fields decode to the built-in rubric.
    expect(res.data?.weights).toEqual(BUILT_IN_GROUP_HEALTH_RUBRIC.weights);
  });
});

describe("buildGroupAttendanceWeeks", () => {
  it("tallies present/absent/excused per session week", async () => {
    const res = await buildGroupAttendanceWeeks(
      emptyReads({
        fetchAttendanceSessions: async () =>
          ok([session("s1", "2026-06-01"), session("s2", "2026-06-08")]),
        fetchAttendanceRecordsForSessions: async () =>
          ok([
            record("s1", "present"),
            record("s1", "present"),
            record("s1", "absent"),
            record("s1", "excused"),
            record("s2", "present"),
          ]),
      }),
      "g1"
    );
    expect(res.error).toBeNull();
    expect(res.data).toEqual([
      { meeting_week: "2026-06-01", present: 2, absent: 1, excused: 1 },
      { meeting_week: "2026-06-08", present: 1, absent: 0, excused: 0 },
    ]);
  });

  it("returns [] for no sessions without reading records", async () => {
    const records = vi.fn(async () => ok([]));
    const res = await buildGroupAttendanceWeeks(
      emptyReads({ fetchAttendanceRecordsForSessions: records }),
      "g1"
    );
    expect(res).toEqual({ data: [], error: null });
    expect(records).not.toHaveBeenCalled();
  });

  it("propagates a sessions read failure, never a false-empty week list", async () => {
    const res = await buildGroupAttendanceWeeks(
      emptyReads({ fetchAttendanceSessions: async () => fail("boom") }),
      "g1"
    );
    expect(res.data).toBeNull();
    expect(res.error?.message).toBe("fetchGroupAttendanceWeeks/sessions: boom");
  });

  it("propagates a records read failure, never zeroed tallies", async () => {
    const res = await buildGroupAttendanceWeeks(
      emptyReads({
        fetchAttendanceSessions: async () => ok([session("s1", "2026-06-01")]),
        fetchAttendanceRecordsForSessions: async () => fail("boom"),
      }),
      "g1"
    );
    expect(res.data).toBeNull();
    expect(res.error?.message).toBe("fetchGroupAttendanceWeeks/records: boom");
  });
});

describe("buildGroupHealthRatings", () => {
  it("propagates an assessment read failure", async () => {
    const res = await buildGroupHealthRatings(
      emptyReads({ fetchGroupHealthAssessment: async () => fail("boom") }),
      "g1",
      PERIOD
    );
    expect(res.data).toBeNull();
    expect(res.error?.message).toBe("fetchGroupHealthRatings: boom");
  });

  it("maps the persisted ratings, and all-nulls when no row exists yet", async () => {
    const withRow = await buildGroupHealthRatings(
      emptyReads({
        fetchGroupHealthAssessment: async () =>
          ok(
            assessment("g1", {
              spiritual_growth_score: 4,
              spiritual_growth_note: "note",
              group_question_score: 2,
            })
          ),
      }),
      "g1",
      PERIOD
    );
    expect(withRow.data).toEqual({
      spiritual_growth_score: 4,
      spiritual_growth_note: "note",
      group_question_score: 2,
    });

    const withoutRow = await buildGroupHealthRatings(
      emptyReads(),
      "g1",
      PERIOD
    );
    expect(withoutRow.data).toEqual({
      spiritual_growth_score: null,
      spiritual_growth_note: null,
      group_question_score: null,
    });
  });
});

describe("buildGroupHealthOverview", () => {
  it("propagates a groups read failure unwrapped, never a false-empty overview", async () => {
    const res = await buildGroupHealthOverview(
      emptyReads({ fetchAllGroups: async () => fail("groups boom") }),
      PERIOD
    );
    expect(res.data).toBeNull();
    // fetchAllGroups already wraps its own errors, so the overview passes it
    // through without another prefix.
    expect(res.error?.message).toBe("groups boom");
  });

  it("returns [] for no active groups without touching later reads", async () => {
    const rubricSetting = vi.fn(async () => ok(null));
    const assessments = vi.fn(async () => ok([]));
    const followUps = vi.fn(async () => ok([]));
    const sessions = vi.fn(async () => ok([]));
    const res = await buildGroupHealthOverview(
      emptyReads({
        // The only group is closed, so the active set is empty.
        fetchAllGroups: async () => ok([group("g1", "Closed", "closed")]),
        fetchGroupHealthRubricSetting: rubricSetting,
        fetchGroupHealthAssessmentsForPeriod: assessments,
        fetchLatestFollowUpFlags: followUps,
        fetchAttendanceSessions: sessions,
      }),
      PERIOD
    );
    expect(res).toEqual({ data: [], error: null });
    expect(rubricSetting).not.toHaveBeenCalled();
    expect(assessments).not.toHaveBeenCalled();
    expect(followUps).not.toHaveBeenCalled();
    expect(sessions).not.toHaveBeenCalled();
  });

  it("propagates a rubric-setting read failure", async () => {
    const res = await buildGroupHealthOverview(
      emptyReads({
        fetchAllGroups: async () => ok([group("g1", "Alpha")]),
        fetchGroupHealthRubricSetting: async () => fail("rubric boom"),
      }),
      PERIOD
    );
    expect(res.data).toBeNull();
    expect(res.error?.message).toBe("fetchGroupHealthRubric: rubric boom");
  });

  it("propagates a decline-margin (metric defaults) read failure", async () => {
    // The rubric build reads metric defaults first; fail only the overview's
    // own decline-margin read (the second call) to pin its prefix.
    let calls = 0;
    const res = await buildGroupHealthOverview(
      emptyReads({
        fetchAllGroups: async () => ok([group("g1", "Alpha")]),
        fetchMetricDefaultsCached: async () => {
          calls += 1;
          return calls === 1 ? ok(null) : fail("defaults boom");
        },
      }),
      PERIOD
    );
    expect(res.data).toBeNull();
    expect(res.error?.message).toBe(
      "listGroupHealthOverview/metricDefaults: defaults boom"
    );
  });

  it("propagates an assessments read failure", async () => {
    const res = await buildGroupHealthOverview(
      emptyReads({
        fetchAllGroups: async () => ok([group("g1", "Alpha")]),
        fetchGroupHealthAssessmentsForPeriod: async () => fail("boom"),
      }),
      PERIOD
    );
    expect(res.data).toBeNull();
    expect(res.error?.message).toBe(
      "listGroupHealthOverview/assessments: boom"
    );
  });

  it("propagates a latest-follow-up view read failure", async () => {
    const res = await buildGroupHealthOverview(
      emptyReads({
        fetchAllGroups: async () => ok([group("g1", "Alpha")]),
        fetchLatestFollowUpFlags: async () => fail("boom"),
      }),
      PERIOD
    );
    expect(res.data).toBeNull();
    expect(res.error?.message).toBe("listGroupHealthOverview/followUp: boom");
  });

  it("falls back to the persisted assessment (flagged stale) when one group's attendance read fails, while other groups grade live", async () => {
    const res = await buildGroupHealthOverview(
      emptyReads({
        fetchAllGroups: async () =>
          ok([group("g1", "Alpha"), group("g2", "Beta")]),
        fetchAttendanceSessions: async (options) => {
          if (options?.groupId === "g1") return fail("attendance boom");
          return ok([session("s2", "2026-06-08")]);
        },
        fetchAttendanceRecordsForSessions: async () =>
          ok([record("s2", "present"), record("s2", "present")]),
        fetchGroupHealthAssessmentsForPeriod: async () =>
          ok([
            assessment("g1", {
              attendance_pct: 55,
              attendance_weeks_counted: 4,
              computed_letter: "B",
              updated_at: "2026-06-02T00:00:00Z",
            }),
          ]),
      }),
      PERIOD
    );
    expect(res.error).toBeNull();
    const [g1, g2] = res.data ?? [];

    // g1: last-known-good from the persisted row, flagged stale — never a
    // false zero and never a page-wide failure.
    expect(g1.stale).toBe(true);
    expect(g1.unassessed).toBe(false);
    expect(g1.attendance_pct).toBe(55);
    expect(g1.attendance_weeks_counted).toBe(4);
    expect(g1.computed_letter).toBe("B");
    expect(g1.last_saved_at).toBe("2026-06-02T00:00:00Z");
    // No fresh window on a failed read: no check-in week, no trend claim.
    expect(g1.last_check_in_week).toBeNull();
    expect(g1.attendance_declining).toBe(false);

    // g2 still grades live: 100% attendance is an A under the built-in
    // cut-lines, with the check-in week taken from the fetched sessions.
    expect(g2.stale).toBe(false);
    expect(g2.attendance_pct).toBe(100);
    expect(g2.computed_letter).toBe("A");
    expect(g2.last_check_in_week).toBe("2026-06-08");
  });

  it("marks a failed read with no persisted row unassessed, not stale", async () => {
    const res = await buildGroupHealthOverview(
      emptyReads({
        fetchAllGroups: async () => ok([group("g1", "Alpha")]),
        fetchAttendanceSessions: async () => fail("attendance boom"),
      }),
      PERIOD
    );
    expect(res.error).toBeNull();
    const [g1] = res.data ?? [];
    expect(g1.stale).toBe(false);
    expect(g1.unassessed).toBe(true);
    expect(g1.computed_letter).toBeNull();
  });

  it("maps needs_follow_up from the latest-follow-up view row (carried across months)", async () => {
    const res = await buildGroupHealthOverview(
      emptyReads({
        fetchAllGroups: async () =>
          ok([group("g1", "Alpha"), group("g2", "Beta")]),
        // The view row is the group's latest assessment of ANY month — no
        // current-period assessment exists here, yet the flag still carries.
        fetchLatestFollowUpFlags: async () =>
          ok([{ group_id: "g1", needs_follow_up: true }]),
      }),
      PERIOD
    );
    expect(res.error).toBeNull();
    const [g1, g2] = res.data ?? [];
    expect(g1.needs_follow_up).toBe(true);
    expect(g2.needs_follow_up).toBe(false);
  });

  it("fans out attendance reads at max(rubric window, trend window) weeks", async () => {
    const limitsFor = async (attendanceWindowWeeks: number) => {
      const limits: Array<number | undefined> = [];
      await buildGroupHealthOverview(
        emptyReads({
          fetchAllGroups: async () => ok([group("g1", "Alpha")]),
          fetchGroupHealthRubricSetting: async () =>
            ok(setting({ attendance_window_weeks: attendanceWindowWeeks })),
          fetchAttendanceSessions: async (options) => {
            limits.push(options?.limit);
            return ok([]);
          },
        }),
        PERIOD
      );
      return limits;
    };

    // A rubric window below the 8-week trend span still fetches 8 weeks, so
    // the declining leg's prior half-window can fill.
    expect(await limitsFor(4)).toEqual([ATTENDANCE_TREND_WINDOW_WEEKS]);
    // A wider rubric window wins.
    expect(await limitsFor(12)).toEqual([12]);
  });
});

describe("buildGroupHealthOverviewForGroup", () => {
  it("returns the graded row for an active group", async () => {
    const res = await buildGroupHealthOverviewForGroup(
      emptyReads({
        fetchGroupsByIds: async () => ok([group("g1", "Alpha")]),
        fetchGroupHealthAssessment: async () =>
          ok(
            assessment("g1", {
              spiritual_growth_score: 4,
              group_question_score: 3,
              updated_at: "2026-06-02T00:00:00Z",
            })
          ),
        fetchLatestFollowUpFlagForGroup: async () =>
          ok({ group_id: "g1", needs_follow_up: true }),
      }),
      "g1",
      PERIOD
    );
    expect(res.error).toBeNull();
    expect(res.data?.group_id).toBe("g1");
    expect(res.data?.group_name).toBe("Alpha");
    expect(res.data?.needs_follow_up).toBe(true);
    expect(res.data?.spiritual_growth_score).toBe(4);
    expect(res.data?.group_question_score).toBe(3);
    expect(res.data?.last_saved_at).toBe("2026-06-02T00:00:00Z");
    // No attendance on record: the built-in weights renormalize over the two
    // ratings (4→75, 3→50 at 40/20) — a 66.7 numeric, letter C.
    expect(res.data?.attendance_pct).toBeNull();
    expect(res.data?.computed_letter).toBe("C");
    expect(res.data?.unassessed).toBe(false);
  });

  it("returns null (not an error) for an unknown group", async () => {
    const res = await buildGroupHealthOverviewForGroup(
      emptyReads(),
      "missing",
      PERIOD
    );
    expect(res).toEqual({ data: null, error: null });
  });

  it("treats a closed group as not assessed without further reads", async () => {
    const rubricSetting = vi.fn(async () => ok(null));
    const res = await buildGroupHealthOverviewForGroup(
      emptyReads({
        fetchGroupsByIds: async () => ok([group("g1", "Alpha", "closed")]),
        fetchGroupHealthRubricSetting: rubricSetting,
      }),
      "g1",
      PERIOD
    );
    expect(res).toEqual({ data: null, error: null });
    expect(rubricSetting).not.toHaveBeenCalled();
  });

  it("propagates a group read failure", async () => {
    const res = await buildGroupHealthOverviewForGroup(
      emptyReads({ fetchGroupsByIds: async () => fail("boom") }),
      "g1",
      PERIOD
    );
    expect(res.data).toBeNull();
    expect(res.error?.message).toBe(
      "getGroupHealthOverviewForGroup/group: boom"
    );
  });

  it("propagates an assessment read failure", async () => {
    const res = await buildGroupHealthOverviewForGroup(
      emptyReads({
        fetchGroupsByIds: async () => ok([group("g1", "Alpha")]),
        fetchGroupHealthAssessment: async () => fail("boom"),
      }),
      "g1",
      PERIOD
    );
    expect(res.data).toBeNull();
    expect(res.error?.message).toBe(
      "getGroupHealthOverviewForGroup/assessment: boom"
    );
  });

  it("propagates a follow-up view read failure", async () => {
    const res = await buildGroupHealthOverviewForGroup(
      emptyReads({
        fetchGroupsByIds: async () => ok([group("g1", "Alpha")]),
        fetchLatestFollowUpFlagForGroup: async () => fail("boom"),
      }),
      "g1",
      PERIOD
    );
    expect(res.data).toBeNull();
    expect(res.error?.message).toBe(
      "getGroupHealthOverviewForGroup/followUp: boom"
    );
  });
});
