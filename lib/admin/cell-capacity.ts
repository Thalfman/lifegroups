// Per-cell capacity ISSUE resolver (#401 / PRD §2.4 + §4). Pure, no I/O. Replaces
// the old hand-FED capacity figure (and the "offerings" concept) with a DERIVED,
// multi-faceted capacity signal computed per CELL from group sizes.
//
// A "cell" = (audience_category ∈ {men,women,mixed}) × (category_id →
// group_categories). This module grades ONE cell from the active member counts of
// the groups in it. There are two facets, and EITHER alone marks the cell as a
// capacity issue:
//
//   * Facet A — over-capacity: any group in the cell has MORE than the universal
//     cap (>12) members.
//   * Facet B — thin availability: there is at most ONE joinable group (a group
//     UNDER the cap, i.e. < 12) in the cell.
//
// Per the PRD §4.2, "joinable = active & under 12". The cell-membership filter
// (active groups, correct audience + category) is applied by the caller; this
// resolver receives the already-cell-scoped ACTIVE group sizes. We deliberately
// compute BOTH facets over active groups only: Facet A's "any group" is read as
// active groups too — over-capacity is about real, member-holding groups, not
// closed/paused shells.

// The universal per-group cap (PRD §2.4). A group AT the cap (exactly 12) is
// neither over-capacity (Facet A needs > 12) nor joinable (Facet B needs < 12).
export const UNIVERSAL_GROUP_CAP = 12;

export type CellCapacityIssue = {
  // True when EITHER facet trips — the cell has a capacity issue.
  isIssue: boolean;
  // Facet A — any active group in the cell is over the cap (> 12 members).
  facetA: boolean;
  // Facet B — at most one joinable group (active & under 12) in the cell.
  facetB: boolean;
};

// Grade one cell's capacity issue from its ACTIVE group member counts. Pure: the
// caller supplies the sizes of every active group already filtered to this cell
// (matching audience_category AND category_id). An empty cell (no active groups)
// has zero joinable groups, so Facet B trips — thin availability is correct for a
// cell with nothing to join.
export function computeCellCapacityIssue(
  activeGroupSizes: readonly number[]
): CellCapacityIssue {
  // Facet A: any active group over the cap. A group exactly at 12 is NOT over.
  const facetA = activeGroupSizes.some((size) => size > UNIVERSAL_GROUP_CAP);

  // Facet B: count joinable groups (active & strictly under the cap). A group
  // exactly at 12 is NOT joinable (it is full, not under). Thin availability is
  // <= 1 joinable group.
  const joinableCount = activeGroupSizes.filter(
    (size) => size < UNIVERSAL_GROUP_CAP
  ).length;
  const facetB = joinableCount <= 1;

  return { isIssue: facetA || facetB, facetA, facetB };
}

// ---------------------------------------------------------------------------
// Type-level rollup (#401 interim surface).
// ---------------------------------------------------------------------------
//
// The full Multiply matrix grid (rows = categories × cols = types) is a LATER
// slice (#403). Until it exists, the per-cell capacity SIGNAL is rolled up to the
// TYPE level for the existing per-type Multiply boards: a type has a capacity
// issue when ANY of its active cells trips. NOTE: in #403 this per-cell signal
// moves onto the individual grid cell, where the issue truly belongs — this
// type-level rollup is the interim surface only.

export type TypeCapacityIssue = {
  // True when any cell of this type has a capacity issue.
  isIssue: boolean;
  // How many of the type's cells trip (for a compact "N of M cells" summary).
  affectedCellCount: number;
  // Total cells considered (active cells of this type).
  cellCount: number;
};

export const NO_TYPE_CAPACITY_ISSUE: TypeCapacityIssue = {
  isIssue: false,
  affectedCellCount: 0,
  cellCount: 0,
};

// Roll a type's per-cell active group sizes up to a single type-level capacity
// issue. `cells` is the list of each active cell's active group sizes for the
// type. A type with no active cells has no issue (nothing to multiply yet).
export function rollUpTypeCapacityIssue(
  cells: readonly (readonly number[])[]
): TypeCapacityIssue {
  let affected = 0;
  for (const sizes of cells) {
    if (computeCellCapacityIssue(sizes).isIssue) affected += 1;
  }
  return {
    isIssue: affected > 0,
    affectedCellCount: affected,
    cellCount: cells.length,
  };
}
