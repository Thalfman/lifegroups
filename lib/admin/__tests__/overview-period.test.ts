import { describe, expect, it } from "vitest";
import {
  OVERVIEW_GRAINS,
  overviewPeriodRange,
  resolveOverviewGrain,
} from "@/lib/admin/overview-period";

// A mid-May 2026 anchor so quarter/month/year boundaries are unambiguous.
const NOW = new Date("2026-05-18T12:00:00Z");

describe("resolveOverviewGrain", () => {
  it("accepts every known grain", () => {
    for (const g of OVERVIEW_GRAINS) {
      expect(resolveOverviewGrain(g)).toBe(g);
    }
  });

  it("defaults to all-time for missing or unknown values", () => {
    expect(resolveOverviewGrain(undefined)).toBe("all");
    expect(resolveOverviewGrain("decade")).toBe("all");
    expect(resolveOverviewGrain("")).toBe("all");
  });

  it("takes the first value when given an array", () => {
    expect(resolveOverviewGrain(["month", "week"])).toBe("month");
  });
});

describe("overviewPeriodRange", () => {
  it("uses an exclusive upper bound of tomorrow so today is included", () => {
    expect(overviewPeriodRange("all", NOW).toExclusiveIso).toBe("2026-05-19");
  });

  it("all-time has no lower bound", () => {
    expect(overviewPeriodRange("all", NOW).fromIso).toBeNull();
  });

  it("month starts on the first of the current month", () => {
    expect(overviewPeriodRange("month", NOW).fromIso).toBe("2026-05-01");
  });

  it("quarter starts at the containing quarter (Q2 → April)", () => {
    expect(overviewPeriodRange("quarter", NOW).fromIso).toBe("2026-04-01");
  });

  it("year starts on Jan 1", () => {
    expect(overviewPeriodRange("year", NOW).fromIso).toBe("2026-01-01");
  });

  it("week has a lower bound on or before today", () => {
    const range = overviewPeriodRange("week", NOW);
    expect(range.fromIso).not.toBeNull();
    expect(range.fromIso! <= "2026-05-18").toBe(true);
  });

  it("carries the human label", () => {
    expect(overviewPeriodRange("quarter", NOW).label).toBe("This quarter");
    expect(overviewPeriodRange("all", NOW).label).toBe("All time");
  });

  it("anchors boundaries to church-local time, not UTC", () => {
    // 2026-06-01T03:00Z is still 2026-05-31 22:00 in America/Chicago (CDT).
    // A UTC basis would start "this month" on June 1 and drop May 31; the
    // church-local basis keeps the window on May.
    const lateMay = new Date("2026-06-01T03:00:00Z");
    const month = overviewPeriodRange("month", lateMay);
    expect(month.fromIso).toBe("2026-05-01");
    expect(month.toExclusiveIso).toBe("2026-06-01");
    expect(overviewPeriodRange("year", lateMay).fromIso).toBe("2026-01-01");
  });
});
