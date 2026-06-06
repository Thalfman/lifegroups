import { describe, expect, it } from "vitest";

import {
  buildCareData,
  type CareReads,
} from "@/components/admin/care/care-data";
import type { ReadResult } from "@/lib/supabase/read-core";

const ok = <T>(data: T): ReadResult<T> => ({ data, error: null });
const fail = (message: string): ReadResult<never> => ({
  data: null,
  error: new Error(message),
});

// A successful, empty read for every dependency; each test overrides only the
// reads it cares about. Two adapters, one seam: this fake satisfies the same
// `CareReads` the live `supabaseCareReads` adapter does, so the waterfall and
// the gather-and-degrade rule are exercised with no database.
function emptyReads(overrides: Partial<CareReads> = {}): CareReads {
  return {
    fetchOverShepherds: async () => ok([]),
    fetchActiveAssignments: async () => ok([]),
    fetchRecentInteractions: async () => ok([]),
    fetchOutstandingFollowUps: async () => ok([]),
    fetchCompletedFollowUps: async () => ok([]),
    fetchMetricDefaults: async () => ok(null),
    fetchGroupLeaders: async () => ok([]),
    fetchAttentionBaselines: async () => ok([]),
    fetchCareDirectory: async () => ok([]),
    ...overrides,
  };
}

const TODAY = "2026-06-06";

describe("buildCareData", () => {
  it("waterfalls the configured windows and active-coverage set into the directory read", async () => {
    let directoryOptions: unknown = null;
    await buildCareData(
      emptyReads({
        // Custom staleness windows from settings (direct 15 / delegated 45).
        fetchMetricDefaults: async () =>
          ok({
            setting_value: {
              shepherd_care_stale_days_direct: 15,
              shepherd_care_stale_days_delegated: 45,
            },
          } as never),
        fetchActiveAssignments: async () =>
          ok([
            { shepherd_profile_id: "s1" },
            { shepherd_profile_id: "s2" },
          ] as never),
        fetchCareDirectory: async (options) => {
          directoryOptions = options;
          return ok([]);
        },
      }),
      { todayIso: TODAY }
    );

    expect(directoryOptions).toMatchObject({
      todayIso: TODAY,
      windows: { directlyOverseenStaleDays: 15, delegatedStaleDays: 45 },
    });
    // The directory must see the SAME active-coverage set the dashboard uses, so
    // its needs_attention can't disagree.
    const opts = directoryOptions as { delegatedShepherdIds: Set<string> };
    expect([...opts.delegatedShepherdIds].sort()).toEqual(["s1", "s2"]);
  });

  it("degrades coverage when the assignments read fails: not-available, no delegated set, error surfaced", async () => {
    let directoryOptions: unknown;
    const data = await buildCareData(
      emptyReads({
        fetchActiveAssignments: async () => fail("coverage boom"),
        fetchCareDirectory: async (options) => {
          directoryOptions = options;
          return ok([]);
        },
      }),
      { todayIso: TODAY }
    );

    expect(data.assignmentsAvailable).toBe(false);
    // Omitted rather than an empty set, so the directory falls back to the
    // conservative window instead of treating everyone as directly-overseen.
    expect(
      (directoryOptions as { delegatedShepherdIds?: unknown })
        .delegatedShepherdIds
    ).toBeUndefined();
    expect(data.error).toBe("coverage boom");
  });

  it("empties the surface when the directory read fails", async () => {
    const data = await buildCareData(
      emptyReads({
        fetchActiveAssignments: async () =>
          ok([{ shepherd_profile_id: "s1" }] as never),
        fetchCareDirectory: async () => fail("directory boom"),
      }),
      { todayIso: TODAY }
    );

    expect(data.entries).toEqual([]);
    expect(data.assignmentsAvailable).toBe(false);
    expect(data.error).toBe("directory boom");
  });

  it("keeps only leader / co_leader group-leader rows", async () => {
    const data = await buildCareData(
      emptyReads({
        fetchGroupLeaders: async () =>
          ok([
            { profile_id: "p1", group_id: "g1", role: "leader" },
            { profile_id: "p2", group_id: "g2", role: "member" },
            { profile_id: "p3", group_id: "g3", role: "co_leader" },
          ] as never),
      }),
      { todayIso: TODAY }
    );

    expect(data.groupLeaders).toEqual([
      { profile_id: "p1", group_id: "g1" },
      { profile_id: "p3", group_id: "g3" },
    ]);
    expect(data.error).toBeNull();
  });
});
