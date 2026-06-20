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
    fetchGroupTypeConfigs: async () => ok([]),
    fetchGroupTypes: async () => ok([]),
    ...overrides,
  };
}

const config = (group_type: string, in_pipeline: boolean) =>
  ({
    group_type,
    target_count: 0,
    readiness_rule: null,
    in_pipeline,
  }) as never;

const GROUP = {
  id: "g1",
  name: "Alpha",
  lifecycle_status: "active",
  group_type: "Men 20-30s",
} as never;

describe("buildMultiplyPlanData", () => {
  it("assembles the planner view with no error when every read succeeds", async () => {
    const data = await buildMultiplyPlanData(
      emptyReads({
        fetchGroupRefs: async () => ok([GROUP]),
      })
    );

    expect(data.error).toBeNull();
    // The active group feeds the "willing to multiply" picker, carrying its
    // free-text group_type.
    expect(data.groupOptions).toEqual([
      { id: "g1", name: "Alpha", groupType: "Men 20-30s" },
    ]);
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
      pipelinedTypes: [],
      groupTypes: [],
      pipeline: [],
    });
  });

  it("a later blocking read (apprentice refs) also empties the view, with its own error", async () => {
    const data = await buildMultiplyPlanData(
      emptyReads({
        fetchGroupRefs: async () => ok([GROUP]),
        fetchApprenticeRefs: async () => fail("refs boom"),
      })
    );

    expect(data).toEqual({
      ...EMPTY_MULTIPLY_PLAN_VIEW,
      error: "refs boom",
      pipelinedTypes: [],
      groupTypes: [],
      pipeline: [],
    });
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

  // ADR 0030 Pipeline (minimal): the in_pipeline configs surface as
  // pipelinedTypes, the master list as groupTypes — both additive.
  it("surfaces only in_pipeline=true configs as pipelinedTypes, with the master list", async () => {
    const data = await buildMultiplyPlanData(
      emptyReads({
        fetchGroupTypeConfigs: async () =>
          ok([
            config("Young Families", true),
            config("Men 20-30s", false),
            config("Women", true),
          ]),
        fetchGroupTypes: async () =>
          ok(["Young Families", "Men 20-30s", "Women"]),
      })
    );

    expect(data.error).toBeNull();
    expect(data.pipelinedTypes).toEqual(["Young Families", "Women"]);
    expect(data.groupTypes).toEqual(["Young Families", "Men 20-30s", "Women"]);
  });

  // ADR 0030 Module 3 (#756): the assembled pipeline partitions each pipelined
  // type into its auto-listed potential candidates (active groups of the type
  // with no saved candidate row) and any locked-in candidates.
  it("assembles the type-first pipeline: potential candidates auto-listed per pipelined type", async () => {
    const data = await buildMultiplyPlanData(
      emptyReads({
        fetchGroupRefs: async () =>
          ok([
            {
              id: "g-yf",
              name: "Smiths",
              lifecycle_status: "active",
              group_type: "Young Families",
            },
            {
              id: "g-men",
              name: "Men's AM",
              lifecycle_status: "active",
              group_type: "Men 20-30s",
            },
          ] as never),
        fetchGroupTypeConfigs: async () => ok([config("Young Families", true)]),
        fetchGroupTypes: async () => ok(["Young Families", "Men 20-30s"]),
      })
    );

    expect(data.error).toBeNull();
    // Only the pipelined type renders; the Men's group is excluded.
    expect(data.pipeline.map((t) => t.type)).toEqual(["Young Families"]);
    expect(
      data.pipeline[0].potentialCandidates.map((p) => p.groupName)
    ).toEqual(["Smiths"]);
    expect(data.pipeline[0].lockedInCandidates).toEqual([]);
  });

  it("degrades the pipeline section to empty when the configs/types reads fail, without blocking the planner", async () => {
    const data = await buildMultiplyPlanData(
      emptyReads({
        fetchGroupRefs: async () => ok([GROUP]),
        fetchGroupTypeConfigs: async () => fail("configs boom"),
        fetchGroupTypes: async () => fail("types boom"),
      })
    );

    // The blocking reads succeeded, so the planner still renders…
    expect(data.error).toBeNull();
    expect(data.groupOptions).toHaveLength(1);
    // …and the failed additive reads simply yield an empty pipeline section.
    expect(data.pipelinedTypes).toEqual([]);
    expect(data.groupTypes).toEqual([]);
    expect(data.pipeline).toEqual([]);
  });
});
