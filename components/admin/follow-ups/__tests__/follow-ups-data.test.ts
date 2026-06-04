import { describe, expect, it } from "vitest";

import {
  buildAdminFollowUpsData,
  type AdminFollowUpsReads,
} from "@/components/admin/follow-ups/follow-ups-data";
import type { ReadResult } from "@/lib/supabase/read-core";

const ok = <T>(data: T): ReadResult<T> => ({ data, error: null });
const fail = (message: string): ReadResult<never> => ({
  data: null,
  error: new Error(message),
});

// A successful, empty read for every dependency; each test overrides only the
// read it cares about. Two adapters, one seam: this fake satisfies the same
// `AdminFollowUpsReads` the live `supabaseAdminFollowUpsReads` adapter does.
function emptyReads(
  overrides: Partial<AdminFollowUpsReads> = {}
): AdminFollowUpsReads {
  return {
    fetchFollowUpsForAdmin: async () => ok([]),
    fetchAllGroups: async () => ok([]),
    fetchAllMembers: async () => ok([]),
    fetchGuests: async () => ok([]),
    fetchProfilesForAdmin: async () => ok([]),
    ...overrides,
  };
}

describe("buildAdminFollowUpsData", () => {
  it("projects each read into the shell shape with no errors on success", async () => {
    const data = await buildAdminFollowUpsData(
      emptyReads({
        fetchAllGroups: async () =>
          ok([{ id: "g1", name: "Group One" }] as never),
      })
    );

    expect(data.groups).toEqual([{ id: "g1", name: "Group One" }]);
    expect(data.errors).toEqual({
      followUps: null,
      groups: null,
      members: null,
      guests: null,
      profiles: null,
    });
  });

  it("degrades a failed read to empty data and surfaces its error", async () => {
    const data = await buildAdminFollowUpsData(
      emptyReads({
        fetchFollowUpsForAdmin: async () => fail("follow-ups boom"),
      })
    );

    expect(data.followUps).toEqual([]);
    expect(data.errors.followUps).toBe("follow-ups boom");
    // The other reads still loaded — one failure doesn't blank the surface.
    expect(data.errors.groups).toBeNull();
  });

  it("requests active members and the assignee role set", async () => {
    const calls: unknown[] = [];
    await buildAdminFollowUpsData(
      emptyReads({
        fetchAllMembers: async (options) => {
          calls.push(["members", options]);
          return ok([]);
        },
        fetchProfilesForAdmin: async (options) => {
          calls.push(["profiles", options]);
          return ok([]);
        },
      })
    );

    expect(calls).toContainEqual(["members", { statuses: ["active"] }]);
    expect(calls).toContainEqual([
      "profiles",
      {
        roles: ["super_admin", "ministry_admin", "leader", "co_leader"],
        statuses: ["active"],
      },
    ]);
  });
});
