import { describe, expect, it } from "vitest";

import {
  buildSettingsData,
  type SettingsReads,
} from "@/components/admin/settings/settings-data";
import type { ReadResult } from "@/lib/supabase/read-core";
import { MATRIX_TYPES } from "@/lib/admin/group-category-matrix";

const ok = <T>(data: T): ReadResult<T> => ({ data, error: null });
const fail = (message: string): ReadResult<never> => ({
  data: null,
  error: new Error(message),
});

// A successful, empty read for every Settings dependency; each test overrides
// only the reads it cares about. Two adapters, one seam (ADR 0015): this fake
// satisfies the same `SettingsReads` the live `supabaseSettingsReads` adapter
// does, so the type×category matrix assembly is exercised with no database.
function emptyReads(overrides: Partial<SettingsReads> = {}): SettingsReads {
  return {
    fetchMetricDefaults: async () => ok(null),
    fetchAllGroups: async () => ok([]),
    fetchAllGroupMetricSettings: async () => ok([]),
    fetchGroupHealthRubric: async () => ok(null),
    fetchMultiplicationConfigs: async () => ok([]),
    fetchLeaderHealthRubric: async () => ok(null),
    fetchGroupCategories: async () => ok([]),
    fetchCategoryTypeCells: async () => ok([]),
    // #400: per-cell coverage reads default to empty.
    fetchCategoryTypeTargetCells: async () => ok([]),
    fetchGroupCellLifecycleRows: async () => ok([]),
    ...overrides,
  };
}

const CAT = "cat-2030";

describe("buildSettingsData — Groups tab (#396)", () => {
  it("builds an empty matrix when the catalog is empty (fresh ministry)", async () => {
    const data = await buildSettingsData(emptyReads(), { isSuperAdmin: false });
    expect(data.categoryMatrix.rows).toEqual([]);
    expect(data.errors.groupCategories).toBeNull();
  });

  it("applying 20-30s to all three types surfaces three active cells in the matrix", async () => {
    const data = await buildSettingsData(
      emptyReads({
        fetchGroupCategories: async () =>
          ok([{ id: CAT, label: "20-30s", created_at: "2026-06-06" }]),
        fetchCategoryTypeCells: async () =>
          ok(
            MATRIX_TYPES.map((audience_category, i) => ({
              id: `cell-${i}`,
              audience_category,
              category_id: CAT,
              active: true,
            }))
          ),
      }),
      { isSuperAdmin: false }
    );

    expect(data.categoryMatrix.rows).toHaveLength(1);
    const row = data.categoryMatrix.rows[0];
    expect(row.label).toBe("20-30s");
    const active = MATRIX_TYPES.filter((type) => row.cells[type].active);
    expect(active).toHaveLength(3);
  });

  it("reflects a partial apply (one type on, the others off)", async () => {
    const data = await buildSettingsData(
      emptyReads({
        fetchGroupCategories: async () =>
          ok([{ id: CAT, label: "20-30s", created_at: "2026-06-06" }]),
        fetchCategoryTypeCells: async () =>
          ok([
            {
              id: "cell-men",
              audience_category: "men",
              category_id: CAT,
              active: true,
            },
          ]),
      }),
      { isSuperAdmin: false }
    );

    const row = data.categoryMatrix.rows[0];
    expect(row.cells.men.active).toBe(true);
    expect(row.cells.women.active).toBe(false);
    expect(row.cells.mixed.active).toBe(false);
  });

  it("surfaces a read failure on errors.groupCategories and degrades to an empty matrix", async () => {
    const data = await buildSettingsData(
      emptyReads({
        fetchGroupCategories: async () => fail("catalog boom"),
      }),
      { isSuperAdmin: false }
    );
    expect(data.errors.groupCategories).toBe("catalog boom");
    expect(data.categoryMatrix.rows).toEqual([]);
  });

  it("surfaces a cell read failure too (either read failing sets the key)", async () => {
    const data = await buildSettingsData(
      emptyReads({
        fetchGroupCategories: async () =>
          ok([{ id: CAT, label: "20-30s", created_at: "2026-06-06" }]),
        fetchCategoryTypeCells: async () => fail("cells boom"),
      }),
      { isSuperAdmin: false }
    );
    expect(data.errors.groupCategories).toBe("cells boom");
  });
});

describe("buildSettingsData — Groups tab coverage (#400)", () => {
  it("builds per-active-cell coverage (have X of Y), sorted by largest shortfall", async () => {
    const data = await buildSettingsData(
      emptyReads({
        fetchGroupCategories: async () =>
          ok([{ id: CAT, label: "20-30s", created_at: "2026-06-06" }]),
        fetchCategoryTypeTargetCells: async () =>
          ok([
            {
              id: "cell-men",
              audience_category: "men",
              category_id: CAT,
              active: true,
              target_count: 3,
            },
            {
              id: "cell-women",
              audience_category: "women",
              category_id: CAT,
              active: true,
              target_count: 2,
            },
          ]),
        fetchGroupCellLifecycleRows: async () =>
          ok([
            // Men: one active + one launching = have 2, target 3 → gap 1.
            {
              audience_category: "men",
              category_id: CAT,
              lifecycle_status: "active",
            },
            {
              audience_category: "men",
              category_id: CAT,
              lifecycle_status: "launching_soon",
            },
            // A planned_pause group does NOT count.
            {
              audience_category: "men",
              category_id: CAT,
              lifecycle_status: "planned_pause",
            },
            // Women: have 0, target 2 → gap 2 (largest shortfall, sorts first).
          ]),
      }),
      { isSuperAdmin: false }
    );

    expect(data.cellCoverage.map((c) => c.audienceCategory)).toEqual([
      "women",
      "men",
    ]);
    expect(data.cellCoverage[0]).toMatchObject({
      audienceCategory: "women",
      have: 0,
      target: 2,
      gap: 2,
    });
    expect(data.cellCoverage[1]).toMatchObject({
      audienceCategory: "men",
      have: 2,
      target: 3,
      gap: 1,
    });
  });

  it("drops an inactive cell from coverage and resolves the label from the catalog", async () => {
    const data = await buildSettingsData(
      emptyReads({
        fetchGroupCategories: async () =>
          ok([{ id: CAT, label: "20-30s", created_at: "2026-06-06" }]),
        fetchCategoryTypeTargetCells: async () =>
          ok([
            {
              id: "cell-mixed",
              audience_category: "mixed",
              category_id: CAT,
              active: false,
              target_count: 5,
            },
          ]),
      }),
      { isSuperAdmin: false }
    );
    expect(data.cellCoverage).toEqual([]);
  });
});
