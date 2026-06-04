import { describe, expect, it } from "vitest";

import {
  buildGroupHealthData,
  type GroupHealthReads,
} from "@/components/admin/group-health/group-health-data";
import type { ReadResult } from "@/lib/supabase/read-core";

const ok = <T>(data: T): ReadResult<T> => ({ data, error: null });
const fail = (message: string): ReadResult<never> => ({
  data: null,
  error: new Error(message),
});

const row = (group_id: string, group_name: string, computed_letter: string) =>
  ({
    group_id,
    group_name,
    computed_letter,
    spiritual_growth_score: 3,
    group_question_score: 3,
  }) as never;

function emptyReads(overrides: Partial<GroupHealthReads> = {}): GroupHealthReads {
  return {
    listGroupHealthOverview: async () => ok([]),
    fetchPlatformConfig: async () => ok(null as never),
    fetchMetricDefaults: async () => ok(null),
    ...overrides,
  };
}

describe("buildGroupHealthData", () => {
  it("returns error status when the overview read fails", async () => {
    const view = await buildGroupHealthData(
      emptyReads({ listGroupHealthOverview: async () => fail("overview boom") })
    );
    expect(view.status).toBe("error");
  });

  it("ranks the overview rows and resolves labels on success", async () => {
    const view = await buildGroupHealthData(
      emptyReads({
        listGroupHealthOverview: async () =>
          ok([row("g1", "Alpha", "C"), row("g2", "Beta", "A")]),
      }),
      { period: "2026-06" }
    );

    expect(view.status).toBe("ok");
    if (view.status !== "ok") return;
    expect(view.period).toBe("2026-06");
    // Best-to-worst ranking: A before C.
    expect(view.rows.map((r) => r.group_id)).toEqual(["g2", "g1"]);
    expect(typeof view.spiritualGrowthLabel).toBe("string");
    expect(typeof view.groupQuestionLabel).toBe("string");
  });

  it("falls back to the default watch grade when metric defaults fail", async () => {
    const view = await buildGroupHealthData(
      emptyReads({
        listGroupHealthOverview: async () => ok([row("g1", "Alpha", "B")]),
        fetchMetricDefaults: async () => fail("defaults boom"),
      })
    );
    // The page still loads (status ok) rather than failing on a defaults error.
    expect(view.status).toBe("ok");
  });
});
