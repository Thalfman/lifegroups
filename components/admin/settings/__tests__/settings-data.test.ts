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
    fetchLeaderHealthRubric: async () => ok(null),
    fetchGroupTypes: async () => ok([]),
    ...overrides,
  };
}

const GROUP = { id: "g1", name: "Alpha" } as never;

describe("buildSettingsData — degradation", () => {
  it("reports no errors when every read succeeds", async () => {
    const data = await buildSettingsData(
      emptyReads({ fetchAllGroups: async () => ok([GROUP]) })
    );

    expect(data.errors).toEqual({
      defaults: null,
      groups: null,
      overrides: null,
      groupRubric: null,
      leaderRubric: null,
      groupTypes: null,
      readiness: null,
    });
    expect(data.groups).toEqual([GROUP]);
  });

  it("falls back to the built-in defaults when the defaults read fails, keeping the other tabs", async () => {
    const data = await buildSettingsData(
      emptyReads({
        fetchMetricDefaults: async () => fail("defaults boom"),
        fetchAllGroups: async () => ok([GROUP]),
      })
    );

    expect(data.errors.defaults).toBe("defaults boom");
    expect(data.defaults).toEqual(BUILT_IN_METRIC_DEFAULTS);
    expect(data.defaultsSource).toBe("fallback");
    // The other reads still loaded — one failure doesn't blank the surface.
    expect(data.errors.groups).toBeNull();
    expect(data.groups).toEqual([GROUP]);
  });

  it("flows the admin-managed group-type list through to groupTypes", async () => {
    const data = await buildSettingsData(
      emptyReads({
        fetchGroupTypes: async () => ok(["Men", "Women", "Mixed"]),
      })
    );

    expect(data.groupTypes).toEqual(["Men", "Women", "Mixed"]);
    expect(data.errors.groupTypes).toBeNull();
  });

  it("surfaces a group-types read failure on the Groups-tab key, keeping earlier sections", async () => {
    const data = await buildSettingsData(
      emptyReads({
        fetchAllGroups: async () => ok([GROUP]),
        fetchGroupTypes: async () => fail("group types boom"),
      })
    );

    expect(data.errors.groupTypes).toBe("group types boom");
    expect(data.groupTypes).toEqual([]);
    // One failed read doesn't blank the surface.
    expect(data.errors.groups).toBeNull();
    expect(data.groups).toEqual([GROUP]);
    expect(data.errors.readiness).toBeNull();
  });

  it("maps the overrides and rubric failures one-to-one onto their tab keys", async () => {
    const data = await buildSettingsData(
      emptyReads({
        fetchAllGroupMetricSettings: async () => fail("overrides boom"),
        fetchGroupHealthRubric: async () => fail("group rubric boom"),
        fetchLeaderHealthRubric: async () => fail("leader rubric boom"),
      })
    );

    expect(data.errors.overrides).toBe("overrides boom");
    expect(data.errors.groupRubric).toBe("group rubric boom");
    expect(data.errors.leaderRubric).toBe("leader rubric boom");
    // Each failed read degrades only its own tab's data…
    expect(data.groupMetricSettings).toEqual([]);
    expect(data.groupRubricCriteria).toEqual([]);
    expect(data.leaderRubricCriteria).toEqual([]);
    // …and the keys fed by the surviving reads stay null.
    expect(data.errors.defaults).toBeNull();
    expect(data.errors.groupTypes).toBeNull();
    expect(data.errors.readiness).toBeNull();
  });

  it("seeds the working default rubric when no health_rubrics row exists (#642)", async () => {
    const data = await buildSettingsData(emptyReads());

    // No row, no error → the editor shows the 40/40/20 starting defaults, not a
    // zeroed form, and is flagged as unsaved so the note + lazy-persist apply.
    expect(data.hasSavedGroupRubric).toBe(false);
    expect(data.groupRubricCriteria).toEqual([
      { key: "attendance", label: "Attendance", weight: 40 },
      { key: "spiritual_growth", label: "Spiritual growth", weight: 40 },
      { key: "group_question", label: "Group question", weight: 20 },
    ]);
    expect(data.groupRubricCriteria.reduce((sum, c) => sum + c.weight, 0)).toBe(
      100
    );
  });

  it("uses the stored criteria and marks the rubric saved when a row exists (#642)", async () => {
    const data = await buildSettingsData(
      emptyReads({
        fetchGroupHealthRubric: async () =>
          ok({
            criteria: [{ key: "unity", label: "Unity", weight: 100 }],
          } as never),
      })
    );

    expect(data.hasSavedGroupRubric).toBe(true);
    expect(data.groupRubricCriteria).toEqual([
      { key: "unity", label: "Unity", weight: 100 },
    ]);
  });

  it("reports the defaults as live when a stored row decodes", async () => {
    const data = await buildSettingsData(
      emptyReads({
        fetchMetricDefaults: async () =>
          ok({
            id: "settings-1",
            setting_key: "metric_defaults",
            setting_value: { shepherd_care_stale_days_direct: 14 },
            created_at: "2026-06-01T00:00:00Z",
            updated_at: "2026-06-01T00:00:00Z",
          }),
      })
    );

    expect(data.defaultsSource).toBe("live");
    expect(data.errors.defaults).toBeNull();
    expect(data.defaults.shepherd_care_stale_days_direct).toBe(14);
    // Keys absent from the stored row fall back per-field to the built-ins.
    expect(data.defaults.shepherd_care_stale_days_delegated).toBe(
      BUILT_IN_METRIC_DEFAULTS.shepherd_care_stale_days_delegated
    );
  });

  it("documents the no-database fallback shape", () => {
    const empty = emptySettingsData();
    expect(empty.defaults).toEqual(BUILT_IN_METRIC_DEFAULTS);
    expect(empty.defaultsSource).toBe("fallback");
    expect(empty.errors.defaults).toBe(
      "The database is not configured in this environment."
    );
  });
});
