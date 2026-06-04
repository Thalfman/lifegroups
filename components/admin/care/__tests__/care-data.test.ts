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

function emptyReads(overrides: Partial<CareReads> = {}): CareReads {
  return {
    fetchOverShepherds: async () => ok([]),
    fetchActiveCoverageAssignments: async () => ok([]),
    fetchRecentInteractions: async () => ok([]),
    fetchOutstandingCareFollowUps: async () => ok([]),
    fetchRecentlyCompletedCareFollowUps: async () => ok([]),
    fetchMetricDefaults: async () => ok(null),
    fetchAllGroupLeaders: async () => ok([]),
    fetchShepherdCareDirectory: async () => ok([]),
    ...overrides,
  };
}

const TODAY = "2026-06-04";

describe("buildCareData", () => {
  it("keeps only leader / co_leader group links (drops member rows)", async () => {
    const data = await buildCareData(
      emptyReads({
        fetchAllGroupLeaders: async () =>
          ok([
            { profile_id: "p1", group_id: "g1", role: "leader" },
            { profile_id: "p2", group_id: "g1", role: "member" },
            { profile_id: "p3", group_id: "g2", role: "co_leader" },
          ] as never),
      }),
      { todayIso: TODAY }
    );

    expect(data.groupLeaders).toEqual([
      { profile_id: "p1", group_id: "g1" },
      { profile_id: "p3", group_id: "g2" },
    ]);
  });

  it("empties the surface on a directory read failure", async () => {
    const data = await buildCareData(
      emptyReads({
        fetchShepherdCareDirectory: async () => fail("directory boom"),
      }),
      { todayIso: TODAY }
    );

    expect(data.error).toBe("directory boom");
    expect(data.entries).toEqual([]);
  });

  it("marks outstanding follow-ups unavailable on that read's failure", async () => {
    const data = await buildCareData(
      emptyReads({
        fetchOutstandingCareFollowUps: async () => fail("outstanding boom"),
      }),
      { todayIso: TODAY }
    );

    expect(data.outstandingFollowUpsAvailable).toBe(false);
  });
});
