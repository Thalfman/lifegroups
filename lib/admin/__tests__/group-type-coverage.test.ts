import { describe, expect, it } from "vitest";

import {
  buildGroupTypeCoverage,
  countsTowardCoverage,
  sortByLargestShortfall,
  buildMultiplyHomeSummary,
} from "@/lib/admin/group-type-coverage";

// Pure per-type coverage resolver for the free-text group_type model: X (have) =
// active + launching groups of the type; Y (target) = the type's configured
// target_count (0 when no config row). Rows are the union of the list + the
// configured types + the types present on groups.

describe("countsTowardCoverage", () => {
  it("counts active and launching_soon, nothing else", () => {
    expect(countsTowardCoverage("active")).toBe(true);
    expect(countsTowardCoverage("launching_soon")).toBe(true);
    expect(countsTowardCoverage("planned_pause")).toBe(false);
    expect(countsTowardCoverage("closed")).toBe(false);
  });
});

describe("buildGroupTypeCoverage", () => {
  it("tallies have (active+launching) against the configured target", () => {
    const rows = buildGroupTypeCoverage({
      types: ["Men's", "Women's"],
      groups: [
        { groupType: "Men's", lifecycleStatus: "active" },
        { groupType: "Men's", lifecycleStatus: "launching_soon" },
        { groupType: "Men's", lifecycleStatus: "closed" },
        { groupType: "Women's", lifecycleStatus: "active" },
      ],
      configs: [
        { groupType: "Men's", targetCount: 4 },
        { groupType: "Women's", targetCount: 1 },
      ],
    });

    const men = rows.find((r) => r.groupType === "Men's");
    const women = rows.find((r) => r.groupType === "Women's");
    expect(men).toMatchObject({ have: 2, target: 4, gap: 2, configured: true });
    expect(women).toMatchObject({
      have: 1,
      target: 1,
      gap: 0,
      configured: true,
    });
  });

  it("matches case-insensitively and keeps the first spelling as label", () => {
    const rows = buildGroupTypeCoverage({
      types: ["Men's"],
      groups: [{ groupType: "men's", lifecycleStatus: "active" }],
      configs: [],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe("Men's");
    expect(rows[0].have).toBe(1);
    expect(rows[0].target).toBe(0);
    expect(rows[0].configured).toBe(false);
  });

  it("surfaces a type still on groups even after it left the list", () => {
    const rows = buildGroupTypeCoverage({
      types: [],
      groups: [{ groupType: "Legacy", lifecycleStatus: "active" }],
      configs: [],
    });
    expect(rows.map((r) => r.groupType)).toContain("Legacy");
  });

  it("ignores Untyped (null) groups as rows", () => {
    const rows = buildGroupTypeCoverage({
      types: ["Men's"],
      groups: [{ groupType: null, lifecycleStatus: "active" }],
      configs: [],
    });
    expect(rows.map((r) => r.groupType)).toEqual(["Men's"]);
    expect(rows[0].have).toBe(0);
  });
});

describe("sortByLargestShortfall", () => {
  it("orders by gap desc, then label", () => {
    const sorted = sortByLargestShortfall([
      { gap: 1, label: "B" },
      { gap: 3, label: "A" },
      { gap: 1, label: "A" },
    ]);
    expect(sorted.map((r) => r.label)).toEqual(["A", "A", "B"]);
  });
});

describe("buildMultiplyHomeSummary", () => {
  it("counts only targeted types and those meeting their target", () => {
    const summary = buildMultiplyHomeSummary([
      {
        groupType: "A",
        label: "A",
        have: 3,
        target: 2,
        configured: true,
        gap: 0,
      },
      {
        groupType: "B",
        label: "B",
        have: 1,
        target: 3,
        configured: true,
        gap: 2,
      },
      {
        groupType: "C",
        label: "C",
        have: 5,
        target: 0,
        configured: false,
        gap: 0,
      },
    ]);
    expect(summary).toEqual({ activeCells: 2, readyCells: 1 });
  });
});
