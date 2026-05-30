export type UserRole = 'super_admin' | 'ministry_admin' | 'over_shepherd' | 'staff_viewer' | 'leader' | 'co_leader';
export type ProfileStatus = 'active' | 'inactive' | 'invited';
export type GroupLifecycleStatus = 'active' | 'planned_pause' | 'seasonal_break' | 'launching_soon' | 'needs_leader' | 'at_risk' | 'closed';
export type GroupHealthStatus = 'healthy' | 'watch' | 'needs_follow_up' | 'healthy_paused' | 'restart_soon' | 'overdue_restart' | 'capacity_full' | 'needs_leader_support';
export type MembershipStatus = 'active' | 'inactive' | 'paused' | 'transferred';
export type RoleInGroup = 'member' | 'leader' | 'co_leader';
export type AttendanceStatus = 'present' | 'absent' | 'excused';
export type AttendanceSessionStatus = 'not_submitted' | 'submitted' | 'did_not_meet' | 'planned_pause' | 'admin_entered';
export type GuestPipelineStage = 'new' | 'contacted' | 'interested' | 'assigned' | 'attended' | 'placed' | 'not_now';
export type FollowUpType = 'attendance' | 'guest' | 'leader' | 'capacity' | 'pause' | 'care' | 'admin';
export type FollowUpStatus = 'open' | 'in_progress' | 'done' | 'snoozed';
export type FollowUpPriority = 'low' | 'normal' | 'high';
export type MeetingFrequency = 'weekly' | 'biweekly' | 'monthly';
export type MeetingWeekParity = 'odd' | 'even';
export type GroupAudienceCategory = 'men' | 'women' | 'mixed';
export type GroupLifeStage =
  | 'young_professionals'
  | 'young_families'
  | 'families_with_kids'
  | 'families_with_adult_kids'
  | 'retirement'
  | 'multi_generational'
  | 'spanish_speaking';
export type MultiplicationCandidateStatus =
  | 'watching'
  | 'planned'
  | 'launched'
  | 'deferred';
// Julian #143: the Doc's "during the day" / "evening" meeting-time options,
// captured on the multiplication candidate so the planner can honour the
// "two options per person" goal.
export type MultiplicationMeetingTime = 'during_the_day' | 'evening';
export type GroupCalendarEventType =
  | 'study'
  | 'community_night'
  | 'mens_transformation'
  | 'womens_transformation'
  | 'social'
  | 'service'
  | 'prayer'
  | 'off'
  | 'cancelled'
  | 'other';
export type GroupCalendarEventStatus = 'scheduled' | 'off' | 'cancelled';
// Leader Care Status (PRD Q2 / ADR 0004 D2): Julian's five. `inactive` is a
// lifecycle state, not a severity level. `needs_follow_up` also exists in
// group_health_status (the Health Pulse) — distinct enum types, distinct
// concepts (see CONTEXT.md).
export type ShepherdCareStatus =
  | 'doing_well'
  | 'needs_encouragement'
  | 'needs_follow_up'
  | 'concern'
  | 'inactive';
export type ShepherdCareInteractionType = 'call' | 'text' | 'in_person' | 'meeting' | 'other';
export type ShepherdCareFollowUpStatus = 'open' | 'in_progress' | 'done';
// Group-Health Grade (#127). A–D report-card letter, plus the scope a manual
// override is held under (#129): cleared at the monthly rollover, or standing.
export type GroupHealthLetter = 'A' | 'B' | 'C' | 'D';
export type GroupHealthOverrideScope = 'this_month' | 'until_cleared';
