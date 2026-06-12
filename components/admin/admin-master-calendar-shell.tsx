"use client";

import {
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { PButton } from "@/components/pastoral/button";
import { usePersistedViewState } from "@/lib/hooks/use-persisted-view-state";
import {
  AdminMasterCalendarGrid,
  type DayClickPayload,
} from "./admin-master-calendar-grid";
import { AdminMasterCalendarList } from "./admin-master-calendar-list";
import { AdminMasterCalendarDrawer } from "./admin-master-calendar-drawer";
import { AdminCalendarLegend } from "./admin-calendar-legend";
import { PlanningByLeaderList } from "./planning/planning-by-leader-list";
import {
  PLANNING_VIEWS,
  filterOccurrencesForView,
  type PlanningViewKey,
} from "@/lib/admin/planning-views";
import {
  ALL_TYPE_OPTIONS,
  calendarActiveFilterChips,
  calendarFilterSummarySegments,
  calendarListRange,
  filterCalendarOccurrences,
  hasActiveCalendarFilters,
  isCalendarViewSnapshot,
  responsiveViewMode,
  viewModePreferenceToPersist,
  type CalendarFilters,
  type CalendarViewMode,
} from "@/lib/admin/master-calendar-view";
import { WEEKDAY_HEADERS } from "@/lib/calendar/occurrences";
import { EVENT_STATUS_OPTIONS } from "@/lib/calendar/payload";
import { P, fontBody, fontSans } from "@/lib/pastoral";
import type {
  MasterCalendarGroupSummary,
  MasterCalendarLeader,
  MasterOccurrence,
} from "@/lib/admin/master-calendar";
import type {
  GroupCalendarEventStatus,
  GroupCalendarEventType,
} from "@/types/enums";

// View-model branching (snapshot validation, filter composition, view-mode
// rules, summary/chips) lives in lib/admin/master-calendar-view; this shell
// owns state and rendering only.
type ViewMode = CalendarViewMode;

// Slugify a label/value into a DOM-safe, human-readable token for checkbox
// `id`/`value` attributes (#371): "Anderson Life Group" → "anderson-life-group".
const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// Visually-hidden style for a fieldset's <legend> that names the group for
// assistive tech without duplicating an adjacent visible label (#371).
const visuallyHidden: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};

export function AdminMasterCalendarShell({
  monthIso,
  todayIso,
  occurrences,
  groups,
  leaderOptions,
  viewerId,
  defaultViewMode = "month",
  persistSurface = "calendar",
  showLegendAlways = false,
  planningViews = false,
}: {
  monthIso: string;
  todayIso: string;
  occurrences: MasterOccurrence[];
  groups: MasterCalendarGroupSummary[];
  leaderOptions: MasterCalendarLeader[];
  // Signed-in profile id, used only to scope this admin's saved view/filters
  // (#263). Omitted/undefined falls back to a shared persistence bucket.
  viewerId?: string | null;
  // The desktop default view. The frozen /admin/calendar keeps "month" (the
  // at-a-glance grid is its value); the Planning area hosts the same calendar
  // with "list" so the upcoming-events view leads (#303). Mobile still
  // auto-selects list regardless.
  defaultViewMode?: ViewMode;
  // Persistence bucket, so the Planning-hosted calendar's view/filter choices
  // don't bleed into the frozen /admin/calendar surface and vice versa (#303).
  persistSurface?: string;
  // Show the status legend above the calendar in every view (not only month).
  // Planning's list-first calendar wants the event-type colors explained up
  // front; the frozen route keeps the legend tied to the month grid.
  showLegendAlways?: boolean;
  // Opt into the Planning area's opinionated saved views (#331): a primary
  // view switcher (This week / Needs coverage / Cancelled-OFF / By leader)
  // above the calendar, the advanced filters moved into a collapsible
  // secondary area, and de-noised per-group calendar links. The frozen
  // /admin/calendar route leaves this off and is unchanged.
  planningViews?: boolean;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>(defaultViewMode);
  const userToggledRef = useRef(false);

  const setViewModeManual = (next: ViewMode) => {
    userToggledRef.current = true;
    setViewMode(next);
  };

  // Filter state.
  const [groupFilter, setGroupFilter] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState<GroupCalendarEventType[]>([]);
  const [statusFilter, setStatusFilter] = useState<GroupCalendarEventStatus[]>(
    []
  );
  const [dayFilter, setDayFilter] = useState<number[]>([]); // 0=Sun..6=Sat
  // Leader filter keyed on profile_id so two profiles with the same
  // display name don't collapse into one option (and so picking one
  // doesn't over-match the other).
  const [leaderFilter, setLeaderFilter] = useState<string>("");

  // The active opinionated view (#331). Inert unless planningViews is set; the
  // frozen /admin/calendar never renders the switcher, so it stays "all".
  const [planningView, setPlanningView] = useState<PlanningViewKey>("all");

  // Saved views & filters (PRD req 12, #263): remember this admin's view mode
  // and every filter selection across reloads and return visits. Declared
  // before the mobile-default effect below so its restore pass runs first — a
  // restored selection marks the view as user-chosen (userToggledRef), which
  // keeps the responsive auto-default from clobbering it.
  const persistHydrated = usePersistedViewState({
    surface: persistSurface,
    scopeId: viewerId,
    snapshot: {
      // Only persist the view as a real preference once the user has toggled
      // it; otherwise leave it null so a return visit re-runs the responsive
      // default instead of inheriting an auto-selected mobile "list".
      viewMode: viewModePreferenceToPersist(viewMode, userToggledRef.current),
      groupFilter,
      typeFilter,
      statusFilter,
      dayFilter,
      leaderFilter,
      planningView,
    },
    restore: (saved) => {
      // A null saved view means "no explicit choice" — leave userToggledRef
      // false so the responsive default (and resize listener) still apply.
      if (saved.viewMode !== null) {
        userToggledRef.current = true;
        setViewMode(saved.viewMode);
      }
      setGroupFilter(saved.groupFilter);
      setTypeFilter(saved.typeFilter);
      setStatusFilter(saved.statusFilter);
      setDayFilter(saved.dayFilter);
      setLeaderFilter(saved.leaderFilter);
      // Restore the opinionated view (#331). Defaults to "all" when the
      // snapshot predates the feature or the route doesn't offer the switcher.
      if (planningViews && saved.planningView !== undefined) {
        setPlanningView(saved.planningView);
      }
    },
    validate: isCalendarViewSnapshot,
  });

  // Default-view decision (Calendar polish, PRD req 11, #262): Month stays the
  // desktop default; List remains the mobile default (auto-selected below) and
  // is one tap away via the toggle. Rationale: the master calendar's value is
  // the at-a-glance month grid spanning every group; List is better for dense
  // days and narrow screens, where it is already chosen automatically. We did
  // not switch admin work to default to List (Open Question 2 — director mobile
  // usage — is non-blocking; revisit if the director works primarily on phone).

  // Hydration-safe mobile default: stay on "month" through SSR and the
  // first client render, then flip to "list" only if the viewport
  // matches AND the user hasn't manually picked (or had restored) a view.
  // Held until persistence has hydrated so a saved view always wins.
  useEffect(() => {
    if (!persistHydrated) return;
    if (userToggledRef.current) return;
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 720px)");
    if (mq.matches) setViewMode(responsiveViewMode(true, defaultViewMode));
    const onChange = (e: MediaQueryListEvent) => {
      if (userToggledRef.current) return;
      setViewMode(responsiveViewMode(e.matches, defaultViewMode));
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [persistHydrated, defaultViewMode]);

  // Selected occurrence for the drawer. We use a composite key
  // (groupId|date) since the master view has multiple occurrences per
  // date but at most one per group/date.
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [listAnchorDate, setListAnchorDate] = useState<string | null>(null);

  const filters = useMemo<CalendarFilters>(
    () => ({ groupFilter, typeFilter, statusFilter, dayFilter, leaderFilter }),
    [groupFilter, typeFilter, statusFilter, dayFilter, leaderFilter]
  );

  // Defer the inputs that re-derive the occurrence set and re-render the whole
  // month grid / list. The quick-view buttons and FilterBar controls stay
  // bound to their urgent state for instant feedback, while the heavy
  // filtering keys off the deferred copies and runs as a low-priority,
  // interruptible render (low INP — same pattern as PeopleDirectory). The
  // counts shown in the bar lag one deferred render, which is acceptable.
  const deferredPlanningView = useDeferredValue(planningView);
  const deferredFilters = useDeferredValue(filters);

  // The opinionated view narrows the set first (#331); the advanced filters
  // then compose on top of whatever view is active. When planningViews is off
  // (frozen /admin/calendar) this is a no-op pass-through of every occurrence.
  const viewScoped = useMemo(
    () =>
      planningViews
        ? filterOccurrencesForView(occurrences, deferredPlanningView, todayIso)
        : occurrences,
    [planningViews, occurrences, deferredPlanningView, todayIso]
  );

  const filtered = useMemo(
    () => filterCalendarOccurrences(viewScoped, deferredFilters),
    [viewScoped, deferredFilters]
  );

  const selected = useMemo(() => {
    if (!selectedKey) return null;
    return (
      filtered.find((o) => `${o.groupId}|${o.date}` === selectedKey) ?? null
    );
  }, [filtered, selectedKey]);

  const hasActiveFilters = hasActiveCalendarFilters(filters);

  const resetFilters = () => {
    setGroupFilter([]);
    setTypeFilter([]);
    setStatusFilter([]);
    setDayFilter([]);
    setLeaderFilter("");
  };

  // The Planning area's top-level reset (#371): in addition to the advanced
  // filters (resetFilters), it also returns the primary quick filter to "All
  // meetings" so one control restores the default Planning calendar view.
  const clearAll = () => {
    resetFilters();
    setPlanningView("all");
  };

  // Whether anything narrows the default Planning view — drives the active-
  // filter summary copy and the disabled state of "Clear filters" (#371).
  const planningFiltersActive = hasActiveFilters || planningView !== "all";

  const onSelect = (o: MasterOccurrence) => {
    setSelectedKey(`${o.groupId}|${o.date}`);
  };

  const onMoreFromDay = (payload: DayClickPayload) => {
    setListAnchorDate(payload.date);
    setViewModeManual("list");
  };

  // The list normally re-clips to the visible month; the "This week" view must
  // not clip (its ISO week can spill past the month — see calendarListRange).
  // Keyed off the deferred view so the clipping always matches the deferred
  // occurrence set it renders.
  const { fromIso: listFromIso, toIso: listToIso } = calendarListRange({
    monthIso,
    planningViews,
    planningView: deferredPlanningView,
  });

  const filterBar = (
    <FilterBar
      groups={groups}
      leaderOptions={leaderOptions}
      groupFilter={groupFilter}
      setGroupFilter={setGroupFilter}
      typeFilter={typeFilter}
      setTypeFilter={setTypeFilter}
      statusFilter={statusFilter}
      setStatusFilter={setStatusFilter}
      dayFilter={dayFilter}
      setDayFilter={setDayFilter}
      leaderFilter={leaderFilter}
      setLeaderFilter={setLeaderFilter}
      hasActiveFilters={hasActiveFilters}
      onReset={resetFilters}
      viewMode={viewMode}
      onChangeView={setViewModeManual}
      filteredCount={filtered.length}
      totalCount={viewScoped.length}
      // The opinionated views own the view toggle's "primary" slot, so hide the
      // Month/List toggle inside the advanced filters when they're present —
      // By leader has its own grouped layout and the other views read best as
      // the list. The frozen route keeps the toggle in the bar.
      hideViewToggle={planningViews}
    />
  );

  // "By leader" renders its own group→leader layout and ignores month/list.
  // Deferred so the layout switch mounts with (and as lazily as) the deferred
  // occurrence set it renders.
  const isByLeader = planningViews && deferredPlanningView === "by-leader";

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {planningViews ? (
        <PlanningViewSwitcher
          value={planningView}
          onChange={setPlanningView}
          counts={{
            total: viewScoped.length,
            shown: filtered.length,
            hasActiveFilters,
          }}
        />
      ) : null}

      {/* Advanced (secondary) filters. As primary affordances the opinionated
          views lead; the fine-grained filters move into a collapsible
          disclosure so they're available but no longer the first thing the
          director meets (#331). The frozen route renders the bar inline. */}
      {planningViews ? (
        <details
          style={{
            border: `1px solid ${P.line}`,
            borderRadius: 14,
            background: P.surface,
            padding: "10px 14px",
          }}
          open={hasActiveFilters}
        >
          <summary
            style={{
              cursor: "pointer",
              fontFamily: fontSans,
              fontSize: 11,
              letterSpacing: 1.5,
              textTransform: "uppercase",
              color: P.ink3,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            Advanced filters
            {hasActiveFilters ? (
              <span
                style={{
                  fontFamily: fontBody,
                  fontSize: 11,
                  letterSpacing: 0,
                  textTransform: "none",
                  color: P.terra,
                  background: P.terraSoft,
                  border: `1px solid ${P.terra}`,
                  borderRadius: 999,
                  padding: "1px 8px",
                }}
              >
                Active
              </span>
            ) : null}
          </summary>
          <div style={{ paddingTop: 12 }}>{filterBar}</div>
        </details>
      ) : (
        filterBar
      )}

      {planningViews ? (
        <ActiveFilterSummary
          planningView={planningView}
          filters={filters}
          leaderOptions={leaderOptions}
          active={planningFiltersActive}
          onClear={clearAll}
        />
      ) : null}

      {showLegendAlways ? <AdminCalendarLegend /> : null}

      {filtered.length === 0 ? (
        <EmptyState hasActiveFilters={hasActiveFilters} />
      ) : isByLeader ? (
        <PlanningByLeaderList
          occurrences={filtered}
          monthIso={monthIso}
          leaderFilter={leaderFilter}
          onSelect={onSelect}
        />
      ) : viewMode === "month" && !planningViews ? (
        // The month grid is the frozen /admin/calendar's at-a-glance view.
        // Planning leads with the opinionated views (list-shaped), so it never
        // renders the grid — its view toggle is hidden.
        <>
          {showLegendAlways ? null : <AdminCalendarLegend />}
          <AdminMasterCalendarGrid
            monthIso={monthIso}
            todayIso={todayIso}
            occurrences={filtered}
            onSelect={onSelect}
            onMoreFromDay={onMoreFromDay}
          />
        </>
      ) : (
        <AdminMasterCalendarList
          occurrences={filtered}
          fromIso={listFromIso}
          toIso={listToIso}
          anchorDate={listAnchorDate}
          onAnchorConsumed={() => setListAnchorDate(null)}
          onSelect={onSelect}
          denoiseGroupLinks={planningViews}
        />
      )}

      <AdminMasterCalendarDrawer
        monthIso={monthIso}
        occurrence={selected}
        onClose={() => setSelectedKey(null)}
      />
    </div>
  );
}

// The opinionated saved-view switcher (#331) — the PRIMARY affordance on
// /admin/planning. The quick filters are mutually-exclusive toggle buttons: each
// exposes its selected state with aria-pressed (#371), so a screen reader
// announces exactly one as pressed. (A tablist would imply per-tab tabpanels,
// which these filters don't have; toggle buttons are the accurate model.) The
// active view's occurrence count rides alongside so the director sees how many
// meetings the view surfaces.
function PlanningViewSwitcher({
  value,
  onChange,
  counts,
}: {
  value: PlanningViewKey;
  onChange: (next: PlanningViewKey) => void;
  counts: { total: number; shown: number; hasActiveFilters: boolean };
}) {
  const itemStyle = (active: boolean): React.CSSProperties => ({
    fontFamily: fontSans,
    fontSize: 12,
    fontWeight: active ? 700 : 500,
    color: active ? P.surface : P.ink3,
    background: active ? P.terra : "transparent",
    border: "none",
    padding: "8px 14px",
    cursor: "pointer",
    borderRadius: 999,
  });
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div
        role="group"
        aria-label="Quick filters"
        style={{
          display: "inline-flex",
          flexWrap: "wrap",
          alignSelf: "start",
          background: P.surface,
          border: `1px solid ${P.line}`,
          borderRadius: 999,
          padding: 3,
          gap: 2,
        }}
      >
        {PLANNING_VIEWS.map((view) => (
          <button
            key={view.key}
            type="button"
            aria-pressed={value === view.key}
            onClick={() => onChange(view.key)}
            style={itemStyle(value === view.key)}
          >
            {view.label}
          </button>
        ))}
      </div>
      <div
        aria-live="polite"
        style={{
          fontFamily: fontBody,
          fontSize: 12,
          color: P.ink3,
        }}
      >
        {counts.hasActiveFilters
          ? `${counts.shown} of ${counts.total} in this view`
          : `${counts.total} ${counts.total === 1 ? "meeting" : "meetings"} in this view`}
      </div>
    </div>
  );
}

// A compact, plain-language summary of WHY the current list is filtered (#371),
// sitting between the filters and the meeting list with a one-tap "Clear
// filters" reset. Each dimension reads "All <thing>" when unfiltered, or the
// chosen value(s) when narrowed, so an admin can tell at a glance what the view
// is showing without re-opening the advanced panel.
function ActiveFilterSummary({
  planningView,
  filters,
  leaderOptions,
  active,
  onClear,
}: {
  planningView: PlanningViewKey;
  filters: CalendarFilters;
  leaderOptions: MasterCalendarLeader[];
  active: boolean;
  onClear: () => void;
}) {
  const parts = useMemo(
    () =>
      calendarFilterSummarySegments({ planningView, filters, leaderOptions }),
    [planningView, filters, leaderOptions]
  );

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
      }}
    >
      <div
        aria-live="polite"
        style={{
          fontFamily: fontBody,
          fontSize: 12.5,
          color: P.ink2,
          minWidth: 0,
        }}
      >
        <span style={{ color: P.ink3, fontWeight: 600 }}>Showing: </span>
        {parts.join(" · ")}
      </div>
      <PButton
        type="button"
        tone="ghost"
        size="sm"
        onClick={onClear}
        disabled={!active}
      >
        Clear filters
      </PButton>
    </div>
  );
}

function ViewToggle({
  viewMode,
  onChange,
}: {
  viewMode: ViewMode;
  onChange: (next: ViewMode) => void;
}) {
  const itemStyle = (active: boolean): React.CSSProperties => ({
    fontFamily: fontSans,
    fontSize: 12,
    fontWeight: active ? 700 : 500,
    color: active ? P.surface : P.ink3,
    background: active ? P.terra : "transparent",
    border: "none",
    padding: "8px 14px",
    cursor: "pointer",
    borderRadius: 999,
  });
  return (
    <div
      role="tablist"
      aria-label="Calendar view"
      style={{
        display: "inline-flex",
        alignSelf: "start",
        background: P.surface,
        border: `1px solid ${P.line}`,
        borderRadius: 999,
        padding: 3,
      }}
    >
      <button
        type="button"
        role="tab"
        aria-selected={viewMode === "month"}
        onClick={() => onChange("month")}
        style={itemStyle(viewMode === "month")}
      >
        Month
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={viewMode === "list"}
        onClick={() => onChange("list")}
        style={itemStyle(viewMode === "list")}
      >
        List
      </button>
    </div>
  );
}

function EmptyState({ hasActiveFilters }: { hasActiveFilters: boolean }) {
  const primary = hasActiveFilters
    ? "No group meetings match these filters."
    : "No group meetings on the calendar for this month.";
  const secondary = hasActiveFilters
    ? "Try clearing a filter or pick a different month."
    : "Try a neighboring month, or check group schedules for OFF weeks.";
  return (
    <div
      style={{
        background: P.surface,
        border: `1px dashed ${P.line}`,
        borderRadius: 14,
        padding: "32px 18px",
        textAlign: "center",
        fontFamily: fontBody,
        fontSize: 14,
        color: P.ink2,
        display: "grid",
        gap: 6,
        justifyItems: "center",
      }}
    >
      <div style={{ fontWeight: 600, color: P.ink }}>{primary}</div>
      <div style={{ fontSize: 13, color: P.ink3 }}>{secondary}</div>
    </div>
  );
}

function FilterBar({
  groups,
  leaderOptions,
  groupFilter,
  setGroupFilter,
  typeFilter,
  setTypeFilter,
  statusFilter,
  setStatusFilter,
  dayFilter,
  setDayFilter,
  leaderFilter,
  setLeaderFilter,
  hasActiveFilters,
  onReset,
  viewMode,
  onChangeView,
  filteredCount,
  totalCount,
  hideViewToggle = false,
}: {
  groups: MasterCalendarGroupSummary[];
  leaderOptions: MasterCalendarLeader[];
  groupFilter: string[];
  setGroupFilter: (next: string[]) => void;
  typeFilter: GroupCalendarEventType[];
  setTypeFilter: (next: GroupCalendarEventType[]) => void;
  statusFilter: GroupCalendarEventStatus[];
  setStatusFilter: (next: GroupCalendarEventStatus[]) => void;
  dayFilter: number[];
  setDayFilter: (next: number[]) => void;
  leaderFilter: string;
  setLeaderFilter: (next: string) => void;
  hasActiveFilters: boolean;
  onReset: () => void;
  viewMode: ViewMode;
  onChangeView: (next: ViewMode) => void;
  filteredCount: number;
  totalCount: number;
  // Hide the Month/List toggle when the opinionated views own the primary view
  // slot (#331): By leader has its own layout and the other Planning views read
  // as the list, so the grid/list toggle would be misleading there.
  hideViewToggle?: boolean;
}) {
  const groupOptions = useMemo(
    () => groups.map((g) => ({ value: g.groupId, label: g.groupName })),
    [groups]
  );

  // Flatten every active selection into removable chips (built pure in
  // lib/admin/master-calendar-view; order mirrors the field grid). A chip's
  // `remove` drops exactly one selection and keeps the other dimensions'
  // identity, so handing every dimension back to its setter is a referential
  // no-op for all but the removed one.
  const activeChips = useMemo<ActiveChip[]>(() => {
    const filters: CalendarFilters = {
      groupFilter,
      typeFilter,
      statusFilter,
      dayFilter,
      leaderFilter,
    };
    return calendarActiveFilterChips(filters, { groups, leaderOptions }).map(
      (chip) => ({
        key: chip.key,
        category: chip.category,
        label: chip.label,
        onRemove: () => {
          const next = chip.remove(filters);
          setGroupFilter(next.groupFilter);
          setTypeFilter(next.typeFilter);
          setStatusFilter(next.statusFilter);
          setDayFilter(next.dayFilter);
          setLeaderFilter(next.leaderFilter);
        },
      })
    );
  }, [
    groups,
    leaderOptions,
    groupFilter,
    setGroupFilter,
    typeFilter,
    setTypeFilter,
    statusFilter,
    setStatusFilter,
    dayFilter,
    setDayFilter,
    leaderFilter,
    setLeaderFilter,
  ]);

  // Show the {n}/{m} hint only when filters are active AND there's
  // something left to show. When filteredCount === 0 the EmptyState
  // carries the message; doubling up reads as noise.
  const showHint = hasActiveFilters && filteredCount > 0;
  return (
    <section
      style={{
        background: P.surface,
        border: `1px solid ${P.line}`,
        borderRadius: 14,
        padding: "12px 14px",
        display: "grid",
        gap: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              fontFamily: fontSans,
              fontSize: 11,
              letterSpacing: 1.5,
              textTransform: "uppercase",
              color: P.ink3,
              fontWeight: 600,
            }}
          >
            Filters
          </div>
          {showHint ? (
            <div
              aria-live="polite"
              style={{
                fontFamily: fontBody,
                fontSize: 12,
                color: P.ink3,
              }}
            >
              {filteredCount} of {totalCount} shown
            </div>
          ) : null}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          {hasActiveFilters ? (
            <PButton type="button" onClick={onReset} tone="ghost" size="sm">
              Reset filters
            </PButton>
          ) : null}
          {hideViewToggle ? null : (
            <ViewToggle viewMode={viewMode} onChange={onChangeView} />
          )}
        </div>
      </div>
      <ActiveFilterChips chips={activeChips} />
      <div
        className="lg-m-master-calendar-filters"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 10,
          alignItems: "start",
        }}
      >
        <GroupsDetailsField
          options={groupOptions}
          value={groupFilter}
          onChange={setGroupFilter}
        />
        <MultiCheckboxField<GroupCalendarEventType>
          label="Gathering type"
          name="gathering-type"
          fieldKey="gathering-type"
          options={ALL_TYPE_OPTIONS}
          value={typeFilter}
          onChange={(next) => setTypeFilter(next)}
        />
        <MultiCheckboxField<GroupCalendarEventStatus>
          label="Status"
          name="status"
          fieldKey="status"
          options={EVENT_STATUS_OPTIONS}
          value={statusFilter}
          onChange={(next) => setStatusFilter(next)}
        />
        <MultiCheckboxField<number>
          label="Meeting day"
          name="meeting-day"
          fieldKey="meeting-day"
          options={WEEKDAY_HEADERS.map((wd, i) => ({ value: i, label: wd }))}
          value={dayFilter}
          onChange={(next) => setDayFilter(next)}
        />
        <SelectField
          label="Leader / co-leader"
          value={leaderFilter}
          onChange={setLeaderFilter}
          options={[
            { value: "", label: "All leaders" },
            ...leaderOptions.map((l) => ({
              value: l.profileId,
              label: l.name,
            })),
          ]}
        />
      </div>
    </section>
  );
}

// A chip carries its filter `category` (the field it came from) so two values
// that share a label across fields stay distinguishable. The master calendar
// deliberately exposes "OFF" and "Cancelled" in BOTH the gathering-type and
// status filters, so a value-only chip ("Remove filter: Cancelled") collides
// between fields — both visually and in its accessible name. Folding the
// category in keeps each chip's name unique (the repeated-control-context
// invariant this surface enforces).
type ActiveChip = {
  key: string;
  category: string;
  label: string;
  onRemove: () => void;
};

// Compact, removable chips summarising every active filter selection
// (Calendar polish, PRD req 11, #262). Each chip drops a single selection;
// the FilterBar's "Reset filters" still clears everything at once. Keeping the
// active set visible (and individually removable) means the admin never has to
// re-open a collapsed field to remember — or undo — one choice.
function ActiveFilterChips({ chips }: { chips: ActiveChip[] }) {
  if (chips.length === 0) return null;
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        alignItems: "center",
      }}
    >
      {chips.map((chip) => (
        <span
          key={chip.key}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontFamily: fontBody,
            fontSize: 11.5,
            color: P.terra,
            background: P.terraSoft,
            border: `1px solid ${P.terra}`,
            borderRadius: 999,
            padding: "2px 4px 2px 10px",
          }}
        >
          <span
            style={{
              fontFamily: fontSans,
              fontSize: 9,
              letterSpacing: 0.6,
              textTransform: "uppercase",
              fontWeight: 700,
              opacity: 0.75,
            }}
          >
            {chip.category}
          </span>
          {chip.label}
          <button
            type="button"
            onClick={chip.onRemove}
            aria-label={`Remove ${chip.category} filter: ${chip.label}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 16,
              height: 16,
              borderRadius: 999,
              border: "none",
              background: "transparent",
              color: P.terra,
              fontSize: 13,
              lineHeight: 1,
              cursor: "pointer",
              padding: 0,
            }}
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}

function GroupsDetailsField({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const uid = useId();
  const count = value.length;
  const selectedSet = useMemo(() => new Set(value), [value]);
  const summaryRight = count === 0 ? "All" : `${count} selected`;
  return (
    <details
      style={{
        border: `1px solid ${P.line2}`,
        borderRadius: 10,
        background: P.bg,
        padding: "6px 10px",
        alignSelf: "start",
        margin: 0,
      }}
    >
      <summary
        style={{
          display: "list-item",
          cursor: "pointer",
          padding: "2px 0",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span
            style={{
              fontFamily: fontSans,
              fontSize: 10,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              color: P.ink3,
              fontWeight: 700,
            }}
          >
            Groups
          </span>
          <span
            style={{
              fontFamily: fontBody,
              fontSize: 11,
              color: count > 0 ? P.terra : P.ink3,
              background: count > 0 ? P.terraSoft : "transparent",
              border: `1px solid ${count > 0 ? P.terra : P.line}`,
              padding: "1px 8px",
              borderRadius: 999,
            }}
          >
            {summaryRight}
          </span>
        </div>
      </summary>
      <fieldset style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <legend style={visuallyHidden}>Groups</legend>
        <div style={{ paddingTop: 8 }}>
          <BulkActions
            label="groups"
            all={options.map((o) => o.value)}
            value={value}
            onChange={onChange}
          />
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            paddingTop: 8,
            maxHeight: 220,
            overflowY: "auto",
            paddingRight: 2,
          }}
        >
          {options.map((opt) => {
            const checked = selectedSet.has(opt.value);
            const id = `${uid}group-${slugify(opt.value)}`;
            return (
              <label
                key={opt.value}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 10px",
                  borderRadius: 999,
                  fontFamily: fontBody,
                  fontSize: 12,
                  color: checked ? P.terra : P.ink2,
                  background: checked ? P.terraSoft : P.surface,
                  border: `1px solid ${checked ? P.terra : P.line}`,
                  cursor: "pointer",
                  userSelect: "none",
                }}
              >
                <input
                  id={id}
                  name="groups"
                  value={slugify(opt.label)}
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    if (e.target.checked) onChange([...value, opt.value]);
                    else onChange(value.filter((v) => v !== opt.value));
                  }}
                  style={{ accentColor: P.terra, margin: 0 }}
                />
                {opt.label}
              </label>
            );
          })}
        </div>
      </fieldset>
    </details>
  );
}

// Compact "Select all / Clear all" pair for a multi-select filter field
// (Calendar polish, PRD req 11, #262). Each button disables itself once it
// would be a no-op (all already chosen / nothing chosen) so the affordance
// also doubles as a hint at the field's current state.
function BulkActions<V>({
  label,
  all,
  value,
  onChange,
}: {
  label: string;
  all: V[];
  value: V[];
  onChange: (next: V[]) => void;
}) {
  // Membership, not length-equality: a stale value in `value` (e.g. a group id
  // retained after the groups prop shrank) could match `all.length` while a
  // currently-listed option stays unchecked, wrongly disabling "Select all".
  const allSelected = all.length > 0 && all.every((v) => value.includes(v));
  const noneSelected = value.length === 0;
  const btnStyle = (disabled: boolean): React.CSSProperties => ({
    fontFamily: fontSans,
    fontSize: 10,
    letterSpacing: 0.4,
    fontWeight: 700,
    textTransform: "uppercase",
    color: disabled ? P.ink3 : P.terra,
    background: "transparent",
    border: "none",
    padding: "2px 4px",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.45 : 1,
  });
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <button
        type="button"
        onClick={() => onChange([...all])}
        disabled={allSelected}
        aria-label={`Select all ${label}`}
        style={btnStyle(allSelected)}
      >
        Select all
      </button>
      <span aria-hidden style={{ color: P.line, fontSize: 10 }}>
        ·
      </span>
      <button
        type="button"
        onClick={() => onChange([])}
        disabled={noneSelected}
        aria-label={`Clear all ${label}`}
        style={btnStyle(noneSelected)}
      >
        Clear all
      </button>
    </div>
  );
}

function MultiCheckboxField<V extends string | number>({
  label,
  name,
  fieldKey,
  options,
  value,
  onChange,
}: {
  label: string;
  // Form-control `name` shared by every checkbox in the field (e.g. "status").
  name: string;
  // Stable per-field token folded into each checkbox `id` so ids stay readable
  // and don't collide across fields (#371).
  fieldKey: string;
  options: { value: V; label: string }[];
  value: V[];
  onChange: (next: V[]) => void;
}) {
  const uid = useId();
  return (
    <fieldset
      style={{
        border: `1px solid ${P.line2}`,
        borderRadius: 10,
        padding: "6px 10px",
        margin: 0,
        background: P.bg,
        alignSelf: "start",
      }}
    >
      <legend
        style={{
          fontFamily: fontSans,
          fontSize: 10,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: P.ink3,
          fontWeight: 700,
          padding: "0 4px",
        }}
      >
        {label}
      </legend>
      <BulkActions
        label={label}
        all={options.map((o) => o.value)}
        value={value}
        onChange={onChange}
      />
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          paddingTop: 4,
          maxHeight: 96,
          overflowY: "auto",
          paddingRight: 2,
        }}
      >
        {options.map((opt) => {
          const checked = value.includes(opt.value);
          const id = `${uid}${fieldKey}-${slugify(String(opt.value))}`;
          return (
            <label
              key={String(opt.value)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px",
                borderRadius: 999,
                fontFamily: fontBody,
                fontSize: 12,
                color: checked ? P.terra : P.ink2,
                background: checked ? P.terraSoft : P.surface,
                border: `1px solid ${checked ? P.terra : P.line}`,
                cursor: "pointer",
                userSelect: "none",
              }}
            >
              <input
                id={id}
                name={name}
                value={slugify(opt.label)}
                type="checkbox"
                checked={checked}
                onChange={(e) => {
                  if (e.target.checked) onChange([...value, opt.value]);
                  else onChange(value.filter((v) => v !== opt.value));
                }}
                style={{ accentColor: P.terra, margin: 0 }}
              />
              {opt.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div
      style={{
        border: `1px solid ${P.line2}`,
        borderRadius: 10,
        padding: "6px 10px",
        background: P.bg,
        display: "grid",
        gap: 4,
        alignSelf: "start",
      }}
    >
      <div
        style={{
          fontFamily: fontSans,
          fontSize: 10,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: P.ink3,
          fontWeight: 700,
        }}
      >
        {label}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        style={{
          fontFamily: fontBody,
          fontSize: 13,
          background: P.surface,
          color: P.ink,
          border: `1px solid ${P.line}`,
          borderRadius: 8,
          padding: "6px 8px",
        }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
