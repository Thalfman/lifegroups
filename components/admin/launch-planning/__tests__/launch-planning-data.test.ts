import { describe, expect, it } from "vitest";

import {
  buildLaunchPlanningData,
  buildMultiplicationView,
  type LaunchPlanningReads,
} from "@/components/admin/launch-planning/launch-planning-data";
import type {
  CapacityBoardExtras,
  LaunchPlanningInputsBundle,
  MultiplicationCandidateEntry,
} from "@/lib/supabase/read-models";
import type { GroupTypeOption } from "@/lib/admin/audience";
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
  coShepherdSinceByGroup: {},
  candidateFlagsByGroup: {},
  candidateGroupIds: [],
  categoryLabelByGroup: {},
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
    fetchCategoriesForAudience: async () => ok([]),
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

// Type-first (group-types-multiplication): the planner picks a group TYPE, then
// (when willing) a group OF that type. buildMultiplicationView turns the active
// groups into `groupsByType`, excluding groups already used by a concrete
// candidate, and passes the type options through.
describe("buildMultiplicationView", () => {
  const TODAY = "2026-06-08";
  const TYPE_OPTIONS: GroupTypeOption[] = [
    { audienceCategory: "men", categoryId: "c1", label: "20-30s" },
  ];
  const GROUPS = [
    {
      id: "g1",
      name: "Alpha",
      lifecycle_status: "active",
      audience_category: "men" as const,
      category_id: "c1",
    },
    {
      id: "g2",
      name: "Beta",
      lifecycle_status: "active",
      audience_category: "men" as const,
      category_id: "c1",
    },
    // Excluded: not active, and Uncategorized (no category).
    {
      id: "g3",
      name: "Gamma",
      lifecycle_status: "closed",
      audience_category: "men" as const,
      category_id: "c1",
    },
    {
      id: "g4",
      name: "Delta",
      lifecycle_status: "active",
      audience_category: "men" as const,
      category_id: null,
    },
  ];

  function candidate(groupId: string | null): MultiplicationCandidateEntry {
    return {
      candidate: {
        id: `cand-${groupId ?? "type"}`,
        group_id: groupId,
        audience_category: "men",
        category_id: "c1",
        target_year: null,
        status: "watching",
        shepherd_willing: false,
        needs_similar_stage: false,
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
      candidateCategoryLabel: "20-30s",
      activeMemberCount: 0,
      coShepherdSince: null,
      linkedApprentice: null,
    };
  }

  it("buckets only active, typed groups by type and passes typeOptions through", () => {
    const view = buildMultiplicationView([], GROUPS, [], TYPE_OPTIONS, TODAY);
    expect(view.typeOptions).toBe(TYPE_OPTIONS);
    expect(view.groupsByType["men|c1"].map((g) => g.name)).toEqual([
      "Alpha",
      "Beta",
    ]);
  });

  it("excludes a group already attached to a concrete candidate", () => {
    const view = buildMultiplicationView(
      [candidate("g1")],
      GROUPS,
      [],
      TYPE_OPTIONS,
      TODAY
    );
    expect(view.groupsByType["men|c1"].map((g) => g.name)).toEqual(["Beta"]);
  });

  it("a type-only candidate removes no group from its type bucket", () => {
    const view = buildMultiplicationView(
      [candidate(null)],
      GROUPS,
      [],
      TYPE_OPTIONS,
      TODAY
    );
    expect(view.groupsByType["men|c1"].map((g) => g.name)).toEqual([
      "Alpha",
      "Beta",
    ]);
  });
});
