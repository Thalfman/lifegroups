import { describe, expect, it } from "vitest";
import {
  buildMultiplyGrid,
  GRID_TYPES,
  type GridCellInput,
} from "@/lib/admin/multiply-grid";
import {
  BUILT_IN_READINESS_RULE,
  type CellReadinessInputs,
  type ReadinessRule,
} from "@/lib/admin/cell-readiness";
import type { GroupAudienceCategory } from "@/types/enums";

// The pure Multiply grid builder (#403 / PRD §2.5). Rows = categories, columns =
// the three top types; each ACTIVE cell carries its readiness signal (#402) + its
// `have X of Y` coverage (#400); a not-applied cell renders blank. These tests pin
// the grid assembly, the blank inactive cells, and the per-cell readiness +
// coverage readout — all with no database.

const CAT = "cat-2030";

// The built-in global rule: interest ≥ 3 required, capacity required, health not.
const GLOBAL: ReadinessRule = BUILT_IN_READINESS_RULE;

function inputs(over: Partial<CellReadinessInputs> = {}): CellReadinessInputs {
  return {
    interestCount: 0,
    capacityIssue: false,
    groupHealth: null,
    leaderHealth: null,
    ...over,
  };
}

function cell(over: Partial<GridCellInput> = {}): GridCellInput {
  return {
    audienceCategory: "men",
    categoryId: CAT,
    active: true,
    have: 0,
    target: 0,
    override: {},
    inputs: inputs(),
    ...over,
  };
}

describe("buildMultiplyGrid — grid assembly", () => {
  it("renders a row per category with a cell for each of the three top types", () => {
    const grid = buildMultiplyGrid([{ id: CAT, label: "20-30s" }], [], GLOBAL);
    expect(grid.rows).toHaveLength(1);
    const row = grid.rows[0];
    expect(row.label).toBe("20-30s");
    expect(Object.keys(row.cells).sort()).toEqual([...GRID_TYPES].sort());
  });

  it("carries each cell's category id and top type", () => {
    const grid = buildMultiplyGrid([{ id: CAT, label: "20-30s" }], [], GLOBAL);
    expect(grid.rows[0].cells.women).toMatchObject({
      categoryId: CAT,
      audienceCategory: "women",
    });
  });

  it("drops cell inputs whose category is not in the catalog", () => {
    // An archived category's stale cell must not surface — rows are keyed off the
    // catalog, so an input for an unknown category is simply ignored.
    const grid = buildMultiplyGrid(
      [{ id: CAT, label: "20-30s" }],
      [cell({ categoryId: "ghost", active: true })],
      GLOBAL
    );
    expect(grid.rows).toHaveLength(1);
    for (const type of GRID_TYPES) {
      expect(grid.rows[0].cells[type].applied).toBe(false);
    }
  });
});

describe("buildMultiplyGrid — blank inactive cells", () => {
  it("renders a cell with no input as blank (not applied, no readout)", () => {
    const grid = buildMultiplyGrid([{ id: CAT, label: "20-30s" }], [], GLOBAL);
    for (const type of GRID_TYPES) {
      const c = grid.rows[0].cells[type];
      expect(c.applied).toBe(false);
      expect(c.readout).toBeNull();
    }
  });

  it("renders an explicitly inactive cell as blank even with inputs present", () => {
    const grid = buildMultiplyGrid(
      [{ id: CAT, label: "20-30s" }],
      [
        cell({
          audienceCategory: "men",
          active: false,
          have: 2,
          target: 3,
          inputs: inputs({ interestCount: 9 }),
        }),
      ],
      GLOBAL
    );
    const men = grid.rows[0].cells.men;
    expect(men.applied).toBe(false);
    expect(men.readout).toBeNull();
  });
});

describe("buildMultiplyGrid — per-cell readiness + coverage readout", () => {
  it("an active cell shows its coverage have X of Y", () => {
    const grid = buildMultiplyGrid(
      [{ id: CAT, label: "20-30s" }],
      [cell({ audienceCategory: "men", active: true, have: 1, target: 2 })],
      GLOBAL
    );
    const readout = grid.rows[0].cells.men.readout;
    expect(readout).not.toBeNull();
    expect(readout?.coverage).toEqual({ have: 1, target: 2 });
  });

  it("an active cell is ready when its readiness rule clears (interest ≥ 3, no capacity issue)", () => {
    const grid = buildMultiplyGrid(
      [{ id: CAT, label: "20-30s" }],
      [
        cell({
          audienceCategory: "men",
          active: true,
          inputs: inputs({ interestCount: 3, capacityIssue: false }),
        }),
      ],
      GLOBAL
    );
    expect(grid.rows[0].cells.men.readout?.signal.ready).toBe(true);
  });

  it("an active cell is not ready and names its blockers when a required pillar falls short", () => {
    const grid = buildMultiplyGrid(
      [{ id: CAT, label: "20-30s" }],
      [
        cell({
          audienceCategory: "men",
          active: true,
          // interest below 3 AND a capacity issue → both required pillars block.
          inputs: inputs({ interestCount: 1, capacityIssue: true }),
        }),
      ],
      GLOBAL
    );
    const signal = grid.rows[0].cells.men.readout?.signal;
    expect(signal?.ready).toBe(false);
    expect(signal?.blockers).toEqual(["interest", "capacity"]);
  });

  it("applies a per-cell override over the global rule (interest ≥ 5 flips a 3-prospect cell to not ready)", () => {
    const ready = inputs({ interestCount: 3, capacityIssue: false });
    // Under the global rule (≥ 3) this cell is ready…
    const base = buildMultiplyGrid(
      [{ id: CAT, label: "20-30s" }],
      [cell({ audienceCategory: "men", active: true, inputs: ready })],
      GLOBAL
    );
    expect(base.rows[0].cells.men.readout?.signal.ready).toBe(true);
    // …but a cell override of interest ≥ 5 makes the same 3-prospect cell not ready.
    const overridden = buildMultiplyGrid(
      [{ id: CAT, label: "20-30s" }],
      [
        cell({
          audienceCategory: "men",
          active: true,
          inputs: ready,
          override: { interest: { required: true, min: 5 } },
        }),
      ],
      GLOBAL
    );
    const signal = overridden.rows[0].cells.men.readout?.signal;
    expect(signal?.ready).toBe(false);
    expect(signal?.blockers).toContain("interest");
  });

  it("a per-type rule changes only that type's cells that don't override it (#410 / ADR 0021)", () => {
    // Every cell has exactly 3 interested prospects: ready under the global rule
    // (interest ≥ 3), and ready for Men's, Women's, Mixed alike — until a per-type
    // rule raises one column's bar.
    const ready = inputs({ interestCount: 3, capacityIssue: false });
    const cells: GridCellInput[] = GRID_TYPES.map((type) =>
      cell({ audienceCategory: type, active: true, inputs: ready })
    );
    // A Men's-wide Interest ≥ 5 rule: the MIDDLE tier, set for Men's only.
    const grid = buildMultiplyGrid(
      [{ id: CAT, label: "20-30s" }],
      cells,
      GLOBAL,
      { men: { interest: { required: true, min: 5 } } }
    );
    const row = grid.rows[0];
    // Men's now needs ≥ 5 → the 3-prospect Men's cell is NOT ready…
    expect(row.cells.men.readout?.signal.ready).toBe(false);
    expect(row.cells.men.readout?.signal.blockers).toContain("interest");
    // …while Women's and Mixed still follow the global ≥ 3 and stay ready.
    expect(row.cells.women.readout?.signal.ready).toBe(true);
    expect(row.cells.mixed.readout?.signal.ready).toBe(true);
  });

  it("a per-cell override beats the per-type rule for that cell only", () => {
    const ready = inputs({ interestCount: 3, capacityIssue: false });
    const grid = buildMultiplyGrid(
      [{ id: CAT, label: "20-30s" }],
      [
        // This Men's cell overrides interest back down to ≥ 3, beating the
        // per-type ≥ 5 — so it stays ready even under the stricter column rule.
        cell({
          audienceCategory: "men",
          active: true,
          inputs: ready,
          override: { interest: { required: true, min: 3 } },
        }),
      ],
      GLOBAL,
      { men: { interest: { required: true, min: 5 } } }
    );
    expect(grid.rows[0].cells.men.readout?.signal.ready).toBe(true);
  });

  it("with no per-type rules supplied, behaviour is identical to global-only (additive)", () => {
    const ready = inputs({ interestCount: 3, capacityIssue: false });
    const cells: GridCellInput[] = GRID_TYPES.map((type) =>
      cell({ audienceCategory: type, active: true, inputs: ready })
    );
    // The 4th arg defaults to {} — every cell resolves straight off the global rule.
    const grid = buildMultiplyGrid(
      [{ id: CAT, label: "20-30s" }],
      cells,
      GLOBAL
    );
    for (const type of GRID_TYPES) {
      expect(grid.rows[0].cells[type].readout?.signal.ready).toBe(true);
    }
  });

  it("assembles a mixed row — some cells applied (with readouts), others blank", () => {
    const applied: GroupAudienceCategory[] = ["men", "mixed"];
    const cells: GridCellInput[] = applied.map((type) =>
      cell({
        audienceCategory: type,
        active: true,
        have: 1,
        target: 2,
        inputs: inputs({ interestCount: 3 }),
      })
    );
    const grid = buildMultiplyGrid(
      [{ id: CAT, label: "20-30s" }],
      cells,
      GLOBAL
    );
    const row = grid.rows[0];
    expect(row.cells.men.applied).toBe(true);
    expect(row.cells.men.readout?.signal.ready).toBe(true);
    expect(row.cells.mixed.applied).toBe(true);
    // women has no input → blank.
    expect(row.cells.women.applied).toBe(false);
    expect(row.cells.women.readout).toBeNull();
  });
});
