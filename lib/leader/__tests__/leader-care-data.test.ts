import { describe, expect, it, vi } from "vitest";

import {
  buildLeaderCareData,
  type LeaderCareReads,
} from "@/lib/leader/leader-care-data";
import type { LeaderSafeGroupRow } from "@/lib/supabase/group-reads";
import type { ReadResult } from "@/lib/supabase/read-core";

const ok = <T>(data: T): ReadResult<T> => ({ data, error: null });
const fail = (message: string): ReadResult<never> => ({
  data: null,
  error: new Error(message),
});

// The row's other columns are irrelevant here — the build function only
// sorts by name and forwards the rows.
const group = (id: string, name: string) =>
  ({ id, name }) as LeaderSafeGroupRow;

function careReads(overrides: Partial<LeaderCareReads> = {}): LeaderCareReads {
  return {
    readFirstRunOrientationSeen: async () => true,
    fetchLeaderGroupsByIds: async () => ok([group("g1", "Alpha")]),
    ...overrides,
  };
}

describe("buildLeaderCareData", () => {
  it("never fetches groups for an empty assignment list", async () => {
    const fetchGroups = vi.fn(async () => ok([group("g1", "Alpha")]));
    const data = await buildLeaderCareData(
      careReads({ fetchLeaderGroupsByIds: fetchGroups }),
      []
    );
    expect(fetchGroups).not.toHaveBeenCalled();
    expect(data.kind).toBe("ok");
    if (data.kind !== "ok") return;
    expect(data.groups).toEqual([]);
  });

  it("returns the load_error arm when the groups read fails", async () => {
    const data = await buildLeaderCareData(
      careReads({ fetchLeaderGroupsByIds: async () => fail("groups boom") }),
      ["g1"]
    );
    expect(data.kind).toBe("load_error");
    if (data.kind !== "load_error") return;
    expect(data.error.message).toContain("groups boom");
  });

  it("sorts groups by name without mutating the read result", async () => {
    const rows = [group("g2", "Zion"), group("g1", "Alpha")];
    const data = await buildLeaderCareData(
      careReads({ fetchLeaderGroupsByIds: async () => ok(rows) }),
      ["g1", "g2"]
    );
    expect(data.kind).toBe("ok");
    if (data.kind !== "ok") return;
    expect(data.groups.map((g) => g.name)).toEqual(["Alpha", "Zion"]);
    expect(rows.map((g) => g.name)).toEqual(["Zion", "Alpha"]);
  });

  it("propagates an unseen orientation flag", async () => {
    const data = await buildLeaderCareData(
      careReads({ readFirstRunOrientationSeen: async () => false }),
      ["g1"]
    );
    expect(data.kind).toBe("ok");
    if (data.kind !== "ok") return;
    expect(data.orientationSeen).toBe(false);
  });
});
