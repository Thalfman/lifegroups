import { describe, expect, it } from "vitest";

import {
  buildPeopleNeedsContact,
  buildPeoplePipelineData,
  type PeopleReads,
} from "@/components/admin/people/people-data";
import type { ReadResult } from "@/lib/supabase/read-core";

const ok = <T>(data: T): ReadResult<T> => ({ data, error: null });
const fail = (message: string): ReadResult<never> => ({
  data: null,
  error: new Error(message),
});

function emptyReads(overrides: Partial<PeopleReads> = {}): PeopleReads {
  return {
    fetchProfilesForAdmin: async () => ok([]),
    fetchAllMembers: async () => ok([]),
    fetchAllGroups: async () => ok([]),
    fetchAllGroupLeaders: async () => ok([]),
    fetchActiveMemberships: async () => ok([]),
    fetchLeaderPipeline: async () => ok([]),
    fetchActiveCoverageAssignments: async () => ok([]),
    fetchMetricDefaults: async () => ok(null),
    fetchShepherdCareDirectory: async () => ok([]),
    ...overrides,
  };
}

describe("buildPeoplePipelineData", () => {
  it("offers only active groups, sorted by name", async () => {
    const pipeline = await buildPeoplePipelineData(
      emptyReads({
        fetchAllGroups: async () =>
          ok([
            { id: "g2", name: "Beta", lifecycle_status: "active" },
            { id: "g1", name: "Alpha", lifecycle_status: "active" },
            { id: "g3", name: "Closed", lifecycle_status: "closed" },
          ] as never),
      })
    );

    expect(pipeline.availableGroups.map((g) => g.name)).toEqual([
      "Alpha",
      "Beta",
    ]);
  });

  it("surfaces a pipeline read error", async () => {
    const pipeline = await buildPeoplePipelineData(
      emptyReads({ fetchLeaderPipeline: async () => fail("pipeline boom") })
    );
    expect(pipeline.error).toBe("pipeline boom");
  });
});

describe("buildPeopleNeedsContact", () => {
  it("returns the profile ids whose care needs attention", async () => {
    const set = await buildPeopleNeedsContact(
      emptyReads({
        fetchShepherdCareDirectory: async () =>
          ok([
            { profile: { id: "p1" }, needs_attention: true },
            { profile: { id: "p2" }, needs_attention: false },
          ] as never),
      }),
      { todayIso: "2026-06-04" }
    );

    expect(set.has("p1")).toBe(true);
    expect(set.has("p2")).toBe(false);
  });

  it("degrades to an empty set when the directory read fails", async () => {
    const set = await buildPeopleNeedsContact(
      emptyReads({
        fetchShepherdCareDirectory: async () => fail("directory boom"),
      }),
      { todayIso: "2026-06-04" }
    );
    expect(set.size).toBe(0);
  });
});
