import { describe, expect, it } from "vitest";

import {
  buildLaunchPlanningData,
  type LaunchPlanningReads,
} from "@/components/admin/launch-planning/launch-planning-data";
import type {
  CapacityBoardExtras,
  LaunchPlanningInputsBundle,
} from "@/lib/supabase/read-models";
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
