import { describe, expect, it } from "vitest";

import {
  buildLaunchPlanningData,
  buildMultiplicationView,
  type LaunchPlanningReads,
} from "@/components/admin/launch-planning/launch-planning-data";
import type {
  CapacityBoardExtras,
  MultiplicationCandidateEntry,
} from "@/lib/supabase/multiplication-reads";
import type { LaunchPlanningInputsBundle } from "@/lib/supabase/settings-reads";
import type { ReadResult } from "@/lib/supabase/read-core";

const ok = <T>(data: T): ReadResult<T> => ({ data, error: null });
const fail = (message: string): ReadResult<never> => ({
  data: null,
  error: new Error(message),
});

const EMPTY_BUNDLE: LaunchPlanningInputsBundle = {
  groups: [],
  groupMetricSettings: [],
  memberships: [],
  metricDefaultsRow: null,
  errors: {
    groups: null,
    overrides: null,
    memberships: null,
    metricDefaults: null,
  },
};

const EMPTY_EXTRAS: CapacityBoardExtras = {
  apprentices: [],
  candidateGroupIds: [],
  groupTypeByGroup: {},
  error: null,
};

function emptyReads(
  overrides: Partial<LaunchPlanningReads> = {}
): LaunchPlanningReads {
  return {
    fetchLaunchPlanningAssumptions: async () => ok(null),
    fetchLaunchPlanningInputsForAdmin: async () => EMPTY_BUNDLE,
    fetchLaunchPlanningScenariosForAdmin: async () => ok([]),
    fetchLeaderPipelineForAdmin: async () => ok([]),
    fetchMultiplicationCandidatesForAdmin: async () => ok([]),
    fetchCapacityBoardExtras: async () => EMPTY_EXTRAS,
    ...overrides,
  };
}

describe("buildLaunchPlanningData", () => {
  it("assembles a clean surface when every read succeeds", async () => {
    const data = await buildLaunchPlanningData(emptyReads());

    expect(data.capacityError).toBeNull();
    expect(data.multiplicationError).toBeNull();
    expect(data.pipelineError).toBeNull();
    expect(data.scenariosError).toBeNull();
  });

  it("gates the capacity board on any of its input-section errors", async () => {
    const data = await buildLaunchPlanningData(
      emptyReads({
        fetchLaunchPlanningInputsForAdmin: async () => ({
          ...EMPTY_BUNDLE,
          errors: { ...EMPTY_BUNDLE.errors, memberships: "memberships boom" },
        }),
      })
    );

    expect(data.capacityError).toBe("memberships boom");
    expect(data.capacityModel.rows).toEqual([]);
  });

  it("blocks the multiplication planner when the pipeline read fails", async () => {
    const data = await buildLaunchPlanningData(
      emptyReads({
        fetchLeaderPipelineForAdmin: async () => fail("pipeline boom"),
      })
    );

    expect(data.multiplicationError).toBe("pipeline boom");
    expect(data.pipelineError).toBe("pipeline boom");
    expect(data.apprenticesByGroup).toEqual({});
  });

  it("surfaces a capacity-extras read failure as a capacity error", async () => {
    const data = await buildLaunchPlanningData(
      emptyReads({
        fetchCapacityBoardExtras: async () => ({
          ...EMPTY_EXTRAS,
          error: "extras boom",
        }),
      })
    );

    expect(data.capacityError).toBe("extras boom");
  });
});

// Group-anchored multiplication: a candidate anchors to a concrete group, and
// its type derives from that group's free-text group_type. buildMultiplicationView
// turns the active groups into `groupOptions`, excluding groups already used by
// a candidate, and carrying each group's group_type through (null = Untyped).
describe("buildMultiplicationView", () => {
  const GROUPS = [
    {
      id: "g1",
      name: "Alpha",
      lifecycle_status: "active",
      group_type: "Men 20-30s" as string | null,
    },
    {
      id: "g2",
      name: "Beta",
      lifecycle_status: "active",
      group_type: "Men 20-30s" as string | null,
    },
    // Excluded: not active.
    {
      id: "g3",
      name: "Gamma",
      lifecycle_status: "closed",
      group_type: "Men 20-30s" as string | null,
    },
    // Active but with no group_type — still pickable, with groupType null.
    {
      id: "g4",
      name: "Delta",
      lifecycle_status: "active",
      group_type: null as string | null,
    },
  ];

  function candidate(groupId: string | null): MultiplicationCandidateEntry {
    return {
      candidate: {
        id: `cand-${groupId ?? "type"}`,
        group_id: groupId,
        target_year: null,
        status: "watching",
        shepherd_willing: false,
        needs_similar_stage: false,
        enough_members: false,
        established_long_enough: false,
        co_shepherd_tenured: false,
        notes: null,
        successor_designate: null,
        meeting_time: null,
        leader_pipeline_id: null,
        manual_member_count: null,
        archived_at: null,
        created_by: null,
        updated_by: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
      group: null,
      activeMemberCount: 0,
      linkedApprentice: null,
    };
  }

  it("offers only active groups, each carrying its group_type (null = Untyped)", () => {
    const view = buildMultiplicationView([], GROUPS, []);
    expect(view.groupOptions).toEqual([
      { id: "g1", name: "Alpha", groupType: "Men 20-30s" },
      { id: "g2", name: "Beta", groupType: "Men 20-30s" },
      // The active, untyped group still appears, with groupType null.
      { id: "g4", name: "Delta", groupType: null },
    ]);
  });

  it("excludes a group already attached to a candidate", () => {
    const view = buildMultiplicationView([candidate("g1")], GROUPS, []);
    expect(view.groupOptions.map((g) => g.name)).toEqual(["Beta", "Delta"]);
  });

  it("a candidate with no group removes no group from the options", () => {
    const view = buildMultiplicationView([candidate(null)], GROUPS, []);
    expect(view.groupOptions.map((g) => g.name)).toEqual([
      "Alpha",
      "Beta",
      "Delta",
    ]);
  });
});
