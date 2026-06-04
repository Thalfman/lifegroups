import { describe, expect, it } from "vitest";

import {
  buildLeaderPipelineData,
  type LeaderPipelineReads,
} from "@/components/admin/leader-pipeline/leader-pipeline-data";
import type { ReadResult } from "@/lib/supabase/read-core";

const ok = <T>(data: T): ReadResult<T> => ({ data, error: null });
const fail = (message: string): ReadResult<never> => ({
  data: null,
  error: new Error(message),
});

function emptyReads(
  overrides: Partial<LeaderPipelineReads> = {}
): LeaderPipelineReads {
  return {
    fetchLeaderPipeline: async () => ok([]),
    fetchAllGroups: async () => ok([]),
    ...overrides,
  };
}

describe("buildLeaderPipelineData", () => {
  it("offers only active groups, sorted by name", async () => {
    const data = await buildLeaderPipelineData(
      emptyReads({
        fetchAllGroups: async () =>
          ok([
            { id: "g2", name: "Beta", lifecycle_status: "active" },
            { id: "g1", name: "Alpha", lifecycle_status: "active" },
            { id: "g3", name: "Zeta", lifecycle_status: "closed" },
          ] as never),
      })
    );

    expect(data.availableGroups.map((g) => g.name)).toEqual(["Alpha", "Beta"]);
  });

  it("surfaces a pipeline read error", async () => {
    const data = await buildLeaderPipelineData(
      emptyReads({ fetchLeaderPipeline: async () => fail("pipeline boom") })
    );
    expect(data.error).toBe("pipeline boom");
  });
});
