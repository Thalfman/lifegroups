import {
  GUEST_PIPELINE_STAGES,
  fetchActiveGroupCount,
  fetchActiveMemberships,
  fetchAllGroupLeaders,
  fetchAllGroupMetricSettings,
  fetchAllGroups,
  fetchAttendanceRecordsForSessions,
  fetchAttendanceSessions,
  fetchGroupsByIds,
  fetchGuests,
  fetchLatestHealthUpdates,
  fetchMembersByIds,
  fetchMetricDefaults,
  fetchNewGuestsForGroupSince,
  fetchOpenFollowUps,
  fetchProfilesForAdmin,
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
  LeaderCurrentWeek,
  LeaderDashboardData,
  LeaderGroupDashboard,
  PipelineStageCount,
  SetupGap,
  SetupGapRow,
  SetupGaps,
} from "./types";
import { ADMIN_FALLBACK, LEADER_FALLBACK } from "./fallback-data";
import { pipelineStageLabel } from "./labels";
// Phase 5B.0 swapped the dashboard's UTC isoWeekStart for a
// church-timezone-aware version so the leader workflow and the
// dashboard agree on what "this week" means.
import { isoWeekStart } from "@/lib/leader/validation";
import { formatWeekLabel } from "@/lib/admin/check-ins";
import {
  capacityStatus as computeCapacityStatus,
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
import {
  computeCheckInDue,
  formatCheckInDueLabel,
  formatCheckInDueRelative,
} from "@/lib/admin/check-in-due";
import type {
  AttendanceRecordsRow,
  AttendanceSessionsRow,
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
type DerivedGroupRow = {
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
};

const ATTENTION_PRIORITY: Record<AttentionReason, number> = {
  follow_up_open: 10,
  missing_check_in: 20,
  capacity_full: 30,
  capacity_warning: 40,
  health_needs_follow_up: 50,
  health_watch: 60,
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
  if (isMissingForWeek(row.sessionStatus)) return "missing";
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

function collectReasonsFor(row: DerivedGroupRow): AttentionReason[] {
  const reasons: AttentionReason[] = [];
  if (row.followUpsForGroup.length > 0) reasons.push("follow_up_open");
  if (isMissingForWeek(row.sessionStatus)) reasons.push("missing_check_in");
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
  const buckets: Record<CapacityStatus, CapacityGroupRow[]> = {
    full: [],
    warning: [],
    ok: [],
    unknown: [],
    excluded: [],
  };
  for (const r of rows) {
    if (r.group.lifecycle_status === "closed") continue;
    if (r.group.lifecycle_status !== "active") continue;
    buckets[r.capacityStatusValue].push(toCapacityGroupRow(r));
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

export async function getAdminDashboardData(
  client: AppSupabaseClient | null,
  options: { selectedWeek?: string; now?: Date } = {},
): Promise<DashboardResult<AdminDashboardData>> {
  if (!client) return fallback(ADMIN_FALLBACK);

  const now = options.now ?? new Date();
  const currentWeek = isoWeekStart(now);
  const selectedWeek = options.selectedWeek ?? currentWeek;

  try {
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
      metricDefaultsResult,
      metricSettingsResult,
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
      fetchMetricDefaults(client),
      fetchAllGroupMetricSettings(client),
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
      metricSettingsResult.error;
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

    const defaults = decodeMetricDefaults(metricDefaultsResult.data);

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
      const dueResult = computeCheckInDue({
        group: { meetingDay: g.meeting_day, meetingTime: g.meeting_time },
        override,
        defaults,
        now,
      });
      const submittedThisWeek =
        sessionStatus === "submitted" || sessionStatus === "admin_entered";
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
        // Only flag overdue if a check-in hasn't already been submitted for
        // the selected week.
        isOverdue: dueResult.isOverdue && !submittedThisWeek,
      };
    });

    const activeRows = derivedRows.filter(
      (r) => r.group.lifecycle_status === "active",
    );

    const submittedCheckIns = activeRows.filter((r) =>
      isSubmittedForWeek(r.sessionStatus),
    ).length;
    const missingCheckIns = activeRows.filter((r) =>
      isMissingForWeek(r.sessionStatus),
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
  };
}

export async function getLeaderDashboardData(
  client: AppSupabaseClient | null,
  options: { assignedGroupIds: readonly string[] },
): Promise<DashboardResult<LeaderDashboardData>> {
  if (!client) return fallback(LEADER_FALLBACK);
  if (options.assignedGroupIds.length === 0) return live({ groups: [] });

  try {
    const groupsResult = await fetchGroupsByIds(client, [
      ...options.assignedGroupIds,
    ]);
    if (groupsResult.error)
      return fallback(LEADER_FALLBACK, groupsResult.error.message);
    const groups = groupsResult.data ?? [];
    if (groups.length === 0) return live({ groups: [] });

    const dashboards = await Promise.all(
      groups.map((g) => buildLeaderGroupDashboard(client, g)),
    );
    return live({ groups: dashboards });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fallback(LEADER_FALLBACK, message);
  }
}
