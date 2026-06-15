import type {
  GroupListTab,
  GroupTriageSignals,
} from "@/lib/dashboard/group-status";
import type { GroupsTableSortRow } from "@/lib/dashboard/groups-table-sort";
import type {
  GroupCapacityCategory,
  GroupHealthCategory,
  GroupLifecycleCategory,
  GroupSetupCategory,
} from "@/lib/dashboard/labels";
import type { AttendanceSessionsRow, GroupsRow } from "@/types/database";

// The card⇄table view mode. SSR + first client paint always render "cards"
// (the historical default), then the persisted choice is adopted after the
// restore effect runs — so the server and first client markup match (no flash).
export type ViewMode = "cards" | "table";

// The five list tabs (issue #300). "all" lists every active group; "archived"
// lists closed groups; the three middle tabs are derived attention buckets.
// The tab keys + membership rules live in lib/dashboard/group-status so the spec
// (plan §4) is locked in by tests; the component only renders them.
export type ListTab = GroupListTab;

// The four independent status categories for one group, derived from already-
// assembled inputs (ADR 0011: per-surface assembly, reusing shared rules only).
export type GroupStatus = {
  lifecycle: GroupLifecycleCategory;
  setup: GroupSetupCategory;
  health: GroupHealthCategory;
  capacity: GroupCapacityCategory;
  // The triage signals the four categories don't carry; default to no-concern
  // when the group has no health-overview row or side-read entry.
  signals: GroupTriageSignals;
};

// The one record being edited or created in the shared EditingSurface drawer
// (#266). Editing no longer expands inline beneath a card; both flows open the
// drawer, out of the list, so the list never reflows and its tab + scroll
// state survive the round trip.
export type GroupEditorState =
  | { mode: "create" }
  | { mode: "edit"; group: GroupsRow };

// One assembled row for the Ops table (#325): the group, its four status
// categories, the resolved leader text + latest-week session it renders, and
// the scalar sort key the comparators ordered it by. Built once per visible
// group from the same maps the cards use — no new reads.
export type GroupTableRow = {
  group: GroupsRow;
  status: GroupStatus;
  leaderText: string | null;
  session: AttendanceSessionsRow | null;
  sortRow: GroupsTableSortRow;
};
