import { describe, expect, it } from "vitest";

import {
  buildSettingsData,
  emptySettingsData,
  type SettingsReads,
} from "@/components/admin/settings/settings-data";
import { BUILT_IN_METRIC_DEFAULTS } from "@/lib/admin/metrics";
import type { ReadResult } from "@/lib/supabase/read-core";

const ok = <T>(data: T): ReadResult<T> => ({ data, error: null });
const fail = (message: string): ReadResult<never> => ({
  data: null,
  error: new Error(message),
});

// A successful, empty read for every Settings dependency; each test overrides
// only the reads it cares about. Two adapters, one seam (ADR 0015). This file
// pins the surface's DEGRADATION behavior (per-tab error keys + fallbacks);
// the Groups-tab assembly itself is pinned in settings-groups-data.test.ts.
function emptyReads(overrides: Partial<SettingsReads> = {}): SettingsReads {
  return {
    fetchMetricDefaults: async () => ok(null),
    fetchAllGroups: async () => ok([]),
    fetchAllGroupMetricSettings: async () => ok([]),
    fetchGroupHealthRubric: async () => ok(null),
    fetchReadinessRule: async () => ok(null),
    fetchAudienceReadinessRules: async () => ok([]),
    fetchLeaderHealthRubric: async () => ok(null),
    fetchGroupCategories: async () => ok([]),
    fetchCategoryTypeTargetCells: async () => ok([]),
    fetchGroupCellLifecycleRows: async () => ok([]),
    fetchCategoriesForAudience: async () => ok([]),
    ...overrides,
  };
}

const GROUP = { id: "g1", name: "Alpha" } as never;

describe("buildSettingsData — degradation", () => {
  it("reports no errors when every read succeeds", async () => {
    const data = await buildSettingsData(
      emptyReads({ fetchAllGroups: async () => ok([GROUP]) }),
      { isSuperAdmin: false }
    );

    expect(data.errors).toEqual({
      defaults: null,
      groups: null,
      overrides: null,
      groupRubric: null,
      leaderRubric: null,
      groupCategories: null,
      readiness: null,
    });
    expect(data.groups).toEqual([GROUP]);
    expect(data.isSuperAdmin).toBe(false);
  });

  it("falls back to the built-in defaults when the defaults read fails, keeping the other tabs", async () => {
    const data = await buildSettingsData(
      emptyReads({
        fetchMetricDefaults: async () => fail("defaults boom"),
        fetchAllGroups: async () => ok([GROUP]),
      }),
      { isSuperAdmin: false }
    );

    expect(data.errors.defaults).toBe("defaults boom");
    expect(data.defaults).toEqual(BUILT_IN_METRIC_DEFAULTS);
    expect(data.defaultsSource).toBe("fallback");
    // The other reads still loaded — one failure doesn't blank the surface.
    expect(data.errors.groups).toBeNull();
    expect(data.groups).toEqual([GROUP]);
  });

  it("surfaces a later (lifecycle) failure on the Groups-tab key, keeping earlier sections", async () => {
    const data = await buildSettingsData(
      emptyReads({
        fetchAllGroups: async () => ok([GROUP]),
        fetchGroupCellLifecycleRows: async () => fail("lifecycle boom"),
      }),
      { isSuperAdmin: false }
    );

    expect(data.errors.groupCategories).toBe("lifecycle boom");
    expect(data.cellCoverage).toEqual([]);
    expect(data.errors.groups).toBeNull();
    expect(data.groups).toEqual([GROUP]);
  });

  it("orders the Groups-tab key precedence as data: catalog before targets before lifecycle", async () => {
    const data = await buildSettingsData(
      emptyReads({
        fetchGroupCategories: async () => fail("catalog boom"),
        fetchGroupCellLifecycleRows: async () => fail("lifecycle boom"),
      }),
      { isSuperAdmin: false }
    );

    expect(data.errors.groupCategories).toBe("catalog boom");
  });

  it("narrows the category picker silently when a per-audience read fails (no error key)", async () => {
    const data = await buildSettingsData(
      emptyReads({
        fetchCategoriesForAudience: async () => fail("picker boom"),
      }),
      { isSuperAdmin: false }
    );

    // Same silent fallback the Groups page uses: the drawer's picker just
    // offers no options for that type.
    expect(data.categoriesByAudience).toEqual({
      men: [],
      women: [],
      mixed: [],
    });
    expect(data.errors.groupCategories).toBeNull();
    expect(data.errors.readiness).toBeNull();
  });

  it("documents the no-database fallback shape", () => {
    const empty = emptySettingsData(true);
    expect(empty.isSuperAdmin).toBe(true);
    expect(empty.defaults).toEqual(BUILT_IN_METRIC_DEFAULTS);
    expect(empty.defaultsSource).toBe("fallback");
    expect(empty.errors.defaults).toBe(
      "The database is not configured in this environment."
    );
  });
});
