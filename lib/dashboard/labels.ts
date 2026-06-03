import type {
  GroupHealthStatus,
  GroupLifecycleStatus,
  GuestPipelineStage,
  FollowUpType,
  FollowUpPriority,
  AttendanceSessionStatus,
  ShepherdCareFollowUpStatus,
  ShepherdCareInteractionType,
  ShepherdCareStatus,
} from "@/types/enums";
import {
  CARE_STATUS_COPY_KEYS,
  resolveCopy,
  type EditableCopyConfig,
} from "@/lib/admin/editable-copy";

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

// ---------------------------------------------------------------------------
// Four independent group-status categories (issue #300)
// ---------------------------------------------------------------------------
//
// The Groups surface shows a group's standing as FOUR separate, independent
// labels — never a combined chip like "Active Healthy". Each category answers a
// different question and has its own closed display vocabulary. These are
// *display* categories layered over the data-model enums, deliberately coarser:
//   * Lifecycle — is the group running? (folds the seven lifecycle_status enum
//     values down to Active / Paused / Archived.)
//   * Setup     — is the group configured enough to operate?
//   * Health    — the Group-Health Grade (Q12 computed grade), NOT Leader Care
//     Status or Health Pulse (CONTEXT.md). Coarsened to the operator's
//     "anything to look at?" read.
//   * Capacity  — how full is it?

// Lifecycle: the running state, collapsed to the three the operator scans for.
export type GroupLifecycleCategory = "active" | "paused" | "archived";

const lifecycleCategoryLabels: Record<GroupLifecycleCategory, string> = {
  active: "Active",
  paused: "Paused",
  archived: "Archived",
};

export function lifecycleCategory(
  status: GroupLifecycleStatus
): GroupLifecycleCategory {
  if (status === "closed") return "archived";
  if (status === "planned_pause" || status === "seasonal_break")
    return "paused";
  return "active";
}

export function lifecycleCategoryLabel(
  category: GroupLifecycleCategory
): string {
  return lifecycleCategoryLabels[category];
}

// Setup: is the group configured enough to run? `needs_leader` and
// `missing_meeting` are the two specific gaps worth surfacing on their own; any
// other gap reads as the generic `needs_setup`.
export type GroupSetupCategory =
  | "complete"
  | "needs_setup"
  | "needs_leader"
  | "missing_meeting";

const setupCategoryLabels: Record<GroupSetupCategory, string> = {
  complete: "Setup complete",
  needs_setup: "Needs setup",
  needs_leader: "Needs leader",
  missing_meeting: "Missing meeting details",
};

export function setupCategoryLabel(category: GroupSetupCategory): string {
  return setupCategoryLabels[category];
}

// Health: the Group-Health Grade read, coarsened to the three states the
// operator triages by. "Needs attention" = graded at or below the director's
// Watch threshold; "No current concerns" = graded above it; "Not assessed" =
// no grade yet. This is the Group-Health Grade, not care status / health pulse.
export type GroupHealthCategory =
  | "not_assessed"
  | "no_concerns"
  | "needs_attention";

const healthCategoryLabels: Record<GroupHealthCategory, string> = {
  not_assessed: "Not assessed",
  no_concerns: "No current concerns",
  needs_attention: "Needs attention",
};

export function healthCategoryLabel(category: GroupHealthCategory): string {
  return healthCategoryLabels[category];
}

// Capacity: how full the group is, in the operator's words.
export type GroupCapacityCategory = "open" | "near_full" | "full";

const capacityCategoryLabels: Record<GroupCapacityCategory, string> = {
  open: "Open",
  near_full: "Near full",
  full: "Full",
};

export function capacityCategoryLabel(category: GroupCapacityCategory): string {
  return capacityCategoryLabels[category];
}

export function pipelineStageLabel(stage: GuestPipelineStage): string {
  return pipelineLabels[stage] ?? stage;
}

// A guest is "in the pipeline" until it reaches a terminal stage: `placed`
// (landed in a group) or `not_now` (declined for now). The single definition
// of the headline-count rule, shared by the live read (admin-group-model) and
// the fallback data so the two can't silently drift apart.
export function isActivePipelineStage(stage: GuestPipelineStage): boolean {
  return stage !== "placed" && stage !== "not_now";
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
  doing_well: "Doing well",
  needs_encouragement: "Needs encouragement",
  needs_follow_up: "Needs follow-up",
  concern: "Concern",
  inactive: "Inactive",
};

const shepherdCareInteractionTypeLabels: Record<
  ShepherdCareInteractionType,
  string
> = {
  call: "Call",
  text: "Text",
  in_person: "In person",
  meeting: "Meeting",
  other: "Other",
};

// Phase SAC.2 (#162): the care-status display labels are now operator-editable
// via the Super Admin Console's editable_copy config. The optional `copyConfig`
// lets a config-aware caller (e.g. the care dashboard, which already loads
// platform config) render the configured wording; omitting it keeps the
// built-in labels, so every existing caller compiles and behaves unchanged.
export function shepherdCareStatusLabel(
  status: ShepherdCareStatus,
  copyConfig?: EditableCopyConfig
): string {
  if (copyConfig) {
    const key = CARE_STATUS_COPY_KEYS[status];
    if (key) return resolveCopy(copyConfig, key);
  }
  return shepherdCareStatusLabels[status] ?? status;
}

export function shepherdCareInteractionTypeLabel(
  type: ShepherdCareInteractionType
): string {
  return shepherdCareInteractionTypeLabels[type] ?? type;
}

const shepherdCareFollowUpStatusLabels: Record<
  ShepherdCareFollowUpStatus,
  string
> = {
  open: "Open",
  in_progress: "In progress",
  done: "Done",
};

export function shepherdCareFollowUpStatusLabel(
  status: ShepherdCareFollowUpStatus
): string {
  return shepherdCareFollowUpStatusLabels[status] ?? status;
}
