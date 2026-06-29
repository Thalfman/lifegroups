import { describe, expect, it } from "vitest";
import {
  buildActivitySummary,
  laterIso,
  resolveActivityWindow,
} from "@/lib/dashboard/activity-summary";

// The "Recent activity" rollup moved out of the admin dashboard orchestration
// into its own streamed boundary (#802 follow-up). These cover the pure pieces —
// the period/reset floor resolution and the summary assembly/degrade — that used
// to be asserted through buildAdminDashboardData in admin-dashboard-data.test.ts.

const NOW = new Date("2026-05-18T12:00:00Z");

const OK_COUNTS = {
  data: {
    membersJoined: 0,
    followUpsCompleted: 0,
    careTouchpoints: 0,
    prospectsAdded: 0,
  },
  error: null,
} as const;

describe("resolveActivityWindow", () => {
  it("leaves the floor unbounded (all-time) when no reset baseline is set", () => {
    const { period, floorIso } = resolveActivityWindow("all", NOW, null);
    expect(period.grain).toBe("all");
    expect(period.label).toBe("All time");
    expect(floorIso).toBeNull();
  });

  it("floors at the DAY AFTER the reset baseline (reset day excluded)", () => {
    // The reset must drop the band to zero immediately, so the reset DAY itself
    // is excluded — the floor is the day AFTER the baseline.
    const { floorIso } = resolveActivityWindow("all", NOW, "2026-05-10");
    expect(floorIso).toBe("2026-05-11");
  });

  it("takes the later of the period start and the reset baseline", () => {
    // A month grain whose start is AFTER an older baseline keeps the month start
    // (the chosen period is the narrower window).
    const { period, floorIso } = resolveActivityWindow(
      "month",
      NOW,
      "2026-04-01"
    );
    expect(period.toExclusiveIso).toBe("2026-05-19"); // start of tomorrow, church-local
    expect(floorIso).toBe("2026-05-01");
  });

  it("laterIso treats null as unbounded on either side", () => {
    expect(laterIso(null, "2026-05-11")).toBe("2026-05-11");
    expect(laterIso("2026-05-01", null)).toBe("2026-05-01");
    expect(laterIso("2026-05-01", "2026-04-02")).toBe("2026-05-01");
  });
});

// Groups / guests reads are passed as ReadResults so a failed read (→ "—") is
// distinguishable from a genuinely-empty one (→ 0). These helpers keep the calls
// readable.
const okGroups = (data: { launched_on: string | null }[] = []) => ({
  data,
  error: null,
});
const okGuests = (data: { first_attended_date: string | null }[] = []) => ({
  data,
  error: null,
});

describe("buildActivitySummary", () => {
  it("defaults to all-time and stays available when the counts read succeeds", () => {
    const { period, floorIso } = resolveActivityWindow("all", NOW, null);
    const summary = buildActivitySummary(
      period,
      floorIso,
      null,
      okGroups(),
      okGuests(),
      OK_COUNTS
    );

    expect(summary.grain).toBe("all");
    expect(summary.label).toBe("All time");
    expect(summary.extendedAvailable).toBe(true);
    expect(summary.resetBaselineOn).toBeNull();
  });

  it("scopes to the requested grain", () => {
    const { period, floorIso } = resolveActivityWindow("month", NOW, null);
    const summary = buildActivitySummary(
      period,
      floorIso,
      null,
      okGroups(),
      okGuests(),
      OK_COUNTS
    );

    expect(summary.grain).toBe("month");
    expect(summary.label).toBe("This month");
  });

  it("echoes the RAW reset baseline so Home can show 'Reset {date}' / Undo", () => {
    const { period, floorIso } = resolveActivityWindow(
      "all",
      NOW,
      "2026-05-10"
    );
    const summary = buildActivitySummary(
      period,
      floorIso,
      "2026-05-10",
      okGroups(),
      okGuests(),
      OK_COUNTS
    );
    expect(summary.resetBaselineOn).toBe("2026-05-10");
  });

  it("degrades the four productivity counts to null when the counts read errors", () => {
    // The extended counts ride one read; a failure leaves extendedAvailable
    // false and every count null — never a false zero — while the (successfully
    // read) array-derived tiles still resolve to numbers.
    const { period, floorIso } = resolveActivityWindow("all", NOW, null);
    const summary = buildActivitySummary(
      period,
      floorIso,
      null,
      okGroups([{ launched_on: "2026-05-15" }]),
      okGuests([{ first_attended_date: "2026-05-15" }]),
      { data: null, error: new Error("activity counts unavailable") }
    );

    expect(summary.extendedAvailable).toBe(false);
    expect(summary.membersJoined).toBeNull();
    expect(summary.prospectsAdded).toBeNull();
    expect(summary.groupsLaunched).toBe(1);
    expect(summary.guestsWelcomed).toBe(1);
  });

  it("marks Groups launched unavailable (null, not zero) when the groups read errors", () => {
    const { period, floorIso } = resolveActivityWindow("all", NOW, null);
    const summary = buildActivitySummary(
      period,
      floorIso,
      null,
      { data: null, error: new Error("groups read failed") },
      okGuests([{ first_attended_date: "2026-05-15" }]),
      OK_COUNTS
    );

    expect(summary.groupsLaunched).toBeNull();
    // Other tiles, whose reads succeeded, stay live.
    expect(summary.guestsWelcomed).toBe(1);
    expect(summary.extendedAvailable).toBe(true);
  });

  it("marks Guests welcomed unavailable (null, not zero) when the guests read errors", () => {
    const { period, floorIso } = resolveActivityWindow("all", NOW, null);
    const summary = buildActivitySummary(
      period,
      floorIso,
      null,
      okGroups([{ launched_on: "2026-05-15" }]),
      { data: null, error: new Error("guests read failed") },
      OK_COUNTS
    );

    expect(summary.guestsWelcomed).toBeNull();
    expect(summary.groupsLaunched).toBe(1);
    expect(summary.extendedAvailable).toBe(true);
  });

  it("counts only array rows inside the [floorIso, toExclusiveIso) window", () => {
    const { period, floorIso } = resolveActivityWindow(
      "all",
      NOW,
      "2026-05-10"
    );
    const summary = buildActivitySummary(
      period,
      floorIso,
      "2026-05-10",
      okGroups([
        { launched_on: "2026-05-09" }, // before floor (day-after = 05-11) → excluded
        { launched_on: "2026-05-12" }, // in range
        { launched_on: null }, // no date → excluded
      ]),
      okGuests([{ first_attended_date: "2026-05-15" }]),
      OK_COUNTS
    );
    expect(summary.groupsLaunched).toBe(1);
    expect(summary.guestsWelcomed).toBe(1);
  });

  it("surfaces Prospects added from the counts read (#471)", () => {
    const { period, floorIso } = resolveActivityWindow("month", NOW, null);
    const summary = buildActivitySummary(
      period,
      floorIso,
      null,
      okGroups(),
      okGuests(),
      {
        data: {
          membersJoined: 0,
          followUpsCompleted: 0,
          careTouchpoints: 0,
          prospectsAdded: 4,
        },
        error: null,
      }
    );
    expect(summary.prospectsAdded).toBe(4);
  });
});
