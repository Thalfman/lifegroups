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
