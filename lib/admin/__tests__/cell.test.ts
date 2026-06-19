import { describe, expect, it } from "vitest";

import {
  resolveCell,
  resolveCells,
  type CellFacetReads,
} from "@/lib/admin/cell";
import { cellKey } from "@/lib/admin/cell-coordinate";
import {
  BUILT_IN_READINESS_RULE,
  type ReadinessRule,
} from "@/lib/admin/cell-readiness";
import {
  EMPTY_CELL_HEALTH_GRADES,
  type CellHealthGrades,
} from "@/lib/admin/cell-health";
import {
  EMPTY_CELL_ACTIVE_GROUP_SIZES,
  EMPTY_CELL_MATURITY,
  type CellActiveGroupSizes,
} from "@/lib/supabase/multiplication-config-reads";
import type { CellInterestTally } from "@/lib/admin/prospect-interest";
import type { CategoryTypeTargetRow } from "@/lib/supabase/group-categories-reads";

// The live Cell resolver (lib/admin/cell.ts). resolveCell composes the per-cell
// facets — interest, capacity, health, coverage — read through ONE cellKey, then
// resolves + evaluates the three-tier readiness rule. These tests own that wiring
// (each pillar reads the same coordinate; the cascade global → per-type → override)
// with plain fixtures, no reads adapter and no database.

const CAT = "cat-a";
const GLOBAL: ReadinessRule = BUILT_IN_READINESS_RULE; // interest ≥ 3, capacity req, health not

function sizes(entries: Record<string, number[]>): CellActiveGroupSizes {
  return { byCell: new Map(Object.entries(entries)), keys: new Map() };
}

function health(
  entries: Record<
    string,
    {
      groupGrades: ("A" | "B" | "C" | "D" | "F")[];
      leaderGrades: ("A" | "B" | "C" | "D" | "F")[];
    }
  >
): CellHealthGrades {
  return new Map(Object.entries(entries));
}

function facets(over: Partial<CellFacetReads> = {}): CellFacetReads {
  return {
    interest: {} as CellInterestTally,
    cellSizes: EMPTY_CELL_ACTIVE_GROUP_SIZES,
    cellMaturity: EMPTY_CELL_MATURITY,
    cellHealth: EMPTY_CELL_HEALTH_GRADES,
    haveByKey: new Map(),
    ...over,
  };
}

function targetCell(
  over: Partial<CategoryTypeTargetRow> = {}
): CategoryTypeTargetRow {
  return {
    id: "cell-1",
    audience_category: "men",
    category_id: CAT,
    active: true,
    target_count: 2,
    trigger_overrides: {},
    ...over,
  };
}

describe("resolveCell — per-cell facet assembly", () => {
  it("reads every facet for a cell through the SAME coordinate key", () => {
    const key = cellKey({ audience: "men", categoryId: CAT });
    const cell = resolveCell(
      {
        coordinate: { audience: "men", categoryId: CAT },
        active: true,
        target: 2,
        triggerOverrides: {},
      },
      facets({
        interest: { [key]: 3 } as CellInterestTally,
        cellSizes: sizes({ [key]: [5, 6] }), // two joinable, under cap → no issue
        cellHealth: health({
          [key]: { groupGrades: ["A"], leaderGrades: ["C"] },
        }),
        haveByKey: new Map([[key, 1]]),
      }),
      { globalRule: GLOBAL, perTypeRule: {} }
    );

    expect(cell.coordinate).toEqual({ audience: "men", categoryId: CAT });
    expect(cell.applied).toBe(true);
    expect(cell.coverage).toEqual({ have: 1, target: 2 });
    expect(cell.inputs.interestCount).toBe(3);
    expect(cell.inputs.capacityIssue).toBe(false);
    expect(cell.inputs.groupHealth).toBe("A");
    expect(cell.inputs.leaderHealth).toBe("C");
  });

  it("defaults a facet with no read to its empty value (interest 0, capacity issue, health null, have 0)", () => {
    const cell = resolveCell(
      {
        coordinate: { audience: "men", categoryId: CAT },
        active: true,
        target: 2,
        triggerOverrides: {},
      },
      facets(),
      { globalRule: GLOBAL, perTypeRule: {} }
    );

    expect(cell.inputs.interestCount).toBe(0);
    // No active groups → zero joinable groups → Facet B (thin availability) trips.
    expect(cell.inputs.capacityIssue).toBe(true);
    expect(cell.inputs.groupHealth).toBeNull();
    expect(cell.inputs.leaderHealth).toBeNull();
    expect(cell.coverage.have).toBe(0);
  });

  it("does NOT bleed one cell's reads into a sibling of a different audience", () => {
    const menKey = cellKey({ audience: "men", categoryId: CAT });
    const womenKey = cellKey({ audience: "women", categoryId: CAT });
    const shared = facets({
      interest: { [menKey]: 7 } as CellInterestTally,
      cellSizes: sizes({ [womenKey]: [5, 6] }),
      cellHealth: health({
        [womenKey]: { groupGrades: ["A"], leaderGrades: ["A"] },
      }),
      haveByKey: new Map([[menKey, 4]]),
    });
    const men = resolveCell(
      {
        coordinate: { audience: "men", categoryId: CAT },
        active: true,
        target: 0,
        triggerOverrides: {},
      },
      shared,
      { globalRule: GLOBAL, perTypeRule: {} }
    );
    const women = resolveCell(
      {
        coordinate: { audience: "women", categoryId: CAT },
        active: true,
        target: 0,
        triggerOverrides: {},
      },
      shared,
      { globalRule: GLOBAL, perTypeRule: {} }
    );

    expect(men.inputs.interestCount).toBe(7);
    expect(men.coverage.have).toBe(4);
    expect(men.inputs.capacityIssue).toBe(true); // no men sizes → Facet B trips
    expect(men.inputs.groupHealth).toBeNull();

    expect(women.inputs.interestCount).toBe(0);
    expect(women.coverage.have).toBe(0);
    expect(women.inputs.capacityIssue).toBe(false); // two joinable women groups
    expect(women.inputs.groupHealth).toBe("A");
  });

  it("leaves an inactive cell unevaluated (signal null) but still resolves its inputs", () => {
    const cell = resolveCell(
      {
        coordinate: { audience: "men", categoryId: CAT },
        active: false,
        target: 3,
        triggerOverrides: { interest: { required: true, min: 9 } },
      },
      facets(),
      { globalRule: GLOBAL, perTypeRule: {} }
    );
    expect(cell.applied).toBe(false);
    expect(cell.signal).toBeNull();
    expect(cell.coverage.target).toBe(3);
  });
});

describe("resolveCell — readiness cascade (global → per-type → override)", () => {
  const readyInterest = (key: string): CellFacetReads =>
    facets({
      interest: { [key]: 3 } as CellInterestTally,
      cellSizes: sizes({ [key]: [5, 6] }),
    });

  it("is ready when the global rule clears (interest ≥ 3, no capacity issue)", () => {
    const key = cellKey({ audience: "men", categoryId: CAT });
    const cell = resolveCell(
      {
        coordinate: { audience: "men", categoryId: CAT },
        active: true,
        target: 0,
        triggerOverrides: {},
      },
      readyInterest(key),
      { globalRule: GLOBAL, perTypeRule: {} }
    );
    expect(cell.signal?.ready).toBe(true);
  });

  it("names its blockers when required pillars fall short", () => {
    const cell = resolveCell(
      {
        coordinate: { audience: "men", categoryId: CAT },
        active: true,
        target: 0,
        triggerOverrides: {},
      },
      facets(), // interest 0, capacity issue
      { globalRule: GLOBAL, perTypeRule: {} }
    );
    expect(cell.signal?.ready).toBe(false);
    expect(cell.signal?.blockers).toEqual(["interest", "capacity"]);
  });

  it("a per-cell override beats the global rule", () => {
    const key = cellKey({ audience: "men", categoryId: CAT });
    const cell = resolveCell(
      {
        coordinate: { audience: "men", categoryId: CAT },
        active: true,
        target: 0,
        triggerOverrides: { interest: { required: true, min: 5 } },
      },
      readyInterest(key), // 3 interested — clears global ≥ 3, not the override ≥ 5
      { globalRule: GLOBAL, perTypeRule: {} }
    );
    expect(cell.signal?.ready).toBe(false);
    expect(cell.signal?.blockers).toContain("interest");
  });

  it("a per-type rule applies when the cell has no override; the override beats it", () => {
    const key = cellKey({ audience: "men", categoryId: CAT });
    const perTypeRule = { interest: { required: true, min: 5 } };
    // Per-type ≥ 5, no cell override → the 3-prospect cell is NOT ready.
    const underType = resolveCell(
      {
        coordinate: { audience: "men", categoryId: CAT },
        active: true,
        target: 0,
        triggerOverrides: {},
      },
      readyInterest(key),
      { globalRule: GLOBAL, perTypeRule }
    );
    expect(underType.signal?.ready).toBe(false);
    // …but the cell can override back down to ≥ 3 and stay ready under the column.
    const overridden = resolveCell(
      {
        coordinate: { audience: "men", categoryId: CAT },
        active: true,
        target: 0,
        triggerOverrides: { interest: { required: true, min: 3 } },
      },
      readyInterest(key),
      { globalRule: GLOBAL, perTypeRule }
    );
    expect(overridden.signal?.ready).toBe(true);
  });
});

describe("resolveCells — batch over target rows", () => {
  it("resolves one cell per row and applies each row's column rule", () => {
    const menKey = cellKey({ audience: "men", categoryId: CAT });
    const womenKey = cellKey({ audience: "women", categoryId: CAT });
    const cells = resolveCells(
      [
        targetCell({ id: "men", audience_category: "men" }),
        targetCell({ id: "women", audience_category: "women" }),
      ],
      facets({
        interest: { [menKey]: 3, [womenKey]: 3 } as CellInterestTally,
        cellSizes: sizes({ [menKey]: [5, 6], [womenKey]: [5, 6] }),
      }),
      // Men's column raised to ≥ 5; Women's inherits global ≥ 3.
      {
        globalRule: GLOBAL,
        perTypeRules: { men: { interest: { required: true, min: 5 } } },
      }
    );
    const men = cells.find((c) => c.coordinate.audience === "men")!;
    const women = cells.find((c) => c.coordinate.audience === "women")!;
    expect(men.signal?.ready).toBe(false); // 3 < per-type 5
    expect(women.signal?.ready).toBe(true); // 3 ≥ global 3
  });
});
