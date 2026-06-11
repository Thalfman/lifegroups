import { describe, expect, it } from "vitest";

import {
  buildCareData,
  type CareReads,
} from "@/components/admin/care/care-data";
import type { ReadResult } from "@/lib/supabase/read-core";
import type { AttentionResetBaselinesRow } from "@/types/database";

const ok = <T>(data: T): ReadResult<T> => ({ data, error: null });
const fail = (message: string): ReadResult<never> => ({
  data: null,
  error: new Error(message),
});

const TODAY = "2026-06-11";

function baselineRow(
  overrides: Partial<AttentionResetBaselinesRow>
): AttentionResetBaselinesRow {
  return {
    id: "base-1",
    surface: "care",
    scope: "global",
    entity_id: null,
    baseline_on: "2026-06-01",
    created_by: null,
    created_at: "2026-06-01T00:00:00Z",
    ...overrides,
  };
}

// Sibling to care-data.test.ts (the waterfall/coverage suite): this file pins
// the empty baseline shape, the per-section no-false-zero flags, the error
// precedence, and the attention-baselines plumbing. Same in-memory adapter,
// same `CareReads` seam.
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

describe("buildCareData — degrade rules", () => {
  it("returns the documented empty shape when every read succeeds empty", async () => {
    const data = await buildCareData(emptyReads(), { todayIso: TODAY });

    expect(data.entries).toEqual([]);
    expect(data.assignments).toEqual([]);
    expect(data.assignmentsAvailable).toBe(true);
    expect(data.overShepherds).toEqual([]);
    expect(data.recentInteractions).toEqual([]);
    expect(data.outstandingFollowUps).toEqual([]);
    expect(data.outstandingFollowUpsAvailable).toBe(true);
    expect(data.completedFollowUps).toEqual([]);
    expect(data.groupLeaders).toEqual([]);
    // No metric_defaults row decodes to the built-in 30/60 cadence windows.
    expect(data.windows).toEqual({
      directlyOverseenStaleDays: 30,
      delegatedStaleDays: 60,
    });
    expect(data.baselines.global).toBeNull();
    expect(data.baselines.byEntityId.size).toBe(0);
    expect(data.error).toBeNull();
  });

  it("flags outstanding follow-ups unavailable on a failed read instead of a false zero", async () => {
    const data = await buildCareData(
      emptyReads({
        fetchOutstandingFollowUps: async () => fail("follow-ups boom"),
      }),
      { todayIso: TODAY }
    );

    expect(data.outstandingFollowUps).toEqual([]);
    expect(data.outstandingFollowUpsAvailable).toBe(false);
    // The independent coverage read is unaffected.
    expect(data.assignmentsAvailable).toBe(true);
    expect(data.error).toBe("follow-ups boom");
  });

  it("reports the first failed batch read in declaration order", async () => {
    const data = await buildCareData(
      emptyReads({
        fetchOverShepherds: async () => fail("over-shepherds boom"),
        fetchCompletedFollowUps: async () => fail("completed boom"),
      }),
      { todayIso: TODAY }
    );

    // overShepherds precedes completedFollowUps in the surface's precedence
    // chain, so its message wins; both sections still degrade to [].
    expect(data.error).toBe("over-shepherds boom");
    expect(data.overShepherds).toEqual([]);
    expect(data.completedFollowUps).toEqual([]);
  });

  it("degrades a failed baselines read to 'no baselines' without erroring the page", async () => {
    const data = await buildCareData(
      emptyReads({
        fetchAttentionBaselines: async () => fail("baselines boom"),
      }),
      { todayIso: TODAY }
    );

    // Today's behaviour, pinned: the reset baselines are an enhancement, so
    // their read failure never blocks Care — and is not surfaced as an error.
    expect(data.baselines.global).toBeNull();
    expect(data.baselines.byEntityId.size).toBe(0);
    expect(data.error).toBeNull();
  });

  it("splits only care-surface baseline rows into the directory read and the result", async () => {
    let captured: Parameters<CareReads["fetchCareDirectory"]>[0];
    const data = await buildCareData(
      emptyReads({
        fetchAttentionBaselines: async () =>
          ok([
            baselineRow({}),
            baselineRow({
              id: "base-2",
              scope: "entity",
              entity_id: "p-1",
              baseline_on: "2026-06-05",
            }),
            // A health-surface row must never leak into the care baselines.
            baselineRow({
              id: "base-3",
              surface: "health",
              baseline_on: "2026-06-08",
            }),
          ]),
        fetchCareDirectory: async (options) => {
          captured = options;
          return ok([]);
        },
      }),
      { todayIso: TODAY }
    );

    expect(captured?.baselines?.global).toBe("2026-06-01");
    expect(captured?.baselines?.byEntityId.get("p-1")).toBe("2026-06-05");
    expect(captured?.baselines?.byEntityId.size).toBe(1);
    // The same split is returned so /admin/care agrees with Home after a
    // reset.
    expect(data.baselines.global).toBe("2026-06-01");
    expect(data.baselines.byEntityId.get("p-1")).toBe("2026-06-05");
  });
});
