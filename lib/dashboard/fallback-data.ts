import type {
  AdminDashboardData,
  AttentionItem,
  HealthGroupRow,
  LaunchPlanningDashboardSnapshot,
  LeaderDashboardData,
  LeaderPipelineDashboardSummary,
  MultiplicationDashboardSummary,
  OverviewActivitySummary,
  PipelineStageCount,
  SetupGapRow,
  ShepherdCareDashboardSummary,
  UpcomingCalendarEvent,
} from "./types";
import { GUEST_PIPELINE_STAGES } from "@/lib/supabase/read-models";
import { pipelineStageLabel, isActivePipelineStage } from "./labels";
import { DEMO_CAPACITY_SUMMARY } from "./demo-seed";

const FALLBACK_PIPELINE_COUNTS: Record<string, number> = {
  new: 6,
  contacted: 5,
  interested: 4,
  assigned: 3,
  attended: 3,
  placed: 1,
  not_now: 1,
};

const fallbackPipelineBreakdown: PipelineStageCount[] =
  GUEST_PIPELINE_STAGES.map((stage) => ({
    stage,
    label: pipelineStageLabel(stage),
    count: FALLBACK_PIPELINE_COUNTS[stage] ?? 0,
  }));

// Derive the headline count from the same breakdown using the live
// builder's rule (lib/dashboard/queries.ts: every stage except the
// terminal `placed` / `not_now`). Deriving rather than hardcoding keeps
// the fallback's count from silently drifting out of step with its own
// breakdown or with the live read's semantics.
const fallbackGuestPipelineCount = fallbackPipelineBreakdown
  .filter((row) => isActivePipelineStage(row.stage))
  .reduce((sum, row) => sum + row.count, 0);

const FALLBACK_WEEK = "2026-05-18";
const FALLBACK_WEEK_LABEL = "Week of May 18, 2026";

// Phase 5A.6 demo calendar for the leader fallback group. Models the
// 5-week rotation (Community Night, Men's Transformation, Study,
// Women's Transformation, Study) starting at the fallback week with
// one OFF date and one Cancelled date sprinkled in. Used by
// /leader-preview and the seasonal sketches on /admin-preview when no
// Supabase client is configured.
const fallbackLeaderUpcoming: UpcomingCalendarEvent[] = [
  {
    date: "2026-05-19", // Tuesday: Community Night
    label: "Community Night",
    status: "scheduled",
    startTime: "19:00",
  },
  {
    date: "2026-05-26", // Tuesday: Men's Transformation
    label: "Men’s Transformation",
    status: "scheduled",
    startTime: "19:00",
  },
];

const healthSubmitted: HealthGroupRow[] = [
  {
    groupId: "fb-cap-ok-1",
    name: "Eastside Community",
    sessionStatus: "submitted",
    healthStatus: "healthy",
    followUpNeeded: false,
    leaderNames: ["Jonah Reyes"],
  },
  {
    groupId: "fb-cap-warn-2",
    name: "Northside Young Adults",
    sessionStatus: "submitted",
    healthStatus: "healthy",
    followUpNeeded: false,
    leaderNames: ["Avery Lewis", "Sam Park"],
  },
];

const healthMissing: HealthGroupRow[] = [
  {
    groupId: "fb-miss-1",
    name: "Westside Families",
    sessionStatus: "no_session",
    healthStatus: "healthy",
    followUpNeeded: false,
    leaderNames: ["Maria Lopez"],
  },
];

const healthDidNotMeet: HealthGroupRow[] = [
  {
    groupId: "fb-dnm-1",
    name: "Riverside Singles",
    sessionStatus: "did_not_meet",
    healthStatus: "healthy",
    followUpNeeded: false,
    leaderNames: ["Daniel Park"],
  },
];

const healthPlannedPause: HealthGroupRow[] = [
  {
    groupId: "fb-pp-1",
    name: "Sunset Seniors",
    sessionStatus: "planned_pause",
    healthStatus: "healthy_paused",
    followUpNeeded: false,
    leaderNames: ["Linda Chen"],
  },
];

const healthNeedsFollowUp: HealthGroupRow[] = [
  {
    groupId: "fb-cap-full-1",
    name: "South Campus Women",
    sessionStatus: "submitted",
    healthStatus: "needs_follow_up",
    followUpNeeded: true,
    leaderNames: ["Priya Mehta"],
  },
];

const healthWatch: HealthGroupRow[] = [
  {
    groupId: "fb-cap-warn-1",
    name: "Downtown Professionals",
    sessionStatus: "submitted",
    healthStatus: "watch",
    followUpNeeded: false,
    leaderNames: ["Noah Bennett"],
  },
];

const healthHealthy: HealthGroupRow[] = [
  {
    groupId: "fb-cap-ok-2",
    name: "Hillside Couples",
    sessionStatus: "submitted",
    healthStatus: "healthy",
    followUpNeeded: false,
    leaderNames: ["Grace Tan", "Eli Robinson"],
  },
];

const setupNoCapacity: SetupGapRow[] = [
  {
    groupId: "fb-cap-unknown-1",
    name: "Bridge Builders",
    gaps: ["capacity"],
    hasExclusion: false,
    isCapacityUnknown: true,
  },
];

const setupNoLeader: SetupGapRow[] = [
  {
    groupId: "fb-no-leader-1",
    name: "Pending Launch Group",
    gaps: ["leader", "meeting_day_time", "members"],
    hasExclusion: false,
    isCapacityUnknown: false,
  },
];

const setupNoMeetingDayTime: SetupGapRow[] = [
  {
    groupId: "fb-no-leader-1",
    name: "Pending Launch Group",
    gaps: ["leader", "meeting_day_time", "members"],
    hasExclusion: false,
    isCapacityUnknown: false,
  },
];

const setupNoMembers: SetupGapRow[] = [
  {
    groupId: "fb-no-leader-1",
    name: "Pending Launch Group",
    gaps: ["leader", "meeting_day_time", "members"],
    hasExclusion: false,
    isCapacityUnknown: false,
  },
];

const fallbackAttention: AttentionItem[] = [
  {
    groupId: "fb-cap-full-1",
    groupName: "South Campus Women",
    reason: "follow_up_open",
    secondaryReasons: ["capacity_full", "health_needs_follow_up"],
    detail: "1 open follow-up",
    priority: 10,
    lifecycleStatus: "active",
    leaderNames: ["Priya Mehta"],
    meetingDay: "Wednesday",
    meetingTime: "19:00",
    effectiveCapacity: 14,
    activeMemberCount: 14,
    sessionStatus: "submitted",
    excludedFromCapacity: false,
    dueLabel: null,
    dueRelative: null,
    isOverdue: false,
  },
  {
    groupId: "fb-cap-warn-1",
    groupName: "Downtown Professionals",
    reason: "capacity_warning",
    secondaryReasons: ["health_watch"],
    detail: "10 / 12 active members",
    priority: 40,
    lifecycleStatus: "active",
    leaderNames: ["Noah Bennett"],
    meetingDay: "Thursday",
    meetingTime: "18:30",
    effectiveCapacity: 12,
    activeMemberCount: 10,
    sessionStatus: "submitted",
    excludedFromCapacity: false,
    dueLabel: null,
    dueRelative: null,
    isOverdue: false,
  },
  // The Shepherd→admin reporting loop was removed per
  // docs/adr/0002-oversight-ladder-and-leader-gating.md: collectReasonsFor no
  // longer surfaces missing_check_in for live data (with the leader surface
  // gated, no check-ins are submitted), so the fallback must not seed a
  // "Missing check-in" attention card either — otherwise a degraded dashboard
  // (unconfigured client / query error) re-surfaces the exact signal the ADR
  // retired. The missing_check_in enum value, label and priority stay dormant.
  {
    groupId: "fb-cap-unknown-1",
    groupName: "Bridge Builders",
    reason: "capacity_unknown",
    secondaryReasons: [],
    detail: "No capacity configured (override, group, or default)",
    priority: 70,
    lifecycleStatus: "active",
    leaderNames: ["Jordan Kim"],
    meetingDay: "Monday",
    meetingTime: "19:00",
    effectiveCapacity: null,
    activeMemberCount: 4,
    sessionStatus: "submitted",
    excludedFromCapacity: false,
    dueLabel: null,
    dueRelative: null,
    isOverdue: false,
  },
  {
    groupId: "fb-no-leader-1",
    groupName: "Pending Launch Group",
    reason: "no_leader",
    secondaryReasons: ["no_members", "missing_meeting_day_time"],
    detail: "No active leader assigned",
    priority: 80,
    lifecycleStatus: "launching_soon",
    leaderNames: [],
    meetingDay: null,
    meetingTime: null,
    effectiveCapacity: null,
    activeMemberCount: 0,
    sessionStatus: "no_session",
    excludedFromCapacity: false,
    dueLabel: null,
    dueRelative: null,
    isOverdue: false,
  },
];

const fallbackShepherdCare: ShepherdCareDashboardSummary = {
  totalActiveShepherds: 24,
  needsAttention: 3,
  overdueTouchpoints: 2,
  notContactedRecently: 4,
  noCareProfile: 5,
  unassignedCoverage: 6,
  activeOverShepherds: 4,
  attentionItemsTotal: 7,
  coverageAvailable: true,
  available: true,
  error: null,
};

const FALLBACK_CHURCH_ATTENDANCE = 200;
const FALLBACK_PARTICIPANTS = 142;

const fallbackLaunchPlanning: LaunchPlanningDashboardSnapshot = {
  effectiveTotalCapacity: 168,
  currentParticipants: FALLBACK_PARTICIPANTS,
  projectedGroupDemand: 180,
  capacityGap: 18,
  recommendedNewGroups: 2,
  estimatedNewLeadersNeeded: 4,
  riskLevel: "watch",
  suggestedLaunchByDate: "2026-07-15",
  unknownCapacityGroupCount: 1,
  excludedActiveGroupCount: 1,
  currentChurchAttendance: FALLBACK_CHURCH_ATTENDANCE,
  // Derived from the same inputs so the fallback can't drift from its own
  // numerator/denominator (matches participationPct rounding).
  participationPct: Math.round(
    (FALLBACK_PARTICIPANTS / FALLBACK_CHURCH_ATTENDANCE) * 100
  ),
  assumptionsAvailable: true,
  available: true,
  error: null,
};

const fallbackLeaderPipeline: LeaderPipelineDashboardSummary = {
  counts: { identified: 4, in_training: 3, ready_to_lead: 2, launched: 1 },
  total: 10,
  available: true,
  error: null,
};

const fallbackMultiplication: MultiplicationDashboardSummary = {
  counts: { watching: 3, planned: 2, launched: 1, deferred: 1 },
  total: 7,
  available: true,
  error: null,
};

// Default-grain (all-time) activity for the period band when no Supabase client
// is configured (e.g. /admin-preview sketches).
const fallbackActivity: OverviewActivitySummary = {
  grain: "all",
  label: "All time",
  groupsLaunched: 6,
  guestsWelcomed: 23,
  membersJoined: 41,
  followUpsCompleted: 18,
  careTouchpoints: 35,
  extendedAvailable: true,
  error: null,
};

export const ADMIN_FALLBACK: AdminDashboardData = {
  meetingWeek: FALLBACK_WEEK,
  weekLabel: FALLBACK_WEEK_LABEL,
  isCurrentWeek: true,
  summary: {
    activeGroupCount: 18,
    submittedCheckIns: 14,
    missingCheckIns: 4,
    needsFollowUp: 2,
    capacityWatch: 3,
    unknownCapacity: 1,
  },
  shepherdCare: fallbackShepherdCare,
  launchPlanning: fallbackLaunchPlanning,
  leaderPipeline: fallbackLeaderPipeline,
  multiplication: fallbackMultiplication,
  activity: fallbackActivity,
  attentionItems: fallbackAttention,
  // Derived by the live assembler from the demo seed (lib/dashboard/demo-seed.ts)
  // rather than hand-built, so the demo capacity rows can't diverge from the
  // live capacity rules. See docs/adr/0011-group-row-assembly-stays-per-surface.md.
  capacitySummary: DEMO_CAPACITY_SUMMARY,
  healthSummary: {
    submitted: healthSubmitted,
    missing: healthMissing,
    didNotMeet: healthDidNotMeet,
    plannedPause: healthPlannedPause,
    needsFollowUp: healthNeedsFollowUp,
    watch: healthWatch,
    healthy: healthHealthy,
    counts: {
      submitted: healthSubmitted.length,
      missing: healthMissing.length,
      did_not_meet: healthDidNotMeet.length,
      planned_pause: healthPlannedPause.length,
      needs_follow_up: healthNeedsFollowUp.length,
      watch: healthWatch.length,
      healthy: healthHealthy.length,
    },
  },
  setupGaps: {
    noCapacity: setupNoCapacity,
    noLeader: setupNoLeader,
    noMeetingDayTime: setupNoMeetingDayTime,
    noMembers: setupNoMembers,
    counts: {
      noCapacity: setupNoCapacity.length,
      noLeader: setupNoLeader.length,
      noMeetingDayTime: setupNoMeetingDayTime.length,
      noMembers: setupNoMembers.length,
    },
  },
  guestPipelineCount: fallbackGuestPipelineCount,
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
  groups: [
    {
      group: {
        groupId: "fallback-leader-group",
        name: "Tuesday Night Life Group",
        meetingDay: "Tuesday",
        meetingTime: "19:00",
        lifecycleStatus: "active",
        healthStatus: "healthy",
        capacity: 12,
        activeMembers: 8,
        weekLabel: "Week of May 18",
        members: [
          { id: "fallback-m-1", displayName: "Jordan K." },
          { id: "fallback-m-2", displayName: "Priya M." },
          { id: "fallback-m-3", displayName: "Noah B." },
          { id: "fallback-m-4", displayName: "Grace T." },
          { id: "fallback-m-5", displayName: "Elijah R." },
          { id: "fallback-m-6", displayName: "Avery L." },
          { id: "fallback-m-7", displayName: "Sam W." },
          { id: "fallback-m-8", displayName: "Riley T." },
        ],
      },
      recentSessions: [
        {
          meetingWeek: "2026-05-11",
          status: "submitted",
          presentCount: 7,
          absentCount: 1,
          excusedCount: 0,
        },
        {
          meetingWeek: "2026-05-04",
          status: "submitted",
          presentCount: 6,
          absentCount: 1,
          excusedCount: 1,
        },
        {
          meetingWeek: "2026-04-27",
          status: "submitted",
          presentCount: 7,
          absentCount: 0,
          excusedCount: 1,
        },
        {
          meetingWeek: "2026-04-20",
          status: "submitted",
          presentCount: 6,
          absentCount: 2,
          excusedCount: 0,
        },
      ],
      healthPulse: {
        attendanceRhythm: "Steady",
        newGuestsThisWeek: 1,
        currentHealth: "healthy",
        leaderNote:
          "Group continues to grow steadily; planning a guest-friendly week soon.",
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
      currentWeek: {
        meetingWeek: "2026-05-18",
        status: "not_submitted",
        alreadySubmitted: false,
        presentCount: 0,
        absentCount: 0,
        excusedCount: 0,
        meetingDate: null,
        submittedAt: null,
        leaderNote: null,
      },
      upcomingEvents: fallbackLeaderUpcoming,
    },
  ],
};
