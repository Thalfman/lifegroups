import { describe, expect, it } from "vitest";

import {
  resolveCareNeedsContact,
  needsContactProfileIds,
  profileNeedsContact,
  type CareNeedsContactReads,
} from "@/lib/admin/care-needs-contact";
import type { ReadResult } from "@/lib/supabase/read-core";
import type { ActiveShepherdCoverageAssignmentSummary } from "@/lib/supabase/shepherd-coverage-reads";
import type { ShepherdCareDirectoryEntry } from "@/lib/supabase/shepherd-care-directory-reads";
import type {
  AppSettingsRow,
  AttentionResetBaselinesRow,
} from "@/types/database";

const ok = <T>(data: T): ReadResult<T> => ({ data, error: null });
const fail = (message: string): ReadResult<never> => ({
  data: null,
  error: new Error(message),
});

// A successful, empty read for every dependency; each test overrides only the
// reads it cares about. This fake satisfies the same `CareNeedsContactReads`
// interface every surface adapter maps onto, so the waterfall + degrade rules
// are exercised with no database.
function emptyReads(
  overrides: Partial<CareNeedsContactReads> = {}
): CareNeedsContactReads {
  return {
    fetchActiveAssignments: async () => ok([]),
    fetchMetricDefaults: async () => ok(null),
    fetchAttentionBaselines: async () => ok([]),
    fetchCareDirectory: async () => ok([]),
    ...overrides,
  };
}

const TODAY = "2026-06-15";

describe("resolveCareNeedsContact", () => {
  it("waterfalls the windows, delegated set, and care baselines into the directory read", async () => {
    let captured:
      | Parameters<CareNeedsContactReads["fetchCareDirectory"]>[0]
      | null = null;
    await resolveCareNeedsContact(
      emptyReads({
        fetchMetricDefaults: async () =>
          ok({
            setting_value: {
              shepherd_care_stale_days_direct: 15,
              shepherd_care_stale_days_delegated: 45,
            },
          } as unknown as AppSettingsRow),
        fetchActiveAssignments: async () =>
          ok([
            { shepherd_profile_id: "s1" },
            { shepherd_profile_id: "s2" },
          ] as unknown as ActiveShepherdCoverageAssignmentSummary[]),
        fetchAttentionBaselines: async () =>
          ok([
            {
              surface: "care",
              scope: "global",
              entity_id: null,
              baseline_on: "2026-06-01",
            },
            {
              surface: "care",
              scope: "entity",
              entity_id: "s1",
              baseline_on: "2026-06-10",
            },
          ] as unknown as AttentionResetBaselinesRow[]),
        fetchCareDirectory: async (options) => {
          captured = options;
          return ok([]);
        },
      }),
      { todayIso: TODAY }
    );

    expect(captured).toMatchObject({
      todayIso: TODAY,
      windows: { directlyOverseenStaleDays: 15, delegatedStaleDays: 45 },
    });
    const opts = captured as unknown as {
      delegatedShepherdIds: Set<string>;
      baselines: { global: string | null; byEntityId: Map<string, string> };
    };
    expect([...opts.delegatedShepherdIds].sort()).toEqual(["s1", "s2"]);
    // The "care" baselines this resolver builds are threaded into the directory
    // read — the core of the issue #636 fix (People/detail used to omit them).
    expect(opts.baselines.global).toBe("2026-06-01");
    expect(opts.baselines.byEntityId.get("s1")).toBe("2026-06-10");
  });

  it("derives the People id set and the person-detail boolean from one resolution", async () => {
    const resolution = await resolveCareNeedsContact(
      emptyReads({
        fetchCareDirectory: async () =>
          ok([
            { profile: { id: "p1" }, needs_attention: true },
            { profile: { id: "p2" }, needs_attention: false },
            { profile: { id: "p3" }, needs_attention: true },
          ] as unknown as ShepherdCareDirectoryEntry[]),
      }),
      { todayIso: TODAY }
    );

    expect(needsContactProfileIds(resolution)).toEqual(new Set(["p1", "p3"]));
    expect(profileNeedsContact(resolution, "p1")).toBe(true);
    expect(profileNeedsContact(resolution, "p2")).toBe(false);
    expect(profileNeedsContact(resolution, "absent")).toBe(false);
  });

  it("degrades a failed coverage read to no delegated set and no false zero", async () => {
    let captured:
      | Parameters<CareNeedsContactReads["fetchCareDirectory"]>[0]
      | null = null;
    const resolution = await resolveCareNeedsContact(
      emptyReads({
        fetchActiveAssignments: async () => fail("coverage boom"),
        fetchCareDirectory: async (options) => {
          captured = options;
          return ok([
            { profile: { id: "p1" }, needs_attention: true },
          ] as unknown as ShepherdCareDirectoryEntry[]);
        },
      }),
      { todayIso: TODAY }
    );

    // Omitted (not an empty set) so the directory falls back to the conservative
    // longer window instead of over-flagging off a failed read.
    expect(
      (captured as unknown as { delegatedShepherdIds?: unknown })
        .delegatedShepherdIds
    ).toBeUndefined();
    expect(resolution.assignmentsAvailable).toBe(false);
    expect(resolution.assignmentsError).toBe("coverage boom");
    // The indicator still derives from the directory read that did succeed.
    expect(needsContactProfileIds(resolution)).toEqual(new Set(["p1"]));
  });

  it("degrades a failed directory read to no flags / false", async () => {
    const resolution = await resolveCareNeedsContact(
      emptyReads({ fetchCareDirectory: async () => fail("directory boom") }),
      { todayIso: TODAY }
    );

    expect(resolution.directory.error?.message).toBe("directory boom");
    expect(needsContactProfileIds(resolution)).toEqual(new Set());
    expect(profileNeedsContact(resolution, "p1")).toBe(false);
  });

  it("degrades a failed baselines read to 'no baselines' rather than failing", async () => {
    let captured:
      | Parameters<CareNeedsContactReads["fetchCareDirectory"]>[0]
      | null = null;
    const resolution = await resolveCareNeedsContact(
      emptyReads({
        fetchAttentionBaselines: async () => fail("baselines boom"),
        fetchCareDirectory: async (options) => {
          captured = options;
          return ok([]);
        },
      }),
      { todayIso: TODAY }
    );

    // No throw; the page still renders. The directory read still runs, just with
    // empty baselines (the pre-fix behaviour, now a deliberate degrade).
    const opts = captured as unknown as {
      baselines: { global: string | null; byEntityId: Map<string, string> };
    };
    expect(opts.baselines.global).toBeNull();
    expect(opts.baselines.byEntityId.size).toBe(0);
    expect(resolution.directory.error).toBeNull();
  });
});
