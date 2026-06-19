import { describe, expect, it } from "vitest";
import {
  buildMultiplyGrid,
  buildMultiplyHomeSummary,
  GRID_TYPES,
} from "@/lib/admin/multiply-grid";
import type { ResolvedCell } from "@/lib/admin/cell";
import type { CellReadinessSignal } from "@/lib/admin/cell-readiness";
import type { GroupAudienceCategory } from "@/types/enums";

// The pure Multiply grid builder (#403 / PRD §2.5), now an ARRANGEMENT of
// already-resolved live Cells (lib/admin/cell.ts): rows = categories, columns = the
// three top types; an APPLIED cell carries its resolved readiness signal + its
// `have X of Y` coverage, a not-applied cell renders blank. These tests pin the
// arrangement, the blank cells, the readout pass-through, and the Home X-of-Y
// summary — the per-cell resolution + cascade is covered in cell.test.ts.

const CAT = "cat-2030";

const READY: CellReadinessSignal = { ready: true, outcomes: [], blockers: [] };
const BLOCKED: CellReadinessSignal = {
  ready: false,
  outcomes: [],
  blockers: ["interest", "capacity"],
};

// A resolved live Cell fixture. Defaults to an applied, ready Men's cell; an
// inactive cell passes `applied: false, signal: null`.
function resolved(
  over: Partial<ResolvedCell> & {
    audience?: GroupAudienceCategory;
    categoryId?: string;
  } = {}
): ResolvedCell {
  const { audience = "men", categoryId = CAT, ...rest } = over;
  return {
    coordinate: { audience, categoryId },
    applied: true,
    coverage: { have: 0, target: 0 },
    inputs: {
      interestCount: 0,
      capacityIssue: false,
      groupHealth: null,
      leaderHealth: null,
      memberCount: 0,
      groupTenureYears: null,
      coShepherdTenureYears: null,
    },
    signal: READY,
    ...rest,
  };
}

describe("buildMultiplyGrid — grid arrangement", () => {
  it("renders a row per category with a cell for each of the three top types", () => {
    const grid = buildMultiplyGrid([{ id: CAT, label: "20-30s" }], []);
    expect(grid.rows).toHaveLength(1);
    const row = grid.rows[0];
    expect(row.label).toBe("20-30s");
    expect(Object.keys(row.cells).sort()).toEqual([...GRID_TYPES].sort());
  });

  it("carries each cell's category id and top type", () => {
    const grid = buildMultiplyGrid([{ id: CAT, label: "20-30s" }], []);
    expect(grid.rows[0].cells.women).toMatchObject({
      categoryId: CAT,
      audienceCategory: "women",
    });
  });

  it("drops resolved cells whose category is not in the catalog", () => {
    // An archived category's stale cell must not surface — rows are keyed off the
    // catalog, so a resolved cell for an unknown category is simply ignored.
    const grid = buildMultiplyGrid(
      [{ id: CAT, label: "20-30s" }],
      [resolved({ categoryId: "ghost" })]
    );
    expect(grid.rows).toHaveLength(1);
    for (const type of GRID_TYPES) {
      expect(grid.rows[0].cells[type].applied).toBe(false);
    }
  });
});

describe("buildMultiplyGrid — blank cells", () => {
  it("renders a cell with no resolved cell as blank (not applied, no readout)", () => {
    const grid = buildMultiplyGrid([{ id: CAT, label: "20-30s" }], []);
    for (const type of GRID_TYPES) {
      const c = grid.rows[0].cells[type];
      expect(c.applied).toBe(false);
      expect(c.readout).toBeNull();
    }
  });

  it("renders an unapplied resolved cell as blank even with coverage present", () => {
    const grid = buildMultiplyGrid(
      [{ id: CAT, label: "20-30s" }],
      [
        resolved({
          audience: "men",
          applied: false,
          signal: null,
          coverage: { have: 2, target: 3 },
        }),
      ]
    );
    const men = grid.rows[0].cells.men;
    expect(men.applied).toBe(false);
    expect(men.readout).toBeNull();
  });
});

describe("buildMultiplyGrid — readout pass-through", () => {
  it("an applied cell shows its coverage have X of Y", () => {
    const grid = buildMultiplyGrid(
      [{ id: CAT, label: "20-30s" }],
      [resolved({ audience: "men", coverage: { have: 1, target: 2 } })]
    );
    const readout = grid.rows[0].cells.men.readout;
    expect(readout).not.toBeNull();
    expect(readout?.coverage).toEqual({ have: 1, target: 2 });
  });

  it("passes the resolved readiness signal through to the readout", () => {
    const grid = buildMultiplyGrid(
      [{ id: CAT, label: "20-30s" }],
      [resolved({ audience: "men", signal: READY })]
    );
    expect(grid.rows[0].cells.men.readout?.signal.ready).toBe(true);
  });

  it("a blocked cell's readout names its blockers", () => {
    const grid = buildMultiplyGrid(
      [{ id: CAT, label: "20-30s" }],
      [resolved({ audience: "men", signal: BLOCKED })]
    );
    const signal = grid.rows[0].cells.men.readout?.signal;
    expect(signal?.ready).toBe(false);
    expect(signal?.blockers).toEqual(["interest", "capacity"]);
  });

  it("assembles a mixed row — some cells applied (with readouts), others blank", () => {
    const applied: GroupAudienceCategory[] = ["men", "mixed"];
    const grid = buildMultiplyGrid(
      [{ id: CAT, label: "20-30s" }],
      applied.map((type) =>
        resolved({
          audience: type,
          coverage: { have: 1, target: 2 },
          signal: READY,
        })
      )
    );
    const row = grid.rows[0];
    expect(row.cells.men.applied).toBe(true);
    expect(row.cells.men.readout?.signal.ready).toBe(true);
    expect(row.cells.mixed.applied).toBe(true);
    // women has no resolved cell → blank.
    expect(row.cells.women.applied).toBe(false);
    expect(row.cells.women.readout).toBeNull();
  });
});

describe("buildMultiplyHomeSummary — Home's X of Y cells ready (#470)", () => {
  it("counts ready cells over active cells across rows and types", () => {
    const grid = buildMultiplyGrid(
      [
        { id: CAT, label: "20-30s" },
        { id: "cat-fam", label: "Families" },
      ],
      [
        resolved({ audience: "men", signal: READY }),
        resolved({ audience: "women", signal: BLOCKED }),
        resolved({ audience: "mixed", categoryId: "cat-fam", signal: READY }),
      ]
    );
    expect(buildMultiplyHomeSummary(grid)).toEqual({
      readyCells: 2,
      activeCells: 3,
    });
  });

  it("ignores blank (not-applied) cells on both sides of X of Y", () => {
    const grid = buildMultiplyGrid(
      [{ id: CAT, label: "20-30s" }],
      [
        resolved({ audience: "men", signal: READY }),
        resolved({ audience: "women", applied: false, signal: null }),
      ]
    );
    expect(buildMultiplyHomeSummary(grid)).toEqual({
      readyCells: 1,
      activeCells: 1,
    });
  });

  it("returns 0 of 0 for an empty grid (no categories applied anywhere)", () => {
    const grid = buildMultiplyGrid([], []);
    expect(buildMultiplyHomeSummary(grid)).toEqual({
      readyCells: 0,
      activeCells: 0,
    });
  });

  it("reports 0 ready of N active when every active cell is blocked", () => {
    const grid = buildMultiplyGrid(
      [{ id: CAT, label: "20-30s" }],
      GRID_TYPES.map((type) => resolved({ audience: type, signal: BLOCKED }))
    );
    expect(buildMultiplyHomeSummary(grid)).toEqual({
      readyCells: 0,
      activeCells: 3,
    });
  });
});
