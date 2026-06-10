import { describe, expect, it } from "vitest";

import {
  buildMultiplyPlanData,
  EMPTY_MULTIPLY_PLAN_VIEW,
  type MultiplyPlanReads,
} from "@/components/admin/multiply/multiply-plan-data";
import type { ReadResult } from "@/lib/supabase/read-core";

const ok = <T>(data: T): ReadResult<T> => ({ data, error: null });
const fail = (message: string): ReadResult<never> => ({
  data: null,
  error: new Error(message),
});

// A successful, empty read for every dependency; each test overrides only the
// reads it cares about. Two adapters, one seam (ADR 0015): this fake satisfies
// the same `MultiplyPlanReads` the live `supabaseMultiplyPlanReads` adapter
// does.
function emptyReads(
  overrides: Partial<MultiplyPlanReads> = {}
): MultiplyPlanReads {
  return {
    fetchMultiplicationCandidates: async () => ok([]),
    fetchGroupRefs: async () => ok([]),
    fetchApprenticeRefs: async () => ok([]),
    fetchCategoriesForAudience: async () => ok([]),
    ...overrides,
  };
}

const GROUP = {
  id: "g1",
  name: "Alpha",
  lifecycle_status: "active",
  audience_category: "men",
  category_id: "c1",
} as never;

describe("buildMultiplyPlanData", () => {
  it("assembles the planner view with no error when every read succeeds", async () => {
    const data = await buildMultiplyPlanData(
      emptyReads({
        fetchGroupRefs: async () => ok([GROUP]),
        fetchCategoriesForAudience: async (audience) =>
          audience === "men"
            ? ok([{ id: "c1", label: "20-30s", created_at: "2026-06-06" }])
            : ok([]),
      })
    );

    expect(data.error).toBeNull();
    expect(data.typeOptions).toEqual([
      { audienceCategory: "men", categoryId: "c1", label: "20-30s" },
    ]);
    // The active, typed group feeds the "willing to multiply" picker.
    expect(data.groupsByType["men|c1"]).toEqual([{ id: "g1", name: "Alpha" }]);
  });

  it("blocks the planner on the first-precedence read (candidates) with the documented empty view", async () => {
    const data = await buildMultiplyPlanData(
      emptyReads({
        fetchMultiplicationCandidates: async () => fail("candidates boom"),
        // Other reads still succeed — the planner must still not render: the
        // apprentice picker could otherwise silently clear a candidate's
        // leader_pipeline_id on save.
        fetchGroupRefs: async () => ok([GROUP]),
      })
    );

    expect(data).toEqual({
      ...EMPTY_MULTIPLY_PLAN_VIEW,
      error: "candidates boom",
    });
  });

  it("a later blocking read (apprentice refs) also empties the view, with its own error", async () => {
    const data = await buildMultiplyPlanData(
      emptyReads({
        fetchGroupRefs: async () => ok([GROUP]),
        fetchApprenticeRefs: async () => fail("refs boom"),
      })
    );

    expect(data).toEqual({ ...EMPTY_MULTIPLY_PLAN_VIEW, error: "refs boom" });
  });

  it("orders the blocking precedence as data: candidates before apprentice refs", async () => {
    const data = await buildMultiplyPlanData(
      emptyReads({
        fetchMultiplicationCandidates: async () => fail("candidates boom"),
        fetchApprenticeRefs: async () => fail("refs boom"),
      })
    );

    expect(data.error).toBe("candidates boom");
  });

  it("degrades the type picker without blocking the planner on a category read failure", async () => {
    const data = await buildMultiplyPlanData(
      emptyReads({
        fetchGroupRefs: async () => ok([GROUP]),
        fetchCategoriesForAudience: async () => fail("categories boom"),
      })
    );

    // The category reads carry no blocking precedence: the edit form preserves
    // a candidate's existing type, so the planner still renders…
    expect(data.error).toBeNull();
    expect(data.typeOptions).toEqual([]);
    // …with the other sections still populated.
    expect(data.groupsByType["men|c1"]).toEqual([{ id: "g1", name: "Alpha" }]);
  });
});
