import {
  fetchShepherdCareDirectoryRowsForAdmin,
  buildCareDirectoryEntries,
  type ShepherdCareDirectoryEntry,
} from "@/lib/supabase/shepherd-care-directory-reads";
import {
  fetchActiveShepherdCoverageAssignmentsForAdmin,
  fetchOverShepherdsForAdmin,
} from "@/lib/supabase/shepherd-coverage-reads";
import {
  fetchActiveGroupCount,
  fetchAllGroupLeaders,
  fetchAllGroups,
} from "@/lib/supabase/group-reads";
import {
  fetchActiveMemberships,
  fetchProfilesForAdmin,
} from "@/lib/supabase/membership-reads";
import { fetchGuests } from "@/lib/supabase/guest-reads";
import { fetchAttendanceSessions } from "@/lib/supabase/attendance-reads";
import {
  fetchGroupHealthAssessmentRatings,
  fetchLatestHealthUpdates,
} from "@/lib/supabase/health-reads";
import { fetchGroupCalendarEvents } from "@/lib/supabase/calendar-reads";
import {
  fetchOpenFollowUps,
  fetchOpenFollowUpsDueCount,
} from "@/lib/supabase/overview-reads";
import {
  fetchLeaderPipelineForAdmin,
  fetchMultiplicationCandidatesForAdmin,
} from "@/lib/supabase/multiplication-reads";
import {
  fetchAllGroupMetricSettings,
  fetchLaunchPlanningAssumptions,
} from "@/lib/supabase/settings-reads";
import { fetchMetricDefaultsCached } from "@/lib/supabase/cached-config";
import { measureReadBundle } from "@/lib/observability/read-timing";
import { loadAllGroupsForAdmin } from "@/lib/admin/groups-read";
import type { ReadResult } from "@/lib/supabase/read-core";
import { fetchAttentionResetBaselines } from "@/lib/supabase/maintenance-reads";
import {
  buildSurfaceBaselines,
  type AttentionBaselines,
} from "@/lib/admin/attention-reset";
import { currentPeriodMonthIso } from "@/lib/admin/ministry-year";
import { bindReads, type BoundReads } from "@/lib/supabase/reads-seam";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import type {
  AdminDashboardData,
  DashboardResult,
  LeaderPipelineDashboardSummary,
  MultiplicationDashboardSummary,
} from "./types";
import { buildAdminGroupModel } from "./admin-group-model";
import { buildLaunchPlanningSnapshot } from "./launch-planning-snapshot";
import { buildShepherdCareSummary } from "./shepherd-care-summary";
import { LEADER_READINESS_STAGES } from "@/lib/admin/leader-pipeline";
import type { OverviewGrain } from "@/lib/admin/overview-period";
import { ADMIN_FALLBACK } from "./fallback-data";
// Phase 5B.0 swapped the dashboard's UTC isoWeekStart for a
// church-timezone-aware version so the leader workflow and the
// dashboard agree on what "this week" means.
import {
  addDaysIso,
  isoWeekStart,
  churchTodayIso,
} from "@/lib/shared/church-time";
import {
  careCadenceWindowsFromDefaults,
  decodeMetricDefaults,
} from "@/lib/admin/metrics";

function fallback<T>(data: T, error?: string): DashboardResult<T> {
  return { source: "fallback", data, error };
}

function live<T>(data: T): DashboardResult<T> {
  return { source: "live", data };
}

// ---------------------------------------------------------------------------
// Admin dashboard (Phase 6.0)
// ---------------------------------------------------------------------------
//
// The pure cross-domain join (derived rows, capacity/health/setup/attention
// partitions, summary counts) lives in lib/dashboard/admin-group-model.ts so
// it is reachable from a unit test without a Supabase client. The two helpers
// below stay here because they are read-dependent: each consumes its own
// `ReadResult` and degrades to an explicit `available:false` state.

// buildShepherdCareSummary moved to lib/dashboard/shepherd-care-summary.ts so
// the demo fallback derives the Care headline card through the same rule.

// Leader-pipeline + multiplication rollups for the executive landing. Both are
// read-dependent and intentionally OUTSIDE the firstError gate: a failure here
// degrades the one card to available:false rather than failing the whole page,
// mirroring buildShepherdCareSummary / buildLaunchPlanningSnapshot.
function buildLeaderPipelineSummary(
  pipelineRes: Awaited<ReturnType<typeof fetchLeaderPipelineForAdmin>>
): LeaderPipelineDashboardSummary {
  // Stable, drift-free keys: seed every readiness stage at 0 in canonical
  // order so the card always renders the full ladder, then tally.
  const counts = LEADER_READINESS_STAGES.reduce(
    (acc, stage) => {
      acc[stage] = 0;
      return acc;
    },
    {} as LeaderPipelineDashboardSummary["counts"]
  );
  if (pipelineRes.error || !pipelineRes.data) {
    return {
      counts,
      total: 0,
      available: false,
      error: pipelineRes.error?.message ?? "unavailable",
    };
  }
  for (const entry of pipelineRes.data) {
    counts[entry.apprentice.readiness_stage] += 1;
  }
  return {
    counts,
    total: pipelineRes.data.length,
    available: true,
    error: null,
  };
}

function buildMultiplicationSummary(
  multiplicationRes: Awaited<
    ReturnType<typeof fetchMultiplicationCandidatesForAdmin>
  >
): MultiplicationDashboardSummary {
  // Seed all four candidate statuses at 0 so the shape is stable; the typed
  // literal is checked against the enum, so a new status would fail the build
  // here rather than silently dropping from the rollup.
  const counts: MultiplicationDashboardSummary["counts"] = {
    watching: 0,
    planned: 0,
    launched: 0,
    deferred: 0,
  };
  if (multiplicationRes.error || !multiplicationRes.data) {
    return {
      counts,
      total: 0,
      available: false,
      error: multiplicationRes.error?.message ?? "unavailable",
    };
  }
  for (const entry of multiplicationRes.data) {
    counts[entry.candidate.status] += 1;
  }
  return {
    counts,
    total: multiplicationRes.data.length,
    available: true,
    error: null,
  };
}

// The reads the admin dashboard orchestration depends on, declared once as a
// fetcher map — the seam between the orchestration (the error-gate, the
// graceful-degrade branches, the pure-model wiring) and Supabase. The
// orchestration is a function of the derived interface, so it can be exercised
// through an in-memory adapter in a unit test instead of a live client. The
// `BoundReads` / `bindReads` scaffold lives in `lib/supabase/reads-seam.ts` so
// every surface shares it (ADR 0015).
const ADMIN_DASHBOARD_FETCHERS = {
  fetchMetricDefaults: fetchMetricDefaultsCached,
  fetchAllGroups,
  fetchActiveGroupCount,
  fetchGuests,
  fetchOpenFollowUps,
  fetchOpenFollowUpsDueCount,
  fetchActiveMemberships,
  fetchLatestHealthUpdates,
  fetchGroupHealthAssessmentRatings,
  fetchAttendanceSessions,
  fetchAllGroupLeaders,
  fetchProfilesForAdmin,
  fetchAllGroupMetricSettings,
  fetchGroupCalendarEvents,
  fetchOverShepherdsForAdmin,
  fetchActiveShepherdCoverageAssignmentsForAdmin,
  fetchLaunchPlanningAssumptions,
  fetchShepherdCareDirectoryRowsForAdmin,
  fetchLeaderPipelineForAdmin,
  fetchMultiplicationCandidatesForAdmin,
  fetchAttentionResetBaselines,
};

export type AdminDashboardReads = BoundReads<typeof ADMIN_DASHBOARD_FETCHERS>;

// The production adapter at the reads seam: binds the live Supabase client to
// every read-model fetcher via the shared `bindReads` scaffold (ADR 0015).
export function supabaseAdminDashboardReads(
  client: AppSupabaseClient
): AdminDashboardReads {
  return {
    ...bindReads(client, ADMIN_DASHBOARD_FETCHERS, "admin_dashboard"),
    // Share the per-request cached groups read with Boundary B's Multiply grid
    // (lib/admin/groups-read.ts) so a first /admin launch reads the full groups
    // table once across both Suspense boundaries. The seam type is unchanged
    // (OmitClient<typeof fetchAllGroups>), so in-memory test adapters are too.
    fetchAllGroups: () => loadAllGroupsForAdmin(),
  };
}

export async function getAdminDashboardData(
  client: AppSupabaseClient | null,
  options: { selectedWeek?: string; now?: Date; grain?: OverviewGrain } = {}
): Promise<DashboardResult<AdminDashboardData>> {
  if (!client) return fallback(ADMIN_FALLBACK);
  return buildAdminDashboardData(supabaseAdminDashboardReads(client), options);
}

// The admin dashboard orchestration, as a deep function of the reads seam:
// resolve metric defaults, batch the reads, gate on the first error, hand the
// pure arrays to `buildAdminGroupModel`, and fold in the read-dependent
// shepherd-care and launch-planning summaries. Every degrade-to-fallback path
// lives here and is reachable from a test through an in-memory `reads` adapter.
export async function buildAdminDashboardData(
  reads: AdminDashboardReads,
  options: { selectedWeek?: string; now?: Date; grain?: OverviewGrain } = {}
): Promise<DashboardResult<AdminDashboardData>> {
  const now = options.now ?? new Date();
  const currentWeek = isoWeekStart(now);
  const selectedWeek = options.selectedWeek ?? currentWeek;
  const periodMonth = currentPeriodMonthIso(now);

  try {
    // Phase 5A.6: batch-fetch calendar events for the selected week so
    // the derived rows below can resolve calendar overrides without a
    // per-group round trip. We fetch a one-week window (Mon..Sun) -- the
    // override resolver narrows further.
    const weekEnd = addDaysIso(selectedWeek, 6);
    // Pin "today" once so the shepherd-care summary uses the same
    // calendar day for needs_attention math and the dashboard for any
    // request-bound timing. Derived from the SAME injected `now` that drives
    // `selectedWeek` / the activity period (via `isoWeekStart`/
    // `overviewPeriodRange`) so fixed-`now` runs (tests, deterministic demo
    // paths) compute "this week" against one clock, not the real wall clock.
    const todayIso = churchTodayIso(now);
    // The "this week" horizon the Home card renders: today + 7 days, inclusive
    // of overdue. Computed here so the UNtruncated due-count read below matches
    // the card's `isDueThisWeek` window exactly.
    const dueThisWeekOnOrBeforeIso = addDaysIso(todayIso, 7);

    // Metric defaults feed the shepherd-care directory's `entry.needs_attention`
    // stamp (configured stale-contact window) — without it /admin would use the
    // built-in 60-day default while /admin/shepherd-care uses the configured
    // window, and the two surfaces would disagree. None of the batched reads
    // below depend on the defaults, so the defaults read joins the parallel
    // batch instead of gating it on its own round trip; `defaultsForRead` is
    // derived once the batch resolves and consumed by the (sequenced)
    // directory fetch and the pure model.
    const [
      groupsResult,
      activeGroupCountResult,
      guestsResult,
      followUpsResult,
      dueFollowUpsThisWeekCountResult,
      membershipsResult,
      healthUpdatesResult,
      healthAssessmentRatingsResult,
      sessionsResult,
      leadersResult,
      profilesResult,
      metricSettingsResult,
      calendarEventsResult,
      overShepherdsResult,
      shepherdAssignmentsResult,
      launchAssumptionsResult,
      leaderPipelineResult,
      multiplicationResult,
      metricDefaultsResult,
      attentionBaselinesResult,
      shepherdDirectoryRowsResult,
    ] = await Promise.all([
      reads.fetchAllGroups(),
      // Exact active-group total via a head/count query — kept as its own read
      // (not derived from the groups array) so the headline count stays correct
      // even if the full-groups read is ever capped/paged. It's a cheap count in
      // this parallel batch, never the critical-path read.
      reads.fetchActiveGroupCount(),
      reads.fetchGuests(),
      reads.fetchOpenFollowUps({ limit: 8 }),
      reads.fetchOpenFollowUpsDueCount({
        dueOnOrBeforeIso: dueThisWeekOnOrBeforeIso,
      }),
      reads.fetchActiveMemberships(),
      reads.fetchLatestHealthUpdates({ updateWeek: selectedWeek }),
      reads.fetchGroupHealthAssessmentRatings({ periodMonth }),
      reads.fetchAttendanceSessions({ meetingWeek: selectedWeek }),
      reads.fetchAllGroupLeaders({ activeOnly: true }),
      reads.fetchProfilesForAdmin(),
      reads.fetchAllGroupMetricSettings(),
      reads.fetchGroupCalendarEvents({
        fromDate: selectedWeek,
        toDate: weekEnd,
        includeArchived: false,
      }),
      // Julian admin-OS spine reads. Failures here degrade gracefully —
      // the dashboard surfaces "unavailable" cards rather than failing
      // the whole page.
      reads.fetchOverShepherdsForAdmin({ includeArchived: true }),
      reads.fetchActiveShepherdCoverageAssignmentsForAdmin(),
      reads.fetchLaunchPlanningAssumptions(),
      // Executive-overview rollups (leader-pipeline supply + multiplication
      // candidates). Like the spine reads above, failures degrade the one
      // card rather than failing the page, so they stay out of firstError.
      reads.fetchLeaderPipelineForAdmin(),
      reads.fetchMultiplicationCandidatesForAdmin(),
      reads.fetchMetricDefaults(),
      // health-checks-reset: the reset baselines so both "Needs attention"
      // cards honour a reset. Like the spine reads, a failure degrades to
      // "no baselines" (today's behaviour) rather than failing the page, so it
      // stays out of firstError below.
      reads.fetchAttentionResetBaselines(),
      // Shepherd-care directory RAW rows (active leader/co_leader profiles +
      // their care rows). Its two DB reads now run concurrently inside the
      // reader (previously serial), so this whole entry is one round trip and
      // rides the parallel batch; the pure needs_attention stamping happens
      // after, once windows / delegated set / baselines are derived. This keeps
      // the above-the-fold "Needs attention" off a second serial round trip.
      // Isolated in its own read_bundle line — it was the slowest single read on
      // this hot batch — so the serial→parallel win is measurable in prod.
      measureReadBundle(
        "admin_home_shepherd_directory",
        () => reads.fetchShepherdCareDirectoryRowsForAdmin(),
        (r) => ({ ok: r.error == null })
      ),
    ]);

    const defaultsForRead = decodeMetricDefaults(
      metricDefaultsResult.data ?? null
    );

    // health-checks-reset: split the flat baseline rows into the per-surface
    // maps the derivations consume. Care floors a last-contact DATE; health
    // floors a due WEEK, so its baseline is mapped to the ISO week-start to
    // match `selectedWeek`. A failed read degrades to empty (no suppression).
    const attentionBaselineRows = attentionBaselinesResult.error
      ? []
      : (attentionBaselinesResult.data ?? []);
    const careBaselines = buildSurfaceBaselines(attentionBaselineRows, "care");
    const healthBaselines = buildSurfaceBaselines(
      attentionBaselineRows,
      "health",
      isoWeekStart
    );

    // Build the shepherd-care directory from the SAME active-coverage set the
    // dashboard model uses, so its per-tier needs_attention stamp can't
    // disagree with the attention queue (Codex review on #138). Sequenced
    // after the batch because it depends on the assignments read; on a
    // coverage read failure the set is left undefined and the directory falls
    // back to the conservative longer (delegated) window.
    const shepherdDelegatedIds = shepherdAssignmentsResult.error
      ? undefined
      : new Set(
          (shepherdAssignmentsResult.data ?? []).map(
            (a) => a.shepherd_profile_id
          )
        );

    // Stamp the shepherd-care directory's needs_attention in memory from the raw
    // rows fetched in the batch above, using the SAME windows / delegated set /
    // baselines the dashboard model uses (so the directory chip can't disagree
    // with the attention queue, Codex review on #138). This is the exact pure
    // computation the old fetchShepherdCareDirectoryForAdmin did internally —
    // moved here so its two DB reads no longer cost a second serial round trip
    // on the above-the-fold path. A raw-read failure degrades exactly as before.
    const shepherdDirectoryResult: ReadResult<ShepherdCareDirectoryEntry[]> =
      shepherdDirectoryRowsResult.error
        ? { data: null, error: shepherdDirectoryRowsResult.error }
        : {
            data: buildCareDirectoryEntries(
              shepherdDirectoryRowsResult.data.profiles,
              shepherdDirectoryRowsResult.data.careRows,
              {
                todayIso,
                windows: careCadenceWindowsFromDefaults(defaultsForRead),
                delegatedShepherdIds: shepherdDelegatedIds,
                baselines: careBaselines,
              }
            ),
            error: null,
          };

    const firstError =
      groupsResult.error ||
      activeGroupCountResult.error ||
      guestsResult.error ||
      followUpsResult.error ||
      dueFollowUpsThisWeekCountResult.error ||
      membershipsResult.error ||
      healthUpdatesResult.error ||
      healthAssessmentRatingsResult.error ||
      sessionsResult.error ||
      leadersResult.error ||
      profilesResult.error ||
      metricDefaultsResult.error ||
      metricSettingsResult.error ||
      calendarEventsResult.error;
    if (firstError) return fallback(ADMIN_FALLBACK, firstError.message);

    const defaults = defaultsForRead;

    // The whole cross-domain join is a pure function of the fetched arrays.
    // It builds its own per-group indexes (latest Health Pulse by week,
    // membership counts, follow-ups, calendar overrides) so the summary
    // counts can never disagree with the queues they summarise.
    const model = buildAdminGroupModel({
      groups: groupsResult.data ?? [],
      memberships: membershipsResult.data ?? [],
      sessions: sessionsResult.data ?? [],
      healthUpdates: healthUpdatesResult.data ?? [],
      healthAssessmentRatings: healthAssessmentRatingsResult.data ?? [],
      leaders: leadersResult.data ?? [],
      profiles: profilesResult.data ?? [],
      metricSettings: metricSettingsResult.data ?? [],
      calendarEvents: calendarEventsResult.data ?? [],
      guests: guestsResult.data ?? [],
      followUps: followUpsResult.data ?? [],
      defaults,
      selectedWeek,
      now,
      activeGroupCount: activeGroupCountResult.data ?? null,
      healthBaselines,
    });

    // Julian admin OS spine summaries. These are the headline cards on
    // /admin under the new direction; if either read failed above, the
    // helper returns an explicit "unavailable" state so the dashboard
    // card can render a message rather than silently zeroing. Both are
    // read-dependent, so they stay out of the pure model and consume its
    // derived rows here.
    const shepherdCare = buildShepherdCareSummary(
      shepherdDirectoryResult,
      overShepherdsResult,
      shepherdAssignmentsResult,
      careCadenceWindowsFromDefaults(defaults),
      todayIso,
      careBaselines
    );
    const launchPlanning = buildLaunchPlanningSnapshot(
      launchAssumptionsResult,
      model.derivedRows,
      defaults
    );
    const leaderPipeline = buildLeaderPipelineSummary(leaderPipelineResult);
    const multiplication = buildMultiplicationSummary(multiplicationResult);

    const { derivedRows: _derivedRows, ...modelPayload } = model;
    return live({
      ...modelPayload,
      dueFollowUpsThisWeekCount: dueFollowUpsThisWeekCountResult.data ?? 0,
      // Expose the SAME church-local horizon the count read used so the Home
      // card gates its launch milestone against one shared bound, not a second
      // (UTC) computation of its own.
      weekAheadCutoffIso: dueThisWeekOnOrBeforeIso,
      shepherdCare,
      launchPlanning,
      leaderPipeline,
      multiplication,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fallback(ADMIN_FALLBACK, message);
  }
}
