"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePersistedViewState } from "@/lib/hooks/use-persisted-view-state";
import {
  AdminMasterCalendarGrid,
  type DayClickPayload,
} from "./admin-master-calendar-grid";
import { AdminMasterCalendarList } from "./admin-master-calendar-list";

// The drawer is a modal that only appears once an occurrence is selected, so its
// chunk is split out of the calendar's First Load JS and fetched on first open
// (mirrors the launch-planning lazy-panels pattern). No loading placeholder: a
// modal has no inline footprint, so a skeleton would flash nothing useful.
const AdminMasterCalendarDrawer = dynamic(
  () =>
    import("./admin-master-calendar-drawer").then(
      (m) => m.AdminMasterCalendarDrawer
    ),
  { ssr: false }
);
import { AdminCalendarLegend } from "./admin-calendar-legend";
import { PlanningByLeaderList } from "./planning/planning-by-leader-list";
import {
  filterOccurrencesForView,
  type PlanningViewKey,
} from "@/lib/admin/planning-views";
import {
  calendarListRange,
  filterCalendarOccurrences,
  hasActiveCalendarFilters,
  isCalendarViewSnapshot,
  responsiveViewMode,
  viewModePreferenceToPersist,
  type CalendarFilters,
  type CalendarViewMode,
} from "@/lib/admin/master-calendar-view";
import type {
  MasterCalendarGroupSummary,
  MasterCalendarLeader,
  MasterOccurrence,
} from "@/lib/admin/master-calendar";
import type {
  GroupCalendarEventStatus,
  GroupCalendarEventType,
} from "@/types/enums";
import { ActiveFilterSummary } from "./master-calendar/active-filter-summary";
import { EmptyState } from "./master-calendar/empty-state";
import { FilterBar } from "./master-calendar/filter-bar";
import { PlanningViewSwitcher } from "./master-calendar/planning-view-switcher";

// View-model branching (snapshot validation, filter composition, view-mode
// rules, summary/chips) lives in lib/admin/master-calendar-view; the
// presentational filter UI lives in ./master-calendar; this shell owns state
// and layout only.
type ViewMode = CalendarViewMode;

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
      // userToggledRef must stay a ref (the mount-once media-query effect reads
      // it without re-subscribing), and it only ever flips false→true alongside
      // a setViewMode call, so this render-time read is consistent with the
      // committed viewMode rather than the impure read the rule guards against.
      // eslint-disable-next-line react-hooks/refs
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
    // Initial sync from a client-only media-query subscription, gated behind
    // hydration + the user-toggle ref so it never fights SSR markup. This is an
    // external-system sync, not the derivable cascading-render the rule targets.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
  // Latches true on the first selection so the dynamically-imported drawer
  // mounts only when first needed, then stays mounted (keeping its close
  // animation) for subsequent opens.
  const [drawerEverOpened, setDrawerEverOpened] = useState(false);
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

  // Stable identity so the memoized occurrence rows (grid + list) don't all
  // re-render whenever the shell re-renders for an unrelated reason. State
  // setters are stable, so the empty dependency list is correct.
  const onSelect = useCallback((o: MasterOccurrence) => {
    setSelectedKey(`${o.groupId}|${o.date}`);
    setDrawerEverOpened(true);
  }, []);

  const onMoreFromDay = (payload: DayClickPayload) => {
    setListAnchorDate(payload.date);
    setViewModeManual("list");
  };

  // Stable so the list's anchor-scroll effect (which depends on it) doesn't
  // re-run on every shell render.
  const onAnchorConsumed = useCallback(() => setListAnchorDate(null), []);

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
    <div className="grid gap-4">
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
          className="rounded-lg border border-line bg-surface px-3.5 py-2.5"
          open={hasActiveFilters}
        >
          {/* flex on the summary drops the native disclosure marker (same as
              the previous inline display:flex). */}
          <summary className="flex cursor-pointer items-center gap-2 font-sans text-2xs font-semibold uppercase tracking-[1.5px] text-ink3">
            Advanced filters
            {hasActiveFilters ? (
              <span className="rounded-pill border border-clay bg-claySoft px-2 py-px font-sans text-2xs normal-case tracking-normal text-clay">
                Active
              </span>
            ) : null}
          </summary>
          <div className="pt-3">{filterBar}</div>
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
          onAnchorConsumed={onAnchorConsumed}
          onSelect={onSelect}
          denoiseGroupLinks={planningViews}
        />
      )}

      {drawerEverOpened && (
        <AdminMasterCalendarDrawer
          monthIso={monthIso}
          occurrence={selected}
          onClose={() => setSelectedKey(null)}
        />
      )}
    </div>
  );
}
