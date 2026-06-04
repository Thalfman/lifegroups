import { describe, expect, it } from "vitest";

import {
  DEFAULT_GROUPS_TABLE_COLUMNS,
  DEFAULT_GROUPS_TABLE_DENSITY,
  GROUPS_TABLE_OPTIONAL_COLUMNS,
  isColumnShown,
  isGroupsTableDensity,
  isGroupsTableOptionalColumn,
  normalizeGroupsTableColumns,
  normalizeGroupsTableDensity,
  toggleGroupsTableColumn,
  type GroupsTableOptionalColumn,
} from "@/lib/dashboard/groups-table-prefs";

// Pure helpers behind the Groups Ops table's saved column + density prefs
// (#333). They lock the optional-column vocabulary, the safe normalisation that
// the persistence validator leans on, and the toggle invariants — so corrupt or
// stale stored values can never collapse the table or reorder its columns.

describe("isGroupsTableDensity", () => {
  it("accepts the two known densities", () => {
    expect(isGroupsTableDensity("comfortable")).toBe(true);
    expect(isGroupsTableDensity("compact")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isGroupsTableDensity("cozy")).toBe(false);
    expect(isGroupsTableDensity("")).toBe(false);
    expect(isGroupsTableDensity(null)).toBe(false);
    expect(isGroupsTableDensity(1)).toBe(false);
    expect(isGroupsTableDensity({})).toBe(false);
  });
});

describe("normalizeGroupsTableDensity", () => {
  it("passes through a valid density", () => {
    expect(normalizeGroupsTableDensity("compact")).toBe("compact");
    expect(normalizeGroupsTableDensity("comfortable")).toBe("comfortable");
  });

  it("falls back to the comfortable default for garbage", () => {
    expect(normalizeGroupsTableDensity("dense")).toBe(
      DEFAULT_GROUPS_TABLE_DENSITY
    );
    expect(normalizeGroupsTableDensity(undefined)).toBe(
      DEFAULT_GROUPS_TABLE_DENSITY
    );
    expect(DEFAULT_GROUPS_TABLE_DENSITY).toBe("comfortable");
  });
});

describe("isGroupsTableOptionalColumn", () => {
  it("accepts every optional column", () => {
    for (const col of GROUPS_TABLE_OPTIONAL_COLUMNS) {
      expect(isGroupsTableOptionalColumn(col)).toBe(true);
    }
  });

  it("rejects the structural columns and unknown keys", () => {
    // group + actions are never toggleable, so they are not optional columns.
    expect(isGroupsTableOptionalColumn("group")).toBe(false);
    expect(isGroupsTableOptionalColumn("actions")).toBe(false);
    expect(isGroupsTableOptionalColumn("nope")).toBe(false);
    expect(isGroupsTableOptionalColumn(42)).toBe(false);
  });
});

describe("normalizeGroupsTableColumns", () => {
  it("returns the default (all optional columns) for a non-array", () => {
    expect(normalizeGroupsTableColumns(null)).toEqual([
      ...DEFAULT_GROUPS_TABLE_COLUMNS,
    ]);
    expect(normalizeGroupsTableColumns("leader")).toEqual([
      ...DEFAULT_GROUPS_TABLE_COLUMNS,
    ]);
    expect(normalizeGroupsTableColumns({})).toEqual([
      ...DEFAULT_GROUPS_TABLE_COLUMNS,
    ]);
  });

  it("keeps known columns and drops unknown / stale ones", () => {
    expect(
      normalizeGroupsTableColumns(["leader", "ghost", "capacity", 7])
    ).toEqual(["leader", "capacity"]);
  });

  it("drops duplicates and re-emits in canonical render order", () => {
    // Input out of order and duplicated → canonical order, deduped.
    expect(
      normalizeGroupsTableColumns(["checkin", "leader", "leader", "setup"])
    ).toEqual(["leader", "setup", "checkin"]);
  });

  it("falls back to the default when nothing valid survives (never hides all)", () => {
    expect(normalizeGroupsTableColumns([])).toEqual([
      ...DEFAULT_GROUPS_TABLE_COLUMNS,
    ]);
    expect(normalizeGroupsTableColumns(["group", "actions", "junk"])).toEqual([
      ...DEFAULT_GROUPS_TABLE_COLUMNS,
    ]);
  });

  it("is idempotent on the canonical default", () => {
    const once = normalizeGroupsTableColumns([...DEFAULT_GROUPS_TABLE_COLUMNS]);
    expect(normalizeGroupsTableColumns(once)).toEqual(once);
  });
});

describe("isColumnShown", () => {
  it("reports membership in the shown set", () => {
    const shown: GroupsTableOptionalColumn[] = ["leader", "capacity"];
    expect(isColumnShown(shown, "leader")).toBe(true);
    expect(isColumnShown(shown, "health")).toBe(false);
  });
});

describe("toggleGroupsTableColumn", () => {
  it("hides a shown column and keeps render order", () => {
    expect(
      toggleGroupsTableColumn(["leader", "setup", "health"], "setup")
    ).toEqual(["leader", "health"]);
  });

  it("shows a hidden column in its canonical slot, not appended", () => {
    // "setup" comes before "health" in render order, so it slots in there.
    expect(toggleGroupsTableColumn(["leader", "health"], "setup")).toEqual([
      "leader",
      "setup",
      "health",
    ]);
  });

  it("refuses to hide the last remaining column", () => {
    expect(toggleGroupsTableColumn(["leader"], "leader")).toEqual(["leader"]);
  });

  it("round-trips: toggle off then on returns to the original shown set", () => {
    const start = normalizeGroupsTableColumns([
      ...DEFAULT_GROUPS_TABLE_COLUMNS,
    ]);
    const without = toggleGroupsTableColumn(start, "meeting");
    expect(without).not.toContain("meeting");
    const restored = toggleGroupsTableColumn(without, "meeting");
    expect(restored).toEqual(start);
  });
});
