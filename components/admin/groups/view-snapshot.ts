import type {
  GroupsTableSortDir,
  GroupsTableSortKey,
} from "@/lib/dashboard/groups-table-sort";
import {
  isGroupsTableDensity,
  type GroupsTableDensity,
  type GroupsTableOptionalColumn,
} from "@/lib/dashboard/groups-table-prefs";
import type { ViewMode } from "./types";

// The persisted view snapshot for this surface (#325, extended in #333): the
// card⇄table mode, the table's sort column + direction, the shown optional
// columns, and the display density. Local, per-browser, profile-scoped — a UI
// preference, never server state. Held as one snapshot under the surface's
// profile-scoped key so the whole Groups view restores atomically without flash.
export type GroupsViewSnapshot = {
  mode: ViewMode;
  sortKey: GroupsTableSortKey;
  sortDir: GroupsTableSortDir;
  // The shown optional columns (#333). Omitted by pre-#333 snapshots; the
  // validator tolerates that and the directory normalises to the default set.
  columns?: GroupsTableOptionalColumn[];
  // The table display density (#333). Omitted by pre-#333 snapshots; defaults
  // to "comfortable" so older saved views keep their historical look.
  density?: GroupsTableDensity;
};

const SORT_KEYS = new Set<GroupsTableSortKey>([
  "group",
  "leader",
  "setup",
  "health",
  "capacity",
  "meeting",
  "checkin",
]);

// Accept any snapshot whose required #325 fields are valid. The #333 additions
// (columns, density) are optional: a pre-#333 saved value omits them, and we
// only reject a present-but-wrong-typed field — the directory then normalises
// columns/density through their own helpers, so a stale or partial value
// degrades to the defaults rather than discarding the whole snapshot.
export function isGroupsViewSnapshot(
  value: unknown
): value is GroupsViewSnapshot {
  if (value === null || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (
    !(
      (v.mode === "cards" || v.mode === "table") &&
      typeof v.sortKey === "string" &&
      SORT_KEYS.has(v.sortKey as GroupsTableSortKey) &&
      (v.sortDir === "asc" || v.sortDir === "desc")
    )
  ) {
    return false;
  }
  if (v.columns !== undefined && !Array.isArray(v.columns)) return false;
  if (v.density !== undefined && !isGroupsTableDensity(v.density)) return false;
  return true;
}
