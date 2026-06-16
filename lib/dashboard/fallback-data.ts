import type {
  AdminDashboardData,
  InterestFunnelDashboardSummary,
  LeaderDashboardData,
  LeaderPipelineDashboardSummary,
  MultiplicationDashboardSummary,
  MultiplyReadinessDashboardSummary,
  OverviewActivitySummary,
  PipelineStageCount,
  ShepherdCareDashboardSummary,
  UpcomingCalendarEvent,
} from "./types";
import { GUEST_PIPELINE_STAGES } from "@/lib/supabase/read-models";
import { pipelineStageLabel, isActivePipelineStage } from "./labels";
import {
  DEMO_ATTENTION_ITEMS,
  DEMO_CAPACITY_SUMMARY,
  DEMO_HEALTH_SUMMARY,
  DEMO_LAUNCH_PLANNING,
  DEMO_NOW_ISO,
  DEMO_SETUP_GAPS,
  DEMO_SHEPHERD_CARE_SUMMARY,
  DEMO_SUMMARY,
} from "./demo-seed";
import { addDaysIso, churchTodayIso } from "@/lib/shared/church-time";

// The demo "week ahead" horizon, derived the same way the live assembler does
// (church-local today + 7 days from the pinned demo `now`) so the no-client
// demo card gates its launch milestone against the same shared bound as live.
const DEMO_WEEK_AHEAD_CUTOFF_ISO = addDaysIso(
  churchTodayIso(new Date(DEMO_NOW_ISO)),
  7
);

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

// Derived from the Care demo seed through the live summary rule
// (lib/dashboard/shepherd-care-summary.ts) — never hardcoded, so a change to
// the attention/cadence rules re-grades the demo card automatically.
const fallbackShepherdCare: ShepherdCareDashboardSummary =
  DEMO_SHEPHERD_CARE_SUMMARY;

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

// Pivot overview demo seeds (#470). These travel as their own props (not
// fields of ADMIN_FALLBACK) because the page loads each summary in parallel
// with the dashboard read and degrades it per-card; the no-client preview
// substitutes these typed seeds instead. The vital-signs band (#476) renders
// the same seeds for its "Prospects in funnel" (active states, Joined as the
// roll-up meta) and "Cells ready to multiply" tiles, so the demo band always
// agrees with the demo overview cards.
export const INTEREST_FUNNEL_FALLBACK: InterestFunnelDashboardSummary = {
  counts: { interested: 5, matched: 3, joined: 4, not_at_this_time: 2 },
  available: true,
  error: null,
};

export const MULTIPLY_READINESS_FALLBACK: MultiplyReadinessDashboardSummary = {
  readyCells: 2,
  activeCells: 6,
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
  prospectsAdded: 9,
  membersJoined: 41,
  followUpsCompleted: 18,
  careTouchpoints: 35,
  extendedAvailable: true,
  error: null,
  resetBaselineOn: null,
};

export const ADMIN_FALLBACK: AdminDashboardData = {
  meetingWeek: FALLBACK_WEEK,
  weekLabel: FALLBACK_WEEK_LABEL,
  isCurrentWeek: true,
  // Derived from the demo seed so the vital-signs tiles can't contradict the
  // capacity / health / setup boards below them (all derive from one model).
  summary: DEMO_SUMMARY,
  shepherdCare: fallbackShepherdCare,
  // The launch snapshot, the attention queue, the capacity board, the health
  // buckets and the setup-gap lists are all derived by the live assembler (and
  // the shared launch-snapshot builder) from the demo seed in
  // lib/dashboard/demo-seed.ts, rather than hand-built — so the demo can't
  // diverge from the live derivation rules. The whole assembler-shaped portion
  // of the demo dashboard now has one source of truth.
  // See docs/adr/0011-group-row-assembly-stays-per-surface.md.
  launchPlanning: DEMO_LAUNCH_PLANNING,
  leaderPipeline: fallbackLeaderPipeline,
  multiplication: fallbackMultiplication,
  activity: fallbackActivity,
  attentionItems: DEMO_ATTENTION_ITEMS,
  capacitySummary: DEMO_CAPACITY_SUMMARY,
  healthSummary: DEMO_HEALTH_SUMMARY,
  setupGaps: DEMO_SETUP_GAPS,
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
      title: "Confirm Hillside Couples restart date",
      type: "pause",
      priority: "normal",
      status: "open",
      dueDate: null,
      relatedGroupName: "Hillside Couples",
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
  // The demo follow-ups above all have no due date, so none fall in the
  // "this week" window — 0 keeps the demo card and the "Follow-ups due this
  // week" vital sign (#476) consistent with that list. (When the dashboard
  // read actually failed both render degraded — "—", never a false zero;
  // this value is for the no-client demo.)
  dueFollowUpsThisWeekCount: 0,
  weekAheadCutoffIso: DEMO_WEEK_AHEAD_CUTOFF_ISO,
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
