import type { GroupAudienceCategory } from "@/types/enums";

// The Settings > Groups type×category matrix (#396 / PRD §2.1), as a pure data
// structure built from the catalog + the cell rows. Rows = categories, columns =
// the three top types (Men's / Women's / Mixed). Each cell carries whether the
// category is ACTIVE under that type — the live unit the rest of the overhaul
// builds on. Keeping this a pure function of its two inputs makes the assembly
// testable with no database (ADR 0015).

// The three top types, in display order. Mirrors MULTIPLY_TYPES but kept local
// so this pure module has no surface dependency.
export const MATRIX_TYPES: readonly GroupAudienceCategory[] = [
  "men",
  "women",
  "mixed",
];

export type MatrixCategoryInput = {
  id: string;
  label: string;
};

export type MatrixCellInput = {
  audience_category: GroupAudienceCategory;
  category_id: string;
  active: boolean;
};

// One cell of the matrix: the category × top type pair and whether it is active.
export type MatrixCell = {
  categoryId: string;
  audienceCategory: GroupAudienceCategory;
  active: boolean;
};

// One row of the matrix: a category and its three cells (one per top type).
export type MatrixRow = {
  categoryId: string;
  label: string;
  cells: Record<GroupAudienceCategory, MatrixCell>;
};

export type CategoryMatrix = {
  rows: MatrixRow[];
};

// Build the matrix: for every catalog category, derive its three cells from the
// cell rows. A cell with no row, or a row whose active flag is false, reads as
// inactive. Cells whose category isn't in the catalog (e.g. an archived
// category's stale rows) are dropped, since the row set is keyed off the catalog.
export function buildCategoryMatrix(
  categories: MatrixCategoryInput[],
  cells: MatrixCellInput[]
): CategoryMatrix {
  // Index the cells by `${audience_category}:${category_id}` for O(1) lookup.
  const activeByKey = new Map<string, boolean>();
  for (const cell of cells) {
    activeByKey.set(
      `${cell.audience_category}:${cell.category_id}`,
      cell.active
    );
  }

  const rows: MatrixRow[] = categories.map((category) => {
    const cellsForRow = {} as Record<GroupAudienceCategory, MatrixCell>;
    for (const type of MATRIX_TYPES) {
      cellsForRow[type] = {
        categoryId: category.id,
        audienceCategory: type,
        active: activeByKey.get(`${type}:${category.id}`) ?? false,
      };
    }
    return {
      categoryId: category.id,
      label: category.label,
      cells: cellsForRow,
    };
  });

  return { rows };
}
