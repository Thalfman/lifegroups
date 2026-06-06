import { describe, expect, it } from "vitest";
import {
  buildCellCoverage,
  countsTowardCoverage,
  sortByLargestShortfall,
  COVERAGE_LIFECYCLE_STATES,
  type CoverageCellInput,
  type CoverageGroupInput,
} from "@/lib/admin/cell-coverage";
import type { GroupLifecycleStatus } from "@/types/enums";

// The pure per-cell coverage resolver (#400 / PRD §2.3). These tests pin the
// three contracts the acceptance criteria call out: the coverage count, the
// active+launching rule, and the panel sort — all with no database.

const CAT = "cat-2030";
const CAT_B = "cat-4050";

function cell(over: Partial<CoverageCellInput> = {}): CoverageCellInput {
  return {
    audienceCategory: "men",
    categoryId: CAT,
    label: "20-30s",
    active: true,
    target: 2,
    ...over,
  };
}

function group(over: Partial<CoverageGroupInput> = {}): CoverageGroupInput {
  return {
    audienceCategory: "men",
    categoryId: CAT,
    lifecycleStatus: "active",
    ...over,
  };
}

describe("countsTowardCoverage — the active+launching rule", () => {
  it("counts active and launching_soon", () => {
    expect(countsTowardCoverage("active")).toBe(true);
    expect(countsTowardCoverage("launching_soon")).toBe(true);
  });

  it("excludes every other lifecycle state (planned-only / other)", () => {
    const excluded: GroupLifecycleStatus[] = [
      "planned_pause",
      "seasonal_break",
      "needs_leader",
      "at_risk",
      "closed",
    ];
    for (const status of excluded) {
      expect(countsTowardCoverage(status)).toBe(false);
    }
  });

  it("names exactly {active, launching_soon} as the coverage states", () => {
    expect([...COVERAGE_LIFECYCLE_STATES].sort()).toEqual(
      ["active", "launching_soon"].sort()
    );
  });
});

describe("buildCellCoverage — the coverage count (X)", () => {
  it("counts active + launching groups in the cell as X", () => {
    const rows = buildCellCoverage(
      [cell({ target: 3 })],
      [
        group({ lifecycleStatus: "active" }),
        group({ lifecycleStatus: "launching_soon" }),
      ]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].have).toBe(2);
    expect(rows[0].target).toBe(3);
    expect(rows[0].gap).toBe(1);
  });

  it("excludes planned-only / other-state groups from X", () => {
    const rows = buildCellCoverage(
      [cell({ target: 2 })],
      [
        group({ lifecycleStatus: "active" }),
        group({ lifecycleStatus: "planned_pause" }),
        group({ lifecycleStatus: "at_risk" }),
      ]
    );
    expect(rows[0].have).toBe(1);
  });

  it("only counts a group whose top type AND category match the cell", () => {
    const rows = buildCellCoverage(
      [cell()],
      [
        group(), // matches
        group({ audienceCategory: "women" }), // wrong type
        group({ categoryId: CAT_B }), // wrong category
        group({ audienceCategory: null }), // no type column
      ]
    );
    expect(rows[0].have).toBe(1);
  });

  it("reports have=0 for an active cell with no matching groups", () => {
    const rows = buildCellCoverage([cell({ target: 2 })], []);
    expect(rows[0].have).toBe(0);
    expect(rows[0].gap).toBe(2);
  });

  it("floors the gap at 0 when a cell is at or over its target", () => {
    const rows = buildCellCoverage(
      [cell({ target: 1 })],
      [group(), group({ lifecycleStatus: "launching_soon" })]
    );
    expect(rows[0].have).toBe(2);
    expect(rows[0].gap).toBe(0);
  });
});

describe("buildCellCoverage — active-cells-only", () => {
  it("drops inactive cells entirely (coverage applies to active cells)", () => {
    const rows = buildCellCoverage(
      [
        cell({ active: true }),
        cell({ audienceCategory: "women", active: false }),
      ],
      [group(), group({ audienceCategory: "women" })]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].audienceCategory).toBe("men");
  });

  it("does not count a group toward an inactive cell", () => {
    // A group in a cell that is off contributes to no coverage row.
    const rows = buildCellCoverage([cell({ active: false })], [group()]);
    expect(rows).toHaveLength(0);
  });
});

describe("sortByLargestShortfall — the panel sort", () => {
  it("orders cells by largest gap first", () => {
    const coverage = buildCellCoverage(
      [
        cell({ categoryId: "a", label: "A", target: 5 }), // gap 5
        cell({ categoryId: "b", label: "B", target: 2 }), // gap 1 (1 active)
        cell({ categoryId: "c", label: "C", target: 1 }), // gap 0 (1 active)
      ],
      [group({ categoryId: "b" }), group({ categoryId: "c" })]
    );
    const sorted = sortByLargestShortfall(coverage);
    expect(sorted.map((r) => r.categoryId)).toEqual(["a", "b", "c"]);
    expect(sorted.map((r) => r.gap)).toEqual([5, 1, 0]);
  });

  it("breaks gap ties by label then top type, deterministically", () => {
    const coverage = buildCellCoverage(
      [
        cell({ categoryId: "z", label: "Zeta", target: 2 }),
        cell({ categoryId: "a", label: "Alpha", target: 2 }),
        cell({
          categoryId: "a",
          audienceCategory: "women",
          label: "Alpha",
          target: 2,
        }),
      ],
      []
    );
    const sorted = sortByLargestShortfall(coverage);
    // All gap 2; Alpha before Zeta, and men before women within Alpha.
    expect(sorted.map((r) => `${r.label}:${r.audienceCategory}`)).toEqual([
      "Alpha:men",
      "Alpha:women",
      "Zeta:men",
    ]);
  });

  it("does not mutate its input array", () => {
    const coverage = buildCellCoverage(
      [
        cell({ categoryId: "a", label: "A", target: 1 }),
        cell({ categoryId: "b", label: "B", target: 9 }),
      ],
      []
    );
    const before = coverage.map((r) => r.categoryId);
    sortByLargestShortfall(coverage);
    expect(coverage.map((r) => r.categoryId)).toEqual(before);
  });
});
