import type {
  GroupAudienceCategory,
  GroupLifecycleStatus,
} from "@/types/enums";
import { cellKey } from "@/lib/admin/cell-coordinate";

// Per-cell coverage — the pure "have X of Y" resolver (#400 / PRD §2.3). A cell
// is (audience_category × category). For every ACTIVE cell it computes:
//   X (have)   = groups in the cell whose lifecycle_status ∈ {active,
//                launching_soon} — "active + actively-launching" (PRD §2.3).
//                Planned-only / other states do NOT count.
//   Y (target) = the cell's target_count.
//   gap        = max(0, target − have) — the shortfall the panel sorts by.
// Targets are TRACKING ONLY here; this module is read-only and feeds NO trigger
// / readiness logic. Keeping it a pure function of its inputs makes the count,
// the active+launching rule, and the panel sort testable with no database
// (ADR 0015).

// The lifecycle states that count toward coverage X. "active + launching" per
// the PRD = a live group plus one that is actively launching. Exported so the
// rule is named in one place (and asserted in the unit test).
export const COVERAGE_LIFECYCLE_STATES: ReadonlySet<GroupLifecycleStatus> =
  new Set<GroupLifecycleStatus>(["active", "launching_soon"]);

// A cell, as the builder needs it: the (type × category) pair, whether it is
// active (only active cells get coverage), the target, and a display label.
export type CoverageCellInput = {
  audienceCategory: GroupAudienceCategory;
  categoryId: string;
  // The category's catalog label, for the panel/readout. Resolved by the caller
  // from group_categories; a cell whose category isn't in the live catalog is
  // dropped (the caller passes only live-category cells).
  label: string;
  active: boolean;
  target: number;
};

// One group's contribution to a cell's count: its cell + lifecycle. A NULL
// audience_category means the group is in no type column, so it counts toward no
// cell. (Groups with a NULL category_id are excluded upstream — Uncategorized is
// in no category cell.)
export type CoverageGroupInput = {
  audienceCategory: GroupAudienceCategory | null;
  categoryId: string;
  lifecycleStatus: GroupLifecycleStatus;
};

// One active cell's coverage row.
export type CellCoverage = {
  audienceCategory: GroupAudienceCategory;
  categoryId: string;
  label: string;
  have: number;
  target: number;
  // The shortfall, floored at 0 — a cell already over its target reads as gap 0,
  // never negative. This is what the dedicated panel sorts by (largest first).
  gap: number;
};

// Whether a group's lifecycle counts toward coverage X (active + launching).
export function countsTowardCoverage(status: GroupLifecycleStatus): boolean {
  return COVERAGE_LIFECYCLE_STATES.has(status);
}

// Build per-active-cell coverage from the active cells + the group rows. Only
// ACTIVE cells appear (coverage applies to active cells only — PRD §2.3). X
// counts the active+launching groups whose (type, category) matches the cell;
// groups in no active cell, with a non-matching state, or with a NULL type are
// simply not counted. The result is returned in the cells' input order; sort it
// with sortByLargestShortfall for the panel.
export function buildCellCoverage(
  cells: CoverageCellInput[],
  groups: CoverageGroupInput[]
): CellCoverage[] {
  const activeCells = cells.filter((cell) => cell.active);

  // Tally X per active cell. Pre-seed every active cell to 0 so a cell with no
  // groups still reports have=0 (not absent).
  const haveByKey = new Map<string, number>();
  for (const cell of activeCells) {
    haveByKey.set(
      cellKey({ audience: cell.audienceCategory, categoryId: cell.categoryId }),
      0
    );
  }
  for (const group of groups) {
    if (group.audienceCategory == null) continue;
    if (!countsTowardCoverage(group.lifecycleStatus)) continue;
    const key = cellKey({
      audience: group.audienceCategory,
      categoryId: group.categoryId,
    });
    // Only count toward an ACTIVE cell — a group in an inactive/absent cell is
    // ignored (the key won't be present in the pre-seeded map).
    if (!haveByKey.has(key)) continue;
    haveByKey.set(key, (haveByKey.get(key) ?? 0) + 1);
  }

  return activeCells.map((cell) => {
    const have =
      haveByKey.get(
        cellKey({
          audience: cell.audienceCategory,
          categoryId: cell.categoryId,
        })
      ) ?? 0;
    const target = cell.target;
    return {
      audienceCategory: cell.audienceCategory,
      categoryId: cell.categoryId,
      label: cell.label,
      have,
      target,
      gap: Math.max(0, target - have),
    };
  });
}

// Sort coverage rows by largest shortfall first — the dedicated panel's order
// (PRD §2.3). Ties break by the cell that is furthest from its target relative to
// nothing further, then by label then type for a stable, deterministic order.
// Returns a NEW array; the input is not mutated.
export function sortByLargestShortfall(rows: CellCoverage[]): CellCoverage[] {
  return [...rows].sort((a, b) => {
    if (b.gap !== a.gap) return b.gap - a.gap;
    if (a.label !== b.label) return a.label.localeCompare(b.label);
    return a.audienceCategory.localeCompare(b.audienceCategory);
  });
}
