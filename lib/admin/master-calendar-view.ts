// Pure view-model helpers for the master group-calendar shell
// (/admin/calendar and the Planning-hosted calendar): the advanced-filter
// composition (group × gathering type × status × meeting day × leader), the
// month/list view-mode rules (responsive default vs persisted preference,
// #262/#263), persisted-snapshot validation, the list clip range, and the
// active-filter summary/chips builders. No DB, no I/O, no React — extracted
// from the shell so the branching is unit-testable without rendering.
//
// The opinionated Planning views (this-week / needs-coverage / …) live in
// lib/admin/planning-views.ts; this module only validates their persisted key.

import {
  PLANNING_VIEWS,
  type PlanningViewKey,
} from "@/lib/admin/planning-views";
import { WEEKDAY_HEADERS, monthBounds } from "@/lib/calendar/occurrences";
import {
  EVENT_STATUS_OPTIONS,
  EVENT_TYPE_OPTIONS,
  friendlyEventTypeLabel,
} from "@/lib/calendar/payload";
import type {
  GroupCalendarEventStatus,
  GroupCalendarEventType,
} from "@/types/enums";

export type CalendarViewMode = "month" | "list";

// The advanced (secondary) filter selections. Multi-value dimensions are
// "empty = unfiltered"; the leader filter is a single profile id ("" = all).
export type CalendarFilters = {
  groupFilter: string[];
  typeFilter: GroupCalendarEventType[];
  statusFilter: GroupCalendarEventStatus[];
  dayFilter: number[]; // 0=Sun..6=Sat
  leaderFilter: string;
};

export const EMPTY_CALENDAR_FILTERS: CalendarFilters = {
  groupFilter: [],
  typeFilter: [],
  statusFilter: [],
  dayFilter: [],
  leaderFilter: "",
};

export type CalendarViewSnapshot = CalendarFilters & {
  // null = the user never explicitly toggled the view, so the persisted state
  // carries no opinion and the responsive default decides on restore.
  // Persisting the auto-selected mobile "list" as if it were a choice would
  // wrongly override the desktop month default on a later visit (#263).
  viewMode: CalendarViewMode | null;
  // The active opinionated view (#331), persisted alongside the filters so a
  // return visit reopens on the same view. Absent on snapshots saved by the
  // frozen /admin/calendar (which never sets the opinionated-views prop); the
  // validator tolerates that and defaults to "all".
  planningView?: PlanningViewKey;
};

const PLANNING_VIEW_KEYS = PLANNING_VIEWS.map((v) => v.key);

const isPlanningViewKey = (v: unknown): v is PlanningViewKey =>
  typeof v === "string" && PLANNING_VIEW_KEYS.includes(v as PlanningViewKey);

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");

// Validate a restored calendar view against its current shape. We check
// structure (and the closed `viewMode` set, plus null for "no explicit
// choice"), not membership: a stale group or leader id simply matches nothing
// and the existing empty state offers a reset, which is friendlier than
// silently dropping the whole saved view (#263).
export function isCalendarViewSnapshot(
  value: unknown
): value is CalendarViewSnapshot {
  if (value === null || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    (v.viewMode === "month" || v.viewMode === "list" || v.viewMode === null) &&
    isStringArray(v.groupFilter) &&
    isStringArray(v.typeFilter) &&
    isStringArray(v.statusFilter) &&
    Array.isArray(v.dayFilter) &&
    v.dayFilter.every((d) => typeof d === "number") &&
    typeof v.leaderFilter === "string" &&
    // Optional and only ever a known key; an older snapshot without it (or a
    // stale key from a renamed view) falls back to "all" on restore.
    (v.planningView === undefined || isPlanningViewKey(v.planningView))
  );
}

// ---------------------------------------------------------------------------
// View-mode rules (Calendar polish, PRD req 11, #262 / saved views #263).
// ---------------------------------------------------------------------------

// What the persisted snapshot should carry: the view becomes a real preference
// only once the user has toggled it; otherwise null, so a return visit re-runs
// the responsive default instead of inheriting an auto-selected mobile "list".
export function viewModePreferenceToPersist(
  viewMode: CalendarViewMode,
  userToggled: boolean
): CalendarViewMode | null {
  return userToggled ? viewMode : null;
}

// The responsive default when the user holds no explicit preference: narrow
// viewports get the list (better for dense days); otherwise the surface's own
// desktop default (month for the frozen calendar, list for Planning, #303).
export function responsiveViewMode(
  viewportIsNarrow: boolean,
  defaultViewMode: CalendarViewMode
): CalendarViewMode {
  return viewportIsNarrow ? "list" : defaultViewMode;
}

// ---------------------------------------------------------------------------
// Filter composition.
// ---------------------------------------------------------------------------

// Minimal structural shape the filter predicate needs; MasterOccurrence is
// assignable.
export type CalendarFilterableOccurrence = {
  groupId: string;
  eventType: GroupCalendarEventType;
  status: GroupCalendarEventStatus;
  weekdayIndex: number;
  leaders: { profileId: string }[];
};

// AND across dimensions; within a multi-value dimension, membership (OR). The
// leader filter keeps an occurrence if ANY of its leaders matches, so a co-led
// group filtered to one leader still surfaces.
export function filterCalendarOccurrences<
  T extends CalendarFilterableOccurrence,
>(occurrences: T[], filters: CalendarFilters): T[] {
  const { groupFilter, typeFilter, statusFilter, dayFilter, leaderFilter } =
    filters;
  return occurrences.filter((o) => {
    if (groupFilter.length > 0 && !groupFilter.includes(o.groupId))
      return false;
    if (typeFilter.length > 0 && !typeFilter.includes(o.eventType))
      return false;
    if (statusFilter.length > 0 && !statusFilter.includes(o.status))
      return false;
    if (dayFilter.length > 0 && !dayFilter.includes(o.weekdayIndex))
      return false;
    if (leaderFilter && !o.leaders.some((l) => l.profileId === leaderFilter))
      return false;
    return true;
  });
}

export function countActiveCalendarFilters(filters: CalendarFilters): number {
  return (
    filters.groupFilter.length +
    filters.typeFilter.length +
    filters.statusFilter.length +
    filters.dayFilter.length +
    (filters.leaderFilter ? 1 : 0)
  );
}

export function hasActiveCalendarFilters(filters: CalendarFilters): boolean {
  return countActiveCalendarFilters(filters) > 0;
}

// ---------------------------------------------------------------------------
// List clip range.
// ---------------------------------------------------------------------------

// The list normally re-clips to the visible month. The "This week" view
// (#331) is anchored to today's ISO week, which can spill into an adjacent
// month on the first/last days of a month; the panel widens the loaded set to
// include that out-of-month part of the week, and the view scope is already
// narrowed to exactly the ISO week — so for this view the list must NOT clip
// to the month, or the widened occurrences would be dropped right back out.
export function calendarListRange({
  monthIso,
  planningViews,
  planningView,
}: {
  monthIso: string;
  planningViews: boolean;
  planningView: PlanningViewKey;
}): { fromIso: string | null; toIso: string | null } {
  const isThisWeek = planningViews && planningView === "this-week";
  if (isThisWeek) return { fromIso: null, toIso: null };
  const bounds = monthBounds(monthIso);
  return {
    fromIso: bounds?.firstIso ?? null,
    toIso: bounds?.lastIso ?? null,
  };
}

// ---------------------------------------------------------------------------
// Active-filter summary + chips.
// ---------------------------------------------------------------------------

// The gathering-type filter exposes "OFF" and "Cancelled" alongside the real
// event types — the master calendar deliberately offers them in BOTH the
// type and status filters.
export const ALL_TYPE_OPTIONS: {
  value: GroupCalendarEventType;
  label: string;
}[] = [
  ...EVENT_TYPE_OPTIONS,
  { value: "off", label: friendlyEventTypeLabel("off") },
  { value: "cancelled", label: friendlyEventTypeLabel("cancelled") },
];

// value → label lookups for the two static option sets, built once at module
// load rather than rebuilt in each summary/chip pass.
const TYPE_LABELS = new Map(ALL_TYPE_OPTIONS.map((o) => [o.value, o.label]));
const STATUS_LABELS = new Map(
  EVENT_STATUS_OPTIONS.map((o) => [o.value, o.label])
);

export type CalendarLeaderOption = { profileId: string; name: string };
export type CalendarGroupOption = { groupId: string; groupName: string };

// A compact, plain-language summary of WHY the current list is filtered
// (#371). Each dimension reads "All <thing>" when unfiltered, or the chosen
// value(s) when narrowed; the leader segment only appears when one is chosen.
export function calendarFilterSummarySegments({
  planningView,
  filters,
  leaderOptions,
}: {
  planningView: PlanningViewKey;
  filters: CalendarFilters;
  leaderOptions: CalendarLeaderOption[];
}): string[] {
  const { groupFilter, typeFilter, statusFilter, dayFilter, leaderFilter } =
    filters;
  const segments: string[] = [];

  const viewLabel =
    PLANNING_VIEWS.find((v) => v.key === planningView)?.label ?? "All meetings";
  segments.push(viewLabel);

  segments.push(
    groupFilter.length === 0
      ? "All groups"
      : `${groupFilter.length} ${groupFilter.length === 1 ? "group" : "groups"}`
  );

  segments.push(
    typeFilter.length === 0
      ? "All gathering types"
      : typeFilter
          .map((t) => TYPE_LABELS.get(t) ?? friendlyEventTypeLabel(t))
          .join(", ")
  );

  segments.push(
    statusFilter.length === 0
      ? "All statuses"
      : statusFilter.map((s) => STATUS_LABELS.get(s) ?? s).join(", ")
  );

  segments.push(
    dayFilter.length === 0
      ? "All meeting days"
      : dayFilter.map((d) => WEEKDAY_HEADERS[d] ?? `Day ${d}`).join(", ")
  );

  if (leaderFilter) {
    const name =
      leaderOptions.find((l) => l.profileId === leaderFilter)?.name ?? "Leader";
    segments.push(name);
  }

  return segments;
}

// A chip carries its filter `category` (the field it came from) so two values
// that share a label across fields stay distinguishable — "OFF"/"Cancelled"
// exist in BOTH the gathering-type and status filters, so a value-only chip
// would collide between fields, visually and in its accessible name.
export type CalendarFilterChip = {
  key: string;
  category: string;
  label: string;
  // Pure removal: the same filters with exactly this one selection dropped.
  // Untouched dimensions keep their array identity, so a caller can hand each
  // dimension of the result straight back to its state setter (unchanged ones
  // are referential no-ops).
  remove: (filters: CalendarFilters) => CalendarFilters;
};

// Flatten every active selection into removable chips. Order mirrors the
// field grid (group → type → status → day → leader) so the chip row reads as
// a compact summary of the controls below it.
export function calendarActiveFilterChips(
  filters: CalendarFilters,
  options: {
    groups: CalendarGroupOption[];
    leaderOptions: CalendarLeaderOption[];
  }
): CalendarFilterChip[] {
  const chips: CalendarFilterChip[] = [];
  const groupLabels = new Map(
    options.groups.map((g) => [g.groupId, g.groupName])
  );

  for (const id of filters.groupFilter) {
    chips.push({
      key: `group:${id}`,
      category: "Group",
      label: groupLabels.get(id) ?? "Group",
      remove: (f) => ({
        ...f,
        groupFilter: f.groupFilter.filter((v) => v !== id),
      }),
    });
  }
  for (const t of filters.typeFilter) {
    chips.push({
      key: `type:${t}`,
      category: "Type",
      label: TYPE_LABELS.get(t) ?? friendlyEventTypeLabel(t),
      remove: (f) => ({
        ...f,
        typeFilter: f.typeFilter.filter((v) => v !== t),
      }),
    });
  }
  for (const s of filters.statusFilter) {
    chips.push({
      key: `status:${s}`,
      category: "Status",
      label: STATUS_LABELS.get(s) ?? s,
      remove: (f) => ({
        ...f,
        statusFilter: f.statusFilter.filter((v) => v !== s),
      }),
    });
  }
  for (const d of filters.dayFilter) {
    chips.push({
      key: `day:${d}`,
      category: "Day",
      label: WEEKDAY_HEADERS[d] ?? `Day ${d}`,
      remove: (f) => ({
        ...f,
        dayFilter: f.dayFilter.filter((v) => v !== d),
      }),
    });
  }
  if (filters.leaderFilter) {
    const leaderFilter = filters.leaderFilter;
    const name =
      options.leaderOptions.find((l) => l.profileId === leaderFilter)?.name ??
      "Leader";
    chips.push({
      key: `leader:${leaderFilter}`,
      category: "Leader",
      label: name,
      remove: (f) => ({ ...f, leaderFilter: "" }),
    });
  }
  return chips;
}
