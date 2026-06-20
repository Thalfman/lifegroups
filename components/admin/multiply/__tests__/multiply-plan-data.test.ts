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

// A minimal saved-candidate entry anchored to a concrete group of `group_type`.
const candidateEntry = (group_type: string, groupName: string) =>
  ({
    candidate: {
      id: "c1",
      group_id: "gc1",
      target_year: 2026,
      status: "watching",
      enough_members: false,
      established_long_enough: false,
      co_shepherd_tenured: false,
      shepherd_willing: false,
      needs_similar_stage: false,
      notes: null,
      successor_designate: null,
      meeting_time: null,
      leader_pipeline_id: null,
      manual_member_count: null,
    },
    group: { id: "gc1", name: groupName, group_type },
    activeMemberCount: 0,
    linkedApprentice: null,
  }) as never;

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
      unpipelinedCandidates: [],
    });
  });

  it("a later blocking read (group refs) also empties the view, with its own error", async () => {
    const data = await buildMultiplyPlanData(
      emptyReads({
        fetchGroupRefs: async () => fail("groups boom"),
      })
    );

    expect(data).toEqual({
      ...EMPTY_MULTIPLY_PLAN_VIEW,
      error: "groups boom",
      pipelinedTypes: [],
      groupTypes: [],
      pipeline: [],
      unpipelinedCandidates: [],
    });
  });

  it("orders the blocking precedence as data: candidates before group refs", async () => {
    const data = await buildMultiplyPlanData(
      emptyReads({
        fetchMultiplicationCandidates: async () => fail("candidates boom"),
        fetchGroupRefs: async () => fail("groups boom"),
      })
    );

    expect(data.error).toBe("candidates boom");
  });

  // ADR 0030: a missing matched shepherd never blocks a pipelined type. The
  // apprentice read only feeds the optional matched-shepherds arm now that the
  // planner is retired, so a transient failure degrades it to empty rather than
  // blanking the whole Pipeline (potential / locked-in candidates still render).
  it("degrades matched shepherds to empty on an apprentice read failure, without blocking", async () => {
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
          ] as never),
        fetchApprenticeRefs: async () => fail("refs boom"),
        fetchGroupTypeConfigs: async () => ok([config("Young Families", true)]),
        fetchGroupTypes: async () => ok(["Young Families"]),
      })
    );

    // The blocking reads succeeded, so the Pipeline still renders…
    expect(data.error).toBeNull();
    expect(data.pipeline.map((t) => t.type)).toEqual(["Young Families"]);
    expect(
      data.pipeline[0].potentialCandidates.map((p) => p.groupName)
    ).toEqual(["Smiths"]);
    // …and the failed apprentice read simply yields no matched shepherds.
    expect(data.pipeline[0].matchedShepherds).toEqual([]);
  });

  // Regression guard (Codex P1): the in_pipeline flag defaults false and is not
  // backfilled, and the planner that used to show every saved candidate is
  // retired from this tab. A saved candidate whose type is NOT explicitly
  // pipelined must stay visible — in the fallback list, NOT by inferring pipeline
  // intent from the candidate (which would auto-list the type's other groups and
  // hide it from the Add picker).
  it("surfaces a saved candidate of a non-pipelined type in the fallback list, not as pipeline intent", async () => {
    const data = await buildMultiplyPlanData(
      emptyReads({
        fetchMultiplicationCandidates: async () =>
          ok([candidateEntry("Women", "Hope Circle")]),
        fetchGroupRefs: async () =>
          ok([
            {
              id: "gc1",
              name: "Hope Circle",
              lifecycle_status: "active",
              group_type: "Women",
            },
          ] as never),
        // Nothing is flagged in_pipeline.
        fetchGroupTypeConfigs: async () => ok([]),
        fetchGroupTypes: async () => ok(["Women"]),
      })
    );

    expect(data.error).toBeNull();
    // "Women" is NOT treated as a pipeline intent…
    expect(data.pipelinedTypes).toEqual([]);
    expect(data.pipeline).toEqual([]);
    // …but its saved candidate is still visible in the fallback list.
    expect(data.unpipelinedCandidates.map((c) => c.groupName)).toEqual([
      "Hope Circle",
    ]);
  });

  // Codex P1 (Untyped): a saved candidate on a group with no type can never be a
  // pipelined (always-concrete) type, so it would vanish entirely once the
  // planner is gone — the fallback list keeps it visible.
  it("keeps an Untyped saved candidate visible in the fallback list", async () => {
    const data = await buildMultiplyPlanData(
      emptyReads({
        fetchMultiplicationCandidates: async () =>
          ok([candidateEntry(null as never, "Mystery Group")]),
        fetchGroupRefs: async () =>
          ok([
            {
              id: "gc1",
              name: "Mystery Group",
              lifecycle_status: "active",
              group_type: null,
            },
          ] as never),
        fetchGroupTypeConfigs: async () => ok([]),
        fetchGroupTypes: async () => ok([]),
      })
    );

    expect(data.error).toBeNull();
    expect(data.pipeline).toEqual([]);
    expect(data.unpipelinedCandidates.map((c) => c.groupName)).toEqual([
      "Mystery Group",
    ]);
  });

  // A candidate whose type IS pipelined renders in that type's section and must
  // NOT also appear in the fallback list (no double-render).
  it("does not duplicate a pipelined type's candidate into the fallback list", async () => {
    const data = await buildMultiplyPlanData(
      emptyReads({
        fetchMultiplicationCandidates: async () =>
          ok([candidateEntry("Young Families", "Smiths")]),
        fetchGroupRefs: async () =>
          ok([
            {
              id: "gc1",
              name: "Smiths",
              lifecycle_status: "active",
              group_type: "Young Families",
            },
          ] as never),
        fetchGroupTypeConfigs: async () => ok([config("Young Families", true)]),
        fetchGroupTypes: async () => ok(["Young Families"]),
      })
    );

    expect(data.error).toBeNull();
    expect(data.pipeline.map((t) => t.type)).toEqual(["Young Families"]);
    expect(data.pipeline[0].lockedInCandidates.map((c) => c.groupName)).toEqual(
      ["Smiths"]
    );
    expect(data.unpipelinedCandidates).toEqual([]);
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

  // ADR 0030 (#758): the supply side. Each apprentice's home-group type is
  // joined from the group refs, then matched to the pipelined type — Ready-to-
  // lead first. No extra read: the picker refs already carry readiness_stage.
  it("matches shepherds to their type under each pipelined type, Ready-to-lead first", async () => {
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
        fetchApprenticeRefs: async () =>
          ok([
            {
              apprentice: {
                id: "a1",
                group_id: "g-yf",
                display_name: "Zara",
                readiness_stage: "in_training",
              },
            },
            {
              apprentice: {
                id: "a2",
                group_id: "g-yf",
                display_name: "Bob",
                readiness_stage: "ready_to_lead",
              },
            },
            {
              apprentice: {
                id: "a3",
                group_id: "g-men",
                display_name: "Carl",
                readiness_stage: "ready_to_lead",
              },
            },
          ] as never),
        fetchGroupTypeConfigs: async () => ok([config("Young Families", true)]),
        fetchGroupTypes: async () => ok(["Young Families", "Men 20-30s"]),
      })
    );

    expect(data.error).toBeNull();
    expect(data.pipeline.map((t) => t.type)).toEqual(["Young Families"]);
    // The two Young-Families apprentices match (Ready-to-lead first); the Men's
    // apprentice is excluded.
    expect(data.pipeline[0].matchedShepherds).toEqual([
      {
        id: "a2",
        displayName: "Bob",
        groupName: "Smiths",
        stage: "ready_to_lead",
        readyToLead: true,
      },
      {
        id: "a1",
        displayName: "Zara",
        groupName: "Smiths",
        stage: "in_training",
        readyToLead: false,
      },
    ]);
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
