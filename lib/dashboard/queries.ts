import {
  GUEST_PIPELINE_STAGES,
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
  fetchMembersByIds,
  fetchMetricDefaults,
  fetchNewGuestsForGroupSince,
  fetchOpenFollowUps,
  fetchOverShepherdsForAdmin,
  fetchProfilesForAdmin,
  fetchShepherdCareDirectoryForAdmin,
  type LeaderFollowUpRow,
} from "@/lib/supabase/read-models";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import type {
  AdminDashboardData,
  AttentionItem,
  AttentionReason,
  CapacityGroupRow,
  CapacitySource,
  CapacitySummary,
  DashboardResult,
  FollowUpItem,
  HealthBucket,
  HealthGroupRow,
  HealthSummary,
  LaunchPlanningDashboardSnapshot,
  LeaderCurrentWeek,
  LeaderDashboardData,
  LeaderGroupDashboard,
  PipelineStageCount,
  SetupGap,
  SetupGapRow,
  SetupGaps,
  ShepherdCareDashboardSummary,
} from "./types";
import {
  buildShepherdCareDashboardModel,
  countAllAttentionItems,
} from "@/lib/admin/shepherd-care-dashboard";
import {
  buildLaunchPlanningInputs,
  computeLaunchPlan,
  decodeLaunchPlanningAssumptions,
} from "@/lib/admin/launch-planning";
import { ADMIN_FALLBACK, LEADER_FALLBACK } from "./fallback-data";
import { pipelineStageLabel } from "./labels";
// Phase 5B.0 swapped the dashboard's UTC isoWeekStart for a
// church-timezone-aware version so the leader workflow and the
// dashboard agree on what "this week" means.
import { isoWeekStart, localTodayIso } from "@/lib/leader/validation";
import { formatWeekLabel } from "@/lib/admin/check-ins";
import {
  capacityStatus as computeCapacityStatus,
  careCadenceWindowsFromDefaults,
  decodeMetricDefaults,
  effectiveCapacity as computeEffectiveCapacity,
  effectiveCapacityFullPct,
  effectiveCapacityWarningPct,
  effectiveHealthStatus,
  hasActiveOverrides,
  isExcludedFromCapacityMetrics,
  unknownCapacity as computeUnknownCapacity,
  type CapacityStatus,
  type MetricDefaults,
} from "@/lib/admin/metrics";
import type { CareCadenceWindows } from "@/lib/admin/shepherd-care-cadence";
import {
  buildCalendarEventsByGroup,
  computeCheckInDue,
  expectedMeetingDateForWeek,
  formatCheckInDueLabel,
  formatCheckInDueRelative,
  pickCalendarOverrideForOccurrence,
} from "@/lib/admin/check-in-due";
import { generateOccurrencesInRange } from "@/lib/calendar/occurrences";
import { eventDisplayLabel } from "@/lib/calendar/payload";
import type {
  AttendanceRecordsRow,
  AttendanceSessionsRow,
  GroupCalendarEventsRow,
  GroupHealthUpdatesRow,
  GroupLeadersRow,
  GroupMembershipsRow,
  GroupMetricSettingsRow,
  GroupsRow,
  MembersRow,
  ProfilesRow,
} from "@/types/database";
import type {
  AttendanceSessionStatus,
  GroupHealthStatus,
  GuestPipelineStage,
} from "@/types/enums";

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

function countPipeline(
  stages: GuestPipelineStage[],
  all: { pipeline_stage: GuestPipelineStage }[],
): PipelineStageCount[] {
  return stages.map((stage) => ({
    stage,
    label: pipelineStageLabel(stage),
    count: all.filter((g) => g.pipeline_stage === stage).length,
  }));
}

function toFollowUpItem(
  row: LeaderFollowUpRow,
  groupsById: Map<string, GroupsRow>,
): FollowUpItem {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    priority: row.priority,
    status: row.status,
    dueDate: row.due_date,
    relatedGroupName: row.related_group_id
      ? groupsById.get(row.related_group_id)?.name ?? null
      : null,
  };
}

function shortenName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  return `${parts[0]} ${last.charAt(0)}.`;
}

function computeAttendanceRhythm(
  rows: { presentCount: number; absentCount: number; excusedCount: number }[],
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

function resolveCapacitySource(
  group: GroupsRow,
  override: GroupMetricSettingsRow | null,
  defaults: MetricDefaults,
): CapacitySource {
  if (override?.capacity_override != null) return "override";
  if (group.capacity != null) return "group";
  if (defaults.default_group_capacity != null) return "default";
  return "unknown";
}

// One per non-closed group. Every section of the dashboard partitions this
// list -- there is no per-section recomputation of capacity or health.
// Exported (alongside collectReasonsFor) only so the attention-set
// regression test can build a typed fixture row.
export type DerivedGroupRow = {
  group: GroupsRow;
  override: GroupMetricSettingsRow | null;
  activeMemberCount: number;
  effectiveCapacityValue: number | null;
  capacitySource: CapacitySource;
  isCapacityUnknown: boolean;
  isExcluded: boolean;
  warningPct: number;
  fullPct: number;
  capacityStatusValue: CapacityStatus;
  utilizationPct: number | null;
  effectiveHealth: GroupHealthStatus;
  hasManualHealthOverride: boolean;
  session: AttendanceSessionsRow | null;
  sessionStatus: AttendanceSessionStatus | "no_session";
  healthUpdate: GroupHealthUpdatesRow | null;
  followUpNeeded: boolean;
  leaderNames: string[];
  hasLeader: boolean;
  hasMeetingDayTime: boolean;
  hasCapacityConfigured: boolean;
  followUpsForGroup: LeaderFollowUpRow[];
  dueLabel: string | null;
  dueRelative: string | null;
  isOverdue: boolean;
  isScheduledThisWeek: boolean;
};

// Julian admin OS pivot (2026-05): missing_check_in dropped from priority
// 20 to 65 so a weekly-cadence signal never outranks shepherd-care or
// capacity reasons on the landing dashboard. The Check-ins page still
// surfaces it as its primary signal; the dashboard just stops leading
// with it.
const ATTENTION_PRIORITY: Record<AttentionReason, number> = {
  follow_up_open: 10,
  capacity_full: 30,
  capacity_warning: 40,
  health_needs_follow_up: 50,
  health_watch: 60,
  missing_check_in: 65,
  capacity_unknown: 70,
  no_leader: 80,
  no_members: 90,
  missing_meeting_day_time: 100,
};

const ATTENTION_LABELS: Record<AttentionReason, string> = {
  follow_up_open: "Open follow-up",
  missing_check_in: "Missing check-in",
  capacity_full: "At capacity",
  capacity_warning: "Near capacity",
  health_needs_follow_up: "Needs follow-up",
  health_watch: "Watch",
  capacity_unknown: "Capacity unknown",
  no_leader: "No active leader",
  no_members: "No active members",
  missing_meeting_day_time: "Missing meeting day or time",
};

export function attentionReasonLabel(reason: AttentionReason): string {
  return ATTENTION_LABELS[reason];
}

function buildLeaderNames(
  groupId: string,
  leaders: GroupLeadersRow[],
  profilesById: Map<string, ProfilesRow>,
): string[] {
  const ranked = leaders
    .filter((l) => l.group_id === groupId)
    .sort((a, b) => {
      // Primary leaders first, then co-leaders, alphabetical within each.
      if (a.role !== b.role) return a.role === "leader" ? -1 : 1;
      const an = profilesById.get(a.profile_id)?.full_name ?? "";
      const bn = profilesById.get(b.profile_id)?.full_name ?? "";
      return an.localeCompare(bn);
    });
  return ranked
    .map((l) => profilesById.get(l.profile_id)?.full_name)
    .filter((n): n is string => Boolean(n));
}

function determineSessionStatus(
  session: AttendanceSessionsRow | null,
): AttendanceSessionStatus | "no_session" {
  if (!session) return "no_session";
  return session.status;
}

function isMissingForWeek(
  status: AttendanceSessionStatus | "no_session",
): boolean {
  return status === "no_session" || status === "not_submitted";
}

function isSubmittedForWeek(
  status: AttendanceSessionStatus | "no_session",
): boolean {
  return status === "submitted" || status === "admin_entered";
}

function pickHealthBucket(row: DerivedGroupRow): HealthBucket {
  // Precedence: health override / follow-up flag → watch → session lifecycle
  // signals → submitted vs missing → healthy default.
  if (
    row.effectiveHealth === "needs_follow_up" ||
    row.followUpNeeded ||
    row.healthUpdate?.follow_up_needed === true
  ) {
    return "needs_follow_up";
  }
  if (row.effectiveHealth === "watch") return "watch";
  if (row.sessionStatus === "planned_pause") return "planned_pause";
  if (row.sessionStatus === "did_not_meet") return "did_not_meet";
  // Off-parity bi-weekly groups aren't expected to meet this week; they
  // fall through to "healthy" rather than "missing".
  if (isMissingForWeek(row.sessionStatus) && row.isScheduledThisWeek) {
    return "missing";
  }
  if (isSubmittedForWeek(row.sessionStatus)) return "submitted";
  return "healthy";
}

function utilizationFor(
  activeMembers: number,
  effectiveCap: number | null,
): number | null {
  if (effectiveCap == null || effectiveCap <= 0) return null;
  return Math.round((activeMembers / effectiveCap) * 1000) / 10;
}

function buildAttentionDetail(
  reason: AttentionReason,
  row: DerivedGroupRow,
  followUpsCount: number,
): string {
  switch (reason) {
    case "follow_up_open":
      return followUpsCount === 1
        ? "1 open follow-up"
        : `${followUpsCount} open follow-ups`;
    case "missing_check_in":
      return "No check-in submitted for the selected week";
    case "capacity_full":
      return row.effectiveCapacityValue != null
        ? `${row.activeMemberCount} / ${row.effectiveCapacityValue} active members`
        : `${row.activeMemberCount} active members`;
    case "capacity_warning":
      return row.effectiveCapacityValue != null
        ? `${row.activeMemberCount} / ${row.effectiveCapacityValue} active members`
        : `${row.activeMemberCount} active members`;
    case "health_needs_follow_up":
      return "Health pulse flagged for follow-up";
    case "health_watch":
      return "Health pulse on watch";
    case "capacity_unknown":
      return "No capacity configured (override, group, or default)";
    case "no_leader":
      return "No active leader assigned";
    case "no_members":
      return "No active members on the roster";
    case "missing_meeting_day_time":
      return row.group.meeting_day || row.group.meeting_time
        ? "Meeting day or time still missing"
        : "Meeting day and time not set";
  }
}

// Exported for the attention-set regression test that pins the removal of
// the dead missing_check_in signal (see lib/dashboard/__tests__).
export function collectReasonsFor(row: DerivedGroupRow): AttentionReason[] {
  const reasons: AttentionReason[] = [];
  if (row.followUpsForGroup.length > 0) reasons.push("follow_up_open");
  // Shepherd→admin reporting loop removed per
  // docs/adr/0002-oversight-ladder-and-leader-gating.md: with the leader
  // surface gated, nobody submits check-ins, so attendance_sessions stop
  // receiving rows and "missing_check_in" would flag every scheduled group
  // forever. The reason is no longer surfaced on the dashboard. The
  // missing_check_in enum value, label, priority and detail copy are kept
  // dormant (the /admin/check-ins page still resolves by direct URL).
  if (!row.isExcluded) {
    if (row.capacityStatusValue === "full") reasons.push("capacity_full");
    else if (row.capacityStatusValue === "warning")
      reasons.push("capacity_warning");
    else if (row.capacityStatusValue === "unknown")
      reasons.push("capacity_unknown");
  }
  if (row.effectiveHealth === "needs_follow_up")
    reasons.push("health_needs_follow_up");
  else if (row.effectiveHealth === "watch") reasons.push("health_watch");
  if (!row.hasLeader) reasons.push("no_leader");
  if (row.activeMemberCount === 0) reasons.push("no_members");
  if (!row.hasMeetingDayTime) reasons.push("missing_meeting_day_time");
  // Sort by ladder so primary reason wins.
  reasons.sort((a, b) => ATTENTION_PRIORITY[a] - ATTENTION_PRIORITY[b]);
  return reasons;
}

function toCapacityGroupRow(row: DerivedGroupRow): CapacityGroupRow {
  return {
    groupId: row.group.id,
    name: row.group.name,
    activeMembers: row.activeMemberCount,
    effectiveCapacity: row.effectiveCapacityValue,
    capacitySource: row.capacitySource,
    utilizationPct: row.utilizationPct,
    status: row.capacityStatusValue,
    warningPct: row.warningPct,
    fullPct: row.fullPct,
    hasManualHealthOverride: row.hasManualHealthOverride,
    healthStatus: row.effectiveHealth,
    excluded: row.isExcluded,
  };
}

function toHealthGroupRow(row: DerivedGroupRow): HealthGroupRow {
  return {
    groupId: row.group.id,
    name: row.group.name,
    sessionStatus: row.sessionStatus,
    healthStatus: row.effectiveHealth,
    followUpNeeded:
      row.followUpNeeded || row.healthUpdate?.follow_up_needed === true,
    leaderNames: row.leaderNames,
  };
}

function buildCapacitySummary(rows: DerivedGroupRow[]): CapacitySummary {
  const buckets: Record<
    "full" | "warning" | "ok" | "unknown" | "excluded",
    CapacityGroupRow[]
  > = {
    full: [],
    warning: [],
    ok: [],
    unknown: [],
    excluded: [],
  };
  for (const r of rows) {
    if (r.group.lifecycle_status === "closed") continue;
    if (r.group.lifecycle_status !== "active") continue;
    // Julian P2: a group kept open past capacity is intentional, not a
    // problem, so it folds into the "ok" bucket for summary counts while
    // the per-row status still reads "open_by_choice" for its badge.
    const bucketKey: "full" | "warning" | "ok" | "unknown" | "excluded" =
      r.capacityStatusValue === "open_by_choice" ? "ok" : r.capacityStatusValue;
    buckets[bucketKey].push(toCapacityGroupRow(r));
  }
  const byUtilDesc = (a: CapacityGroupRow, b: CapacityGroupRow) => {
    const au = a.utilizationPct ?? -1;
    const bu = b.utilizationPct ?? -1;
    if (au !== bu) return bu - au;
    return a.name.localeCompare(b.name);
  };
  buckets.full.sort(byUtilDesc);
  buckets.warning.sort(byUtilDesc);
  buckets.ok.sort(byUtilDesc);
  buckets.unknown.sort((a, b) => a.name.localeCompare(b.name));
  buckets.excluded.sort((a, b) => a.name.localeCompare(b.name));
  return {
    full: buckets.full,
    warning: buckets.warning,
    ok: buckets.ok,
    unknown: buckets.unknown,
    excluded: buckets.excluded,
    counts: {
      full: buckets.full.length,
      warning: buckets.warning.length,
      ok: buckets.ok.length,
      unknown: buckets.unknown.length,
      excluded: buckets.excluded.length,
    },
  };
}

function buildHealthSummary(rows: DerivedGroupRow[]): HealthSummary {
  const buckets: Record<HealthBucket, HealthGroupRow[]> = {
    submitted: [],
    missing: [],
    did_not_meet: [],
    planned_pause: [],
    needs_follow_up: [],
    watch: [],
    healthy: [],
  };
  for (const r of rows) {
    if (r.group.lifecycle_status === "closed") continue;
    const bucket = pickHealthBucket(r);
    buckets[bucket].push(toHealthGroupRow(r));
  }
  const sortByName = (a: HealthGroupRow, b: HealthGroupRow) =>
    a.name.localeCompare(b.name);
  for (const key of Object.keys(buckets) as HealthBucket[]) {
    buckets[key].sort(sortByName);
  }
  return {
    submitted: buckets.submitted,
    missing: buckets.missing,
    didNotMeet: buckets.did_not_meet,
    plannedPause: buckets.planned_pause,
    needsFollowUp: buckets.needs_follow_up,
    watch: buckets.watch,
    healthy: buckets.healthy,
    counts: {
      submitted: buckets.submitted.length,
      missing: buckets.missing.length,
      did_not_meet: buckets.did_not_meet.length,
      planned_pause: buckets.planned_pause.length,
      needs_follow_up: buckets.needs_follow_up.length,
      watch: buckets.watch.length,
      healthy: buckets.healthy.length,
    },
  };
}

function buildSetupGaps(rows: DerivedGroupRow[]): SetupGaps {
  const noCapacity: SetupGapRow[] = [];
  const noLeader: SetupGapRow[] = [];
  const noMeetingDayTime: SetupGapRow[] = [];
  const noMembers: SetupGapRow[] = [];
  for (const r of rows) {
    if (r.group.lifecycle_status === "closed") continue;
    const gaps: SetupGap[] = [];
    if (!r.hasCapacityConfigured) gaps.push("capacity");
    if (!r.hasLeader) gaps.push("leader");
    if (!r.hasMeetingDayTime) gaps.push("meeting_day_time");
    if (r.activeMemberCount === 0) gaps.push("members");
    if (gaps.length === 0) continue;
    const setupRow: SetupGapRow = {
      groupId: r.group.id,
      name: r.group.name,
      gaps,
      hasExclusion: r.isExcluded,
      isCapacityUnknown: r.isCapacityUnknown,
    };
    if (gaps.includes("capacity")) noCapacity.push(setupRow);
    if (gaps.includes("leader")) noLeader.push(setupRow);
    if (gaps.includes("meeting_day_time")) noMeetingDayTime.push(setupRow);
    if (gaps.includes("members")) noMembers.push(setupRow);
  }
  const byName = (a: SetupGapRow, b: SetupGapRow) =>
    a.name.localeCompare(b.name);
  noCapacity.sort(byName);
  noLeader.sort(byName);
  noMeetingDayTime.sort(byName);
  noMembers.sort(byName);
  return {
    noCapacity,
    noLeader,
    noMeetingDayTime,
    noMembers,
    counts: {
      noCapacity: noCapacity.length,
      noLeader: noLeader.length,
      noMeetingDayTime: noMeetingDayTime.length,
      noMembers: noMembers.length,
    },
  };
}

function buildAttentionItems(rows: DerivedGroupRow[]): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const r of rows) {
    if (r.group.lifecycle_status === "closed") continue;
    const reasons = collectReasonsFor(r);
    if (reasons.length === 0) continue;
    const primary = reasons[0];
    items.push({
      groupId: r.group.id,
      groupName: r.group.name,
      reason: primary,
      secondaryReasons: reasons.slice(1),
      detail: buildAttentionDetail(primary, r, r.followUpsForGroup.length),
      priority: ATTENTION_PRIORITY[primary],
      lifecycleStatus: r.group.lifecycle_status,
      leaderNames: r.leaderNames,
      meetingDay: r.group.meeting_day,
      meetingTime: r.group.meeting_time,
      effectiveCapacity: r.effectiveCapacityValue,
      activeMemberCount: r.activeMemberCount,
      sessionStatus: r.sessionStatus,
      excludedFromCapacity: r.isExcluded,
      dueLabel: r.dueLabel,
      dueRelative: r.dueRelative,
      isOverdue: r.isOverdue,
    });
  }
  items.sort(
    (a, b) =>
      a.priority - b.priority || a.groupName.localeCompare(b.groupName),
  );
  return items;
}

function buildShepherdCareSummary(
  shepherdDirectoryRes: Awaited<
    ReturnType<typeof fetchShepherdCareDirectoryForAdmin>
  >,
  overShepherdsRes: Awaited<ReturnType<typeof fetchOverShepherdsForAdmin>>,
  assignmentsRes: Awaited<
    ReturnType<typeof fetchActiveShepherdCoverageAssignmentsForAdmin>
  >,
  windows: CareCadenceWindows,
  todayIso: string,
): ShepherdCareDashboardSummary {
  if (shepherdDirectoryRes.error || !shepherdDirectoryRes.data) {
    return {
      totalActiveShepherds: 0,
      needsAttention: 0,
      overdueTouchpoints: 0,
      notContactedRecently: 0,
      noCareProfile: 0,
      unassignedCoverage: 0,
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
    { coverageAvailable: assignmentsAvailable, windows },
  );
  return {
    totalActiveShepherds: model.summary.totalActiveShepherds,
    needsAttention: model.summary.needsAttention,
    overdueTouchpoints: model.summary.overdueTouchpoints,
    notContactedRecently: model.summary.notContactedRecently,
    noCareProfile: model.summary.noCareProfile,
    unassignedCoverage: model.summary.unassignedCoverage,
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
  defaults: MetricDefaults,
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
  // /admin/launch-planning uses. Always use the decoded value so the
  // dashboard and the deep page agree in unseeded environments.
  const assumptions = decodeLaunchPlanningAssumptions(
    assumptionsRes.data ?? null,
    defaults,
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
      })),
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
    assumptionsAvailable,
    available: true,
    error: null,
  };
}

function emptyLaunchPlanningSnapshot(
  errorMessage: string,
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
    assumptionsAvailable: false,
    available: false,
    error: errorMessage,
  };
}

export async function getAdminDashboardData(
  client: AppSupabaseClient | null,
  options: { selectedWeek?: string; now?: Date } = {},
): Promise<DashboardResult<AdminDashboardData>> {
  if (!client) return fallback(ADMIN_FALLBACK);

  const now = options.now ?? new Date();
  const currentWeek = isoWeekStart(now);
  const selectedWeek = options.selectedWeek ?? currentWeek;

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
    const metricDefaultsResult = await fetchMetricDefaults(client);
    const defaultsForRead = decodeMetricDefaults(
      metricDefaultsResult.data ?? null,
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
      shepherdDirectoryResult,
      overShepherdsResult,
      shepherdAssignmentsResult,
      launchAssumptionsResult,
    ] = await Promise.all([
      fetchAllGroups(client),
      fetchActiveGroupCount(client),
      fetchGuests(client),
      fetchOpenFollowUps(client, { limit: 8 }),
      fetchActiveMemberships(client),
      fetchLatestHealthUpdates(client, { updateWeek: selectedWeek }),
      fetchAttendanceSessions(client, { meetingWeek: selectedWeek }),
      fetchAllGroupLeaders(client, { activeOnly: true }),
      fetchProfilesForAdmin(client),
      fetchAllGroupMetricSettings(client),
      fetchGroupCalendarEvents(client, {
        fromDate: selectedWeek,
        toDate: weekEnd,
        includeArchived: false,
      }),
      // Julian admin-OS spine reads. Failures here degrade gracefully —
      // the dashboard surfaces "unavailable" cards rather than failing
      // the whole page.
      fetchShepherdCareDirectoryForAdmin(client, {
        todayIso,
        windows: careCadenceWindowsFromDefaults(defaultsForRead),
      }),
      fetchOverShepherdsForAdmin(client, { includeArchived: true }),
      fetchActiveShepherdCoverageAssignmentsForAdmin(client),
      fetchLaunchPlanningAssumptions(client),
    ]);

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

    const groups = groupsResult.data ?? [];
    const guests = guestsResult.data ?? [];
    const followUps = followUpsResult.data ?? [];
    const memberships = membershipsResult.data ?? [];
    const healthUpdates = healthUpdatesResult.data ?? [];
    const sessions = sessionsResult.data ?? [];
    const leaders = leadersResult.data ?? [];
    const profiles = profilesResult.data ?? [];
    const metricSettings = metricSettingsResult.data ?? [];
    const calendarEvents = calendarEventsResult.data ?? [];
    const calendarEventsByGroup = buildCalendarEventsByGroup(calendarEvents);

    const groupsById = new Map(groups.map((g) => [g.id, g] as const));
    const profilesById = new Map(profiles.map((p) => [p.id, p] as const));
    const metricSettingsByGroup = new Map(
      metricSettings.map((s) => [s.group_id, s] as const),
    );
    const sessionByGroup = new Map(
      sessions.map((s) => [s.group_id, s] as const),
    );
    const healthByGroup = new Map<string, GroupHealthUpdatesRow>();
    for (const u of healthUpdates) {
      const existing = healthByGroup.get(u.group_id);
      if (!existing || u.update_week > existing.update_week) {
        healthByGroup.set(u.group_id, u);
      }
    }
    const membershipsByGroup = new Map<string, number>();
    for (const m of memberships as GroupMembershipsRow[]) {
      membershipsByGroup.set(
        m.group_id,
        (membershipsByGroup.get(m.group_id) ?? 0) + 1,
      );
    }
    const followUpsByGroup = new Map<string, LeaderFollowUpRow[]>();
    for (const fu of followUps) {
      if (!fu.related_group_id) continue;
      const list = followUpsByGroup.get(fu.related_group_id) ?? [];
      list.push(fu);
      followUpsByGroup.set(fu.related_group_id, list);
    }

    const defaults = defaultsForRead;

    const derivedRows: DerivedGroupRow[] = groups.map((g) => {
      const override = metricSettingsByGroup.get(g.id) ?? null;
      const activeMemberCount = membershipsByGroup.get(g.id) ?? 0;
      const effectiveCapacityValue = computeEffectiveCapacity(
        g,
        override,
        defaults,
      );
      const isCapacityUnknown = computeUnknownCapacity(g, override, defaults);
      const isExcluded = isExcludedFromCapacityMetrics(override);
      const warningPct = effectiveCapacityWarningPct(override, defaults);
      const fullPct = effectiveCapacityFullPct(defaults);
      const capacityStatusValue = computeCapacityStatus({
        activeMemberCount,
        effectiveCapacity: effectiveCapacityValue,
        warningPct,
        fullPct,
        excluded: isExcluded,
        allowOverCapacity: Boolean(override?.allow_over_capacity),
      });
      const effectiveHealth = effectiveHealthStatus(g, override);
      const healthUpdate = healthByGroup.get(g.id) ?? null;
      const session = sessionByGroup.get(g.id) ?? null;
      const sessionStatus = determineSessionStatus(session);
      const leaderNames = buildLeaderNames(g.id, leaders, profilesById);
      const hasLeader = leaderNames.length > 0;
      const hasMeetingDayTime = Boolean(g.meeting_day && g.meeting_time);
      const hasCapacityConfigured =
        override?.capacity_override != null || g.capacity != null;
      const groupEventsForWeek = calendarEventsByGroup.get(g.id) ?? [];
      const occurrenceDate = expectedMeetingDateForWeek(selectedWeek, {
        meetingDay: g.meeting_day,
        meetingFrequency: g.meeting_frequency,
        meetingWeekParity: g.meeting_week_parity,
      });
      const calendarOverride = pickCalendarOverrideForOccurrence(
        groupEventsForWeek,
        occurrenceDate,
      );
      const dueResult = computeCheckInDue({
        group: {
          meetingDay: g.meeting_day,
          meetingTime: g.meeting_time,
          meetingFrequency: g.meeting_frequency,
          meetingWeekParity: g.meeting_week_parity,
        },
        override,
        defaults,
        // Anchor due-date math to the week the admin is reviewing so
        // historical-week views compute the right meeting occurrence
        // (Codex P2: "use selected week when computing due dates").
        meetingWeek: selectedWeek,
        now,
        calendarOverride,
      });
      // Any session status other than "no_session" / "not_submitted"
      // counts as the leader having checked in for the week. We use
      // this to suppress overdue messaging on rows that already have
      // a did_not_meet or planned_pause submission so the attention
      // and health surfaces don't show "Did not meet · Overdue"
      // simultaneously.
      const isCheckedInThisWeek = !isMissingForWeek(sessionStatus);
      return {
        group: g,
        override,
        activeMemberCount,
        effectiveCapacityValue,
        capacitySource: resolveCapacitySource(g, override, defaults),
        isCapacityUnknown,
        isExcluded,
        warningPct,
        fullPct,
        capacityStatusValue,
        utilizationPct: utilizationFor(
          activeMemberCount,
          effectiveCapacityValue,
        ),
        effectiveHealth,
        hasManualHealthOverride: hasActiveOverrides(override),
        session,
        sessionStatus,
        healthUpdate,
        followUpNeeded: healthUpdate?.follow_up_needed ?? false,
        leaderNames,
        hasLeader,
        hasMeetingDayTime,
        hasCapacityConfigured,
        followUpsForGroup: followUpsByGroup.get(g.id) ?? [],
        dueLabel: formatCheckInDueLabel(dueResult.due),
        dueRelative: formatCheckInDueRelative(dueResult),
        // Only flag overdue if (1) due-date math worked AND (2) the
        // leader hasn't already submitted anything for the selected
        // week (submitted / admin_entered / did_not_meet / planned_pause
        // all count as "checked in").
        isOverdue: dueResult.isOverdue && !isCheckedInThisWeek,
        isScheduledThisWeek: dueResult.isScheduledThisWeek,
      };
    });

    const activeRows = derivedRows.filter(
      (r) => r.group.lifecycle_status === "active",
    );

    const submittedCheckIns = activeRows.filter((r) =>
      isSubmittedForWeek(r.sessionStatus),
    ).length;
    // Bi-weekly off-parity groups and monthly groups aren't necessarily
    // expected to check in this specific week, so they don't count
    // toward "missing". Monthly groups can't be resolved without richer
    // recurrence info; the dashboard surfaces them as healthy until
    // they actually submit a check-in.
    const missingCheckIns = activeRows.filter(
      (r) => isMissingForWeek(r.sessionStatus) && r.isScheduledThisWeek,
    ).length;
    const needsFollowUp = activeRows.filter(
      (r) =>
        r.effectiveHealth === "needs_follow_up" ||
        r.followUpNeeded ||
        r.healthUpdate?.follow_up_needed === true,
    ).length;

    const capacitySummary = buildCapacitySummary(derivedRows);
    const healthSummary = buildHealthSummary(derivedRows);
    const setupGaps = buildSetupGaps(derivedRows);
    const attentionItems = buildAttentionItems(derivedRows);

    const pipelineBreakdown = countPipeline(GUEST_PIPELINE_STAGES, guests);
    const guestPipelineCount = guests.filter(
      (g) => g.pipeline_stage !== "placed" && g.pipeline_stage !== "not_now",
    ).length;

    const followUpItems = followUps.map((row: LeaderFollowUpRow) =>
      toFollowUpItem(row, groupsById),
    );

    const summary = {
      activeGroupCount: activeGroupCountResult.data ?? activeRows.length,
      submittedCheckIns,
      missingCheckIns,
      needsFollowUp,
      capacityWatch:
        capacitySummary.counts.full + capacitySummary.counts.warning,
      unknownCapacity: capacitySummary.counts.unknown,
    };

    // Julian admin OS spine summaries. These are the headline cards on
    // /admin under the new direction; if either read failed above, the
    // helper returns an explicit "unavailable" state so the dashboard
    // card can render a message rather than silently zeroing.
    const shepherdCare = buildShepherdCareSummary(
      shepherdDirectoryResult,
      overShepherdsResult,
      shepherdAssignmentsResult,
      careCadenceWindowsFromDefaults(defaults),
      todayIso,
    );
    const launchPlanning = buildLaunchPlanningSnapshot(
      launchAssumptionsResult,
      derivedRows,
      defaults,
    );

    return live({
      meetingWeek: selectedWeek,
      weekLabel: formatWeekLabel(selectedWeek),
      isCurrentWeek: selectedWeek === currentWeek,
      summary,
      attentionItems,
      capacitySummary,
      healthSummary,
      setupGaps,
      guestPipelineCount,
      guestPipelineBreakdown: pipelineBreakdown,
      followUps: followUpItems,
      shepherdCare,
      launchPlanning,
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
  calendarEvents: GroupCalendarEventsRow[] = [],
): Promise<LeaderGroupDashboard> {
  const [sessionsResult, membershipsResult, healthUpdatesResult, followUpsResult] =
    await Promise.all([
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
      sessions.map((s) => s.id),
    );
    if (recordsResult.error) throw recordsResult.error;
    recordsByMember = recordsResult.data ?? [];
  }

  const recentSessions = sessions.slice(0, 4).map((session) => {
    const recs = recordsByMember.filter((r) => r.session_id === session.id);
    return {
      meetingWeek: session.meeting_week,
      status: session.status,
      presentCount: recs.filter((r) => r.attendance_status === "present").length,
      absentCount: recs.filter((r) => r.attendance_status === "absent").length,
      excusedCount: recs.filter((r) => r.attendance_status === "excused").length,
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
    currentWeekIso,
  );
  if (newGuestsResult.error) throw newGuestsResult.error;
  const newGuestsThisWeek = (newGuestsResult.data ?? []).length;

  const followUpItems = followUps.map((row: LeaderFollowUpRow) =>
    toFollowUpItem(row, new Map([[group.id, group]])),
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
      (r) => r.attendance_status === "present",
    ).length,
    absentCount: currentWeekRecords.filter(
      (r) => r.attendance_status === "absent",
    ).length,
    excusedCount: currentWeekRecords.filter(
      (r) => r.attendance_status === "excused",
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
  const todayIso = localTodayIso();
  const horizonEndIso = addDaysIsoForWeek(todayIso, 8 * 7);
  const generated = generateOccurrencesInRange(
    {
      meetingDay: group.meeting_day,
      meetingTime: group.meeting_time,
      meetingFrequency: group.meeting_frequency,
      meetingWeekParity: group.meeting_week_parity,
    },
    todayIso,
    horizonEndIso,
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
  options: { assignedGroupIds: readonly string[] },
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
        buildLeaderGroupDashboard(client, g, eventsByGroup.get(g.id) ?? []),
      ),
    );
    return live({ groups: dashboards });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fallback(LEADER_FALLBACK, message);
  }
}
