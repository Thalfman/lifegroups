import type {
  AttendanceSessionStatus,
  FollowUpPriority,
  FollowUpStatus,
  FollowUpType,
  GroupHealthStatus,
  GroupLifecycleStatus,
  GuestPipelineStage,
} from "@/types/enums";

export type DashboardSource = "live" | "fallback";

export type DashboardResult<T> = {
  source: DashboardSource;
  data: T;
  error?: string;
};

export interface GroupHealthRow {
  groupId: string;
  name: string;
  lifecycleStatus: GroupLifecycleStatus;
  healthStatus: GroupHealthStatus;
}

export interface CapacityRow {
  groupId: string;
  name: string;
  activeMembers: number;
  capacity: number | null;
  utilization: number | null;
  healthStatus: GroupHealthStatus;
}

export interface CapacityOverview {
  totalActiveGroups: number;
  nearCapacityGroups: number;
  fullGroups: number;
  rows: CapacityRow[];
}

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

export interface AdminDashboardData {
  activeGroupCount: number;
  attendanceThisWeek: number;
  guestPipelineCount: number;
  missingCheckInsCount: number;
  groupHealth: GroupHealthRow[];
  capacity: CapacityOverview;
  guestPipelineBreakdown: PipelineStageCount[];
  followUps: FollowUpItem[];
  weekLabel: string;
}

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

export interface LeaderGroupDashboard {
  group: LeaderGroupSummary;
  recentSessions: LeaderSessionStatusRow[];
  healthPulse: LeaderHealthPulse;
  followUps: FollowUpItem[];
}

export interface LeaderDashboardData {
  groups: LeaderGroupDashboard[];
}
