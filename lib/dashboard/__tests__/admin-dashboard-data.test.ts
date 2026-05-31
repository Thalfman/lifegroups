import { describe, expect, it } from "vitest";
import {
  buildAdminDashboardData,
  type AdminDashboardReads,
} from "@/lib/dashboard/queries";

// A successful, empty read for every dashboard dependency. Each test overrides
// only the read it cares about, so the admin dashboard orchestration — the
// firstError gate, the graceful-degrade spine branches — is exercised in
// isolation through this in-memory adapter at the same seam the live Supabase
// adapter (`supabaseAdminDashboardReads`) satisfies. Two adapters, one seam.
function emptyReads(
  overrides: Partial<AdminDashboardReads> = {}
): AdminDashboardReads {
  return {
    fetchMetricDefaults: async () => ({ data: null, error: null }),
    fetchAllGroups: async () => ({ data: [], error: null }),
    fetchActiveGroupCount: async () => ({ data: 0, error: null }),
    fetchGuests: async () => ({ data: [], error: null }),
    fetchOpenFollowUps: async () => ({ data: [], error: null }),
    fetchActiveMemberships: async () => ({ data: [], error: null }),
    fetchLatestHealthUpdates: async () => ({ data: [], error: null }),
    fetchAttendanceSessions: async () => ({ data: [], error: null }),
    fetchAllGroupLeaders: async () => ({ data: [], error: null }),
    fetchProfilesForAdmin: async () => ({ data: [], error: null }),
    fetchAllGroupMetricSettings: async () => ({ data: [], error: null }),
    fetchGroupCalendarEvents: async () => ({ data: [], error: null }),
    fetchOverShepherdsForAdmin: async () => ({ data: [], error: null }),
    fetchActiveShepherdCoverageAssignmentsForAdmin: async () => ({
      data: [],
      error: null,
    }),
    fetchLaunchPlanningAssumptions: async () => ({ data: null, error: null }),
    fetchShepherdCareDirectoryForAdmin: async () => ({ data: [], error: null }),
    ...overrides,
  };
}

const NOW = new Date("2026-05-18T12:00:00Z");

describe("buildAdminDashboardData", () => {
  it("returns a live result when every read succeeds", async () => {
    const result = await buildAdminDashboardData(emptyReads(), { now: NOW });

    expect(result.source).toBe("live");
    if (result.source !== "live") return;
    // The read-dependent spine summaries are both available when their reads
    // succeed, even with no data behind them.
    expect(result.data.shepherdCare.available).toBe(true);
    expect(result.data.shepherdCare.totalActiveShepherds).toBe(0);
    expect(result.data.launchPlanning.available).toBe(true);
  });

  it("degrades to the fallback when a gated read errors", async () => {
    // fetchAllGroups is one of the reads in the firstError gate: an error
    // there must fail the whole page over to the fallback, not render a
    // half-built dashboard.
    const result = await buildAdminDashboardData(
      emptyReads({
        fetchAllGroups: async () => ({
          data: null,
          error: new Error("groups read failed"),
        }),
      }),
      { now: NOW }
    );

    expect(result.source).toBe("fallback");
    if (result.source !== "fallback") return;
    expect(result.error).toContain("groups read failed");
  });

  it("keeps the page live but marks shepherd-care unavailable when only the directory read errors", async () => {
    // The shepherd-care directory is a spine read outside the firstError
    // gate: its failure must degrade only the shepherd-care card, leaving the
    // rest of the dashboard live.
    const result = await buildAdminDashboardData(
      emptyReads({
        fetchShepherdCareDirectoryForAdmin: async () => ({
          data: null,
          error: new Error("care directory unavailable"),
        }),
      }),
      { now: NOW }
    );

    expect(result.source).toBe("live");
    if (result.source !== "live") return;
    expect(result.data.shepherdCare.available).toBe(false);
  });
});
