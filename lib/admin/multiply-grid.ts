import type { GroupAudienceCategory } from "@/types/enums";
import { AUDIENCE_CATEGORIES } from "@/lib/admin/audience";
import type { CellReadinessSignal } from "@/lib/admin/cell-readiness";
import type { ResolvedCell } from "@/lib/admin/cell";
import { cellKey } from "@/lib/admin/cell-coordinate";

// The Multiply matrix grid (#403 / PRD §2.5), as a pure data structure. This is
// the slice that FOLDS the three per-type Multiply boards into ONE grid:
//   * rows    = categories (the live catalog),
//   * columns = the three top types (Men's / Women's / Mixed).
// Each ACTIVE cell (the category is applied to that type) carries its per-cell
// READINESS signal (#402) and its `have X of Y` COVERAGE (#400). A cell where the
// category is NOT applied to that type renders BLANK — it carries no readout.
//
// This builder is now pure ARRANGEMENT: it places already-resolved live Cells
// (lib/admin/cell.ts — the unit carrying coverage, inputs, and the resolved
// readiness signal) into the rows × columns matrix and blanks the cells with no
// resolved Cell or an unapplied one. The per-cell resolution — reading each
// facet through one cellKey and resolving the three-tier readiness cascade — lives
// in `resolveCell`; this file no longer touches the readiness rule. Pure (no I/O,
// no Supabase), so the arrangement, the blank inactive cells, and the readout
// pass-through are testable with no database (ADR 0015). The loader
// (components/admin/multiply/multiply-grid-data.ts) gathers the reads and resolves
// the Cells; this builder arranges them.

// The three top types, in display order — the canonical Audience vocabulary.
export const GRID_TYPES = AUDIENCE_CATEGORIES;

// One catalog category: a grid ROW.
export type GridCategoryInput = {
  id: string;
  label: string;
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

// Home overview roll-up (#470): "X of Y cells ready", built purely over an
// already-assembled grid. Y counts the ACTIVE (applied) cells; X counts those
// whose readiness signal is ready. Because it derives from the same grid the
// /admin/multiply surface renders, Home's headline can never disagree with the
// Multiply grid's per-cell signals.
export type MultiplyHomeSummary = {
  readyCells: number;
  activeCells: number;
};

export function buildMultiplyHomeSummary(
  grid: MultiplyGrid
): MultiplyHomeSummary {
  let readyCells = 0;
  let activeCells = 0;
  for (const row of grid.rows) {
    for (const type of GRID_TYPES) {
      const cell = row.cells[type];
      // Only an applied cell carries a readout; blank cells never count toward
      // either side of "X of Y".
      if (!cell.applied || cell.readout === null) continue;
      activeCells += 1;
      if (cell.readout.signal.ready) readyCells += 1;
    }
  }
  return { readyCells, activeCells };
}

// Arrange resolved live Cells into the matrix: for every catalog category, place
// its three cells (one per top type). A category/type with no resolved Cell, or
// one that isn't applied, renders BLANK (applied: false, readout: null). An
// APPLIED cell carries its already-resolved readiness signal paired with its
// `have X of Y` coverage — `resolveCell` (lib/admin/cell.ts) did the cascade and
// the evaluation; this builder only reads the result. Cells whose category isn't
// in the catalog are dropped (the rows are keyed off the catalog), so an archived
// category's stale cells never surface.
export function buildMultiplyGrid(
  categories: GridCategoryInput[],
  cells: ResolvedCell[]
): MultiplyGrid {
  // Index the resolved cells by their canonical key for O(1) lookup.
  const cellByKey = new Map<string, ResolvedCell>();
  for (const cell of cells) {
    cellByKey.set(cellKey(cell.coordinate), cell);
  }

  const rows: MultiplyGridRow[] = categories.map((category) => {
    const cellsForRow = {} as Record<GroupAudienceCategory, MultiplyGridCell>;
    for (const type of GRID_TYPES) {
      const resolved = cellByKey.get(
        cellKey({ audience: type, categoryId: category.id })
      );
      const applied = resolved?.applied ?? false;

      // An applied cell always carries a readiness signal (resolveCell evaluates
      // it only when active); a blank cell has none.
      const readout: GridCellReadout | null =
        applied && resolved && resolved.signal
          ? { signal: resolved.signal, coverage: resolved.coverage }
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
