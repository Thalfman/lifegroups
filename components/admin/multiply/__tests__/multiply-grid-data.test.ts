import { describe, expect, it } from "vitest";

import {
  buildMultiplyGridData,
  EMPTY_MULTIPLY_GRID_DATA,
  type MultiplyGridReads,
} from "@/components/admin/multiply/multiply-grid-data";
import { currentMinistryYear } from "@/components/admin/multiply/multiply-data";
import { EMPTY_CELL_ACTIVE_GROUP_SIZES } from "@/lib/supabase/multiplication-config-reads";
import { EMPTY_CELL_HEALTH_GRADES } from "@/lib/admin/cell-health";
import type { ReadResult } from "@/lib/supabase/read-core";

const ok = <T>(data: T): ReadResult<T> => ({ data, error: null });
const fail = (message: string): ReadResult<never> => ({
  data: null,
  error: new Error(message),
});

// A successful, empty read for every dependency; each test overrides only the
// reads it cares about. Two adapters, one seam (ADR 0015): this fake satisfies
// the same `MultiplyGridReads` the live `supabaseMultiplyGridReads` adapter
// does, so the grid assembly is exercised with no database.
function emptyReads(
  overrides: Partial<MultiplyGridReads> = {}
): MultiplyGridReads {
  return {
    fetchGroupCategories: async () => ok([]),
    fetchCategoryTypeTargetCells: async () => ok([]),
    fetchGroupCellLifecycleRows: async () => ok([]),
    // No stored global rule (fresh ministry): the built-in default applies.
    fetchReadinessRule: async () => ok(null),
    fetchAudienceReadinessRules: async () => ok([]),
    fetchCellInterestCounts: async () => ok({}),
    fetchCellActiveGroupSizes: async () => ok(EMPTY_CELL_ACTIVE_GROUP_SIZES),
    fetchCellHealthGrades: async () => ok(EMPTY_CELL_HEALTH_GRADES),
    ...overrides,
  };
}

const NOW = new Date("2026-03-15T12:00:00Z");
const CAT = { id: "c1", label: "20-30s", created_at: "2026-06-06" };
const MEN_CELL = {
  id: "cell-men",
  audience_category: "men" as const,
  category_id: "c1",
  active: true,
  target_count: 2,
  trigger_overrides: {},
};
const MEN_ACTIVE_GROUP = {
  audience_category: "men" as const,
  category_id: "c1",
  lifecycle_status: "active" as const,
};

describe("buildMultiplyGridData", () => {
  it("assembles the grid with no error when every read succeeds", async () => {
    const data = await buildMultiplyGridData(
      emptyReads({
        fetchGroupCategories: async () => ok([CAT]),
        fetchCategoryTypeTargetCells: async () => ok([MEN_CELL]),
        fetchGroupCellLifecycleRows: async () => ok([MEN_ACTIVE_GROUP]),
      }),
      NOW
    );

    expect(data.error).toBeNull();
    expect(data.ruleFellBack).toBe(false);
    expect(data.ministryYear).toBe(currentMinistryYear(NOW));
    expect(data.grid.rows).toHaveLength(1);
    const row = data.grid.rows[0];
    expect(row.label).toBe("20-30s");
    // The applied cell carries its `have X of Y` coverage readout…
    expect(row.cells.men.applied).toBe(true);
    expect(row.cells.men.readout?.coverage).toEqual({ have: 1, target: 2 });
    // …and an unapplied cell renders blank.
    expect(row.cells.women.applied).toBe(false);
    expect(row.cells.women.readout).toBeNull();
  });

  it("surfaces the first-precedence failure (categories) and degrades to no rows", async () => {
    const data = await buildMultiplyGridData(
      emptyReads({
        fetchGroupCategories: async () => fail("categories boom"),
        // A second, later failure must not displace the first-precedence one.
        fetchCellHealthGrades: async () => fail("health boom"),
      }),
      NOW
    );

    expect(data.error).toBe("categories boom");
    expect(data.grid.rows).toEqual([]);
  });

  it("still assembles the grid from what loaded when a later read fails", async () => {
    const data = await buildMultiplyGridData(
      emptyReads({
        fetchGroupCategories: async () => ok([CAT]),
        fetchCategoryTypeTargetCells: async () => ok([MEN_CELL]),
        fetchGroupCellLifecycleRows: async () => ok([MEN_ACTIVE_GROUP]),
        fetchCellHealthGrades: async () => fail("health boom"),
      }),
      NOW
    );

    // The error is surfaced — callers (the Readiness tab, Home's card) gate on
    // it so the partial grid is never presented as a false "0 of 0 ready" —
    // while the earlier sections still populate the grid.
    expect(data.error).toBe("health boom");
    expect(data.grid.rows).toHaveLength(1);
    expect(data.grid.rows[0].cells.men.applied).toBe(true);
  });

  it("degrades to the documented empty grid shape when every read fails", async () => {
    const data = await buildMultiplyGridData(
      emptyReads({
        fetchGroupCategories: async () => fail("categories boom"),
        fetchCategoryTypeTargetCells: async () => fail("cells boom"),
        fetchGroupCellLifecycleRows: async () => fail("lifecycle boom"),
        fetchReadinessRule: async () => fail("rule boom"),
        fetchAudienceReadinessRules: async () => fail("per-type boom"),
        fetchCellInterestCounts: async () => fail("interest boom"),
        fetchCellActiveGroupSizes: async () => fail("sizes boom"),
        fetchCellHealthGrades: async () => fail("health boom"),
      }),
      NOW
    );

    expect(data.grid).toEqual(EMPTY_MULTIPLY_GRID_DATA.grid);
    expect(data.ruleFellBack).toBe(false);
    // Error precedence is the batch's declaration order; categories leads it.
    expect(data.error).toBe("categories boom");
  });

  it("flags a corrupt stored trigger rule without treating it as a read error (#473)", async () => {
    const data = await buildMultiplyGridData(
      emptyReads({
        fetchReadinessRule: async () =>
          ok({
            id: "rule-1",
            ministry_year: 2026,
            rule: "corrupt jsonb",
            updated_at: "2026-06-06",
          }),
      }),
      NOW
    );

    expect(data.ruleFellBack).toBe(true);
    expect(data.error).toBeNull();
  });
});
