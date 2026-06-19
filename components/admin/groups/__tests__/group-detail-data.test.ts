import { describe, expect, it } from "vitest";

import {
  buildGroupDetailData,
  buildGroupTabData,
  resolveGroupSpine,
  type GroupDetailOptions,
  type GroupDetailReads,
} from "@/components/admin/groups/group-detail-data";
import type { ReadResult } from "@/lib/supabase/read-core";

const ok = <T>(data: T): ReadResult<T> => ({ data, error: null });
const fail = (message: string): ReadResult<never> => ({
  data: null,
  error: new Error(message),
});

const GROUP_ID = "00000000-0000-4000-8000-000000000001";
const LEADER_PROFILE_ID = "00000000-0000-4000-8000-0000000000b1";

const GROUP = {
  id: GROUP_ID,
  name: "Tuesday Night Life Group",
  lifecycle_status: "active",
  meeting_day: "Tuesday",
  meeting_time: "19:00:00",
  meeting_frequency: "weekly",
  meeting_week_parity: null,
  capacity: 12,
  location_area: "North side",
  description: null,
};

const HEALTH_ROW = {
  group_id: GROUP_ID,
  group_name: "Tuesday Night Life Group",
  attendance_pct: 78.4,
  attendance_weeks_counted: 6,
  spiritual_growth_score: 4,
  spiritual_growth_note: null,
  group_question_score: 3,
  group_question_leader_reported: false,
  computed_letter: "A",
  last_check_in_week: "2026-06-01",
  last_saved_at: null,
  stale: false,
  unassessed: false,
  needs_follow_up: false,
  attendance_declining: false,
};

// A successful baseline for every read; each test overrides only the reads it
// cares about. This fake satisfies the same `GroupDetailReads` the live
// `supabaseGroupDetailReads` adapter does, so the fail-closed rules per tab
// are exercised with no database.
function detailReads(
  overrides: Partial<GroupDetailReads> = {}
): GroupDetailReads {
  return {
    fetchGroupsByIds: async () => ok([GROUP] as never),
    fetchAllGroupLeaders: async () =>
      ok([
        {
          id: "gl-1",
          group_id: GROUP_ID,
          profile_id: LEADER_PROFILE_ID,
          role: "leader",
          active: true,
        },
        // A leader of ANOTHER group, to pin the per-group filter.
        {
          id: "gl-2",
          group_id: "other-group",
          profile_id: "p-other",
          role: "leader",
          active: true,
        },
      ] as never),
    fetchActiveMemberships: async () =>
      ok([
        { group_id: GROUP_ID, member_id: "m-1", status: "active" },
        { group_id: GROUP_ID, member_id: "m-2", status: "active" },
        { group_id: GROUP_ID, member_id: "m-3", status: "active" },
      ] as never),
    fetchMetricDefaults: async () => ok(null),
    fetchGroupMetricSettings: async () => ok(null),
    fetchGroupHealthOverview: async () => ok(HEALTH_ROW as never),
    // Super-Admin-only via RLS: a ministry admin reads null and the labels
    // fall back to the documented placeholders.
    fetchPlatformConfig: async () => ok(null),
    fetchProfilesForAdmin: async () =>
      ok([
        { id: LEADER_PROFILE_ID, full_name: "Avery Leader", status: "active" },
        // Not on this group's roster → an assignable option.
        { id: "p-bench", full_name: "Drew Bench", status: "active" },
        // Inactive profiles are never offered for assignment.
        { id: "p-idle", full_name: "Em Inactive", status: "inactive" },
      ] as never),
    fetchAllMembers: async () =>
      ok([
        { id: "m-1", full_name: "Avery Member", status: "active" },
        { id: "m-2", full_name: "Blair Member", status: "active" },
        { id: "m-3", full_name: "Casey Former", status: "inactive" },
        // Not on this group's roster → an assignable option.
        { id: "m-4", full_name: "Drew Available", status: "active" },
      ] as never),
    fetchMembersByIds: async () =>
      ok([
        { id: "m-2", full_name: "Blair Member", status: "active" },
        { id: "m-1", full_name: "Avery Member", status: "active" },
        { id: "m-3", full_name: "Casey Former", status: "inactive" },
      ] as never),
    fetchGroupHealthRatings: async () =>
      ok({
        spiritual_growth_score: 4,
        spiritual_growth_note: null,
        group_question_score: 3,
      } as never),
    fetchAttendanceSessions: async () =>
      ok([
        {
          id: "s-1",
          group_id: GROUP_ID,
          meeting_week: "2026-06-01",
          status: "submitted",
        },
      ] as never),
    fetchOpenFollowUps: async () =>
      ok([
        {
          id: "f-1",
          title: "Call the leader",
          type: "pastoral_care",
          priority: "high",
          related_group_id: GROUP_ID,
          leader_visible_note: null,
        },
      ] as never),
    fetchGroupCalendarEvents: async () => ok([] as never),
    fetchProspectSignalsForGroup: async () =>
      ok({
        matched: [{ id: "pr-1", full_name: "Morgan Prospect" }],
        joinedCount: 2,
      }),
    fetchCheckInsLive: async () => false,
    ...overrides,
  };
}

function options(
  tab: GroupDetailOptions["tab"],
  extra: Partial<GroupDetailOptions> = {}
): GroupDetailOptions {
  return {
    groupId: GROUP_ID,
    tab,
    periodMonth: "2026-06-01",
    todayIso: "2026-06-10",
    ...extra,
  };
}

// The streaming route (repo-sweep #605) loads the spine and the per-tab data
// through these split helpers so the tab can render behind a Suspense boundary.
// buildGroupDetailData (covered below) composes both, but assert the split
// contract directly since the route now depends on it.
describe("split loaders (spine / tab)", () => {
  it("resolveGroupSpine returns the group, or null when none is found", async () => {
    expect(await resolveGroupSpine(detailReads(), GROUP_ID)).toMatchObject({
      id: GROUP_ID,
    });
    expect(
      await resolveGroupSpine(
        detailReads({ fetchGroupsByIds: async () => ok([]) }),
        GROUP_ID
      )
    ).toBeNull();
  });

  it("resolveGroupSpine throws to the route error boundary on a failed read", async () => {
    await expect(
      resolveGroupSpine(
        detailReads({ fetchGroupsByIds: async () => fail("spine boom") }),
        GROUP_ID
      )
    ).rejects.toThrow("spine boom");
  });

  it("buildGroupTabData runs only the requested tab against a resolved group", async () => {
    let healthCalled = false;
    const tabData = await buildGroupTabData(
      detailReads({
        fetchGroupHealthOverview: async () => {
          healthCalled = true;
          return ok(HEALTH_ROW as never);
        },
      }),
      GROUP as never,
      options("follow-ups")
    );
    expect(tabData.tab).toBe("follow-ups");
    // The spine is not re-read and the non-requested tab's reads never fire.
    expect(healthCalled).toBe(false);
  });
});

describe("buildGroupDetailData", () => {
  it("yields the 404 shape when the group read succeeds but finds nothing", async () => {
    expect(
      await buildGroupDetailData(
        detailReads({ fetchGroupsByIds: async () => ok([]) }),
        options("overview")
      )
    ).toEqual({ kind: "not_found" });
  });

  it("throws to the route error boundary when the spine read fails", async () => {
    // Unchanged from the pre-seam page: a failed group read is neither a 404
    // nor a degraded render — it surfaces as the route error.
    await expect(
      buildGroupDetailData(
        detailReads({ fetchGroupsByIds: async () => fail("spine boom") }),
        options("overview")
      )
    ).rejects.toThrow("spine boom");
  });

  it("only runs the requested tab's reads", async () => {
    let healthCalled = false;
    let followUpsCalled = false;
    const result = await buildGroupDetailData(
      detailReads({
        fetchGroupHealthOverview: async () => {
          healthCalled = true;
          return ok(HEALTH_ROW as never);
        },
        fetchOpenFollowUps: async () => {
          followUpsCalled = true;
          return ok([] as never);
        },
      }),
      options("follow-ups")
    );

    if (result.kind !== "ok") throw new Error("expected ok");
    expect(followUpsCalled).toBe(true);
    // The overview/health reads never fire for a follow-ups deep link.
    expect(healthCalled).toBe(false);
  });

  describe("overview tab", () => {
    it("derives the four status labels when every feeding read succeeds", async () => {
      const result = await buildGroupDetailData(
        detailReads(),
        options("overview")
      );

      if (result.kind !== "ok") throw new Error("expected ok");
      expect(result.group).toMatchObject({ id: GROUP_ID });
      expect(result.tabData).toEqual({
        tab: "overview",
        statuses: {
          lifecycle: "active",
          setup: "complete",
          // Grade A against the built-in Watch threshold (C).
          health: "no_concerns",
          // 3 members of an effective capacity of 12.
          capacity: "open",
        },
        stale: false,
        memberCount: 3,
      });
    });

    it("fails closed on the statuses when any feeding read fails", async () => {
      const result = await buildGroupDetailData(
        detailReads({
          fetchGroupHealthOverview: async () => fail("health boom"),
        }),
        options("overview")
      );

      if (result.kind !== "ok") throw new Error("expected ok");
      if (result.tabData.tab !== "overview") throw new Error("wrong tab");
      // No confidently-wrong "Not assessed" / "Needs leader" / "Open" badge.
      expect(result.tabData.statuses).toBeNull();
      // The member count came from its own successful read and survives.
      expect(result.tabData.memberCount).toBe(3);
    });

    it("suppresses the member count when the memberships read fails", async () => {
      const result = await buildGroupDetailData(
        detailReads({
          fetchActiveMemberships: async () => fail("memberships boom"),
        }),
        options("overview")
      );

      if (result.kind !== "ok") throw new Error("expected ok");
      if (result.tabData.tab !== "overview") throw new Error("wrong tab");
      expect(result.tabData.statuses).toBeNull();
      // "—", never a false zero.
      expect(result.tabData.memberCount).toBeNull();
    });
  });

  describe("people tab", () => {
    it("assembles the roster plus the assignable options", async () => {
      const result = await buildGroupDetailData(
        detailReads(),
        options("people")
      );

      if (result.kind !== "ok") throw new Error("expected ok");
      expect(result.tabData).toEqual({
        tab: "people",
        archived: false,
        // Only this group's leader links, with resolved names and the
        // profile id the remove action keys on.
        leaders: [
          {
            id: "gl-1",
            profileId: LEADER_PROFILE_ID,
            name: "Avery Leader",
            isCoLeader: false,
          },
        ],
        // Active members only, sorted by name.
        members: [
          { id: "m-1", fullName: "Avery Member" },
          { id: "m-2", fullName: "Blair Member" },
        ],
        // Active people NOT already on the roster; inactive people excluded.
        assignableLeaders: [{ id: "p-bench", name: "Drew Bench" }],
        assignableMembers: [{ id: "m-4", name: "Drew Available" }],
        // This group's Interest Funnel view (group-level only).
        prospectSignals: {
          matched: [{ id: "pr-1", full_name: "Morgan Prospect" }],
          joinedCount: 2,
        },
      });
    });

    it("suppresses the funnel card when the prospect read fails", async () => {
      const result = await buildGroupDetailData(
        detailReads({
          fetchProspectSignalsForGroup: async () => fail("prospects boom"),
        }),
        options("people")
      );

      if (result.kind !== "ok") throw new Error("expected ok");
      if (result.tabData.tab !== "people") throw new Error("wrong tab");
      // null → degraded note, never a false "no prospects matched".
      expect(result.tabData.prospectSignals).toBeNull();
      // The roster itself is unaffected.
      expect(result.tabData.leaders).toHaveLength(1);
      expect(result.tabData.members).toHaveLength(2);
    });

    it("suppresses the leaders list AND its assign options when the profiles read fails", async () => {
      const result = await buildGroupDetailData(
        detailReads({
          fetchProfilesForAdmin: async () => fail("profiles boom"),
        }),
        options("people")
      );

      if (result.kind !== "ok") throw new Error("expected ok");
      if (result.tabData.tab !== "people") throw new Error("wrong tab");
      // Leader names come from the profiles read, so the whole list fails
      // closed rather than rendering every leader as "(unknown)" — and the
      // assign control can't offer trustworthy options either.
      expect(result.tabData.leaders).toBeNull();
      expect(result.tabData.assignableLeaders).toBeNull();
      expect(result.tabData.members).toHaveLength(2);
      expect(result.tabData.assignableMembers).toEqual([
        { id: "m-4", name: "Drew Available" },
      ]);
    });

    it("derives the roster from the already-loaded pool, with no second members read", async () => {
      let byIdCalled = false;
      const result = await buildGroupDetailData(
        detailReads({
          fetchMembersByIds: async () => {
            byIdCalled = true;
            return fail("must not be called");
          },
        }),
        options("people")
      );

      if (result.kind !== "ok") throw new Error("expected ok");
      if (result.tabData.tab !== "people") throw new Error("wrong tab");
      // A non-archived group reuses the member pool it already loaded for the
      // assign control, so the People tab makes no by-id round-trip — and the
      // roster is still the active in-roster members, sorted by name.
      expect(byIdCalled).toBe(false);
      expect(result.tabData.members).toEqual([
        { id: "m-1", fullName: "Avery Member" },
        { id: "m-2", fullName: "Blair Member" },
      ]);
    });

    it("suppresses the roster and member options when the member pool read fails", async () => {
      const result = await buildGroupDetailData(
        detailReads({ fetchAllMembers: async () => fail("pool boom") }),
        options("people")
      );

      if (result.kind !== "ok") throw new Error("expected ok");
      if (result.tabData.tab !== "people") throw new Error("wrong tab");
      // The pool now backs the roster (the roster is a subset of those same
      // rows), so a failed pool read fails the roster closed rather than
      // rendering a partial one — and the not-already-assigned difference can't
      // be computed either, so the assign control is suppressed too.
      expect(result.tabData.members).toBeNull();
      expect(result.tabData.assignableMembers).toBeNull();
      // Leaders come from their own reads and are unaffected.
      expect(result.tabData.leaders).toEqual([
        {
          id: "gl-1",
          profileId: LEADER_PROFILE_ID,
          name: "Avery Leader",
          isCoLeader: false,
        },
      ]);
    });

    it("reads an archived group's roster by id and fails it closed on a failed read", async () => {
      const result = await buildGroupDetailData(
        detailReads({
          fetchGroupsByIds: async () =>
            ok([{ ...GROUP, lifecycle_status: "closed" }] as never),
          fetchMembersByIds: async () => fail("members boom"),
        }),
        options("people")
      );

      if (result.kind !== "ok") throw new Error("expected ok");
      if (result.tabData.tab !== "people") throw new Error("wrong tab");
      // The archived roster is read-only and skips the pool, so it still reads
      // members by id — and fails closed when that read fails.
      expect(result.tabData.archived).toBe(true);
      expect(result.tabData.members).toBeNull();
    });

    it("renders an archived group's roster read-only with no assign options", async () => {
      let poolRead = false;
      const result = await buildGroupDetailData(
        detailReads({
          fetchGroupsByIds: async () =>
            ok([{ ...GROUP, lifecycle_status: "closed" }] as never),
          fetchAllMembers: async () => {
            poolRead = true;
            return ok([] as never);
          },
        }),
        options("people")
      );

      if (result.kind !== "ok") throw new Error("expected ok");
      if (result.tabData.tab !== "people") throw new Error("wrong tab");
      expect(result.tabData.archived).toBe(true);
      // The roster still shows; the assign options are off entirely — and the
      // member pool isn't even read.
      expect(result.tabData.leaders).toHaveLength(1);
      expect(result.tabData.assignableLeaders).toBeNull();
      expect(result.tabData.assignableMembers).toBeNull();
      expect(poolRead).toBe(false);
    });
  });

  describe("health tab", () => {
    it("carries the grade, ratings, and the shared editor's row + labels on success", async () => {
      const result = await buildGroupDetailData(
        detailReads(),
        options("health")
      );

      if (result.kind !== "ok") throw new Error("expected ok");
      expect(result.tabData).toEqual({
        tab: "health",
        failed: false,
        period: "2026-06-01",
        health: "no_concerns",
        grade: "A",
        stale: false,
        attendancePct: 78.4,
        attendanceWeeksCounted: 6,
        spiritualGrowthScore: 4,
        groupQuestionScore: 3,
        // The full overview row flows through for the shared editor drawer.
        editorRow: HEALTH_ROW,
        // platform_config read null (Super-Admin-only RLS) → the documented
        // placeholder wordings, same fallback the triage uses.
        spiritualGrowthLabel: "Spiritual growth (1–5)",
        groupQuestionLabel: "Group engagement — shepherd-reported (1–5)",
      });
    });

    it("fails closed as a whole when the ratings read fails", async () => {
      const result = await buildGroupDetailData(
        detailReads({
          fetchGroupHealthRatings: async () => fail("ratings boom"),
        }),
        options("health")
      );

      if (result.kind !== "ok") throw new Error("expected ok");
      if (result.tabData.tab !== "health") throw new Error("wrong tab");
      // A failed read must not masquerade as a genuine "Not rated" grade —
      // and no editor opens over unknown values.
      expect(result.tabData.failed).toBe(true);
      expect(result.tabData.editorRow).toBeNull();
    });
  });

  describe("attendance tab", () => {
    it("lists sessions with the frozen-surface flag on success", async () => {
      const result = await buildGroupDetailData(
        detailReads({ fetchCheckInsLive: async () => true }),
        options("attendance")
      );

      if (result.kind !== "ok") throw new Error("expected ok");
      if (result.tabData.tab !== "attendance") throw new Error("wrong tab");
      expect(result.tabData.checkInsLive).toBe(true);
      expect(result.tabData.sessions).toHaveLength(1);
    });

    it("suppresses the session list when its read fails", async () => {
      const result = await buildGroupDetailData(
        detailReads({
          fetchAttendanceSessions: async () => fail("sessions boom"),
        }),
        options("attendance")
      );

      if (result.kind !== "ok") throw new Error("expected ok");
      if (result.tabData.tab !== "attendance") throw new Error("wrong tab");
      // null, not [] — "no sessions on record" must stay an honest claim.
      expect(result.tabData.sessions).toBeNull();
      expect(result.tabData.checkInsLive).toBe(false);
    });
  });

  describe("follow-ups tab", () => {
    it("lists open follow-ups on success", async () => {
      const result = await buildGroupDetailData(
        detailReads(),
        options("follow-ups")
      );

      if (result.kind !== "ok") throw new Error("expected ok");
      if (result.tabData.tab !== "follow-ups") throw new Error("wrong tab");
      expect(result.tabData.followUps).toHaveLength(1);
    });

    it("suppresses the list when the read fails", async () => {
      const result = await buildGroupDetailData(
        detailReads({ fetchOpenFollowUps: async () => fail("fu boom") }),
        options("follow-ups")
      );

      if (result.kind !== "ok") throw new Error("expected ok");
      if (result.tabData.tab !== "follow-ups") throw new Error("wrong tab");
      // null, not [] — a failed read is not a confirmation of none.
      expect(result.tabData.followUps).toBeNull();
    });
  });

  describe("events tab", () => {
    it("generates schedule occurrences and merges saved overrides", async () => {
      const result = await buildGroupDetailData(
        detailReads({
          fetchGroupCalendarEvents: async () =>
            ok([
              {
                id: "ev-1",
                group_id: GROUP_ID,
                event_date: "2026-06-16",
                event_type: "study",
                status: "cancelled",
                title: null,
                description: null,
                archived_at: null,
              },
            ] as never),
        }),
        options("events")
      );

      if (result.kind !== "ok") throw new Error("expected ok");
      if (result.tabData.tab !== "events") throw new Error("wrong tab");
      const occurrences = result.tabData.occurrences;
      if (occurrences === null) throw new Error("expected occurrences");
      // Every Tuesday in the 56-day window from 2026-06-10 (a Wednesday).
      expect(occurrences.map((o) => o.date)).toEqual([
        "2026-06-16",
        "2026-06-23",
        "2026-06-30",
        "2026-07-07",
        "2026-07-14",
        "2026-07-21",
        "2026-07-28",
        "2026-08-04",
      ]);
      // The saved override cancels the first occurrence rather than letting
      // the generated default present it as a live meeting.
      expect(occurrences[0]).toMatchObject({
        status: "cancelled",
        overrideId: "ev-1",
      });
      expect(occurrences[1]).toMatchObject({
        status: "scheduled",
        overrideId: null,
        meetingTime: "19:00",
      });
    });

    it("fails closed when the override read fails", async () => {
      const result = await buildGroupDetailData(
        detailReads({
          fetchGroupCalendarEvents: async () => fail("calendar boom"),
        }),
        options("events")
      );

      if (result.kind !== "ok") throw new Error("expected ok");
      if (result.tabData.tab !== "events") throw new Error("wrong tab");
      // Without the overrides we cannot tell which generated occurrences were
      // cancelled — never show the un-overridden schedule as live meetings.
      expect(result.tabData.occurrences).toBeNull();
    });
  });
});
