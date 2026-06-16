import { describe, expect, it } from "vitest";

import { buildGridCellInputs } from "@/components/admin/multiply/multiply-grid-data";
import { cellKey } from "@/lib/admin/cell-coordinate";
import {
  EMPTY_CELL_ACTIVE_GROUP_SIZES,
  EMPTY_CELL_HEALTH_GRADES,
  type CellActiveGroupSizes,
  type CellHealthGrades,
} from "@/lib/supabase/multiplication-config-reads";
import type { CellInterestTally } from "@/lib/admin/prospect-interest";
import type { CategoryTypeTargetRow } from "@/lib/supabase/group-categories-reads";

// Pure tests for buildGridCellInputs — the per-cell readiness-input assembler
// extracted from the Multiply grid loader. The loader's own test covers I/O and
// degrade; this file owns the breadth: that each pillar reads from the SAME cell
// coordinate, and the edge cases of each pillar's wiring. No reads adapter, no
// database — just plain fixtures in, GridCellInput[] out.

const CAT_A = "cat-a";

function targetCell(
  overrides: Partial<CategoryTypeTargetRow> = {}
): CategoryTypeTargetRow {
  return {
    id: "cell-1",
    audience_category: "men",
    category_id: CAT_A,
    active: true,
    target_count: 2,
    trigger_overrides: {},
    ...overrides,
  };
}

function sizes(entries: Record<string, number[]>): CellActiveGroupSizes {
  return {
    byCell: new Map(Object.entries(entries)),
    keys: new Map(),
  };
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

describe("buildGridCellInputs — per-cell readiness assembly", () => {
  it("reads every pillar for a cell through the SAME coordinate key", () => {
    const key = cellKey({ audience: "men", categoryId: CAT_A });
    const [cell] = buildGridCellInputs({
      targetCells: [targetCell()],
      interest: { [key]: 3 } as CellInterestTally,
      cellSizes: sizes({ [key]: [5, 6] }), // two joinable, under cap → no issue
      cellHealth: health({
        [key]: { groupGrades: ["A"], leaderGrades: ["C"] },
      }),
      haveByKey: new Map([[key, 1]]),
    });

    expect(cell.audienceCategory).toBe("men");
    expect(cell.categoryId).toBe(CAT_A);
    expect(cell.active).toBe(true);
    expect(cell.have).toBe(1);
    expect(cell.target).toBe(2);
    expect(cell.inputs.interestCount).toBe(3);
    expect(cell.inputs.capacityIssue).toBe(false);
    expect(cell.inputs.groupHealth).toBe("A");
    expect(cell.inputs.leaderHealth).toBe("C");
  });

  it("defaults a pillar with no read to its empty value (interest 0, capacity issue, health null, have 0)", () => {
    const [cell] = buildGridCellInputs({
      targetCells: [targetCell()],
      interest: {} as CellInterestTally,
      cellSizes: EMPTY_CELL_ACTIVE_GROUP_SIZES,
      cellHealth: EMPTY_CELL_HEALTH_GRADES,
      haveByKey: new Map(),
    });

    expect(cell.inputs.interestCount).toBe(0);
    // No active groups → zero joinable groups → Facet B (thin availability) trips.
    expect(cell.inputs.capacityIssue).toBe(true);
    expect(cell.inputs.groupHealth).toBeNull();
    expect(cell.inputs.leaderHealth).toBeNull();
    expect(cell.have).toBe(0);
  });

  it("does NOT bleed one cell's reads into a sibling cell of a different audience", () => {
    const menKey = cellKey({ audience: "men", categoryId: CAT_A });
    const womenKey = cellKey({ audience: "women", categoryId: CAT_A });
    const cells = buildGridCellInputs({
      targetCells: [
        targetCell({ id: "men", audience_category: "men" }),
        targetCell({ id: "women", audience_category: "women" }),
      ],
      interest: { [menKey]: 7 } as CellInterestTally,
      cellSizes: sizes({ [womenKey]: [5, 6] }),
      cellHealth: health({
        [womenKey]: { groupGrades: ["A"], leaderGrades: ["A"] },
      }),
      haveByKey: new Map([[menKey, 4]]),
    });

    const men = cells.find((c) => c.audienceCategory === "men")!;
    const women = cells.find((c) => c.audienceCategory === "women")!;

    // Men sees only the men-keyed reads; women sees only the women-keyed reads.
    expect(men.inputs.interestCount).toBe(7);
    expect(men.have).toBe(4);
    expect(men.inputs.capacityIssue).toBe(true); // no men sizes → Facet B trips
    expect(men.inputs.groupHealth).toBeNull();

    expect(women.inputs.interestCount).toBe(0);
    expect(women.have).toBe(0);
    expect(women.inputs.capacityIssue).toBe(false); // two joinable women groups
    expect(women.inputs.groupHealth).toBe("A");
  });

  it("passes the cell's active flag through and decodes its trigger overrides", () => {
    const [cell] = buildGridCellInputs({
      targetCells: [
        targetCell({
          active: false,
          trigger_overrides: { interest: { required: true, min: 9 } },
        }),
      ],
      interest: {} as CellInterestTally,
      cellSizes: EMPTY_CELL_ACTIVE_GROUP_SIZES,
      cellHealth: EMPTY_CELL_HEALTH_GRADES,
      haveByKey: new Map(),
    });

    expect(cell.active).toBe(false);
    // The override is decoded at the trust boundary into the cell's partial rule.
    expect(cell.override.interest).toEqual({ required: true, min: 9 });
  });
});
