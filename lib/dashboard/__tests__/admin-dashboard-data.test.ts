import { describe, expect, it } from "vitest";
import {
  buildAdminDashboardData,
  type AdminDashboardReads,
} from "@/lib/dashboard/queries";
import { ADMIN_FALLBACK } from "@/lib/dashboard/fallback-data";
import {
  DEMO_FOLLOW_UPS,
  DEMO_GROUPS,
  DEMO_LAUNCH_ASSUMPTIONS_ROW,
  DEMO_LEADERS,
  DEMO_MEMBERSHIPS,
  DEMO_METRIC_DEFAULTS_ROW,
  DEMO_METRIC_SETTINGS,
  DEMO_NOW_ISO,
  DEMO_PROFILES,
  DEMO_SELECTED_WEEK,
  DEMO_SESSIONS,
} from "@/lib/dashboard/demo-seed";

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
    fetchOpenFollowUpsDueCount: async () => ({ data: 0, error: null }),
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
    fetchLeaderPipelineForAdmin: async () => ({ data: [], error: null }),
    fetchMultiplicationCandidatesForAdmin: async () => ({
      data: [],
      error: null,
    }),
    fetchOverviewActivityCounts: async () => ({
      data: { membersJoined: 0, followUpsCompleted: 0, careTouchpoints: 0 },
      error: null,
    }),
    fetchAttentionResetBaselines: async () => ({ data: [], error: null }),
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

  it("surfaces the UNtruncated due-this-week follow-up count from its own count read", async () => {
    // The card can only see the first capped rows of fetchOpenFollowUps, so the
    // accurate count comes from a dedicated head:true count read; the dashboard
    // must pass it straight through, never re-deriving it from the capped rows.
    const result = await buildAdminDashboardData(
      emptyReads({
        fetchOpenFollowUps: async () => ({ data: [], error: null }),
        fetchOpenFollowUpsDueCount: async () => ({ data: 12, error: null }),
      }),
      { now: NOW }
    );

    expect(result.source).toBe("live");
    if (result.source !== "live") return;
    expect(result.data.dueFollowUpsThisWeekCount).toBe(12);
  });

  it("derives the due-this-week horizon from the injected `now`, not the wall clock", async () => {
    // Regression (Codex round 2): the count read must ask Supabase for the same
    // "this week" the rest of the dashboard (selectedWeek, activity period) is
    // assembled around — i.e. today+7 measured from `options.now`. With a fixed
    // `now` of 2026-05-18 the horizon is 2026-05-25, regardless of the real
    // current date, so fixed-date runs don't drift onto the live week.
    let captured: string | undefined;
    const result = await buildAdminDashboardData(
      emptyReads({
        fetchOpenFollowUpsDueCount: async ({ dueOnOrBeforeIso }) => {
          captured = dueOnOrBeforeIso;
          return { data: 3, error: null };
        },
      }),
      { now: NOW }
    );

    expect(result.source).toBe("live");
    if (result.source !== "live") return;
    expect(captured).toBe("2026-05-25");
    expect(result.data.dueFollowUpsThisWeekCount).toBe(3);
    // The shared "week ahead" horizon the Home card gates its launch milestone
    // against is the SAME church-local bound the count read used — exposed so
    // the card no longer derives a parallel (UTC) horizon (Codex round 3).
    expect(result.data.weekAheadCutoffIso).toBe("2026-05-25");
    expect(result.data.weekAheadCutoffIso).toBe(captured);
  });

  it("degrades to the fallback when the due-this-week count read errors", async () => {
    // The count read is part of the firstError gate: it backs the Home "This
    // week" card's headline figure, so a failure degrades the page rather than
    // showing a silently-zeroed count.
    const result = await buildAdminDashboardData(
      emptyReads({
        fetchOpenFollowUpsDueCount: async () => ({
          data: null,
          error: new Error("due count read failed"),
        }),
      }),
      { now: NOW }
    );

    expect(result.source).toBe("fallback");
    if (result.source !== "fallback") return;
    expect(result.error).toContain("due count read failed");
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

  it("seeds leader-pipeline and multiplication rollups with stable, zeroed counts when their reads succeed empty", async () => {
    const result = await buildAdminDashboardData(emptyReads(), { now: NOW });

    expect(result.source).toBe("live");
    if (result.source !== "live") return;
    // Every canonical key is present at 0 so the ladder/status cards always
    // render the full set rather than a sparse map.
    expect(result.data.leaderPipeline.available).toBe(true);
    expect(result.data.leaderPipeline.total).toBe(0);
    expect(result.data.leaderPipeline.counts).toEqual({
      identified: 0,
      in_training: 0,
      ready_to_lead: 0,
      launched: 0,
    });
    expect(result.data.multiplication.available).toBe(true);
    expect(result.data.multiplication.total).toBe(0);
    expect(result.data.multiplication.counts).toEqual({
      watching: 0,
      planned: 0,
      launched: 0,
      deferred: 0,
    });
  });

  it("keeps the page live but marks leader-pipeline unavailable when only that read errors", async () => {
    // Leader pipeline is outside the firstError gate: a failure degrades only
    // its card while the rest of the dashboard stays live with zeroed counts.
    const result = await buildAdminDashboardData(
      emptyReads({
        fetchLeaderPipelineForAdmin: async () => ({
          data: null,
          error: new Error("pipeline unavailable"),
        }),
      }),
      { now: NOW }
    );

    expect(result.source).toBe("live");
    if (result.source !== "live") return;
    expect(result.data.leaderPipeline.available).toBe(false);
    expect(result.data.leaderPipeline.total).toBe(0);
    // Multiplication is independent and still available.
    expect(result.data.multiplication.available).toBe(true);
  });

  it("keeps the page live but marks multiplication unavailable when only that read errors", async () => {
    const result = await buildAdminDashboardData(
      emptyReads({
        fetchMultiplicationCandidatesForAdmin: async () => ({
          data: null,
          error: new Error("multiplication unavailable"),
        }),
      }),
      { now: NOW }
    );

    expect(result.source).toBe("live");
    if (result.source !== "live") return;
    expect(result.data.multiplication.available).toBe(false);
    expect(result.data.leaderPipeline.available).toBe(true);
  });

  it("defaults the activity band to all-time and stays available when the activity read succeeds", async () => {
    const result = await buildAdminDashboardData(emptyReads(), { now: NOW });

    expect(result.source).toBe("live");
    if (result.source !== "live") return;
    expect(result.data.activity.grain).toBe("all");
    expect(result.data.activity.label).toBe("All time");
    expect(result.data.activity.extendedAvailable).toBe(true);
  });

  it("scopes the activity band to the requested grain", async () => {
    const result = await buildAdminDashboardData(emptyReads(), {
      now: NOW,
      grain: "month",
    });

    expect(result.source).toBe("live");
    if (result.source !== "live") return;
    expect(result.data.activity.grain).toBe("month");
    expect(result.data.activity.label).toBe("This month");
  });

  it("derives the whole demo dashboard from the demo seed over the in-memory reads adapter", async () => {
    // ADR-0011 follow-on: every assembler-shaped piece of the demo dashboard
    // the fallback ships must be the live assembler's output for the demo seed,
    // not a hand-built second source of truth. Feed the full seed through the
    // SAME in-memory reads adapter seam the production /admin path uses and
    // assert every derived shape the orchestration produces equals the one
    // ADMIN_FALLBACK carries — capacity, health, attention, setup gaps, and the
    // launch snapshot (which derives through the shared spine builder).
    const result = await buildAdminDashboardData(
      emptyReads({
        fetchAllGroups: async () => ({ data: DEMO_GROUPS, error: null }),
        fetchActiveMemberships: async () => ({
          data: DEMO_MEMBERSHIPS,
          error: null,
        }),
        fetchAllGroupMetricSettings: async () => ({
          data: DEMO_METRIC_SETTINGS,
          error: null,
        }),
        fetchAllGroupLeaders: async () => ({ data: DEMO_LEADERS, error: null }),
        fetchProfilesForAdmin: async () => ({
          data: DEMO_PROFILES,
          error: null,
        }),
        fetchAttendanceSessions: async () => ({
          data: DEMO_SESSIONS,
          error: null,
        }),
        fetchOpenFollowUps: async () => ({
          data: DEMO_FOLLOW_UPS,
          error: null,
        }),
        fetchLaunchPlanningAssumptions: async () => ({
          data: DEMO_LAUNCH_ASSUMPTIONS_ROW,
          error: null,
        }),
        fetchMetricDefaults: async () => ({
          data: DEMO_METRIC_DEFAULTS_ROW,
          error: null,
        }),
      }),
      { now: new Date(DEMO_NOW_ISO), selectedWeek: DEMO_SELECTED_WEEK }
    );

    expect(result.source).toBe("live");
    if (result.source !== "live") return;
    expect(result.data.capacitySummary).toEqual(ADMIN_FALLBACK.capacitySummary);
    expect(result.data.healthSummary).toEqual(ADMIN_FALLBACK.healthSummary);
    expect(result.data.attentionItems).toEqual(ADMIN_FALLBACK.attentionItems);
    expect(result.data.setupGaps).toEqual(ADMIN_FALLBACK.setupGaps);
    expect(result.data.launchPlanning).toEqual(ADMIN_FALLBACK.launchPlanning);
    // The seed still exercises every capacity bucket, so the demo board stays
    // representative after the cutover.
    expect(result.data.capacitySummary.counts).toEqual({
      full: 1,
      warning: 2,
      ok: 3,
      unknown: 1,
      excluded: 1,
    });
  });

  it("keeps the page live but marks activity counts unavailable when that read errors", async () => {
    // The activity counts read is outside the firstError gate: a failure leaves
    // groupsLaunched/guestsWelcomed (derived from gated arrays) intact while the
    // three productivity counts go null.
    const result = await buildAdminDashboardData(
      emptyReads({
        fetchOverviewActivityCounts: async () => ({
          data: null,
          error: new Error("activity counts unavailable"),
        }),
      }),
      { now: NOW }
    );

    expect(result.source).toBe("live");
    if (result.source !== "live") return;
    expect(result.data.activity.extendedAvailable).toBe(false);
    expect(result.data.activity.membersJoined).toBeNull();
    // Derived-from-gated-arrays metrics still resolve to a number.
    expect(typeof result.data.activity.groupsLaunched).toBe("number");
  });
});
