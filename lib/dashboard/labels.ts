import type {
  GroupHealthStatus,
  GroupLifecycleStatus,
  GuestPipelineStage,
  FollowUpType,
  FollowUpPriority,
  AttendanceSessionStatus,
  ShepherdCareInteractionType,
  ShepherdCareStatus,
} from "@/types/enums";

const lifecycleLabels: Record<GroupLifecycleStatus, string> = {
  active: "Active",
  planned_pause: "Planned Pause",
  seasonal_break: "Seasonal Break",
  launching_soon: "Launching Soon",
  needs_leader: "Needs Leader",
  at_risk: "At Risk",
  closed: "Closed",
};

const healthLabels: Record<GroupHealthStatus, string> = {
  healthy: "Healthy",
  watch: "Watch",
  needs_follow_up: "Needs Follow-up",
  healthy_paused: "Healthy (Paused)",
  restart_soon: "Restart Soon",
  overdue_restart: "Overdue Restart",
  capacity_full: "Capacity Full",
  needs_leader_support: "Needs Leader Support",
};

const pipelineLabels: Record<GuestPipelineStage, string> = {
  new: "New",
  contacted: "Contacted",
  interested: "Interested",
  assigned: "Assigned",
  attended: "Attended",
  placed: "Placed",
  not_now: "Not now",
};

const followUpTypeLabels: Record<FollowUpType, string> = {
  attendance: "Attendance",
  guest: "Guest",
  leader: "Leader",
  capacity: "Capacity",
  pause: "Pause",
  care: "Care",
  admin: "Admin",
};

const followUpPriorityLabels: Record<FollowUpPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
};

const sessionStatusLabels: Record<AttendanceSessionStatus, string> = {
  not_submitted: "Not submitted",
  submitted: "Submitted",
  did_not_meet: "Did not meet",
  planned_pause: "Planned pause",
  admin_entered: "Admin entered",
};

export function lifecycleStatusLabel(status: GroupLifecycleStatus): string {
  return lifecycleLabels[status] ?? status;
}

export function healthStatusLabel(status: GroupHealthStatus): string {
  return healthLabels[status] ?? status;
}

export function pipelineStageLabel(stage: GuestPipelineStage): string {
  return pipelineLabels[stage] ?? stage;
}

export function followUpTypeLabel(type: FollowUpType): string {
  return followUpTypeLabels[type] ?? type;
}

export function followUpPriorityLabel(priority: FollowUpPriority): string {
  return followUpPriorityLabels[priority] ?? priority;
}

export function sessionStatusLabel(status: AttendanceSessionStatus): string {
  return sessionStatusLabels[status] ?? status;
}

const shepherdCareStatusLabels: Record<ShepherdCareStatus, string> = {
  healthy: "Healthy",
  watch: "Watch",
  needs_attention: "Needs attention",
};

const shepherdCareInteractionTypeLabels: Record<ShepherdCareInteractionType, string> = {
  call: "Call",
  text: "Text",
  in_person: "In person",
  meeting: "Meeting",
  other: "Other",
};

export function shepherdCareStatusLabel(status: ShepherdCareStatus): string {
  return shepherdCareStatusLabels[status] ?? status;
}

export function shepherdCareInteractionTypeLabel(
  type: ShepherdCareInteractionType,
): string {
  return shepherdCareInteractionTypeLabels[type] ?? type;
}
