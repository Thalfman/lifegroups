import { describe, expect, it } from "vitest";
import {
  filterOccurrencesForView,
  groupOccurrencesByLeader,
  occurrenceIsCancelledOrOff,
  occurrenceIsThisWeek,
  occurrenceNeedsCoverage,
} from "@/lib/admin/planning-views";
import type { MasterOccurrence } from "@/lib/admin/master-calendar";

// A scheduled, real, weekly meeting of an active group with one leader — i.e.
// a fully-covered occurrence. Each test overrides only the field under test so
// the predicate is exercised one condition at a time.
function occ(overrides: Partial<MasterOccurrence> = {}): MasterOccurrence {
  return {
    groupId: "grp-1",
    groupName: "Sunday Night",
    lifecycleStatus: "active",
    meetingDay: "Tuesday",
    meetingTime: "19:00",
    meetingFrequency: "weekly",
    meetingWeekParity: null,
    leaders: [{ profileId: "p-1", name: "Dana Cole" }],
    date: "2026-05-12",
    weekdayIndex: 2,
    inheritedMeetingTime: "19:00",
    eventType: "study",
    status: "scheduled",
    title: null,
    description: null,
    overrideId: null,
    isGenerated: true,
    isMeetingOccurrence: true,
    ...overrides,
  };
}

describe("occurrenceNeedsCoverage", () => {
  it("is true for a scheduled, real meeting of an active group with no leaders", () => {
    expect(occurrenceNeedsCoverage(occ({ leaders: [] }))).toBe(true);
  });

  it("is false when the group already has a leader", () => {
    expect(occurrenceNeedsCoverage(occ())).toBe(false);
  });

  it("is false when a co-leader covers the occurrence", () => {
    expect(
      occurrenceNeedsCoverage(
        occ({ leaders: [{ profileId: "p-2", name: "Sam Reed" }] })
      )
    ).toBe(false);
  });

  it("excludes non-active groups even when unassigned", () => {
    // Every non-active lifecycle is excluded — a paused/closed/at-risk group's
    // empty calendar is not an actionable staffing gap.
    for (const lifecycleStatus of [
      "planned_pause",
      "seasonal_break",
      "launching_soon",
      "needs_leader",
      "at_risk",
      "closed",
    ] as const) {
      expect(
        occurrenceNeedsCoverage(occ({ leaders: [], lifecycleStatus }))
      ).toBe(false);
    }
  });

  it("excludes OFF and cancelled occurrences even when unassigned", () => {
    expect(occurrenceNeedsCoverage(occ({ leaders: [], status: "off" }))).toBe(
      false
    );
    expect(
      occurrenceNeedsCoverage(occ({ leaders: [], status: "cancelled" }))
    ).toBe(false);
  });

  it("excludes special / non-meeting rows even when unassigned", () => {
    expect(
      occurrenceNeedsCoverage(occ({ leaders: [], isMeetingOccurrence: false }))
    ).toBe(false);
  });
});

describe("occurrenceIsCancelledOrOff", () => {
  it("matches OFF and cancelled, not scheduled", () => {
    expect(occurrenceIsCancelledOrOff(occ({ status: "off" }))).toBe(true);
    expect(occurrenceIsCancelledOrOff(occ({ status: "cancelled" }))).toBe(true);
    expect(occurrenceIsCancelledOrOff(occ({ status: "scheduled" }))).toBe(
      false
    );
  });
});

describe("occurrenceIsThisWeek", () => {
  it("matches dates in the same ISO week (Mon–Sun) as today", () => {
    // 2026-05-12 is a Tuesday; 2026-05-13 (Wed) shares its Mon-anchored week.
    expect(
      occurrenceIsThisWeek(occ({ date: "2026-05-12" }), "2026-05-13")
    ).toBe(true);
  });

  it("excludes dates in a neighbouring week", () => {
    expect(
      occurrenceIsThisWeek(occ({ date: "2026-05-12" }), "2026-05-20")
    ).toBe(false);
  });
});

describe("filterOccurrencesForView", () => {
  const today = "2026-05-13";
  const set: MasterOccurrence[] = [
    occ({ groupId: "a", date: "2026-05-12", leaders: [] }), // this week, needs coverage
    occ({ groupId: "b", date: "2026-05-12", status: "cancelled" }), // this week, cancelled
    occ({ groupId: "c", date: "2026-05-26", leaders: [] }), // later week, needs coverage
    occ({ groupId: "d", date: "2026-05-26", status: "off" }), // later week, off
  ];

  it("'all' is a pass-through", () => {
    expect(filterOccurrencesForView(set, "all", today)).toHaveLength(4);
  });

  it("'this-week' keeps only the current ISO week", () => {
    const ids = filterOccurrencesForView(set, "this-week", today).map(
      (o) => o.groupId
    );
    expect(ids).toEqual(["a", "b"]);
  });

  it("'needs-coverage' keeps only actionable staffing gaps", () => {
    const ids = filterOccurrencesForView(set, "needs-coverage", today).map(
      (o) => o.groupId
    );
    // 'a' and 'c' are unassigned, scheduled, active, real meetings. 'b' is
    // cancelled and 'd' is off, so neither is a gap.
    expect(ids).toEqual(["a", "c"]);
  });

  it("'cancelled-off' keeps only cancelled or OFF occurrences", () => {
    const ids = filterOccurrencesForView(set, "cancelled-off", today).map(
      (o) => o.groupId
    );
    expect(ids).toEqual(["b", "d"]);
  });

  it("'by-leader' is a pass-through (grouping happens at render)", () => {
    expect(filterOccurrencesForView(set, "by-leader", today)).toHaveLength(4);
  });
});

describe("groupOccurrencesByLeader", () => {
  it("buckets each occurrence under each of its leaders, sorted by name", () => {
    const groups = groupOccurrencesByLeader([
      occ({ groupId: "a", leaders: [{ profileId: "p-2", name: "Sam Reed" }] }),
      occ({ groupId: "b", leaders: [{ profileId: "p-1", name: "Dana Cole" }] }),
    ]);
    expect(groups.map((g) => g.name)).toEqual(["Dana Cole", "Sam Reed"]);
  });

  it("places an occurrence with co-leaders under each leader", () => {
    const groups = groupOccurrencesByLeader([
      occ({
        groupId: "a",
        leaders: [
          { profileId: "p-1", name: "Dana Cole" },
          { profileId: "p-2", name: "Sam Reed" },
        ],
      }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.occurrences.length === 1)).toBe(true);
  });

  it("collects unassigned occurrences into a trailing Unassigned bucket", () => {
    const groups = groupOccurrencesByLeader([
      occ({ groupId: "a", leaders: [{ profileId: "p-1", name: "Dana Cole" }] }),
      occ({ groupId: "b", leaders: [] }),
    ]);
    const last = groups[groups.length - 1];
    expect(last.profileId).toBeNull();
    expect(last.name).toBe("Unassigned");
    expect(last.occurrences.map((o) => o.groupId)).toEqual(["b"]);
  });

  it("omits the Unassigned bucket when every occurrence has a leader", () => {
    const groups = groupOccurrencesByLeader([occ()]);
    expect(groups.some((g) => g.profileId === null)).toBe(false);
  });
});
