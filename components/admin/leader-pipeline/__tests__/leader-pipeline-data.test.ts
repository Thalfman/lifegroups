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
    fetchGroupRefs: async () => ok([]),
    fetchActiveMemberships: async () => ok([]),
    fetchAllMembers: async () => ok([]),
    ...overrides,
  };
}

// Two active groups; Zeta is closed so its members never become options.
const groupRefs = async () =>
  ok([
    { id: "g2", name: "Beta", lifecycle_status: "active" },
    { id: "g1", name: "Alpha", lifecycle_status: "active" },
    { id: "g3", name: "Zeta", lifecycle_status: "closed" },
  ] as never);

const membership = (groupId: string, memberId: string) =>
  ({ group_id: groupId, member_id: memberId }) as never;

const member = (id: string, name: string) => ({ id, full_name: name }) as never;

describe("buildLeaderPipelineData", () => {
  it("offers only active groups, sorted by name", async () => {
    const data = await buildLeaderPipelineData(
      emptyReads({ fetchGroupRefs: groupRefs })
    );

    expect(data.availableGroups.map((g) => g.name)).toEqual(["Alpha", "Beta"]);
  });

  it("surfaces a pipeline read error", async () => {
    const data = await buildLeaderPipelineData(
      emptyReads({ fetchLeaderPipeline: async () => fail("pipeline boom") })
    );
    expect(data.error).toBe("pipeline boom");
  });

  it("groups each active group's member options, sorted by name", async () => {
    const data = await buildLeaderPipelineData(
      emptyReads({
        fetchGroupRefs: groupRefs,
        fetchActiveMemberships: async () =>
          ok([
            membership("g1", "m-zoe"),
            membership("g1", "m-abe"),
            membership("g2", "m-bea"),
            // g3 is closed: never offered, even with an active membership.
            membership("g3", "m-abe"),
          ]),
        fetchAllMembers: async () =>
          ok([
            member("m-abe", "Abe Ortiz"),
            member("m-bea", "Bea Lin"),
            member("m-zoe", "Zoe Park"),
          ]),
      })
    );

    expect(data.memberOptionsByGroup).toEqual({
      g1: [
        { id: "m-abe", name: "Abe Ortiz" },
        { id: "m-zoe", name: "Zoe Park" },
      ],
      g2: [{ id: "m-bea", name: "Bea Lin" }],
    });
  });

  it("drops memberships whose member is not in the active-members read", async () => {
    const data = await buildLeaderPipelineData(
      emptyReads({
        fetchGroupRefs: groupRefs,
        fetchActiveMemberships: async () =>
          ok([membership("g1", "m-gone"), membership("g1", "m-abe")]),
        fetchAllMembers: async () => ok([member("m-abe", "Abe Ortiz")]),
      })
    );

    expect(data.memberOptionsByGroup).toEqual({
      g1: [{ id: "m-abe", name: "Abe Ortiz" }],
    });
  });

  it("asks the members read for active members only", async () => {
    let received: unknown;
    await buildLeaderPipelineData(
      emptyReads({
        fetchAllMembers: async (options) => {
          received = options;
          return ok([]);
        },
      })
    );

    expect(received).toEqual({ statuses: ["active"] });
  });

  it("degrades a failed options read to no options, not a pipeline error", async () => {
    const data = await buildLeaderPipelineData(
      emptyReads({
        fetchGroupRefs: groupRefs,
        fetchActiveMemberships: async () => fail("memberships boom"),
      })
    );

    expect(data.memberOptionsByGroup).toEqual({});
    expect(data.error).toBeNull();
    expect(data.availableGroups.map((g) => g.name)).toEqual(["Alpha", "Beta"]);
  });
});
