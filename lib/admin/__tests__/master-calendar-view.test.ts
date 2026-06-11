import { describe, expect, it } from "vitest";
import {
  ALL_TYPE_OPTIONS,
  EMPTY_CALENDAR_FILTERS,
  calendarActiveFilterChips,
  calendarFilterSummarySegments,
  calendarListRange,
  countActiveCalendarFilters,
  filterCalendarOccurrences,
  hasActiveCalendarFilters,
  isCalendarViewSnapshot,
  responsiveViewMode,
  viewModePreferenceToPersist,
  type CalendarFilterableOccurrence,
  type CalendarFilters,
} from "@/lib/admin/master-calendar-view";

// A scheduled Tuesday study with one leader; each test overrides only the
// fields under test.
function occ(
  overrides: Partial<CalendarFilterableOccurrence> = {}
): CalendarFilterableOccurrence {
  return {
    groupId: "g-1",
    eventType: "study",
    status: "scheduled",
    weekdayIndex: 2,
    leaders: [{ profileId: "p-1" }],
    ...overrides,
  };
}

function filters(overrides: Partial<CalendarFilters> = {}): CalendarFilters {
  return { ...EMPTY_CALENDAR_FILTERS, ...overrides };
}

const LEADERS = [
  { profileId: "p-1", name: "Dana Cole" },
  { profileId: "p-2", name: "Sam Reed" },
];
const GROUPS = [
  { groupId: "g-1", groupName: "Anderson Life Group" },
  { groupId: "g-2", groupName: "Riverside" },
];

describe("filterCalendarOccurrences", () => {
  it("passes everything through when no filter is active", () => {
    const all = [occ(), occ({ groupId: "g-2" })];
    expect(filterCalendarOccurrences(all, filters())).toEqual(all);
  });

  it("narrows by each dimension", () => {
    const all = [
      occ(),
      occ({ groupId: "g-2" }),
      occ({ eventType: "social" }),
      occ({ status: "cancelled" }),
      occ({ weekdayIndex: 4 }),
      occ({ leaders: [{ profileId: "p-2" }] }),
    ];
    expect(
      filterCalendarOccurrences(all, filters({ groupFilter: ["g-2"] }))
    ).toHaveLength(1);
    expect(
      filterCalendarOccurrences(all, filters({ typeFilter: ["social"] }))
    ).toHaveLength(1);
    expect(
      filterCalendarOccurrences(all, filters({ statusFilter: ["cancelled"] }))
    ).toHaveLength(1);
    expect(
      filterCalendarOccurrences(all, filters({ dayFilter: [4] }))
    ).toHaveLength(1);
    expect(
      filterCalendarOccurrences(all, filters({ leaderFilter: "p-2" }))
    ).toHaveLength(1);
  });

  it("is OR within a multi-value dimension, AND across dimensions", () => {
    const all = [
      occ({ groupId: "g-1", weekdayIndex: 2 }),
      occ({ groupId: "g-2", weekdayIndex: 2 }),
      occ({ groupId: "g-1", weekdayIndex: 4 }),
      occ({ groupId: "g-3", weekdayIndex: 2 }),
    ];
    const kept = filterCalendarOccurrences(
      all,
      filters({ groupFilter: ["g-1", "g-2"], dayFilter: [2] })
    );
    expect(kept.map((o) => o.groupId)).toEqual(["g-1", "g-2"]);
  });

  it("the leader filter matches ANY of an occurrence's leaders (co-led group)", () => {
    const coLed = occ({
      leaders: [{ profileId: "p-1" }, { profileId: "p-2" }],
    });
    expect(
      filterCalendarOccurrences([coLed], filters({ leaderFilter: "p-2" }))
    ).toEqual([coLed]);
    expect(
      filterCalendarOccurrences(
        [occ({ leaders: [] })],
        filters({ leaderFilter: "p-2" })
      )
    ).toHaveLength(0);
  });
});

describe("active-filter counting", () => {
  it("counts every selection across dimensions; the leader counts once", () => {
    expect(countActiveCalendarFilters(filters())).toBe(0);
    expect(
      countActiveCalendarFilters(
        filters({
          groupFilter: ["g-1", "g-2"],
          dayFilter: [0],
          leaderFilter: "p-1",
        })
      )
    ).toBe(4);
    expect(hasActiveCalendarFilters(filters())).toBe(false);
    expect(hasActiveCalendarFilters(filters({ leaderFilter: "p-1" }))).toBe(
      true
    );
  });
});

describe("isCalendarViewSnapshot", () => {
  const valid = {
    viewMode: null,
    groupFilter: ["g-1"],
    typeFilter: ["study"],
    statusFilter: [],
    dayFilter: [2, 4],
    leaderFilter: "",
  };

  it("accepts a snapshot with no explicit view choice (viewMode null)", () => {
    expect(isCalendarViewSnapshot(valid)).toBe(true);
  });

  it("accepts an explicit month/list choice and a known planning view", () => {
    expect(isCalendarViewSnapshot({ ...valid, viewMode: "month" })).toBe(true);
    expect(
      isCalendarViewSnapshot({
        ...valid,
        viewMode: "list",
        planningView: "this-week",
      })
    ).toBe(true);
  });

  it("rejects an unknown view mode or a stale planning-view key", () => {
    expect(isCalendarViewSnapshot({ ...valid, viewMode: "grid" })).toBe(false);
    expect(
      isCalendarViewSnapshot({ ...valid, planningView: "renamed-view" })
    ).toBe(false);
  });

  it("rejects malformed filter arrays and non-objects", () => {
    expect(isCalendarViewSnapshot({ ...valid, dayFilter: ["2"] })).toBe(false);
    expect(isCalendarViewSnapshot({ ...valid, groupFilter: "g-1" })).toBe(
      false
    );
    expect(isCalendarViewSnapshot(null)).toBe(false);
  });
});

describe("view-mode rules (#262/#263)", () => {
  it("persists no preference until the user toggles the view", () => {
    // An auto-selected mobile "list" must not become a sticky choice.
    expect(viewModePreferenceToPersist("list", false)).toBe(null);
    expect(viewModePreferenceToPersist("month", false)).toBe(null);
  });

  it("persists the chosen view once toggled", () => {
    expect(viewModePreferenceToPersist("list", true)).toBe("list");
    expect(viewModePreferenceToPersist("month", true)).toBe("month");
  });

  it("narrow viewports default to list; wide ones to the surface default", () => {
    expect(responsiveViewMode(true, "month")).toBe("list");
    expect(responsiveViewMode(false, "month")).toBe("month");
    // Planning hosts the calendar with a list desktop default (#303).
    expect(responsiveViewMode(false, "list")).toBe("list");
  });
});

describe("calendarListRange", () => {
  it("clips to the visible month by default", () => {
    expect(
      calendarListRange({
        monthIso: "2026-06",
        planningViews: true,
        planningView: "all",
      })
    ).toEqual({ fromIso: "2026-06-01", toIso: "2026-06-30" });
  });

  it('does not clip for the Planning "This week" view (ISO week may spill the month)', () => {
    expect(
      calendarListRange({
        monthIso: "2026-06",
        planningViews: true,
        planningView: "this-week",
      })
    ).toEqual({ fromIso: null, toIso: null });
  });

  it("the frozen calendar (planningViews off) always clips to the month", () => {
    expect(
      calendarListRange({
        monthIso: "2026-06",
        planningViews: false,
        planningView: "this-week",
      })
    ).toEqual({ fromIso: "2026-06-01", toIso: "2026-06-30" });
  });

  it("an unparseable month yields an unclipped range", () => {
    expect(
      calendarListRange({
        monthIso: "not-a-month",
        planningViews: false,
        planningView: "all",
      })
    ).toEqual({ fromIso: null, toIso: null });
  });
});

describe("calendarFilterSummarySegments (#371)", () => {
  it('reads "All <thing>" per dimension when nothing narrows the view', () => {
    expect(
      calendarFilterSummarySegments({
        planningView: "all",
        filters: filters(),
        leaderOptions: LEADERS,
      })
    ).toEqual([
      "All meetings",
      "All groups",
      "All gathering types",
      "All statuses",
      "All meeting days",
    ]);
  });

  it("names the active view, counts groups, and lists chosen values", () => {
    const segments = calendarFilterSummarySegments({
      planningView: "needs-coverage",
      filters: filters({
        groupFilter: ["g-1"],
        typeFilter: ["study", "off"],
        statusFilter: ["cancelled"],
        dayFilter: [0, 6],
        leaderFilter: "p-2",
      }),
      leaderOptions: LEADERS,
    });
    expect(segments[0]).toBe("Needs coverage");
    expect(segments[1]).toBe("1 group");
    expect(segments[2]).toBe("Study, OFF"); // friendly labels, not enum text
    expect(segments[3]).toBe("Cancelled");
    expect(segments[4]).toBe("Sun, Sat");
    expect(segments[5]).toBe("Sam Reed");
  });

  it("pluralizes the group count", () => {
    const segments = calendarFilterSummarySegments({
      planningView: "all",
      filters: filters({ groupFilter: ["g-1", "g-2"] }),
      leaderOptions: LEADERS,
    });
    expect(segments[1]).toBe("2 groups");
  });

  it('falls back to "Leader" for a stale leader id', () => {
    const segments = calendarFilterSummarySegments({
      planningView: "all",
      filters: filters({ leaderFilter: "p-gone" }),
      leaderOptions: LEADERS,
    });
    expect(segments[5]).toBe("Leader");
  });
});

describe("calendarActiveFilterChips", () => {
  it("orders chips group → type → status → day → leader and resolves labels", () => {
    const chips = calendarActiveFilterChips(
      filters({
        groupFilter: ["g-1"],
        typeFilter: ["off"],
        statusFilter: ["off"],
        dayFilter: [3],
        leaderFilter: "p-1",
      }),
      { groups: GROUPS, leaderOptions: LEADERS }
    );
    expect(chips.map((c) => c.category)).toEqual([
      "Group",
      "Type",
      "Status",
      "Day",
      "Leader",
    ]);
    // "OFF" exists in BOTH the type and status filters with the same label;
    // the category keeps the two chips distinguishable when labels coincide.
    expect(chips.map((c) => c.label)).toEqual([
      "Anderson Life Group",
      "OFF",
      "OFF",
      "Wed",
      "Dana Cole",
    ]);
    expect(chips.map((c) => c.key)).toEqual([
      "group:g-1",
      "type:off",
      "status:off",
      "day:3",
      "leader:p-1",
    ]);
  });

  it("remove() drops exactly one selection and keeps the other dimensions by identity", () => {
    const current = filters({
      groupFilter: ["g-1", "g-2"],
      dayFilter: [2],
      leaderFilter: "p-1",
    });
    const chips = calendarActiveFilterChips(current, {
      groups: GROUPS,
      leaderOptions: LEADERS,
    });

    const groupChip = chips.find((c) => c.key === "group:g-2");
    const next = groupChip!.remove(current);
    expect(next.groupFilter).toEqual(["g-1"]);
    // Untouched dimensions keep their array identity so handing them back to
    // their state setters is a referential no-op.
    expect(next.dayFilter).toBe(current.dayFilter);
    expect(next.leaderFilter).toBe("p-1");

    const leaderChip = chips.find((c) => c.key === "leader:p-1");
    expect(leaderChip!.remove(current).leaderFilter).toBe("");
  });

  it("uses fallback labels for stale ids", () => {
    const chips = calendarActiveFilterChips(
      filters({ groupFilter: ["g-gone"], leaderFilter: "p-gone" }),
      { groups: GROUPS, leaderOptions: LEADERS }
    );
    expect(chips.map((c) => c.label)).toEqual(["Group", "Leader"]);
  });
});
