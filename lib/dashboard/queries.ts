import {
  currentUtcDateIso,
  fetchActiveGroupCount,
  fetchActiveMemberships,
  fetchActiveShepherdCoverageAssignmentsForAdmin,
  fetchAllGroupLeaders,
  fetchAllGroupMetricSettings,
  fetchAllGroups,
  fetchAttendanceRecordsForSessions,
  fetchAttendanceSessions,
  fetchGroupCalendarEvents,
  fetchGroupsByIds,
  fetchGuests,
  fetchLatestHealthUpdates,
  fetchLaunchPlanningAssumptions,
  fetchLeaderPipelineForAdmin,
  fetchMembersByIds,
  fetchMetricDefaults,
  fetchMultiplicationCandidatesForAdmin,
  fetchNewGuestsForGroupSince,
  fetchOpenFollowUps,
  fetchOverShepherdsForAdmin,
  fetchOverviewActivityCounts,
  fetchProfilesForAdmin,
  fetchShepherdCareDirectoryForAdmin,
  type LeaderFollowUpRow,
} from "@/lib/supabase/read-models";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import type {
  AdminDashboardData,
  DashboardResult,
  LaunchPlanningDashboardSnapshot,
  LeaderCurrentWeek,
  LeaderDashboardData,
  LeaderGroupDashboard,
  LeaderPipelineDashboardSummary,
  MultiplicationDashboardSummary,
  OverviewActivitySummary,
  ShepherdCareDashboardSummary,
} from "./types";
import {
  buildAdminGroupModel,
  toFollowUpItem,
  type DerivedGroupRow,
} from "./admin-group-model";
import {
  buildShepherdCareDashboardModel,
  countAllAttentionItems,
} from "@/lib/admin/shepherd-care-dashboard";
import {
  applyBaselineSilentDefaults,
  buildLaunchPlanningInputs,
  computeLaunchPlan,
  decodeLaunchPlanningAssumptions,
  participationPct,
} from "@/lib/admin/launch-planning";
import { LEADER_READINESS_STAGES } from "@/lib/admin/leader-pipeline";
import {
  overviewPeriodRange,
  type OverviewGrain,
  type OverviewPeriodRange,
} from "@/lib/admin/overview-period";
import { ADMIN_FALLBACK, LEADER_FALLBACK } from "./fallback-data";
// Phase 5B.0 swapped the dashboard's UTC isoWeekStart for a
// church-timezone-aware version so the leader workflow and the
// dashboard agree on what "this week" means.
import { isoWeekStart, churchTodayIso } from "@/lib/shared/church-time";
import {
  careCadenceWindowsFromDefaults,
  decodeMetricDefaults,
  type MetricDefaults,
} from "@/lib/admin/metrics";
import type { CareCadenceWindows } from "@/lib/admin/shepherd-care-cadence";
import { generateOccurrencesInRange } from "@/lib/calendar/occurrences";
import { eventDisplayLabel } from "@/lib/calendar/payload";
import type {
  AttendanceRecordsRow,
  GroupCalendarEventsRow,
  GroupMembershipsRow,
  GroupsRow,
  MembersRow,
} from "@/types/database";

function describeWeek(meetingWeekIso: string): string {
  const date = new Date(`${meetingWeekIso}T00:00:00Z`);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function addDaysIsoForWeek(iso: string, days: number): string {
  const anchor = new Date(`${iso}T00:00:00Z`);
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return anchor.toISOString().slice(0, 10);
}

function fallback<T>(data: T, error?: string): DashboardResult<T> {
  return { source: "fallback", data, error };
}

function live<T>(data: T): DashboardResult<T> {
  return { source: "live", data };
}

function shortenName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  return `${parts[0]} ${last.charAt(0)}.`;
}

function computeAttendanceRhythm(
  rows: { presentCount: number; absentCount: number; excusedCount: number }[]
): string {
  if (rows.length === 0) return "No recent sessions";
  const presentTotals = rows.map((r) => r.presentCount);
  const avg =
    presentTotals.reduce((sum, n) => sum + n, 0) / presentTotals.length;
  const latest = presentTotals[0];
  if (Math.abs(latest - avg) <= 1) return "Steady";
  return latest > avg ? "Growing" : "Dipping";
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

function buildShepherdCareSummary(
  shepherdDirectoryRes: Awaited<
    ReturnType<typeof fetchShepherdCareDirectoryForAdmin>
  >,
  overShepherdsRes: Awaited<ReturnType<typeof fetchOverShepherdsForAdmin>>,
  assignmentsRes: Awaited<
    ReturnType<typeof fetchActiveShepherdCoverageAssignmentsForAdmin>
  >,
  windows: CareCadenceWindows,
  todayIso: string
): ShepherdCareDashboardSummary {
  // Active over-shepherds (coaches) — the list is fetched with archived rows
  // included, so filter to active. null when that read failed, so a transient
  // error renders as "—" rather than a misleading real "0 coverage capacity".
  const activeOverShepherds = overShepherdsRes.error
    ? null
    : (overShepherdsRes.data ?? []).filter((o) => o.active).length;
  if (shepherdDirectoryRes.error || !shepherdDirectoryRes.data) {
    return {
      totalActiveShepherds: 0,
      needsAttention: 0,
      overdueTouchpoints: 0,
      notContactedRecently: 0,
      noCareProfile: 0,
      unassignedCoverage: 0,
      activeOverShepherds,
      attentionItemsTotal: 0,
      coverageAvailable: false,
      available: false,
      error: shepherdDirectoryRes.error?.message ?? "unavailable",
    };
  }
  const assignmentsAvailable = assignmentsRes.error === null;
  const model = buildShepherdCareDashboardModel({
    entries: shepherdDirectoryRes.data,
    assignments: assignmentsRes.data ?? [],
    overShepherds: overShepherdsRes.data ?? [],
    recentInteractions: [],
    todayIso,
    assignmentsAvailable,
    windows,
  });
  const attentionItemsTotal = countAllAttentionItems(
    shepherdDirectoryRes.data,
    assignmentsRes.data ?? [],
    todayIso,
    { coverageAvailable: assignmentsAvailable, windows }
  );
  return {
    totalActiveShepherds: model.summary.totalActiveShepherds,
    needsAttention: model.summary.needsAttention,
    overdueTouchpoints: model.summary.overdueTouchpoints,
    notContactedRecently: model.summary.notContactedRecently,
    noCareProfile: model.summary.noCareProfile,
    unassignedCoverage: model.summary.unassignedCoverage,
    activeOverShepherds,
    attentionItemsTotal,
    coverageAvailable: model.coverageAvailable,
    available: true,
    // If the coverage assignments read failed, surface the error so the
    // dashboard card can warn that the unassigned-coverage count and the
    // no_over_shepherd reason are suppressed — matches the explicit
    // error banner shown on /admin/shepherd-care.
    error: assignmentsAvailable
      ? null
      : (assignmentsRes.error?.message ?? "Coverage data unavailable."),
  };
}

function buildLaunchPlanningSnapshot(
  assumptionsRes: Awaited<ReturnType<typeof fetchLaunchPlanningAssumptions>>,
  derivedRows: DerivedGroupRow[],
  defaults: MetricDefaults
): LaunchPlanningDashboardSnapshot {
  // Failed assumption reads (transient DB/RLS) must surface as an
  // explicit "unavailable" state — otherwise the dashboard quietly
  // recommends a launch plan against built-in defaults while
  // /admin/launch-planning shows an error banner. The two surfaces must
  // not contradict each other.
  if (assumptionsRes.error) {
    return emptyLaunchPlanningSnapshot(assumptionsRes.error.message);
  }
  const assumptionsAvailable = assumptionsRes.data != null;
  // decodeLaunchPlanningAssumptions(null, defaults) already folds the
  // configured metric defaults (e.g. default_group_capacity ->
  // average_group_size) into the fallback, matching what
  // /admin/launch-planning uses. applyBaselineSilentDefaults then normalizes the
  // baseline-only silently-defaulted inputs (growth 0, size = default capacity,
  // buffer/leaders to defaults) EXACTLY as the deep page does (#224), so a seeded
  // row carrying growth=20 / size=10 can't make this card contradict the page.
  const assumptions = applyBaselineSilentDefaults(
    decodeLaunchPlanningAssumptions(assumptionsRes.data ?? null, defaults),
    defaults
  );
  const inputs = buildLaunchPlanningInputs({
    groups: derivedRows.map((r) => r.group),
    overrides: derivedRows
      .map((r) => r.override)
      .filter((o): o is NonNullable<typeof o> => o !== null),
    memberships: derivedRows.flatMap((r) =>
      Array.from({ length: r.activeMemberCount }, () => ({
        group_id: r.group.id,
        status: "active" as const,
      }))
    ),
    metricDefaults: defaults,
  });
  const outputs = computeLaunchPlan(assumptions, inputs);
  return {
    effectiveTotalCapacity: inputs.effective_total_capacity,
    currentParticipants: inputs.current_participants,
    projectedGroupDemand: outputs.projected_group_demand,
    capacityGap: outputs.capacity_gap,
    recommendedNewGroups: outputs.recommended_new_groups,
    estimatedNewLeadersNeeded: outputs.estimated_new_leaders_needed,
    riskLevel: outputs.risk_level,
    suggestedLaunchByDate: outputs.suggested_launch_by_date,
    unknownCapacityGroupCount: inputs.unknown_capacity_group_count,
    excludedActiveGroupCount: inputs.excluded_active_group_count,
    // Participation uses the editable church-attendance assumption as its
    // denominator (via participationPct) — the same source /admin/launch-planning
    // uses — so the landing's "% in groups" never disagrees with that page.
    currentChurchAttendance: assumptions.current_church_attendance,
    participationPct: participationPct(
      inputs.current_participants,
      assumptions.current_church_attendance
    ),
    assumptionsAvailable,
    available: true,
    error: null,
  };
}

function emptyLaunchPlanningSnapshot(
  errorMessage: string
): LaunchPlanningDashboardSnapshot {
  return {
    effectiveTotalCapacity: 0,
    currentParticipants: 0,
    projectedGroupDemand: 0,
    capacityGap: 0,
    recommendedNewGroups: 0,
    estimatedNewLeadersNeeded: 0,
    riskLevel: "ok",
    suggestedLaunchByDate: null,
    unknownCapacityGroupCount: 0,
    excludedActiveGroupCount: 0,
    currentChurchAttendance: 0,
    participationPct: null,
    assumptionsAvailable: false,
    available: false,
    error: errorMessage,
  };
}

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

// "Activity this period" rollup. groupsLaunched + guestsWelcomed come from the
// already-fetched (gated) group/guest arrays — no extra read — while the three
// productivity counts come from fetchOverviewActivityCounts and degrade to null
// if that read fails (extendedAvailable=false). Date columns are YYYY-MM-DD, so
// lexicographic comparison against the half-open [fromIso, toExclusiveIso)
// window is correct.
function buildActivitySummary(
  period: OverviewPeriodRange,
  groups: readonly { launched_on: string | null }[],
  guests: readonly { first_attended_date: string | null }[],
  activityRes: Awaited<ReturnType<typeof fetchOverviewActivityCounts>>
): OverviewActivitySummary {
  const inRange = (iso: string | null): boolean => {
    if (!iso) return false;
    if (iso >= period.toExclusiveIso) return false;
    if (period.fromIso && iso < period.fromIso) return false;
    return true;
  };
  const extended = activityRes.error ? null : activityRes.data;
  return {
    grain: period.grain,
    label: period.label,
    groupsLaunched: groups.filter((g) => inRange(g.launched_on)).length,
    guestsWelcomed: guests.filter((g) => inRange(g.first_attended_date)).length,
    membersJoined: extended ? extended.membersJoined : null,
    followUpsCompleted: extended ? extended.followUpsCompleted : null,
    careTouchpoints: extended ? extended.careTouchpoints : null,
    extendedAvailable: activityRes.error === null,
    error: activityRes.error?.message ?? null,
  };
}

// The reads the admin dashboard orchestration depends on, as one interface —
// the seam between the orchestration (the error-gate, the graceful-degrade
// branches, the pure-model wiring) and Supabase. The orchestration is a
// function of this interface, so it can be exercised through an in-memory
// adapter in a unit test instead of a live client. Each method mirrors a
// read-model fetcher with the `client` argument already applied.
type OmitClient<F> = F extends (
  client: AppSupabaseClient,
  ...rest: infer R
) => infer Ret
  ? (...rest: R) => Ret
  : never;

export type AdminDashboardReads = {
  fetchMetricDefaults: OmitClient<typeof fetchMetricDefaults>;
  fetchAllGroups: OmitClient<typeof fetchAllGroups>;
  fetchActiveGroupCount: OmitClient<typeof fetchActiveGroupCount>;
  fetchGuests: OmitClient<typeof fetchGuests>;
  fetchOpenFollowUps: OmitClient<typeof fetchOpenFollowUps>;
  fetchActiveMemberships: OmitClient<typeof fetchActiveMemberships>;
  fetchLatestHealthUpdates: OmitClient<typeof fetchLatestHealthUpdates>;
  fetchAttendanceSessions: OmitClient<typeof fetchAttendanceSessions>;
  fetchAllGroupLeaders: OmitClient<typeof fetchAllGroupLeaders>;
  fetchProfilesForAdmin: OmitClient<typeof fetchProfilesForAdmin>;
  fetchAllGroupMetricSettings: OmitClient<typeof fetchAllGroupMetricSettings>;
  fetchGroupCalendarEvents: OmitClient<typeof fetchGroupCalendarEvents>;
  fetchOverShepherdsForAdmin: OmitClient<typeof fetchOverShepherdsForAdmin>;
  fetchActiveShepherdCoverageAssignmentsForAdmin: OmitClient<
    typeof fetchActiveShepherdCoverageAssignmentsForAdmin
  >;
  fetchLaunchPlanningAssumptions: OmitClient<
    typeof fetchLaunchPlanningAssumptions
  >;
  fetchShepherdCareDirectoryForAdmin: OmitClient<
    typeof fetchShepherdCareDirectoryForAdmin
  >;
  fetchLeaderPipelineForAdmin: OmitClient<typeof fetchLeaderPipelineForAdmin>;
  fetchMultiplicationCandidatesForAdmin: OmitClient<
    typeof fetchMultiplicationCandidatesForAdmin
  >;
  fetchOverviewActivityCounts: OmitClient<typeof fetchOverviewActivityCounts>;
};

// The production adapter at the reads seam: binds the live Supabase client to
// every read-model fetcher.
export function supabaseAdminDashboardReads(
  client: AppSupabaseClient
): AdminDashboardReads {
  return {
    fetchMetricDefaults: (...a) => fetchMetricDefaults(client, ...a),
    fetchAllGroups: (...a) => fetchAllGroups(client, ...a),
    fetchActiveGroupCount: (...a) => fetchActiveGroupCount(client, ...a),
    fetchGuests: (...a) => fetchGuests(client, ...a),
    fetchOpenFollowUps: (...a) => fetchOpenFollowUps(client, ...a),
    fetchActiveMemberships: (...a) => fetchActiveMemberships(client, ...a),
    fetchLatestHealthUpdates: (...a) => fetchLatestHealthUpdates(client, ...a),
    fetchAttendanceSessions: (...a) => fetchAttendanceSessions(client, ...a),
    fetchAllGroupLeaders: (...a) => fetchAllGroupLeaders(client, ...a),
    fetchProfilesForAdmin: (...a) => fetchProfilesForAdmin(client, ...a),
    fetchAllGroupMetricSettings: (...a) =>
      fetchAllGroupMetricSettings(client, ...a),
    fetchGroupCalendarEvents: (...a) => fetchGroupCalendarEvents(client, ...a),
    fetchOverShepherdsForAdmin: (...a) =>
      fetchOverShepherdsForAdmin(client, ...a),
    fetchActiveShepherdCoverageAssignmentsForAdmin: (...a) =>
      fetchActiveShepherdCoverageAssignmentsForAdmin(client, ...a),
    fetchLaunchPlanningAssumptions: (...a) =>
      fetchLaunchPlanningAssumptions(client, ...a),
    fetchShepherdCareDirectoryForAdmin: (...a) =>
      fetchShepherdCareDirectoryForAdmin(client, ...a),
    fetchLeaderPipelineForAdmin: (...a) =>
      fetchLeaderPipelineForAdmin(client, ...a),
    fetchMultiplicationCandidatesForAdmin: (...a) =>
      fetchMultiplicationCandidatesForAdmin(client, ...a),
    fetchOverviewActivityCounts: (...a) =>
      fetchOverviewActivityCounts(client, ...a),
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
  // Period for the "activity this period" band (default all-time). Only the
  // activity rollup is period-scoped; everything else is current-state.
  const period = overviewPeriodRange(options.grain ?? "all", now);

  try {
    // Phase 5A.6: batch-fetch calendar events for the selected week so
    // the derived rows below can resolve calendar overrides without a
    // per-group round trip. We fetch a one-week window (Mon..Sun) -- the
    // override resolver narrows further.
    const weekEnd = addDaysIsoForWeek(selectedWeek, 6);
    // Pin "today" once so the shepherd-care summary uses the same
    // calendar day for needs_attention math and the dashboard for any
    // request-bound timing.
    const todayIso = currentUtcDateIso();

    // Resolve metric defaults first so the shepherd-care directory fetch
    // can bake `entry.needs_attention` against the configured
    // stale-contact window — without this, /admin would compute the
    // headline "Needs attention" count against the built-in 60-day
    // default while /admin/shepherd-care uses the configured window,
    // and the two surfaces would disagree. Mirrors the loader pattern in
    // app/(protected)/admin/shepherd-care/page.tsx.
    const metricDefaultsResult = await reads.fetchMetricDefaults();
    const defaultsForRead = decodeMetricDefaults(
      metricDefaultsResult.data ?? null
    );

    const [
      groupsResult,
      activeGroupCountResult,
      guestsResult,
      followUpsResult,
      membershipsResult,
      healthUpdatesResult,
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
      activityResult,
    ] = await Promise.all([
      reads.fetchAllGroups(),
      reads.fetchActiveGroupCount(),
      reads.fetchGuests(),
      reads.fetchOpenFollowUps({ limit: 8 }),
      reads.fetchActiveMemberships(),
      reads.fetchLatestHealthUpdates({ updateWeek: selectedWeek }),
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
      reads.fetchOverviewActivityCounts({
        fromIso: period.fromIso,
        toExclusiveIso: period.toExclusiveIso,
      }),
    ]);

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
    const shepherdDirectoryResult =
      await reads.fetchShepherdCareDirectoryForAdmin({
        todayIso,
        windows: careCadenceWindowsFromDefaults(defaultsForRead),
        delegatedShepherdIds: shepherdDelegatedIds,
      });

    const firstError =
      groupsResult.error ||
      activeGroupCountResult.error ||
      guestsResult.error ||
      followUpsResult.error ||
      membershipsResult.error ||
      healthUpdatesResult.error ||
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
      todayIso
    );
    const launchPlanning = buildLaunchPlanningSnapshot(
      launchAssumptionsResult,
      model.derivedRows,
      defaults
    );
    const leaderPipeline = buildLeaderPipelineSummary(leaderPipelineResult);
    const multiplication = buildMultiplicationSummary(multiplicationResult);
    const activity = buildActivitySummary(
      period,
      groupsResult.data ?? [],
      guestsResult.data ?? [],
      activityResult
    );

    const { derivedRows: _derivedRows, ...modelPayload } = model;
    return live({
      ...modelPayload,
      shepherdCare,
      launchPlanning,
      leaderPipeline,
      multiplication,
      activity,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fallback(ADMIN_FALLBACK, message);
  }
}

// ---------------------------------------------------------------------------
// Leader dashboard (unchanged Phase 5B.0 model)
// ---------------------------------------------------------------------------

async function buildLeaderGroupDashboard(
  client: AppSupabaseClient,
  group: GroupsRow,
  calendarEvents: GroupCalendarEventsRow[] = []
): Promise<LeaderGroupDashboard> {
  const [
    sessionsResult,
    membershipsResult,
    healthUpdatesResult,
    followUpsResult,
  ] = await Promise.all([
    fetchAttendanceSessions(client, { groupId: group.id, limit: 8 }),
    fetchActiveMemberships(client, { groupId: group.id }),
    fetchLatestHealthUpdates(client, { groupId: group.id }),
    fetchOpenFollowUps(client, { groupId: group.id, limit: 6 }),
  ]);

  const firstError =
    sessionsResult.error ||
    membershipsResult.error ||
    healthUpdatesResult.error ||
    followUpsResult.error;
  if (firstError) throw firstError;

  const sessions = sessionsResult.data ?? [];
  const memberships = membershipsResult.data ?? [];
  const healthUpdates = healthUpdatesResult.data ?? [];
  const followUps = followUpsResult.data ?? [];

  const memberIds = memberships.map((m: GroupMembershipsRow) => m.member_id);
  const membersResult = await fetchMembersByIds(client, memberIds);
  if (membersResult.error) throw membersResult.error;
  const members = (membersResult.data ?? []) as MembersRow[];

  let recordsByMember: AttendanceRecordsRow[] = [];
  if (sessions.length > 0) {
    const recordsResult = await fetchAttendanceRecordsForSessions(
      client,
      sessions.map((s) => s.id)
    );
    if (recordsResult.error) throw recordsResult.error;
    recordsByMember = recordsResult.data ?? [];
  }

  const recentSessions = sessions.slice(0, 4).map((session) => {
    const recs = recordsByMember.filter((r) => r.session_id === session.id);
    return {
      meetingWeek: session.meeting_week,
      status: session.status,
      presentCount: recs.filter((r) => r.attendance_status === "present")
        .length,
      absentCount: recs.filter((r) => r.attendance_status === "absent").length,
      excusedCount: recs.filter((r) => r.attendance_status === "excused")
        .length,
    };
  });

  const latestHealth = healthUpdates[0];
  const currentWeekIso = isoWeekStart(new Date());
  // The leader card header is always anchored to "this calendar week" so
  // the workflow date doesn't drift backwards on weeks where a leader
  // hasn't submitted yet.
  const latestWeekIso = currentWeekIso;

  const currentWeekSession =
    sessions.find((s) => s.meeting_week === currentWeekIso) ?? null;
  const currentWeekRecords = currentWeekSession
    ? recordsByMember.filter((r) => r.session_id === currentWeekSession.id)
    : [];

  const newGuestsResult = await fetchNewGuestsForGroupSince(
    client,
    group.id,
    currentWeekIso
  );
  if (newGuestsResult.error) throw newGuestsResult.error;
  const newGuestsThisWeek = (newGuestsResult.data ?? []).length;

  const followUpItems = followUps.map((row: LeaderFollowUpRow) =>
    toFollowUpItem(row, new Map([[group.id, group]]))
  );

  const memberList = members
    .map((m) => ({ id: m.id, displayName: shortenName(m.full_name) }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  const rhythm = computeAttendanceRhythm(recentSessions);

  const currentWeek: LeaderCurrentWeek = {
    meetingWeek: currentWeekIso,
    status: currentWeekSession?.status ?? "not_submitted",
    alreadySubmitted:
      currentWeekSession?.status === "submitted" ||
      currentWeekSession?.status === "did_not_meet" ||
      currentWeekSession?.status === "planned_pause" ||
      currentWeekSession?.status === "admin_entered",
    presentCount: currentWeekRecords.filter(
      (r) => r.attendance_status === "present"
    ).length,
    absentCount: currentWeekRecords.filter(
      (r) => r.attendance_status === "absent"
    ).length,
    excusedCount: currentWeekRecords.filter(
      (r) => r.attendance_status === "excused"
    ).length,
    meetingDate: currentWeekSession?.meeting_date ?? null,
    submittedAt: currentWeekSession?.submitted_at ?? null,
    leaderNote: currentWeekSession?.leader_note ?? null,
  };

  // Upcoming-events strip: at most 2 upcoming events from today onwards.
  // Phase 5A.6 correction: after dropping form-first event creation,
  // default meetings are generated from the group's schedule and
  // typically have no DB row. The strip must include those generated
  // occurrences so a group that meets weekly and has no explicit
  // overrides still shows "next up" entries. Saved override rows merge
  // onto the same date and replace the gathering type / status. OFF /
  // cancelled overrides are kept in the list so the leader can see what
  // they previously published. Meeting time is always inherited from
  // the group schedule.
  //
  // The floor is today's church-local calendar date so a Wednesday view
  // doesn't show Monday's already-past meeting; the ceiling is the same
  // 8-week horizon used by the calendar fetch so the merge is complete.
  const todayIso = churchTodayIso();
  const horizonEndIso = addDaysIsoForWeek(todayIso, 8 * 7);
  const generated = generateOccurrencesInRange(
    {
      meetingDay: group.meeting_day,
      meetingTime: group.meeting_time,
      meetingFrequency: group.meeting_frequency,
      meetingWeekParity: group.meeting_week_parity,
    },
    todayIso,
    horizonEndIso
  );
  const overridesByDate = new Map<string, GroupCalendarEventsRow>();
  for (const e of calendarEvents) {
    if (e.archived_at != null) continue;
    if (e.event_date < todayIso) continue;
    overridesByDate.set(e.event_date, e);
  }
  const dates = new Set<string>([
    ...generated.map((g) => g.date),
    ...overridesByDate.keys(),
  ]);
  const upcomingEvents = Array.from(dates)
    .sort()
    .slice(0, 2)
    .map((date) => {
      const override = overridesByDate.get(date);
      if (override) {
        return {
          date,
          label: eventDisplayLabel({
            title: override.title,
            event_type: override.event_type,
          }),
          status: override.status,
          startTime: group.meeting_time,
        };
      }
      return {
        date,
        label: eventDisplayLabel({ title: null, event_type: "study" }),
        status: "scheduled" as const,
        startTime: group.meeting_time,
      };
    });

  return {
    group: {
      groupId: group.id,
      name: group.name,
      meetingDay: group.meeting_day,
      meetingTime: group.meeting_time,
      lifecycleStatus: group.lifecycle_status,
      healthStatus: latestHealth?.pulse ?? group.health_status,
      capacity: group.capacity,
      activeMembers: memberships.length,
      weekLabel: `Week of ${describeWeek(latestWeekIso)}`,
      members: memberList,
    },
    recentSessions,
    healthPulse: {
      attendanceRhythm: rhythm,
      newGuestsThisWeek,
      currentHealth: latestHealth?.pulse ?? group.health_status,
      leaderNote: latestHealth?.leader_note ?? null,
    },
    followUps: followUpItems,
    currentWeek,
    upcomingEvents,
  };
}

export async function getLeaderDashboardData(
  client: AppSupabaseClient | null,
  options: { assignedGroupIds: readonly string[] }
): Promise<DashboardResult<LeaderDashboardData>> {
  if (!client) return fallback(LEADER_FALLBACK);
  if (options.assignedGroupIds.length === 0) return live({ groups: [] });

  try {
    const todayIso = isoWeekStart(new Date());
    const horizonEnd = addDaysIsoForWeek(todayIso, 8 * 7);
    const [groupsResult, calendarEventsResult] = await Promise.all([
      fetchGroupsByIds(client, [...options.assignedGroupIds]),
      fetchGroupCalendarEvents(client, {
        groupIds: [...options.assignedGroupIds],
        fromDate: todayIso,
        toDate: horizonEnd,
        includeArchived: false,
      }),
    ]);
    if (groupsResult.error)
      return fallback(LEADER_FALLBACK, groupsResult.error.message);
    if (calendarEventsResult.error)
      return fallback(LEADER_FALLBACK, calendarEventsResult.error.message);
    const groups = groupsResult.data ?? [];
    if (groups.length === 0) return live({ groups: [] });

    const eventsByGroup = new Map<string, GroupCalendarEventsRow[]>();
    for (const e of calendarEventsResult.data ?? []) {
      const list = eventsByGroup.get(e.group_id) ?? [];
      list.push(e);
      eventsByGroup.set(e.group_id, list);
    }

    const dashboards = await Promise.all(
      groups.map((g) =>
        buildLeaderGroupDashboard(client, g, eventsByGroup.get(g.id) ?? [])
      )
    );
    return live({ groups: dashboards });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fallback(LEADER_FALLBACK, message);
  }
}
