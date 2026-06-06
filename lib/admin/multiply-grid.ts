import type { GroupAudienceCategory } from "@/types/enums";
import {
  evaluateCellReadiness,
  resolveCellRule,
  type CellReadinessInputs,
  type CellReadinessOverride,
  type CellReadinessSignal,
  type ReadinessRule,
} from "@/lib/admin/cell-readiness";

// The Multiply matrix grid (#403 / PRD §2.5), as a pure data structure. This is
// the slice that FOLDS the three per-type Multiply boards into ONE grid:
//   * rows    = categories (the live catalog),
//   * columns = the three top types (Men's / Women's / Mixed).
// Each ACTIVE cell (the category is applied to that type) carries its per-cell
// READINESS signal (#402, the recast natural-unit rule resolved global+override)
// and its `have X of Y` COVERAGE (#400). A cell where the category is NOT applied
// to that type renders BLANK — it carries no readout.
//
// Like lib/admin/group-category-matrix.ts and lib/admin/cell-coverage.ts, this is
// a pure function of its inputs (no I/O, no Supabase), so the grid assembly, the
// blank inactive cells, and the per-cell readiness + coverage readout are all
// testable with no database (ADR 0015). The loader
// (components/admin/multiply/multiply-grid-data.ts) supplies the inputs — the
// catalog, each cell's applied flag + target + override, and the per-cell natural-
// unit readiness inputs (interest headcount, capacity issue, the two health
// letters) plus the coverage X — and this resolver assembles the grid.

// The three top types, in display order. Mirrors MATRIX_TYPES / MULTIPLY_TYPES but
// kept local so this pure module has no surface dependency.
export const GRID_TYPES: readonly GroupAudienceCategory[] = [
  "men",
  "women",
  "mixed",
];

// One catalog category: a grid ROW.
export type GridCategoryInput = {
  id: string;
  label: string;
};

// One cell's full input: the (type × category) coordinate, whether the category
// is APPLIED to that type (active), its coverage target (Y) and current have (X),
// the per-cell readiness override (a partial of the global rule), and the per-cell
// readiness inputs in their natural units (interest headcount, capacity issue, the
// two health letters). An inactive cell is rendered blank, so its readiness inputs
// are never evaluated — the loader still passes them for a uniform shape.
export type GridCellInput = {
  audienceCategory: GroupAudienceCategory;
  categoryId: string;
  active: boolean;
  have: number;
  target: number;
  override: CellReadinessOverride;
  inputs: CellReadinessInputs;
};

// The `have X of Y` coverage readout shown on an active cell.
export type GridCoverage = {
  have: number;
  target: number;
};

// An active cell's readout: its readiness signal + its coverage. A blank cell has
// no readout.
export type GridCellReadout = {
  signal: CellReadinessSignal;
  coverage: GridCoverage;
};

// One grid cell: its (type × category) coordinate, whether the category is applied
// to that type, and — only when applied — its readiness + coverage readout. A
// not-applied cell has `applied: false` and `readout: null`, so the surface renders
// it blank.
export type MultiplyGridCell = {
  categoryId: string;
  audienceCategory: GroupAudienceCategory;
  applied: boolean;
  readout: GridCellReadout | null;
};

// One grid row: a category and its three cells (one per top type).
export type MultiplyGridRow = {
  categoryId: string;
  label: string;
  cells: Record<GroupAudienceCategory, MultiplyGridCell>;
};

export type MultiplyGrid = {
  rows: MultiplyGridRow[];
};

// A cell key matching the per-cell input keying (single colon), so the loader and
// the grid agree without juggling tuples. (The capacity read uses a DOUBLE-colon
// key of its own — see cellKeyString — so the loader maps between them.)
function cellKey(
  audienceCategory: GroupAudienceCategory,
  categoryId: string
): string {
  return `${audienceCategory}:${categoryId}`;
}

// Build the Multiply grid: for every catalog category, derive its three cells from
// the cell inputs. A cell with no input row, or an input whose `active` flag is
// false, renders BLANK (applied: false, readout: null) — the category is not
// applied to that type. An ACTIVE cell resolves its effective readiness rule
// (global rule overlaid with the cell's override) and evaluates it against the
// cell's natural-unit inputs, pairing the signal with the cell's `have X of Y`
// coverage. Cells whose category isn't in the catalog are dropped (the rows are
// keyed off the catalog), so an archived category's stale cells never surface.
export function buildMultiplyGrid(
  categories: GridCategoryInput[],
  cells: GridCellInput[],
  globalRule: ReadinessRule
): MultiplyGrid {
  // Index the cell inputs by `${audience_category}:${category_id}` for O(1) lookup.
  const inputByKey = new Map<string, GridCellInput>();
  for (const cell of cells) {
    inputByKey.set(cellKey(cell.audienceCategory, cell.categoryId), cell);
  }

  const rows: MultiplyGridRow[] = categories.map((category) => {
    const cellsForRow = {} as Record<GroupAudienceCategory, MultiplyGridCell>;
    for (const type of GRID_TYPES) {
      const input = inputByKey.get(cellKey(type, category.id));
      const applied = input?.active ?? false;

      // Only an applied cell carries a readout; an unapplied cell stays blank, so
      // its readiness inputs are never evaluated.
      const readout: GridCellReadout | null =
        applied && input
          ? {
              signal: evaluateCellReadiness(
                resolveCellRule(globalRule, input.override),
                input.inputs
              ),
              coverage: { have: input.have, target: input.target },
            }
          : null;

      cellsForRow[type] = {
        categoryId: category.id,
        audienceCategory: type,
        applied,
        readout,
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
