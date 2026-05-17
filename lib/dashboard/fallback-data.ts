import type {
  AdminDashboardData,
  LeaderDashboardData,
  PipelineStageCount,
} from "./types";
import { GUEST_PIPELINE_STAGES } from "@/lib/supabase/read-models";
import { pipelineStageLabel } from "./labels";

const FALLBACK_PIPELINE_COUNTS: Record<string, number> = {
  new: 6,
  contacted: 5,
  interested: 4,
  assigned: 3,
  attended: 3,
  placed: 1,
  not_now: 1,
};

const fallbackPipelineBreakdown: PipelineStageCount[] = GUEST_PIPELINE_STAGES.map((stage) => ({
  stage,
  label: pipelineStageLabel(stage),
  count: FALLBACK_PIPELINE_COUNTS[stage] ?? 0,
}));

export const ADMIN_FALLBACK: AdminDashboardData = {
  activeGroupCount: 18,
  attendanceThisWeek: 312,
  guestPipelineCount: 23,
  missingCheckInsCount: 4,
  weekLabel: "this week",
  groupHealth: [
    {
      groupId: "fallback-1",
      name: "Northside Young Adults",
      lifecycleStatus: "active",
      healthStatus: "healthy",
    },
    {
      groupId: "fallback-2",
      name: "Westside Families",
      lifecycleStatus: "planned_pause",
      healthStatus: "healthy_paused",
    },
    {
      groupId: "fallback-3",
      name: "Downtown Professionals",
      lifecycleStatus: "active",
      healthStatus: "watch",
    },
    {
      groupId: "fallback-4",
      name: "South Campus Women",
      lifecycleStatus: "active",
      healthStatus: "capacity_full",
    },
    {
      groupId: "fallback-5",
      name: "Eastside Community",
      lifecycleStatus: "active",
      healthStatus: "needs_follow_up",
    },
  ],
  capacity: {
    totalActiveGroups: 18,
    nearCapacityGroups: 4,
    fullGroups: 2,
    rows: [
      {
        groupId: "fallback-1",
        name: "Northside Young Adults",
        activeMembers: 9,
        capacity: 12,
        utilization: 0.75,
        healthStatus: "healthy",
      },
      {
        groupId: "fallback-4",
        name: "South Campus Women",
        activeMembers: 14,
        capacity: 14,
        utilization: 1,
        healthStatus: "capacity_full",
      },
      {
        groupId: "fallback-3",
        name: "Downtown Professionals",
        activeMembers: 10,
        capacity: 12,
        utilization: 0.83,
        healthStatus: "watch",
      },
    ],
  },
  guestPipelineBreakdown: fallbackPipelineBreakdown,
  followUps: [
    {
      id: "fallback-fu-1",
      title: "Reach out to Skyler about placement",
      type: "guest",
      priority: "high",
      status: "open",
      dueDate: null,
      relatedGroupName: "Northside Young Adults",
    },
    {
      id: "fallback-fu-2",
      title: "Confirm Westside Families restart date",
      type: "pause",
      priority: "normal",
      status: "open",
      dueDate: null,
      relatedGroupName: "Westside Families",
    },
    {
      id: "fallback-fu-3",
      title: "Check in with Eastside leader on attendance",
      type: "attendance",
      priority: "normal",
      status: "in_progress",
      dueDate: null,
      relatedGroupName: "Eastside Community",
    },
    {
      id: "fallback-fu-4",
      title: "South Campus Women capacity review",
      type: "capacity",
      priority: "low",
      status: "open",
      dueDate: null,
      relatedGroupName: "South Campus Women",
    },
  ],
};

export const LEADER_FALLBACK: LeaderDashboardData = {
  group: {
    groupId: "fallback-leader-group",
    name: "Tuesday Night Life Group",
    meetingDay: "Tuesday",
    meetingTime: "19:00",
    lifecycleStatus: "active",
    healthStatus: "healthy",
    capacity: 12,
    activeMembers: 8,
    weekLabel: "Week of May 17",
    memberNames: ["Jordan K.", "Priya M.", "Noah B.", "Grace T.", "Elijah R.", "Avery L.", "Sam W.", "Riley T."],
  },
  recentSessions: [
    { meetingWeek: "2026-05-11", status: "submitted", presentCount: 7, absentCount: 1, excusedCount: 0 },
    { meetingWeek: "2026-05-04", status: "submitted", presentCount: 6, absentCount: 1, excusedCount: 1 },
    { meetingWeek: "2026-04-27", status: "submitted", presentCount: 7, absentCount: 0, excusedCount: 1 },
    { meetingWeek: "2026-04-20", status: "submitted", presentCount: 6, absentCount: 2, excusedCount: 0 },
  ],
  healthPulse: {
    attendanceRhythm: "Steady",
    newGuestsThisWeek: 1,
    currentHealth: "healthy",
    leaderNote: "Group continues to grow steadily; planning a guest-friendly week soon.",
  },
  followUps: [
    {
      id: "fallback-leader-fu-1",
      title: "Welcome new guest to the group",
      type: "guest",
      priority: "normal",
      status: "open",
      dueDate: null,
      relatedGroupName: "Tuesday Night Life Group",
    },
    {
      id: "fallback-leader-fu-2",
      title: "Confirm meeting space for next week",
      type: "admin",
      priority: "low",
      status: "open",
      dueDate: null,
      relatedGroupName: "Tuesday Night Life Group",
    },
  ],
};
