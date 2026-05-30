import { describe, expect, it } from "vitest";
import {
  BUILT_IN_CARE_CADENCE_WINDOWS,
  coverageTierForShepherd,
  isCareContactStale,
  staleWindowDaysForTier,
  type CareCadenceWindows,
} from "@/lib/admin/shepherd-care-cadence";

const TODAY = "2026-05-30";
const WINDOWS: CareCadenceWindows = {
  directlyOverseenStaleDays: 30,
  delegatedStaleDays: 60,
};

// Subtract whole days from an ISO date for building fixtures.
function isoDaysAgo(days: number, from = TODAY): string {
  const ms = Date.parse(`${from}T00:00:00Z`) - days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

describe("coverageTierForShepherd — tier derivation", () => {
  it("delegated when an active over-shepherd covers the shepherd", () => {
    expect(coverageTierForShepherd(true)).toBe("delegated");
  });

  it("directly_overseen when no active over-shepherd assignment", () => {
    expect(coverageTierForShepherd(false)).toBe("directly_overseen");
  });
});

describe("staleWindowDaysForTier — window selection", () => {
  it("picks the shorter window for directly-overseen", () => {
    expect(staleWindowDaysForTier("directly_overseen", WINDOWS)).toBe(30);
  });

  it("picks the longer window for delegated", () => {
    expect(staleWindowDaysForTier("delegated", WINDOWS)).toBe(60);
  });

  it("defaults to the built-in 30 / 60 windows", () => {
    expect(staleWindowDaysForTier("directly_overseen")).toBe(
      BUILT_IN_CARE_CADENCE_WINDOWS.directlyOverseenStaleDays,
    );
    expect(staleWindowDaysForTier("delegated")).toBe(
      BUILT_IN_CARE_CADENCE_WINDOWS.delegatedStaleDays,
    );
  });
});

describe("isCareContactStale — per-tier staleness", () => {
  it("treats a never-contacted shepherd as stale regardless of tier", () => {
    for (const tier of ["directly_overseen", "delegated"] as const) {
      expect(
        isCareContactStale({
          lastAdminContactIso: null,
          todayIso: TODAY,
          tier,
          windows: WINDOWS,
        }),
      ).toBe(true);
    }
  });

  it("a directly-overseen shepherd goes stale sooner (45 days > 30-day window)", () => {
    const args = {
      lastAdminContactIso: isoDaysAgo(45),
      todayIso: TODAY,
      windows: WINDOWS,
    };
    // 45 days exceeds the 30-day directly-overseen window...
    expect(isCareContactStale({ ...args, tier: "directly_overseen" })).toBe(true);
    // ...but not the 60-day delegated window.
    expect(isCareContactStale({ ...args, tier: "delegated" })).toBe(false);
  });

  it("is not stale exactly at the window boundary (strictly greater)", () => {
    expect(
      isCareContactStale({
        lastAdminContactIso: isoDaysAgo(30),
        todayIso: TODAY,
        tier: "directly_overseen",
        windows: WINDOWS,
      }),
    ).toBe(false);
    expect(
      isCareContactStale({
        lastAdminContactIso: isoDaysAgo(31),
        todayIso: TODAY,
        tier: "directly_overseen",
        windows: WINDOWS,
      }),
    ).toBe(true);
  });

  it("a delegated shepherd is stale only past the 60-day window", () => {
    expect(
      isCareContactStale({
        lastAdminContactIso: isoDaysAgo(60),
        todayIso: TODAY,
        tier: "delegated",
        windows: WINDOWS,
      }),
    ).toBe(false);
    expect(
      isCareContactStale({
        lastAdminContactIso: isoDaysAgo(61),
        todayIso: TODAY,
        tier: "delegated",
        windows: WINDOWS,
      }),
    ).toBe(true);
  });

  it("honours configured windows over the built-in defaults", () => {
    const tight: CareCadenceWindows = {
      directlyOverseenStaleDays: 7,
      delegatedStaleDays: 14,
    };
    expect(
      isCareContactStale({
        lastAdminContactIso: isoDaysAgo(10),
        todayIso: TODAY,
        tier: "directly_overseen",
        windows: tight,
      }),
    ).toBe(true);
    expect(
      isCareContactStale({
        lastAdminContactIso: isoDaysAgo(10),
        todayIso: TODAY,
        tier: "delegated",
        windows: tight,
      }),
    ).toBe(false);
  });
});
