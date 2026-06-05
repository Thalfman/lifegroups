import { describe, expect, it } from "vitest";

import {
  buildSettingsData,
  type SettingsReads,
} from "@/components/admin/settings/settings-data";
import type { ReadResult } from "@/lib/supabase/read-core";

const ok = <T>(data: T): ReadResult<T> => ({ data, error: null });

function emptyReads(overrides: Partial<SettingsReads> = {}): SettingsReads {
  return {
    fetchMetricDefaults: async () => ok(null),
    fetchAllGroups: async () => ok([]),
    fetchAllGroupMetricSettings: async () => ok([]),
    fetchPlatformConfig: async () => ok(null as never),
    fetchGroupHealthRubric: async () => ok(null),
    ...overrides,
  };
}

describe("buildSettingsData", () => {
  it("does NOT read platform config for a ministry admin", async () => {
    let configRead = false;
    const data = await buildSettingsData(
      emptyReads({
        fetchPlatformConfig: async () => {
          configRead = true;
          return ok(null as never);
        },
      }),
      { isSuperAdmin: false }
    );

    expect(configRead).toBe(false);
    expect(data.editableCopy).toBeNull();
    expect(data.isSuperAdmin).toBe(false);
  });

  it("reads platform config (editable copy) for a super admin", async () => {
    let configRead = false;
    const data = await buildSettingsData(
      emptyReads({
        fetchPlatformConfig: async () => {
          configRead = true;
          return ok(null as never);
        },
      }),
      { isSuperAdmin: true }
    );

    expect(configRead).toBe(true);
    expect(data.editableCopy).not.toBeNull();
  });
});
