import type {
  AttendanceSessionStatus,
  FollowUpPriority,
  FollowUpStatus,
  FollowUpType,
  GroupCalendarEventStatus,
  GroupHealthStatus,
  GroupLifecycleStatus,
  GuestPipelineStage,
  LeaderReadinessStage,
  MultiplicationCandidateStatus,
  ProspectState,
} from "@/types/enums";
import type { CapacityStatus } from "@/lib/admin/metrics";
import type { LaunchPlanningRiskLevel } from "@/lib/admin/launch-planning";
import type { OverviewGrain } from "@/lib/admin/overview-period";

export type DashboardSource = "live" | "fallback";

export type DashboardResult<T> = {
  source: DashboardSource;
  data: T;
  error?: string;
};

export interface PipelineStageCount {
  stage: GuestPipelineStage;
  label: string;
  count: number;
}

export interface FollowUpItem {
  id: string;
  title: string;
  type: FollowUpType;
  priority: FollowUpPriority;
  status: FollowUpStatus;
  dueDate: string | null;
  relatedGroupName: string | null;
}

// Phase 6.0 dashboard model.
//
// Every per-group row below is derived from the same single-pass
// `DerivedGroupRow` in `lib/dashboard/queries.ts`, so summary counts,
// attention queue priorities, capacity buckets, health buckets, and
// setup-gap lists stay consistent with one another even if a metric
// default or override changes mid-week.

export type CapacitySource = "override" | "group" | "default" | "unknown";

export type AttentionReason =
  | "follow_up_open"
  | "missing_check_in"
  | "capacity_full"
  | "capacity_warning"
  | "health_needs_follow_up"
  | "health_watch"
  | "capacity_unknown"
  | "no_leader"
  | "no_members"
  | "missing_meeting_day_time";

export interface AttentionItem {
  groupId: string;
  groupName: string;
  reason: AttentionReason;
  secondaryReasons: AttentionReason[];
  detail: string;
  priority: number;
  lifecycleStatus: GroupLifecycleStatus;
  leaderNames: string[];
  meetingDay: string | null;
  meetingTime: string | null;
  effectiveCapacity: number | null;
  activeMemberCount: number;
  sessionStatus: AttendanceSessionStatus | "no_session";
  excludedFromCapacity: boolean;
  // Phase 5A.5 — due-date enrichment for "missing check-in" items.
  dueLabel: string | null;
  dueRelative: string | null;
  isOverdue: boolean;
}

export interface CapacityGroupRow {
  groupId: string;
  name: string;
  activeMembers: number;
  effectiveCapacity: number | null;
  capacitySource: CapacitySource;
  utilizationPct: number | null;
  status: CapacityStatus;
  warningPct: number;
  fullPct: number;
  hasManualHealthOverride: boolean;
  healthStatus: GroupHealthStatus;
  excluded: boolean;
}

export interface CapacitySummary {
  full: CapacityGroupRow[];
  warning: CapacityGroupRow[];
  ok: CapacityGroupRow[];
  unknown: CapacityGroupRow[];
  excluded: CapacityGroupRow[];
  counts: Record<"full" | "warning" | "ok" | "unknown" | "excluded", number>;
}

export type HealthBucket =
  | "submitted"
  | "missing"
  | "did_not_meet"
  | "planned_pause"
  | "needs_follow_up"
  | "watch"
  | "healthy";

export interface HealthGroupRow {
  groupId: string;
  name: string;
  sessionStatus: AttendanceSessionStatus | "no_session";
  healthStatus: GroupHealthStatus;
  followUpNeeded: boolean;
  leaderNames: string[];
}

export interface HealthSummary {
  submitted: HealthGroupRow[];
  missing: HealthGroupRow[];
  didNotMeet: HealthGroupRow[];
  plannedPause: HealthGroupRow[];
  needsFollowUp: HealthGroupRow[];
  watch: HealthGroupRow[];
  healthy: HealthGroupRow[];
  counts: Record<HealthBucket, number>;
}

export type SetupGap = "capacity" | "leader" | "meeting_day_time" | "members";

export interface SetupGapRow {
  groupId: string;
  name: string;
  gaps: SetupGap[];
  hasExclusion: boolean;
  isCapacityUnknown: boolean;
}

export interface SetupGaps {
  noCapacity: SetupGapRow[];
  noLeader: SetupGapRow[];
  noMeetingDayTime: SetupGapRow[];
  noMembers: SetupGapRow[];
  counts: {
    noCapacity: number;
    noLeader: number;
    noMeetingDayTime: number;
    noMembers: number;
  };
}

export interface AdminSummary {
  activeGroupCount: number;
  submittedCheckIns: number;
  missingCheckIns: number;
  needsFollowUp: number;
  capacityWatch: number;
  unknownCapacity: number;
}

// Julian admin OS spine — surfaced on the /admin landing so shepherd
// care + launch planning lead the dashboard instead of weekly check-in
// status. Both summaries are computed from the same helpers the deep
// pages use (lib/admin/shepherd-care-dashboard, lib/admin/launch-planning)
// so the dashboard never drifts from /admin/shepherd-care or
// /admin/launch-planning.
export interface ShepherdCareDashboardSummary {
  totalActiveShepherds: number;
  needsAttention: number;
  overdueTouchpoints: number;
  notContactedRecently: number;
  noCareProfile: number;
  unassignedCoverage: number;
  // Count of active over-shepherds (coaches) — the coverage capacity behind
  // the unassignedCoverage figure. Derived from the over-shepherds list the
  // orchestration already fetches. null when that read failed, so a transient
  // error isn't shown as a real "0 coverage capacity".
  activeOverShepherds: number | null;
  attentionItemsTotal: number;
  coverageAvailable: boolean;
  available: boolean;
  error: string | null;
}

export interface LaunchPlanningDashboardSnapshot {
  effectiveTotalCapacity: number;
  currentParticipants: number;
  projectedGroupDemand: number;
  capacityGap: number;
  recommendedNewGroups: number;
  estimatedNewLeadersNeeded: number;
  riskLevel: LaunchPlanningRiskLevel;
  suggestedLaunchByDate: string | null;
  unknownCapacityGroupCount: number;
  excludedActiveGroupCount: number;
  // "% of the church in a life group" inputs — the denominator is the
  // editable church-attendance assumption (not the raw snapshot series), so
  // the landing's participation figure agrees with /admin/launch-planning.
  // `participationPct` is null when no denominator is configured.
  currentChurchAttendance: number;
  participationPct: number | null;
  assumptionsAvailable: boolean;
  available: boolean;
  error: string | null;
}

// Executive-overview rollups (Julian admin OS landing). Both are read-dependent
// and computed in lib/dashboard/queries.ts from the same read models the deep
// pages use (lib/admin/leader-pipeline, lib/admin/multiplication), so the
// landing counts never drift from /admin/leader-pipeline or the multiplication
// surface on /admin/launch-planning. Each degrades to available:false on a read
// failure rather than zeroing.
export interface LeaderPipelineDashboardSummary {
  counts: Record<LeaderReadinessStage, number>;
  total: number;
  available: boolean;
  error: string | null;
}

export interface MultiplicationDashboardSummary {
  counts: Record<MultiplicationCandidateStatus, number>;
  total: number;
  available: boolean;
  error: string | null;
}

// Care/Plan/Multiply pivot overview summaries (#470, ADR 0016/0022). Both load
// in app/(protected)/admin/page.tsx alongside the dashboard read (one round of
// parallel reads) and travel to DashboardClient as their own props — not inside
// AdminDashboardData — so each degrades per-card: a failed read flips
// available:false and the card renders an unavailable state, never a false
// zero.

// Prospects by state for the Home Interest Funnel card. Counts come from the
// narrow fetchProspectStateCounts read (state + archived only), not the full
// board read; `joined` is the collapsed Joined roll-up count.
export interface InterestFunnelDashboardSummary {
  counts: Record<ProspectState, number>;
  available: boolean;
  error: string | null;
}

// "X of Y cells ready" for the Home Multiplication card, built purely over the
// Multiply grid (buildMultiplyHomeSummary) so Home never disagrees with
// /admin/multiply's per-cell readiness signals.
export interface MultiplyReadinessDashboardSummary {
  readyCells: number;
  activeCells: number;
  available: boolean;
  error: string | null;
}

// "Activity this period" — the only period-scoped block on the landing, driven
// by the week/month/quarter/year/all-time slicer. groupsLaunched + guestsWelcomed
// are derived from arrays the dashboard already fetches (always available); the
// remaining four come from a dedicated count read and are null when it fails
// (extendedAvailable === false). prospectsAdded (#471) counts live Interest
// Funnel intake; guestsWelcomed stays for the frozen guests tile, which only
// renders when that surface's flag is live.
export interface OverviewActivitySummary {
  grain: OverviewGrain;
  label: string;
  groupsLaunched: number;
  guestsWelcomed: number;
  prospectsAdded: number | null;
  membersJoined: number | null;
  followUpsCompleted: number | null;
  careTouchpoints: number | null;
  extendedAvailable: boolean;
  error: string | null;
  // activity-reset: the global "as-of" reset date the tiles are floored at, or
  // null when no reset is in effect. Surfaced so the Home control can show
  // "since {date}" and offer Undo. The counts above already measure from it.
  resetBaselineOn: string | null;
}

export interface AdminDashboardData {
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
  // Accurate, UNtruncated count of OPEN follow-ups due within the "this week"
  // horizon (on or before today + 7 days, inclusive of overdue). `followUps`
  // above is capped (priority/due ordered, limited rows) so the Home "This week"
  // card filters it for previews; this count is the faithful total the card
  // reports so a low-priority item due this week is never dropped from the cap.
  dueFollowUpsThisWeekCount: number;
  // The single church-local "week ahead" horizon (today + 7 days, YYYY-MM-DD)
  // both the due-follow-up count above and the Home "This week" card's launch
  // milestone gate are measured against. Computed once in the data layer from
  // the same church-local `today` so the card can't drift onto a parallel UTC
  // horizon: a launch date one day past this bound never appears under "This
  // week" while the follow-up window says otherwise.
  weekAheadCutoffIso: string;
  shepherdCare: ShepherdCareDashboardSummary;
  launchPlanning: LaunchPlanningDashboardSnapshot;
  leaderPipeline: LeaderPipelineDashboardSummary;
  multiplication: MultiplicationDashboardSummary;
  activity: OverviewActivitySummary;
}

// Leader dashboard model is untouched by Phase 6.0.

export interface LeaderGroupMember {
  id: string;
  displayName: string;
}

export interface LeaderGroupSummary {
  groupId: string;
  name: string;
  meetingDay: string | null;
  meetingTime: string | null;
  lifecycleStatus: GroupLifecycleStatus;
  healthStatus: GroupHealthStatus;
  capacity: number | null;
  activeMembers: number;
  weekLabel: string;
  members: LeaderGroupMember[];
}

export interface LeaderSessionStatusRow {
  meetingWeek: string;
  status: AttendanceSessionStatus;
  presentCount: number;
  absentCount: number;
  excusedCount: number;
}

export interface LeaderHealthPulse {
  attendanceRhythm: string;
  newGuestsThisWeek: number;
  currentHealth: GroupHealthStatus;
  leaderNote: string | null;
}

// `AttendanceSessionStatus` already includes `'not_submitted'`. That value
// is used here when no `attendance_sessions` row exists for the current
// week yet; the dashboard displays it as the "not yet started" state.
export interface LeaderCurrentWeek {
  meetingWeek: string;
  status: AttendanceSessionStatus;
  alreadySubmitted: boolean;
  presentCount: number;
  absentCount: number;
  excusedCount: number;
  meetingDate: string | null;
  submittedAt: string | null;
  leaderNote: string | null;
}

// Phase 5A.6: the compact upcoming-events strip on each leader group
// card pre-resolves the friendly label (title or fallback event_type
// label) so the client component doesn't need to import the label
// helper.
export interface UpcomingCalendarEvent {
  date: string; // YYYY-MM-DD
  label: string;
  status: GroupCalendarEventStatus;
  startTime: string | null;
}

export interface LeaderGroupDashboard {
  group: LeaderGroupSummary;
  recentSessions: LeaderSessionStatusRow[];
  healthPulse: LeaderHealthPulse;
  followUps: FollowUpItem[];
  currentWeek: LeaderCurrentWeek;
  upcomingEvents: UpcomingCalendarEvent[];
}

export interface LeaderDashboardData {
  groups: LeaderGroupDashboard[];
}
