import {
  fetchActiveGroupCount,
  fetchActiveMemberships,
  fetchActiveShepherdCoverageAssignmentsForAdmin,
  fetchAllGroupLeaders,
  fetchAllGroupMetricSettings,
  fetchAllGroups,
  fetchAttendanceRecordsForSessions,
  fetchAttendanceSessions,
  fetchGroupCalendarEvents,
  fetchGroupHealthAssessmentRatings,
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
  fetchOpenFollowUpsDueCount,
  fetchOverShepherdsForAdmin,
  fetchProfilesForAdmin,
  fetchShepherdCareDirectoryRowsForAdmin,
  buildCareDirectoryEntries,
  type ShepherdCareDirectoryEntry,
  type LeaderFollowUpRow,
} from "@/lib/supabase/read-models";
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
import { bindReads, type OmitClient } from "@/lib/supabase/reads-seam";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import type {
  AdminDashboardData,
  DashboardResult,
  LeaderCurrentWeek,
  LeaderDashboardData,
  LeaderGroupDashboard,
  LeaderPipelineDashboardSummary,
  MultiplicationDashboardSummary,
  ShepherdCareDashboardSummary,
} from "./types";
import { buildAdminGroupModel, toFollowUpItem } from "./admin-group-model";
import { buildLaunchPlanningSnapshot } from "./launch-planning-snapshot";
import { buildShepherdCareSummary } from "./shepherd-care-summary";
import { LEADER_READINESS_STAGES } from "@/lib/admin/leader-pipeline";
import type { OverviewGrain } from "@/lib/admin/overview-period";
import { ADMIN_FALLBACK, LEADER_FALLBACK } from "./fallback-data";
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

// The reads the admin dashboard orchestration depends on, as one interface —
// the seam between the orchestration (the error-gate, the graceful-degrade
// branches, the pure-model wiring) and Supabase. The orchestration is a
// function of this interface, so it can be exercised through an in-memory
// adapter in a unit test instead of a live client. Each method mirrors a
// read-model fetcher with the `client` argument already applied. The
// `OmitClient` / `bindReads` scaffold now lives in `lib/supabase/reads-seam.ts`
// so every surface shares it (ADR 0015).
export type AdminDashboardReads = {
  fetchMetricDefaults: OmitClient<typeof fetchMetricDefaults>;
  fetchAllGroups: OmitClient<typeof fetchAllGroups>;
  fetchActiveGroupCount: OmitClient<typeof fetchActiveGroupCount>;
  fetchGuests: OmitClient<typeof fetchGuests>;
  fetchOpenFollowUps: OmitClient<typeof fetchOpenFollowUps>;
  fetchOpenFollowUpsDueCount: OmitClient<typeof fetchOpenFollowUpsDueCount>;
  fetchActiveMemberships: OmitClient<typeof fetchActiveMemberships>;
  fetchLatestHealthUpdates: OmitClient<typeof fetchLatestHealthUpdates>;
  fetchGroupHealthAssessmentRatings: OmitClient<
    typeof fetchGroupHealthAssessmentRatings
  >;
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
  fetchShepherdCareDirectoryRowsForAdmin: OmitClient<
    typeof fetchShepherdCareDirectoryRowsForAdmin
  >;
  fetchLeaderPipelineForAdmin: OmitClient<typeof fetchLeaderPipelineForAdmin>;
  fetchMultiplicationCandidatesForAdmin: OmitClient<
    typeof fetchMultiplicationCandidatesForAdmin
  >;
  fetchAttentionResetBaselines: OmitClient<typeof fetchAttentionResetBaselines>;
};

// The production adapter at the reads seam: binds the live Supabase client to
// every read-model fetcher via the shared `bindReads` scaffold (ADR 0015).
export function supabaseAdminDashboardReads(
  client: AppSupabaseClient
): AdminDashboardReads {
  return {
    ...bindReads(client, {
      fetchMetricDefaults: fetchMetricDefaultsCached,
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
    }),
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

// ---------------------------------------------------------------------------
// Leader dashboard (unchanged Phase 5B.0 model)
// ---------------------------------------------------------------------------

async function buildLeaderGroupDashboard(
  client: AppSupabaseClient,
  group: GroupsRow,
  calendarEvents: GroupCalendarEventsRow[] = []
): Promise<LeaderGroupDashboard> {
  // The leader card header is always anchored to "this calendar week" so the
  // workflow date doesn't drift backwards on weeks where a leader hasn't
  // submitted yet. Computed up front so the new-guests count (which only needs
  // the group id + week) can join the first parallel batch instead of trailing
  // it on its own round trip.
  const currentWeekIso = isoWeekStart(new Date());

  const [
    sessionsResult,
    membershipsResult,
    healthUpdatesResult,
    followUpsResult,
    newGuestsResult,
  ] = await Promise.all([
    fetchAttendanceSessions(client, { groupId: group.id, limit: 8 }),
    fetchActiveMemberships(client, { groupId: group.id }),
    fetchLatestHealthUpdates(client, { groupId: group.id }),
    fetchOpenFollowUps(client, { groupId: group.id, limit: 6 }),
    fetchNewGuestsForGroupSince(client, group.id, currentWeekIso),
  ]);

  const firstError =
    sessionsResult.error ||
    membershipsResult.error ||
    healthUpdatesResult.error ||
    followUpsResult.error ||
    newGuestsResult.error;
  if (firstError) throw firstError;

  const sessions = sessionsResult.data ?? [];
  const memberships = membershipsResult.data ?? [];
  const healthUpdates = healthUpdatesResult.data ?? [];
  const followUps = followUpsResult.data ?? [];
  const newGuestsThisWeek = (newGuestsResult.data ?? []).length;

  // Both follow-on reads depend only on the first batch's results (member ids
  // from memberships, session ids from sessions) and not on each other, so they
  // run in parallel rather than as two sequential round trips.
  const memberIds = memberships.map((m: GroupMembershipsRow) => m.member_id);
  const [membersResult, recordsResult] = await Promise.all([
    fetchMembersByIds(client, memberIds),
    sessions.length > 0
      ? fetchAttendanceRecordsForSessions(
          client,
          sessions.map((s) => s.id)
        )
      : Promise.resolve({ data: [] as AttendanceRecordsRow[], error: null }),
  ]);
  if (membersResult.error) throw membersResult.error;
  if (recordsResult.error) throw recordsResult.error;
  const members = (membersResult.data ?? []) as MembersRow[];
  const recordsByMember: AttendanceRecordsRow[] = recordsResult.data ?? [];

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
  const latestWeekIso = currentWeekIso;

  const currentWeekSession =
    sessions.find((s) => s.meeting_week === currentWeekIso) ?? null;
  const currentWeekRecords = currentWeekSession
    ? recordsByMember.filter((r) => r.session_id === currentWeekSession.id)
    : [];

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
  const horizonEndIso = addDaysIso(todayIso, 8 * 7);
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
    const horizonEnd = addDaysIso(todayIso, 8 * 7);
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
