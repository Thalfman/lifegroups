import { isTaskListTab } from "@/lib/dashboard/group-list-tabs";
import type { ListTab, ViewMode } from "./types";

// #650: which card⇄table layout the directory actually renders for a tab.
//
// The task tabs (Needs setup / Needs health check) default to the card layout
// so setup deep-links land on task cards, while the `all`/`archived`/attention
// tabs follow the admin's persisted browsing preference (`browsingMode`). On a
// task tab the admin can still toggle to a table for the current visit
// (`taskOverride`), but that choice is deliberately ephemeral — it is never
// persisted, so it can't change the global browsing default.
export function effectiveGroupsViewMode(args: {
  tab: ListTab;
  browsingMode: ViewMode;
  taskOverride: ViewMode | null;
}): ViewMode {
  return isTaskListTab(args.tab)
    ? (args.taskOverride ?? "cards")
    : args.browsingMode;
}
