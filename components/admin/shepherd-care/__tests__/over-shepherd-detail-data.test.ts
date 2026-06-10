import { describe, expect, it } from "vitest";

import {
  buildOverShepherdDetailData,
  type OverShepherdDetailReads,
} from "@/components/admin/shepherd-care/over-shepherd-detail-data";
import type { ReadResult } from "@/lib/supabase/read-core";

const ok = <T>(data: T): ReadResult<T> => ({ data, error: null });
const fail = (message: string): ReadResult<never> => ({
  data: null,
  error: new Error(message),
});

const OVER_SHEPHERD_ID = "00000000-0000-4000-8000-000000000001";

const OVER_SHEPHERD = {
  id: OVER_SHEPHERD_ID,
  full_name: "Pat Over-Shepherd",
  active: true,
};

const COVERED = [
  {
    assignment: { id: "cov-1" },
    shepherd: { id: "sh-1", full_name: "Avery Leader" },
  },
  {
    assignment: { id: "cov-2" },
    shepherd: { id: "sh-2", full_name: "Blake Leader" },
  },
];

// A successful baseline for both reads; each test overrides only the read it
// cares about. This fake satisfies the same `OverShepherdDetailReads` the live
// `supabaseOverShepherdDetailReads` adapter does, so the suppression rules are
// exercised with no database.
function detailReads(
  overrides: Partial<OverShepherdDetailReads> = {}
): OverShepherdDetailReads {
  return {
    fetchOverShepherd: async () => ok(OVER_SHEPHERD as never),
    fetchCoveredShepherds: async () => ok(COVERED as never),
    ...overrides,
  };
}

describe("buildOverShepherdDetailData", () => {
  it("assembles the record and its coverage when all reads succeed", async () => {
    const data = await buildOverShepherdDetailData(
      detailReads(),
      OVER_SHEPHERD_ID
    );

    if (data.kind !== "ok") throw new Error("expected ok");
    expect(data.overShepherd).toMatchObject({
      id: OVER_SHEPHERD_ID,
      full_name: "Pat Over-Shepherd",
    });
    expect(data.coveredShepherds).toHaveLength(2);
    expect(data.error).toBeNull();
  });

  it("yields the 404 shape for a missing over-shepherd", async () => {
    expect(
      await buildOverShepherdDetailData(
        detailReads({ fetchOverShepherd: async () => ok(null) }),
        OVER_SHEPHERD_ID
      )
    ).toEqual({ kind: "not_found" });
  });

  it("blocks the edit form when the over-shepherd read fails", async () => {
    // A dummy "Unknown" record would let an admin submit the edit form and
    // overwrite the real record with placeholder values — the page renders a
    // load_error screen instead.
    expect(
      await buildOverShepherdDetailData(
        detailReads({
          fetchOverShepherd: async () => fail("over-shepherd boom"),
          // The coverage read succeeding must not rescue the page.
          fetchCoveredShepherds: async () => ok(COVERED as never),
        }),
        OVER_SHEPHERD_ID
      )
    ).toEqual({ kind: "load_error", message: "over-shepherd boom" });
  });

  it("suppresses only the coverage list when the coverage read fails", async () => {
    const data = await buildOverShepherdDetailData(
      detailReads({
        fetchCoveredShepherds: async () => fail("coverage boom"),
      }),
      OVER_SHEPHERD_ID
    );

    if (data.kind !== "ok") throw new Error("expected ok");
    // The record (and its edit form) still render from their own successful
    // read; the coverage list degrades to empty with the failure surfaced
    // through the page banner — never a confidently wrong "no coverage".
    expect(data.overShepherd).toMatchObject({ id: OVER_SHEPHERD_ID });
    expect(data.coveredShepherds).toEqual([]);
    expect(data.error).toBe("coverage boom");
  });
});
