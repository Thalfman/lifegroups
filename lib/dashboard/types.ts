import type {
  AttendanceSessionStatus,
  FollowUpPriority,
  FollowUpStatus,
  FollowUpType,
  GroupHealthStatus,
  GroupLifecycleStatus,
  GuestPipelineStage,
} from "@/types/enums";
import type { CapacityStatus } from "@/lib/admin/metrics";

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

export interface LeaderGroupDashboard {
  group: LeaderGroupSummary;
  recentSessions: LeaderSessionStatusRow[];
  healthPulse: LeaderHealthPulse;
  followUps: FollowUpItem[];
  currentWeek: LeaderCurrentWeek;
}

export interface LeaderDashboardData {
  groups: LeaderGroupDashboard[];
}
