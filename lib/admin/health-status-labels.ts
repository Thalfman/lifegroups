// #478 (P2.2): the ONE canonical display label per group health status. The
// Settings override form's dropdown options and the per-group override
// summary chips both read this map, so the label an admin picks and the
// summary that echoes the pick can't drift — and no Settings surface falls
// back to de-underscored enum text ("needs follow up") again. Pure data, no
// I/O — safe to import from both server and client components.

import type { GroupHealthStatus } from "@/types/enums";

// Exhaustive over the enum (a new status fails the typecheck here), in the
// display order the override form offers: the everyday triage trio first,
// then the pause/restart states, then the structural flags.
export const GROUP_HEALTH_STATUS_LABEL: Record<GroupHealthStatus, string> = {
  healthy: "Healthy",
  watch: "Watch",
  needs_follow_up: "Needs follow-up",
  healthy_paused: "Healthy (paused)",
  restart_soon: "Restart soon",
  overdue_restart: "Overdue restart",
  capacity_full: "Capacity full",
  needs_leader_support: "Needs leader support",
};

// The statuses in display order (object key order is insertion order for
// string keys), so option lists render in the order defined above.
export const GROUP_HEALTH_STATUSES = Object.keys(
  GROUP_HEALTH_STATUS_LABEL
) as GroupHealthStatus[];

// The canonical label for one status. The map is exhaustive over the type,
// but the value ultimately comes from the database (the trust boundary), so
// fall back to the raw value rather than rendering nothing.
export function groupHealthStatusLabel(status: GroupHealthStatus): string {
  return GROUP_HEALTH_STATUS_LABEL[status] ?? status;
}
