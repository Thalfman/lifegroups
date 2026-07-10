export type UserRole =
  | "super_admin"
  | "ministry_admin"
  | "over_shepherd"
  | "leader"
  | "co_leader";
// Note: a legacy no-access role was removed from this union (#190). Existing
// rows were migrated to inactive `leader` (also no-access per ADR 0002). The
// value was deliberately KEPT in the `user_role` Postgres enum but made inert
// (20260531140000: `auth_role()` returns `public.user_role`, so recreating the
// type would cascade through every predicate); the types-drift guard
// allowlists this divergence (tests/integration/support/types-drift-manifest.ts).
export type ProfileStatus = "active" | "inactive" | "invited";
export type GroupLifecycleStatus =
  | "active"
  | "planned_pause"
  | "seasonal_break"
  | "launching_soon"
  | "needs_leader"
  | "at_risk"
  | "closed";
export type GroupHealthStatus =
  | "healthy"
  | "watch"
  | "needs_follow_up"
  | "healthy_paused"
  | "restart_soon"
  | "overdue_restart"
  | "capacity_full"
  | "needs_leader_support";
export type MembershipStatus = "active" | "inactive" | "paused" | "transferred";
export type RoleInGroup = "member" | "leader" | "co_leader";
export type AttendanceStatus = "present" | "absent" | "excused";
export type AttendanceSessionStatus =
  | "not_submitted"
  | "submitted"
  | "did_not_meet"
  | "planned_pause"
  | "admin_entered";
export type GuestPipelineStage =
  | "new"
  | "contacted"
  | "interested"
  | "assigned"
  | "attended"
  | "placed"
  | "not_now";
export type FollowUpType =
  | "attendance"
  | "guest"
  | "leader"
  | "capacity"
  | "pause"
  | "care"
  | "admin";
export type FollowUpStatus = "open" | "in_progress" | "done" | "snoozed";
export type FollowUpPriority = "low" | "normal" | "high";
export type MeetingFrequency = "weekly" | "biweekly" | "monthly";
export type MeetingWeekParity = "odd" | "even";
// Deliberate retention: 20260611000000_phase_groups2_group_category_retire_
// life_stage.sql dropped the `groups.life_stage` COLUMN but intentionally kept
// the `group_life_stage` Postgres enum TYPE (dropping the column does not
// require dropping its type; keeping it avoids breaking other objects and
// leaves it available for reuse). This union stays to mirror that live type;
// the types-drift guard allowlists the no-column state
// (tests/integration/support/types-drift-manifest.ts).
export type GroupLifeStage =
  | "young_professionals"
  | "young_families"
  | "families_with_kids"
  | "families_with_adult_kids"
  | "retirement"
  | "multi_generational"
  | "spanish_speaking";
export type MultiplicationCandidateStatus =
  | "watching"
  | "planned"
  | "launched"
  | "deferred";
// Julian #143: the Doc's "during the day" / "evening" meeting-time options,
// captured on the multiplication candidate so the planner can honour the
// "two options per person" goal.
export type MultiplicationMeetingTime = "during_the_day" | "evening";
// Capacity & Multiplication PRD §3.2 (#183): an Apprentice's readiness stage —
// the leader-in-training's progress toward leading the next group. The pipeline
// rolls these up so "who is Ready to lead?" is a glance, not a hunt.
export type LeaderReadinessStage =
  | "identified"
  | "in_training"
  | "ready_to_lead"
  | "launched";
export type GroupCalendarEventType =
  | "study"
  | "community_night"
  | "mens_transformation"
  | "womens_transformation"
  | "social"
  | "service"
  | "prayer"
  | "off"
  | "cancelled"
  | "other";
export type GroupCalendarEventStatus = "scheduled" | "off" | "cancelled";
// Leader Care Status (PRD Q2 / ADR 0004 D2): Julian's five. `inactive` is a
// lifecycle state, not a severity level. `needs_follow_up` also exists in
// group_health_status (the Health Pulse) — distinct enum types, distinct
// concepts (see CONTEXT.md).
export type ShepherdCareStatus =
  | "doing_well"
  | "needs_encouragement"
  | "needs_follow_up"
  | "concern"
  | "inactive";
export type ShepherdCareInteractionType =
  | "call"
  | "text"
  | "in_person"
  | "meeting"
  | "other";
export type ShepherdCareFollowUpStatus = "open" | "in_progress" | "done";
// Group-Health Grade (#127). A report-card letter, plus the scope a manual
// override is held under (#129): cleared at the monthly rollover, or standing.
// The pivot's configurable Health Rubric (ADR 0018) adds `F` so a failing group
// can be graded — the scale is now A / B / C / D / F (no E).
export type GroupHealthLetter = "A" | "B" | "C" | "D" | "F";
export type GroupHealthOverrideScope = "this_month" | "until_cleared";
// Leader-Health Grade (ADR 0018): the symmetric per-Leader letter grade,
// computed from the Leader-Health Rubric. Same A / B / C / D / F scale as the
// Group-Health Grade, about the person rather than the group. The override
// scope is shared with the group grade (GroupHealthOverrideScope).
export type LeaderHealthLetter = "A" | "B" | "C" | "D" | "F";
// Prospect state (ADR 0016): the four colour-coded states a Prospect moves
// through in the Interest Funnel (the Plan area), superseding guest_pipeline_stage.
//   interested (yellow) → matched (blue) → joined (green); not_at_this_time (orange)
// matched/joined require a group; joined archives the Prospect out of the active
// board into the collapsed Joined roll-up.
export type ProspectState =
  | "interested"
  | "matched"
  | "joined"
  | "not_at_this_time";
