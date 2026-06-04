import { describe, expect, it } from "vitest";

import {
  buildShepherdCareData,
  type ShepherdCareReads,
} from "@/components/admin/shepherd-care/shepherd-care-data";
import type { ReadResult } from "@/lib/supabase/read-core";

const ok = <T>(data: T): ReadResult<T> => ({ data, error: null });
const fail = (message: string): ReadResult<never> => ({
  data: null,
  error: new Error(message),
});

function emptyReads(
  overrides: Partial<ShepherdCareReads> = {}
): ShepherdCareReads {
  return {
    fetchOverShepherds: async () => ok([]),
    fetchActiveCoverageAssignments: async () => ok([]),
    fetchRecentInteractions: async () => ok([]),
    fetchOutstandingCareFollowUps: async () => ok([]),
    fetchMetricDefaults: async () => ok(null),
    fetchShepherdCareDirectory: async () => ok([]),
    ...overrides,
  };
}

const TODAY = "2026-06-04";

describe("buildShepherdCareData", () => {
  it("returns an error and empties the surface when the directory read fails", async () => {
    const data = await buildShepherdCareData(
      emptyReads({
        fetchShepherdCareDirectory: async () => fail("directory boom"),
      }),
      { todayIso: TODAY }
    );

    expect(data.error).toBe("directory boom");
    expect(data.entries).toEqual([]);
  });

  it("passes the active-coverage set and todayIso into the directory read", async () => {
    let dirArgs: unknown;
    await buildShepherdCareData(
      emptyReads({
        fetchActiveCoverageAssignments: async () =>
          ok([{ shepherd_profile_id: "p1" }] as never),
        fetchShepherdCareDirectory: async (options) => {
          dirArgs = options;
          return ok([]);
        },
      }),
      { todayIso: TODAY }
    );

    expect(dirArgs).toMatchObject({ todayIso: TODAY });
    const delegated = (dirArgs as { delegatedShepherdIds?: Set<string> })
      .delegatedShepherdIds;
    expect(delegated?.has("p1")).toBe(true);
  });

  it("marks coverage unavailable (and leaves delegated set undefined) when assignments fail", async () => {
    let dirArgs: { delegatedShepherdIds?: Set<string> } | undefined;
    const data = await buildShepherdCareData(
      emptyReads({
        fetchActiveCoverageAssignments: async () => fail("assignments boom"),
        fetchShepherdCareDirectory: async (options) => {
          dirArgs = options as typeof dirArgs;
          return ok([]);
        },
      }),
      { todayIso: TODAY }
    );

    expect(data.assignmentsAvailable).toBe(false);
    expect(dirArgs?.delegatedShepherdIds).toBeUndefined();
  });

  it("flags recent-interactions unavailable on that read's failure without erroring the directory", async () => {
    const data = await buildShepherdCareData(
      emptyReads({
        fetchRecentInteractions: async () => fail("recent boom"),
      }),
      { todayIso: TODAY }
    );

    expect(data.recentInteractionsAvailable).toBe(false);
    expect(data.entries).toEqual([]);
    expect(data.error).toBe("recent boom");
  });
});
