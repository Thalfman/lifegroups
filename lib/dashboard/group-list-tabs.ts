import type { GroupListTab } from "@/lib/dashboard/group-status";

export const GROUP_LIST_TAB_KEYS = [
  "all",
  "needs_setup",
  "needs_health_check",
  "needs_attention",
  "archived",
] as const satisfies readonly GroupListTab[];

const GROUP_LIST_TAB_SET = new Set<string>(GROUP_LIST_TAB_KEYS);

export function resolveGroupListTab(
  raw: string | string[] | undefined
): GroupListTab {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && GROUP_LIST_TAB_SET.has(value)
    ? (value as GroupListTab)
    : "all";
}

// The task-shaped tabs (#650): setup deep-links land on these, and they read as
// task cards. The directory defaults them to the card layout without touching
// the global default (the `all` tab + table) or an admin's persisted browsing
// preference for the other tabs.
export const TASK_LIST_TABS = [
  "needs_setup",
  "needs_health_check",
] as const satisfies readonly GroupListTab[];

const TASK_LIST_TAB_SET = new Set<string>(TASK_LIST_TABS);

export function isTaskListTab(tab: GroupListTab): boolean {
  return TASK_LIST_TAB_SET.has(tab);
}
