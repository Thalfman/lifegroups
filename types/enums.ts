export type UserRole = 'super_admin' | 'ministry_admin' | 'staff_viewer' | 'leader' | 'co_leader';
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
export type ShepherdCareStatus = 'healthy' | 'watch' | 'needs_attention';
export type ShepherdCareInteractionType = 'call' | 'text' | 'in_person' | 'meeting' | 'other';
