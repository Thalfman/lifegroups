// Pure view-model helpers for the GENERAL follow-ups queue
// (/admin/follow-ups): the filter composition (status × priority × due window
// × assignee × group × guest), the status-grouped partition with its in-group
// ordering, and the persisted-view snapshot validation (#263). No DB, no I/O —
// the shell stays a thin stateful container and this branching is
// unit-testable without rendering.
//
// "General" follow-ups are the group/task queue — distinct from the care
// follow-ups about Leaders (lib/admin/shepherd-care-follow-ups.ts).

import type { FollowUpPriority, FollowUpStatus } from "@/types/enums";

// Display + partition order for the status-grouped queue.
export const FOLLOW_UP_STATUS_ORDER: readonly FollowUpStatus[] = [
  "open",
  "in_progress",
  "snoozed",
  "done",
];

export type FollowUpDueFilter = "all" | "overdue" | "this_week" | "no_due_date";

// The surface leads with open work, so the status filter defaults to "active"
// (everything not yet done). "all" shows every status; a single status narrows
// to it.
export type FollowUpStatusFilter = "active" | "all" | FollowUpStatus;

export type FollowUpPriorityFilter = "all" | FollowUpPriority;

export const FOLLOW_UP_STATUS_FILTERS: {
  value: FollowUpStatusFilter;
  label: string;
}[] = [
  { value: "active", label: "Open items" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "snoozed", label: "Snoozed" },
  { value: "done", label: "Done" },
  { value: "all", label: "All statuses" },
];

export const FOLLOW_UP_PRIORITY_FILTERS: {
  value: FollowUpPriorityFilter;
  label: string;
}[] = [
  { value: "all", label: "Any priority" },
  { value: "high", label: "High" },
  { value: "normal", label: "Normal" },
  { value: "low", label: "Low" },
];

export const FOLLOW_UP_DUE_FILTERS: {
  value: FollowUpDueFilter;
  label: string;
}[] = [
  { value: "all", label: "Any due date" },
  { value: "overdue", label: "Overdue" },
  { value: "this_week", label: "Due this week" },
  { value: "no_due_date", label: "No due date" },
];

// Saved views & filters (PRD req 12, #263): the persisted shape for this
// surface. Group/guest/assignee filters are free-form ids ("all" or a uuid),
// so they validate as plain strings — a stale id simply matches nothing and
// the list shows its empty state, the same as a no-match live filter.
export type FollowUpsViewSnapshot = {
  showFilters: boolean;
  statusFilter: FollowUpStatusFilter;
  priorityFilter: FollowUpPriorityFilter;
  dueFilter: FollowUpDueFilter;
  assigneeFilter: string;
  groupFilter: string;
  guestFilter: string;
};

const STATUS_FILTER_VALUES = new Set<string>(
  FOLLOW_UP_STATUS_FILTERS.map((f) => f.value)
);
const PRIORITY_FILTER_VALUES = new Set<string>(
  FOLLOW_UP_PRIORITY_FILTERS.map((f) => f.value)
);
const DUE_FILTER_VALUES = new Set<string>(
  FOLLOW_UP_DUE_FILTERS.map((f) => f.value)
);

export function isFollowUpsViewSnapshot(
  value: unknown
): value is FollowUpsViewSnapshot {
  if (value === null || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.showFilters === "boolean" &&
    typeof v.statusFilter === "string" &&
    STATUS_FILTER_VALUES.has(v.statusFilter) &&
    typeof v.priorityFilter === "string" &&
    PRIORITY_FILTER_VALUES.has(v.priorityFilter) &&
    typeof v.dueFilter === "string" &&
    DUE_FILTER_VALUES.has(v.dueFilter) &&
    typeof v.assigneeFilter === "string" &&
    typeof v.groupFilter === "string" &&
    typeof v.guestFilter === "string"
  );
}

// Restore guard for the free-form id filters (assignee/group/guest): a saved
// id whose record later left the loaded option list (deactivated assignee,
// removed group or guest) is coerced back to "all" — otherwise the queue would
// filter by an unselectable value and read as empty with no chip to clear.
export function coerceSavedIdFilter(
  saved: string,
  known: { has(id: string): boolean }
): string {
  return saved === "all" || known.has(saved) ? saved : "all";
}

// The due window the overdue / this-week filters compare against: local
// midnight of "now" and the day seven days out (both inclusive bounds for
// this_week; overdue is strictly before today).
export type FollowUpDueWindow = { today: Date; inSevenDays: Date };

export function followUpDueWindow(now: Date): FollowUpDueWindow {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const inSevenDays = new Date(today);
  inSevenDays.setDate(inSevenDays.getDate() + 7);
  return { today, inSevenDays };
}

// Minimal structural shape the queue helpers need; AdminFollowUpEntry is
// assignable. Workflow fields only — no titles or note bodies.
export type FollowUpQueueItem = {
  status: FollowUpStatus;
  priority: FollowUpPriority;
  due_date: string | null;
  created_at: string;
  assigned_to: string | null;
  related_group_id: string | null;
  related_guest_id: string | null;
};

export type FollowUpQueueFilters = {
  statusFilter: FollowUpStatusFilter;
  priorityFilter: FollowUpPriorityFilter;
  dueFilter: FollowUpDueFilter;
  // "all" or an id; an id that matches nothing simply yields an empty list.
  assigneeFilter: string;
  groupFilter: string;
  guestFilter: string;
};

// Due dates are date-only strings; parse at local midnight so comparisons
// against the local-midnight due window are day-accurate.
function dueDateAtLocalMidnight(dueDate: string): Date {
  return new Date(`${dueDate}T00:00:00`);
}

export function filterFollowUps<T extends FollowUpQueueItem>(
  followUps: T[],
  filters: FollowUpQueueFilters,
  window: FollowUpDueWindow
): T[] {
  const {
    statusFilter,
    priorityFilter,
    dueFilter,
    assigneeFilter,
    groupFilter,
    guestFilter,
  } = filters;
  return followUps.filter((fu) => {
    if (statusFilter === "active") {
      if (fu.status === "done") return false;
    } else if (statusFilter !== "all" && fu.status !== statusFilter) {
      return false;
    }
    if (priorityFilter !== "all" && fu.priority !== priorityFilter)
      return false;
    if (assigneeFilter !== "all" && fu.assigned_to !== assigneeFilter)
      return false;
    if (groupFilter !== "all" && fu.related_group_id !== groupFilter)
      return false;
    if (guestFilter !== "all" && fu.related_guest_id !== guestFilter)
      return false;
    if (dueFilter !== "all") {
      if (dueFilter === "no_due_date") {
        if (fu.due_date) return false;
      } else if (!fu.due_date) {
        return false;
      } else {
        const due = dueDateAtLocalMidnight(fu.due_date);
        if (dueFilter === "overdue") {
          if (due >= window.today) return false;
        } else if (dueFilter === "this_week") {
          if (due < window.today || due > window.inSevenDays) return false;
        }
      }
    }
    return true;
  });
}

const PRIORITY_ORDER: Record<FollowUpPriority, number> = {
  high: 0,
  normal: 1,
  low: 2,
};

// due_date asc (nulls last); then priority high > normal > low; then
// created_at desc. Due date leads so the default view answers "what's due
// next" first.
export function compareFollowUps(
  a: FollowUpQueueItem,
  b: FollowUpQueueItem
): number {
  if (a.due_date && b.due_date && a.due_date !== b.due_date)
    return a.due_date.localeCompare(b.due_date);
  if (a.due_date && !b.due_date) return -1;
  if (!a.due_date && b.due_date) return 1;
  if (a.priority !== b.priority)
    return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  return b.created_at.localeCompare(a.created_at);
}

// Partition into the status-grouped queue. Every status keys a bucket (empty
// buckets included so render order stays driven by FOLLOW_UP_STATUS_ORDER),
// each sorted by compareFollowUps.
export function partitionFollowUpsByStatus<T extends FollowUpQueueItem>(
  followUps: T[]
): Record<FollowUpStatus, T[]> {
  const out: Record<FollowUpStatus, T[]> = {
    open: [],
    in_progress: [],
    snoozed: [],
    done: [],
  };
  for (const fu of followUps) out[fu.status].push(fu);
  for (const status of FOLLOW_UP_STATUS_ORDER)
    out[status].sort(compareFollowUps);
  return out;
}

// Overdue badge rule: a dated, not-yet-done follow-up whose due date has
// passed. A done item is never overdue regardless of its date.
export function isFollowUpOverdue(
  followUp: Pick<FollowUpQueueItem, "due_date" | "status">,
  today: Date
): boolean {
  if (!followUp.due_date || followUp.status === "done") return false;
  return dueDateAtLocalMidnight(followUp.due_date) < today;
}
