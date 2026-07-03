import { describe, expect, it } from "vitest";

import {
  buildGroupManagementData,
  type GroupManagementReads,
} from "@/components/admin/groups/group-management-data";
import type { ReadResult } from "@/lib/supabase/read-core";
import { buildCareDirectoryEntries } from "@/lib/supabase/shepherd-care-directory-reads";

const ok = <T>(data: T): ReadResult<T> => ({ data, error: null });
const fail = (message: string): ReadResult<never> => ({
  data: null,
  error: new Error(message),
});

function emptyReads(
  overrides: Partial<GroupManagementReads> = {}
): GroupManagementReads {
  return {
    fetchAllGroups: async () => ok([]),
    fetchAllGroupLeaders: async () => ok([]),
    fetchProfilesForAdmin: async () => ok([]),
    fetchActiveMemberships: async () => ok([]),
    fetchLatestMeetingWeek: async () => ok(null),
    fetchMetricDefaults: async () => ok(null),
    fetchAllGroupMetricSettings: async () => ok([]),
    listGroupHealthOverview: async () => ok([]),
    fetchOpenFollowUps: async () => ok([]),
    fetchShepherdCareDirectory: async () => ok([]),
    fetchActiveAssignments: async () => ok([]),
    fetchAttentionBaselines: async () => ok([]),
    fetchAttendanceSessions: async () => ok([]),
    fetchGroupTypes: async () => ok([]),
    ...overrides,
  };
}

describe("buildGroupManagementData", () => {
  it("maps a leader's care concern onto their group", async () => {
    const data = await buildGroupManagementData(
      emptyReads({
        fetchShepherdCareDirectory: async () =>
          ok([
            { profile: { id: "p1" }, needs_attention: true },
            { profile: { id: "p2" }, needs_attention: false },
          ] as never),
        fetchAllGroupLeaders: async () =>
          ok([
            { group_id: "g1", profile_id: "p1", active: true },
            { group_id: "g2", profile_id: "p2", active: true },
          ] as never),
      })
    );

    expect(data.healthSignalsByGroupId.g1?.hasCareConcern).toBe(true);
    // g2's leader has no concern and the group is absent from the overview /
    // follow-ups, so it is never stamped — only groups with a signal appear.
    expect(data.healthSignalsByGroupId.g2).toBeUndefined();
  });

  // A care row last contacted 51 days before "today". With no active
  // over-shepherd the leader is directly-overseen (30-day window) → stale, so
  // the shared rule flags them. The old raw read ran with no coverage context,
  // treating every leader as delegated (60-day window), and would have *missed*
  // this — proving Groups now applies the windows + coverage from the resolver.
  const TODAY = "2026-06-21";
  const careRow = (overrides: Record<string, unknown> = {}) => ({
    id: "c1",
    shepherd_profile_id: "p1",
    current_status: "healthy",
    last_contact_at: "2026-05-01", // 51 days before TODAY
    next_touchpoint_due: null,
    archived_at: null,
    created_at: "2026-05-01",
    updated_at: "2026-05-01",
    ...overrides,
  });

  it("applies coverage windows to the care-concern signal (a case the raw flag missed)", async () => {
    const data = await buildGroupManagementData(
      emptyReads({
        // No active coverage → directly-overseen → 30-day window → 51 days stale.
        fetchActiveAssignments: async () => ok([]),
        fetchShepherdCareDirectory: async (options) =>
          ok(
            buildCareDirectoryEntries(
              [{ id: "p1" }] as never,
              [careRow()] as never,
              options
            )
          ),
        fetchAllGroupLeaders: async () =>
          ok([{ group_id: "g1", profile_id: "p1", active: true }] as never),
      }),
      { todayIso: TODAY }
    );

    expect(data.healthSignalsByGroupId.g1?.hasCareConcern).toBe(true);
  });

  it("respects care attention-reset baselines (a case the raw flag missed)", async () => {
    const data = await buildGroupManagementData(
      emptyReads({
        fetchActiveAssignments: async () => ok([]),
        // A global "care" reset 10 days ago floors the effective last-contact
        // inside the 30-day window, so the leader reads fresh. The old
        // context-free read ignored baselines and would have flagged g1.
        fetchAttentionBaselines: async () =>
          ok([
            {
              id: "b1",
              surface: "care",
              scope: "global",
              entity_id: null,
              baseline_on: "2026-06-11",
            },
          ] as never),
        // 75 days since contact — stale under *either* window, so the old raw
        // read (60-day, no baseline) would have flagged g1. The 10-day-old reset
        // floors the effective contact inside the window and clears it.
        fetchShepherdCareDirectory: async (options) =>
          ok(
            buildCareDirectoryEntries(
              [{ id: "p1" }] as never,
              [careRow({ last_contact_at: "2026-04-07" })] as never,
              options
            )
          ),
        fetchAllGroupLeaders: async () =>
          ok([{ group_id: "g1", profile_id: "p1", active: true }] as never),
      }),
      { todayIso: TODAY }
    );

    // No concern, no follow-up, absent from the overview → never stamped.
    expect(data.healthSignalsByGroupId.g1).toBeUndefined();
  });

  it("stamps a group that has only a follow-up (not in the health overview)", async () => {
    const data = await buildGroupManagementData(
      emptyReads({
        fetchOpenFollowUps: async () =>
          ok([{ related_group_id: "g9" }] as never),
      })
    );

    // g9 never appeared in the health overview, but the follow-up keeps it in
    // Needs Attention rather than being dropped.
    expect(data.healthSignalsByGroupId.g9).toEqual({
      missingRequiredRatings: false,
      hasOpenFollowUp: true,
      hasCareConcern: false,
    });
  });

  it("flags missing required ratings from the health overview row", async () => {
    const data = await buildGroupManagementData(
      emptyReads({
        listGroupHealthOverview: async () =>
          ok([
            {
              group_id: "g1",
              computed_letter: "B",
              spiritual_growth_score: null,
              group_question_score: 4,
              needs_follow_up: false,
            },
          ] as never),
      })
    );

    expect(data.healthSignalsByGroupId.g1?.missingRequiredRatings).toBe(true);
    expect(data.healthGradesByGroupId.g1).toBe("B");
  });

  it("only fetches attendance for the latest week, and folds week errors into sessions", async () => {
    let askedWeek: string | undefined;
    const withWeek = await buildGroupManagementData(
      emptyReads({
        fetchLatestMeetingWeek: async () => ok("2026-06-01"),
        fetchAttendanceSessions: async (options) => {
          askedWeek = options?.meetingWeek;
          return ok([{ id: "s1" }] as never);
        },
      })
    );
    expect(askedWeek).toBe("2026-06-01");
    expect(withWeek.latestSessions).toHaveLength(1);

    const weekFailed = await buildGroupManagementData(
      emptyReads({
        fetchLatestMeetingWeek: async () => fail("week boom"),
      })
    );
    expect(weekFailed.errors.sessions).toBe("week boom");
    expect(weekFailed.latestSessions).toEqual([]);
  });

  it("surfaces a per-read error without blanking the others", async () => {
    const data = await buildGroupManagementData(
      emptyReads({ fetchAllGroups: async () => fail("groups boom") })
    );
    expect(data.errors.groups).toBe("groups boom");
    expect(data.errors.leaders).toBeNull();
  });
});
