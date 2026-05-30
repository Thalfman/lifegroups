// Admin dashboard group model (Phase 6.0 → 6.1 extraction).
//
// This module is the pure, read-free heart of the /admin landing
// dashboard. `getAdminDashboardData` in lib/dashboard/queries.ts fetches
// the raw Supabase rows, gates on `firstError`, and then hands the arrays
// to `buildAdminGroupModel` here. Everything below is a deterministic
// function of its inputs — no Supabase client, no `new Date()` — so the
// whole cross-domain join (capacity × health × setup × attention × the
// summary counts) is reachable from a unit test by passing plain fixtures.
//
// The read-dependent "spine" summaries (shepherd care, launch planning)
// stay in queries.ts: they consume `model.derivedRows` plus their own
// read-results and emit explicit `available:false` states on degraded
// reads, which is a read concern this module deliberately does not own.
//
// Health vocabulary (see CONTEXT.md): a group carries TWO distinct health
// signals that must not be collapsed. `groups.health_status` is the
// admin-set status (folded through `effectiveHealthStatus` with any
// manual override) and surfaces here as `effectiveHealth`. A
// `group_health_updates` row is the leader's weekly **Health Pulse** and
// surfaces as `healthUpdate`. The fields are named apart on purpose.
import type {
  AdminSummary,
  AttentionItem,
  AttentionReason,
  CapacityGroupRow,
  CapacitySource,
  CapacitySummary,
  FollowUpItem,
  HealthBucket,
  HealthGroupRow,
  HealthSummary,
  PipelineStageCount,
  SetupGap,
  SetupGapRow,
  SetupGaps,
} from "./types";
import {
  GUEST_PIPELINE_STAGES,
  type GuestDirectoryEntry,
  type LeaderFollowUpRow,
} from "@/lib/supabase/read-models";
import { pipelineStageLabel } from "./labels";
import { isoWeekStart } from "@/lib/shared/church-time";
import { formatWeekLabel } from "@/lib/admin/check-ins";
import {
  capacityStatus as computeCapacityStatus,
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
  buildCalendarEventsByGroup,
  computeCheckInDue,
  expectedMeetingDateForWeek,
  formatCheckInDueLabel,
  formatCheckInDueRelative,
  pickCalendarOverrideForOccurrence,
} from "@/lib/admin/check-in-due";
import type {
  AttendanceSessionsRow,
  GroupCalendarEventsRow,
  GroupHealthUpdatesRow,
  GroupLeadersRow,
  GroupMembershipsRow,
  GroupMetricSettingsRow,
  GroupsRow,
  ProfilesRow,
} from "@/types/database";
import type {
  AttendanceSessionStatus,
  GroupHealthStatus,
  GuestPipelineStage,
} from "@/types/enums";

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

// Shared follow-up mapper, also used by the leader dashboard path in
// queries.ts. Kept here alongside the admin model since the admin model
// is its primary consumer.
export function toFollowUpItem(
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

export interface AdminGroupModelInput {
  groups: GroupsRow[];
  memberships: GroupMembershipsRow[];
  sessions: AttendanceSessionsRow[];
  healthUpdates: GroupHealthUpdatesRow[];
  leaders: GroupLeadersRow[];
  profiles: ProfilesRow[];
  metricSettings: GroupMetricSettingsRow[];
  calendarEvents: GroupCalendarEventsRow[];
  guests: GuestDirectoryEntry[];
  followUps: LeaderFollowUpRow[];
  defaults: MetricDefaults;
  selectedWeek: string;
  now: Date;
  // The authoritative active-group count from its own read; falls back to
  // counting active derived rows when the read returned nothing.
  activeGroupCount: number | null;
}

export interface AdminGroupModel {
  meetingWeek: string;
  weekLabel: string;
  isCurrentWeek: boolean;
  summary: AdminSummary;
  attentionItems: AttentionItem[];
  capacitySummary: CapacitySummary;
  healthSummary: HealthSummary;
  setupGaps: SetupGaps;
  guestPipelineCount: number;
  guestPipelineBreakdown: PipelineStageCount[];
  followUps: FollowUpItem[];
  // Exposed for the read-dependent spine summaries (launch planning) that
  // partition the same rows in queries.ts. Not part of the wire payload.
  derivedRows: DerivedGroupRow[];
}

// Pure cross-domain join for the /admin landing dashboard. Builds its own
// per-group indexes (groups, latest Health Pulse by week, membership
// counts, follow-ups, calendar overrides) from the raw arrays, derives one
// `DerivedGroupRow` per group, then partitions that single list into every
// dashboard section so the summary counts can never disagree with the
// queues they summarise.
export function buildAdminGroupModel(
  input: AdminGroupModelInput,
): AdminGroupModel {
  const {
    groups,
    memberships,
    sessions,
    healthUpdates,
    leaders,
    profiles,
    metricSettings,
    calendarEvents,
    guests,
    followUps,
    defaults,
    selectedWeek,
    now,
    activeGroupCount,
  } = input;

  const currentWeek = isoWeekStart(now);

  const calendarEventsByGroup = buildCalendarEventsByGroup(calendarEvents);
  const groupsById = new Map(groups.map((g) => [g.id, g] as const));
  const profilesById = new Map(profiles.map((p) => [p.id, p] as const));
  const metricSettingsByGroup = new Map(
    metricSettings.map((s) => [s.group_id, s] as const),
  );
  const sessionByGroup = new Map(sessions.map((s) => [s.group_id, s] as const));
  // Latest Health Pulse per group: keep the row with the greatest
  // update_week so a stale earlier-week pulse can't shadow this week's.
  const healthByGroup = new Map<string, GroupHealthUpdatesRow>();
  for (const u of healthUpdates) {
    const existing = healthByGroup.get(u.group_id);
    if (!existing || u.update_week > existing.update_week) {
      healthByGroup.set(u.group_id, u);
    }
  }
  const membershipsByGroup = new Map<string, number>();
  for (const m of memberships) {
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
      utilizationPct: utilizationFor(activeMemberCount, effectiveCapacityValue),
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

  const guestPipelineBreakdown = countPipeline(GUEST_PIPELINE_STAGES, guests);
  const guestPipelineCount = guests.filter(
    (g) => g.pipeline_stage !== "placed" && g.pipeline_stage !== "not_now",
  ).length;

  const followUpItems = followUps.map((row) =>
    toFollowUpItem(row, groupsById),
  );

  const summary: AdminSummary = {
    activeGroupCount: activeGroupCount ?? activeRows.length,
    submittedCheckIns,
    missingCheckIns,
    needsFollowUp,
    capacityWatch:
      capacitySummary.counts.full + capacitySummary.counts.warning,
    unknownCapacity: capacitySummary.counts.unknown,
  };

  return {
    meetingWeek: selectedWeek,
    weekLabel: formatWeekLabel(selectedWeek),
    isCurrentWeek: selectedWeek === currentWeek,
    summary,
    attentionItems,
    capacitySummary,
    healthSummary,
    setupGaps,
    guestPipelineCount,
    guestPipelineBreakdown,
    followUps: followUpItems,
    derivedRows,
  };
}
