import type { GroupHealthStatus, GroupLifecycleStatus } from "@/types/enums";
import type { BadgeLifecycle, BadgeTone } from "@/components/dashboard/badges";
import { healthStatusLabel, lifecycleStatusLabel } from "./labels";

export interface LifecycleBadgeProps {
  status: BadgeLifecycle;
  label: string;
}

export interface HealthBadgeProps {
  tone: BadgeTone;
  label: string;
}

const lifecycleToBadge: Record<GroupLifecycleStatus, BadgeLifecycle> = {
  active: "Active",
  planned_pause: "Planned Pause",
  seasonal_break: "Seasonal Break",
  launching_soon: "Restart Soon",
  needs_leader: "Overdue Restart",
  at_risk: "Overdue Restart",
  closed: "Seasonal Break",
};

const healthToTone: Record<GroupHealthStatus, BadgeTone> = {
  healthy: "healthy",
  healthy_paused: "healthy",
  watch: "watch",
  capacity_full: "watch",
  restart_soon: "watch",
  needs_follow_up: "followup",
  overdue_restart: "followup",
  needs_leader_support: "followup",
};

export function mapLifecycleToBadge(status: GroupLifecycleStatus): LifecycleBadgeProps {
  return {
    status: lifecycleToBadge[status],
    label: lifecycleStatusLabel(status),
  };
}

export function mapHealthToBadge(status: GroupHealthStatus): HealthBadgeProps {
  return {
    tone: healthToTone[status],
    label: healthStatusLabel(status),
  };
}
