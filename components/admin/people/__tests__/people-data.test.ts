import { describe, expect, it } from "vitest";

import {
  buildPeopleDirectoryData,
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
    fetchGroupRefs: async () => ok([]),
    fetchAllGroupLeaders: async () => ok([]),
    fetchActiveMemberships: async () => ok([]),
    fetchLeaderPipeline: async () => ok([]),
    fetchActiveCoverageAssignments: async () => ok([]),
    fetchMetricDefaults: async () => ok(null),
    fetchShepherdCareDirectory: async () => ok([]),
    ...overrides,
  };
}

describe("buildPeopleDirectoryData", () => {
  it("excludes super_admin profiles and keeps other roles", async () => {
    const profiles = [
      { id: "p1", role: "super_admin" },
      { id: "p2", role: "ministry_admin" },
      { id: "p3", role: "leader" },
    ];
    const result = await buildPeopleDirectoryData(
      emptyReads({
        fetchProfilesForAdmin: async () => ok(profiles as never),
      }),
      { currentActorProfileId: "p2" }
    );

    expect(result.profiles.map((p) => p.id)).toEqual(["p2", "p3"]);
  });

  it("returns an empty profiles list when all profiles are super_admin", async () => {
    const result = await buildPeopleDirectoryData(
      emptyReads({
        fetchProfilesForAdmin: async () =>
          ok([{ id: "p1", role: "super_admin" }] as never),
      }),
      { currentActorProfileId: "p1" }
    );

    expect(result.profiles).toHaveLength(0);
  });
});

describe("buildPeoplePipelineData", () => {
  it("offers only active groups, sorted by name", async () => {
    const pipeline = await buildPeoplePipelineData(
      emptyReads({
        fetchGroupRefs: async () =>
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

  // Guards the superset wiring: PeopleReads satisfies the shared pipeline
  // builder, so the member-link options flow through to the Apprentices tab.
  it("surfaces each active group's member options", async () => {
    const pipeline = await buildPeoplePipelineData(
      emptyReads({
        fetchGroupRefs: async () =>
          ok([
            { id: "g1", name: "Alpha", lifecycle_status: "active" },
          ] as never),
        fetchActiveMemberships: async () =>
          ok([{ group_id: "g1", member_id: "m1" }] as never),
        fetchAllMembers: async () =>
          ok([{ id: "m1", full_name: "Abe Ortiz" }] as never),
      })
    );

    expect(pipeline.memberOptionsByGroup).toEqual({
      g1: [{ id: "m1", name: "Abe Ortiz" }],
    });
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
