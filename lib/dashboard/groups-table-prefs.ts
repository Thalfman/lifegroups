// Saved column + density preferences for the Groups Ops table (issue #333,
// PRD §4.14 "Groups → table follow-through"). Pure, exported, and unit-tested so
// the default set, the optional-column vocabulary, and the merge/normalise rules
// are a locked spec rather than logic buried in the directory component.
//
// These sit beside the sort comparators (groups-table-sort.ts) and the framework-
// free persistence core (lib/admin/view-preferences.ts). The React wiring stays
// in groups-directory.tsx via the shared usePersistedViewState hook; this module
// only owns the shapes and the safe normalisation the hook's validator leans on.

// The table's display density. "comfortable" is the historical look (roomy cell
// padding); "compact" tightens rows so more groups fit on screen at once — the
// scan-speed lever the PRD calls for. Comfortable is the SSR-safe default so the
// server and first client paint match before the saved choice hydrates.
export type GroupsTableDensity = "comfortable" | "compact";

export const GROUPS_TABLE_DENSITIES: readonly GroupsTableDensity[] = [
  "comfortable",
  "compact",
];

export const DEFAULT_GROUPS_TABLE_DENSITY: GroupsTableDensity = "comfortable";

// The columns an admin can hide. The "group" name column and the trailing
// "actions" column are structural (the table is meaningless without a record
// label and its row actions), so they are never toggleable and never persisted —
// only these optional columns carry a shown/hidden preference.
export type GroupsTableOptionalColumn =
  | "leader"
  | "setup"
  | "health"
  | "capacity"
  | "meeting"
  | "checkin";

// The optional columns in render order. Order is fixed by the table layout; the
// preference only records which of them are shown, never a reordering.
export const GROUPS_TABLE_OPTIONAL_COLUMNS: readonly GroupsTableOptionalColumn[] =
  ["leader", "setup", "health", "capacity", "meeting", "checkin"];

const OPTIONAL_COLUMN_SET: ReadonlySet<string> = new Set(
  GROUPS_TABLE_OPTIONAL_COLUMNS
);

// The persisted column choice: the set of optional columns currently shown,
// recorded as a list (JSON-serialisable, order-insensitive on read). The default
// shows every optional column — the historical full table.
export const DEFAULT_GROUPS_TABLE_COLUMNS: readonly GroupsTableOptionalColumn[] =
  GROUPS_TABLE_OPTIONAL_COLUMNS;

export function isGroupsTableDensity(
  value: unknown
): value is GroupsTableDensity {
  return value === "comfortable" || value === "compact";
}

export function isGroupsTableOptionalColumn(
  value: unknown
): value is GroupsTableOptionalColumn {
  return typeof value === "string" && OPTIONAL_COLUMN_SET.has(value);
}

/**
 * Normalise a stored/raw list of column keys into the canonical shown set:
 * keep only known optional columns, drop duplicates and any unknown (stale-schema)
 * keys, and return them in the table's fixed render order. A non-array or empty
 * result is not "show nothing" — an admin can never persist a table with every
 * optional column hidden, so the empty/garbage case falls back to the default
 * (all optional columns shown) rather than rendering a name-and-actions-only table.
 */
export function normalizeGroupsTableColumns(
  value: unknown
): GroupsTableOptionalColumn[] {
  if (!Array.isArray(value)) return [...DEFAULT_GROUPS_TABLE_COLUMNS];
  const seen = new Set<GroupsTableOptionalColumn>();
  for (const item of value) {
    if (isGroupsTableOptionalColumn(item)) seen.add(item);
  }
  if (seen.size === 0) return [...DEFAULT_GROUPS_TABLE_COLUMNS];
  // Re-emit in canonical render order so persistence never reorders the table.
  return GROUPS_TABLE_OPTIONAL_COLUMNS.filter((col) => seen.has(col));
}

/** Normalise a stored density, falling back to the comfortable default. */
export function normalizeGroupsTableDensity(
  value: unknown
): GroupsTableDensity {
  return isGroupsTableDensity(value) ? value : DEFAULT_GROUPS_TABLE_DENSITY;
}

/** Whether a given optional column is in the shown set. */
export function isColumnShown(
  shown: readonly GroupsTableOptionalColumn[],
  column: GroupsTableOptionalColumn
): boolean {
  return shown.includes(column);
}

/**
 * Toggle one optional column's visibility, returning a new shown list in
 * canonical render order. Toggling the last remaining column off is refused —
 * the table always keeps at least one optional column so it never collapses to a
 * name-and-actions-only strip — so hiding the final column is a no-op.
 */
export function toggleGroupsTableColumn(
  shown: readonly GroupsTableOptionalColumn[],
  column: GroupsTableOptionalColumn
): GroupsTableOptionalColumn[] {
  const currentlyShown = shown.includes(column);
  if (currentlyShown && shown.length <= 1) {
    // Refuse to hide the last column; return a normalised copy unchanged.
    return normalizeGroupsTableColumns(shown);
  }
  const next = new Set(shown.filter(isGroupsTableOptionalColumn));
  if (currentlyShown) next.delete(column);
  else next.add(column);
  return GROUPS_TABLE_OPTIONAL_COLUMNS.filter((col) => next.has(col));
}
