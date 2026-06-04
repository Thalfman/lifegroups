import { describe, expect, it } from "vitest";
import {
  CHECKIN_RANK,
  checkinRankForStatus,
  compareGroupsBy,
  meetingDayIndexFromName,
  meetingMinutesFromTime,
  sortGroupsTableRows,
  type GroupsTableSortRow,
} from "@/lib/dashboard/groups-table-sort";

// A complete, healthy baseline row; each test overrides only the field its
// column cares about so the comparator under test is exercised in isolation.
function row(overrides: Partial<GroupsTableSortRow> = {}): GroupsTableSortRow {
  return {
    name: "Group",
    leaderText: "Pat Lee · Lead",
    setup: "complete",
    health: "no_concerns",
    healthGrade: "B",
    capacity: "open",
    meetingDayIndex: 2,
    meetingMinutes: 19 * 60,
    checkinRank: CHECKIN_RANK.submitted,
    ...overrides,
  };
}

// Sort by a column + direction and return just the names, so assertions read as
// the expected row order.
function order(
  rows: GroupsTableSortRow[],
  key: Parameters<typeof compareGroupsBy>[0],
  dir: Parameters<typeof compareGroupsBy>[1]
): string[] {
  return sortGroupsTableRows(rows, key, dir).map((r) => r.name);
}

describe("sortGroupsTableRows / compareGroupsBy", () => {
  it("does not mutate the input array", () => {
    const rows = [row({ name: "B" }), row({ name: "A" })];
    const snapshot = rows.map((r) => r.name);
    sortGroupsTableRows(rows, "group", "asc");
    expect(rows.map((r) => r.name)).toEqual(snapshot);
  });

  describe("group column", () => {
    it("sorts by name ascending, case-insensitively", () => {
      const rows = [
        row({ name: "charlie" }),
        row({ name: "Alpha" }),
        row({ name: "Bravo" }),
      ];
      expect(order(rows, "group", "asc")).toEqual([
        "Alpha",
        "Bravo",
        "charlie",
      ]);
    });

    it("reverses for descending", () => {
      const rows = [row({ name: "Alpha" }), row({ name: "Bravo" })];
      expect(order(rows, "group", "desc")).toEqual(["Bravo", "Alpha"]);
    });
  });

  describe("leader column", () => {
    it("sorts assigned leaders alphabetically and unassigned last (asc)", () => {
      const rows = [
        row({ name: "Z", leaderText: null }),
        row({ name: "A", leaderText: "Wendy" }),
        row({ name: "B", leaderText: "Casey" }),
      ];
      expect(order(rows, "leader", "asc")).toEqual(["B", "A", "Z"]);
    });

    it("keeps unassigned last even when descending", () => {
      const rows = [
        row({ name: "Z", leaderText: null }),
        row({ name: "A", leaderText: "Wendy" }),
        row({ name: "B", leaderText: "Casey" }),
      ];
      // Desc flips the present leaders (Wendy before Casey) but null still trails.
      expect(order(rows, "leader", "desc")).toEqual(["A", "B", "Z"]);
    });
  });

  describe("setup column", () => {
    it("surfaces the most-in-need setup first ascending", () => {
      const rows = [
        row({ name: "done", setup: "complete" }),
        row({ name: "generic", setup: "needs_setup" }),
        row({ name: "noleader", setup: "needs_leader" }),
        row({ name: "nomeeting", setup: "missing_meeting" }),
      ];
      expect(order(rows, "setup", "asc")).toEqual([
        "noleader",
        "nomeeting",
        "generic",
        "done",
      ]);
    });
  });

  describe("health column", () => {
    it("orders worse grades first ascending, with not-assessed last", () => {
      const rows = [
        row({ name: "a", healthGrade: "A", health: "no_concerns" }),
        row({ name: "d", healthGrade: "D", health: "needs_attention" }),
        row({ name: "none", healthGrade: null, health: "not_assessed" }),
        row({ name: "c", healthGrade: "C", health: "needs_attention" }),
      ];
      expect(order(rows, "health", "asc")).toEqual(["d", "c", "a", "none"]);
    });

    it("breaks ungraded ties by health category", () => {
      const rows = [
        row({ name: "plain", healthGrade: null, health: "not_assessed" }),
        row({ name: "concern", healthGrade: null, health: "needs_attention" }),
      ];
      // needs_attention leads not_assessed even when neither carries a grade.
      expect(order(rows, "health", "asc")).toEqual(["concern", "plain"]);
    });

    it("keeps ungraded rows last when descending", () => {
      const rows = [
        row({ name: "a", healthGrade: "A", health: "no_concerns" }),
        row({ name: "none", healthGrade: null, health: "not_assessed" }),
        row({ name: "d", healthGrade: "D", health: "needs_attention" }),
      ];
      // Desc flips the graded order (best grade first) but "not assessed" must
      // not ride to the top — it stays last in both directions.
      expect(order(rows, "health", "desc")).toEqual(["a", "d", "none"]);
    });
  });

  describe("capacity column", () => {
    it("surfaces fullest first ascending", () => {
      const rows = [
        row({ name: "open", capacity: "open" }),
        row({ name: "full", capacity: "full" }),
        row({ name: "near", capacity: "near_full" }),
      ];
      expect(order(rows, "capacity", "asc")).toEqual(["full", "near", "open"]);
    });
  });

  describe("meeting column", () => {
    it("sorts by day then time, unset day last", () => {
      const rows = [
        row({ name: "wed-late", meetingDayIndex: 3, meetingMinutes: 20 * 60 }),
        row({ name: "wed-early", meetingDayIndex: 3, meetingMinutes: 18 * 60 }),
        row({ name: "mon", meetingDayIndex: 1, meetingMinutes: 19 * 60 }),
        row({ name: "noday", meetingDayIndex: null, meetingMinutes: null }),
      ];
      expect(order(rows, "meeting", "asc")).toEqual([
        "mon",
        "wed-early",
        "wed-late",
        "noday",
      ]);
    });

    it("keeps unset day last when descending", () => {
      const rows = [
        row({ name: "mon", meetingDayIndex: 1, meetingMinutes: 19 * 60 }),
        row({ name: "wed", meetingDayIndex: 3, meetingMinutes: 19 * 60 }),
        row({ name: "noday", meetingDayIndex: null, meetingMinutes: null }),
      ];
      expect(order(rows, "meeting", "desc")).toEqual(["wed", "mon", "noday"]);
    });

    it("keeps an unset time last within a shared day when descending", () => {
      const rows = [
        row({ name: "early", meetingDayIndex: 3, meetingMinutes: 18 * 60 }),
        row({ name: "late", meetingDayIndex: 3, meetingMinutes: 20 * 60 }),
        row({ name: "notime", meetingDayIndex: 3, meetingMinutes: null }),
      ];
      // Desc flips the timed groups (late before early) but the group with no
      // meeting time set stays last for that day rather than leading it.
      expect(order(rows, "meeting", "desc")).toEqual([
        "late",
        "early",
        "notime",
      ]);
    });
  });

  describe("checkin column", () => {
    it("surfaces the groups that still owe a check-in first ascending", () => {
      const rows = [
        row({ name: "submitted", checkinRank: CHECKIN_RANK.submitted }),
        row({ name: "missing", checkinRank: CHECKIN_RANK.not_submitted }),
        row({ name: "norecord", checkinRank: CHECKIN_RANK.no_record }),
      ];
      expect(order(rows, "checkin", "asc")).toEqual([
        "missing",
        "norecord",
        "submitted",
      ]);
    });
  });

  describe("tie-break stability", () => {
    it("falls back to ascending name order on a column tie, in both directions", () => {
      const rows = [
        row({ name: "Bravo", capacity: "open" }),
        row({ name: "Alpha", capacity: "open" }),
      ];
      expect(order(rows, "capacity", "asc")).toEqual(["Alpha", "Bravo"]);
      // Descending the column must not reverse equal-on-column rows.
      expect(order(rows, "capacity", "desc")).toEqual(["Alpha", "Bravo"]);
    });
  });
});

describe("meetingDayIndexFromName", () => {
  it("maps day names to 0=Sun..6=Sat, case-insensitively", () => {
    expect(meetingDayIndexFromName("Sunday")).toBe(0);
    expect(meetingDayIndexFromName("wednesday")).toBe(3);
    expect(meetingDayIndexFromName("  Saturday ")).toBe(6);
  });

  it("returns null for unset or unrecognized days", () => {
    expect(meetingDayIndexFromName(null)).toBeNull();
    expect(meetingDayIndexFromName("")).toBeNull();
    expect(meetingDayIndexFromName("Someday")).toBeNull();
  });
});

describe("meetingMinutesFromTime", () => {
  it("parses HH:MM and HH:MM:SS into minutes since midnight", () => {
    expect(meetingMinutesFromTime("19:00")).toBe(19 * 60);
    expect(meetingMinutesFromTime("09:30:00")).toBe(9 * 60 + 30);
  });

  it("returns null for unset or unparseable times", () => {
    expect(meetingMinutesFromTime(null)).toBeNull();
    expect(meetingMinutesFromTime("evening")).toBeNull();
  });
});

describe("checkinRankForStatus", () => {
  it("ranks known statuses worst-first", () => {
    expect(checkinRankForStatus("not_submitted")).toBe(
      CHECKIN_RANK.not_submitted
    );
    expect(checkinRankForStatus("submitted")).toBe(CHECKIN_RANK.submitted);
    expect(checkinRankForStatus("did_not_meet")).toBe(
      CHECKIN_RANK.did_not_meet
    );
  });

  it("falls back to the no-record rank for a missing or unknown status", () => {
    expect(checkinRankForStatus(null)).toBe(CHECKIN_RANK.no_record);
    expect(checkinRankForStatus("weird")).toBe(CHECKIN_RANK.no_record);
  });
});
