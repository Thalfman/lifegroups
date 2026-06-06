import { describe, expect, it } from "vitest";
import {
  buildCategoryMatrix,
  MATRIX_TYPES,
} from "@/lib/admin/group-category-matrix";

// The pure type×category matrix builder (#396 / PRD §2.1). Rows = categories,
// columns = the three top types; each cell carries whether the category is active
// under that type. These tests pin the assembly with no database.

const CAT = "cat-2030";

describe("buildCategoryMatrix", () => {
  it("renders a row per category with a cell for each of the three top types", () => {
    const matrix = buildCategoryMatrix([{ id: CAT, label: "20-30s" }], []);
    expect(matrix.rows).toHaveLength(1);
    const row = matrix.rows[0];
    expect(row.label).toBe("20-30s");
    expect(Object.keys(row.cells).sort()).toEqual([...MATRIX_TYPES].sort());
  });

  it("reads a cell with no row as inactive (off)", () => {
    const matrix = buildCategoryMatrix([{ id: CAT, label: "20-30s" }], []);
    for (const type of MATRIX_TYPES) {
      expect(matrix.rows[0].cells[type].active).toBe(false);
    }
  });

  it("applying 20-30s to all three types yields three active cells", () => {
    // The issue's acceptance criterion: applying a category to all three types
    // produces three active cells visible in the grid.
    const matrix = buildCategoryMatrix(
      [{ id: CAT, label: "20-30s" }],
      MATRIX_TYPES.map((audience_category) => ({
        audience_category,
        category_id: CAT,
        active: true,
      }))
    );
    const activeCells = MATRIX_TYPES.filter(
      (type) => matrix.rows[0].cells[type].active
    );
    expect(activeCells).toHaveLength(3);
  });

  it("treats an explicit inactive cell row as off (unapplied)", () => {
    const matrix = buildCategoryMatrix(
      [{ id: CAT, label: "20-30s" }],
      [{ audience_category: "men", category_id: CAT, active: false }]
    );
    expect(matrix.rows[0].cells.men.active).toBe(false);
  });

  it("drops cell rows whose category is not in the catalog", () => {
    // An archived category's stale cells must not surface — the catalog read only
    // returns live categories, so a cell for an unknown category is ignored.
    const matrix = buildCategoryMatrix(
      [{ id: CAT, label: "20-30s" }],
      [{ audience_category: "men", category_id: "ghost", active: true }]
    );
    expect(matrix.rows).toHaveLength(1);
    expect(matrix.rows[0].cells.men.active).toBe(false);
  });

  it("carries each cell's category id and top type for the toggle to post back", () => {
    const matrix = buildCategoryMatrix([{ id: CAT, label: "20-30s" }], []);
    expect(matrix.rows[0].cells.women).toMatchObject({
      categoryId: CAT,
      audienceCategory: "women",
    });
  });
});
