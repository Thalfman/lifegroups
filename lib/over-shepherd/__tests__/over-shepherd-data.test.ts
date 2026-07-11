import { describe, expect, it, vi } from "vitest";

import {
  buildOverShepherdData,
  type OverShepherdLandingReads,
} from "@/lib/over-shepherd/over-shepherd-data";
import {
  careCadenceWindowsFromDefaults,
  decodeMetricDefaults,
} from "@/lib/admin/metrics";
import type { ShepherdCareDirectoryEntry } from "@/lib/supabase/shepherd-care-directory-reads";
import type { AppSettingsRow } from "@/types/database";
import type { ReadResult } from "@/lib/supabase/read-core";

const ok = <T>(data: T): ReadResult<T> => ({ data, error: null });
const fail = (message: string): ReadResult<never> => ({
  data: null,
  error: new Error(message),
});

// The directory assembly is covered by over-shepherd-reads.test.ts; here an
// entry is opaque — the build function only counts and forwards them.
const entry = (shepherdProfileId: string) =>
  ({ shepherdProfileId }) as unknown as ShepherdCareDirectoryEntry;

const coverage = (coveredShepherdIds: string[]) => ({
  data: { overShepherdId: "os-1", coveredShepherdIds },
  error: null,
});

// The documented baseline: what a missing/failed settings read falls back to.
const BASELINE_WINDOWS = careCadenceWindowsFromDefaults(
  decodeMetricDefaults(null)
);

function landingReads(
  overrides: Partial<OverShepherdLandingReads> = {}
): OverShepherdLandingReads {
  return {
    readFirstRunOrientationSeen: async () => true,
    fetchOverShepherdCoverageForCaller: async () => coverage(["sp-1"]),
    fetchMetricDefaultsCached: async () => ok(null),
    fetchOverShepherdCareDirectory: async () => ok([entry("sp-1")]),
    ...overrides,
  };
}

describe("buildOverShepherdData", () => {
  it("returns unavailable when the coverage read fails", async () => {
    const data = await buildOverShepherdData(
      landingReads({
        fetchOverShepherdCoverageForCaller: async () => fail("coverage boom"),
      })
    );
    expect(data.kind).toBe("unavailable");
  });

  it("returns no_access on a clean null coverage resolution (Codex #5)", async () => {
    const data = await buildOverShepherdData(
      landingReads({
        fetchOverShepherdCoverageForCaller: async () => ({
          data: null,
          error: null,
        }),
      })
    );
    expect(data.kind).toBe("no_access");
  });

  it("renders an empty directory (not no_access) for an empty coverage list", async () => {
    const data = await buildOverShepherdData(
      landingReads({
        fetchOverShepherdCoverageForCaller: async () => coverage([]),
        fetchOverShepherdCareDirectory: async () => ok([]),
      })
    );
    expect(data.kind).toBe("ok");
    if (data.kind !== "ok") return;
    expect(data.entries).toEqual([]);
    expect(data.lede).toContain("No Shepherds are assigned");
  });

  it("returns unavailable when the directory read fails", async () => {
    const data = await buildOverShepherdData(
      landingReads({
        fetchOverShepherdCareDirectory: async () => fail("directory boom"),
      })
    );
    expect(data.kind).toBe("unavailable");
  });

  it("falls back to the baseline cadence window when the defaults read fails", async () => {
    const directory = vi.fn(async () => ok([entry("sp-1")]));
    await buildOverShepherdData(
      landingReads({
        fetchMetricDefaultsCached: async () => fail("settings boom"),
        fetchOverShepherdCareDirectory: directory,
      })
    );
    expect(directory).toHaveBeenCalledWith(["sp-1"], {
      windows: BASELINE_WINDOWS,
      todayIso: undefined,
    });
  });

  it("honors configured cadence defaults and threads todayIso through", async () => {
    const directory = vi.fn(async () => ok([entry("sp-1")]));
    const settingsRow = {
      setting_value: {
        shepherd_care_stale_days_direct: 21,
        shepherd_care_stale_days_delegated: 45,
      },
    } as unknown as AppSettingsRow;
    await buildOverShepherdData(
      landingReads({
        fetchMetricDefaultsCached: async () => ok(settingsRow),
        fetchOverShepherdCareDirectory: directory,
      }),
      { todayIso: "2026-05-10" }
    );
    expect(directory).toHaveBeenCalledWith(["sp-1"], {
      windows: { directlyOverseenStaleDays: 21, delegatedStaleDays: 45 },
      todayIso: "2026-05-10",
    });
  });

  it("returns the populated lede and propagates an unseen orientation flag", async () => {
    const data = await buildOverShepherdData(
      landingReads({ readFirstRunOrientationSeen: async () => false })
    );
    expect(data.kind).toBe("ok");
    if (data.kind !== "ok") return;
    expect(data.entries).toHaveLength(1);
    expect(data.lede).toContain("Shepherds you cover");
    expect(data.orientationSeen).toBe(false);
  });
});
