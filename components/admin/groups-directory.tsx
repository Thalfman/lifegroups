"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useDeferredValue,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { useValueChange } from "@/lib/hooks/use-value-change";
import { fieldInputClassName } from "@/components/admin/forms/field-styles";
import {
  capacityCategory,
  healthCategory,
  listTabDescription,
  matchesListTab,
  setupCategory,
} from "@/lib/dashboard/group-status";
import {
  checkinRankForStatus,
  compareGroupsBy,
  meetingDayIndexFromName,
  meetingMinutesFromTime,
  type GroupsTableSortDir,
  type GroupsTableSortKey,
  type GroupsTableSortRow,
} from "@/lib/dashboard/groups-table-sort";
import {
  DEFAULT_GROUPS_TABLE_COLUMNS,
  DEFAULT_GROUPS_TABLE_DENSITY,
  normalizeGroupsTableColumns,
  toggleGroupsTableColumn,
  type GroupsTableDensity,
  type GroupsTableOptionalColumn,
} from "@/lib/dashboard/groups-table-prefs";
import { usePersistedViewState } from "@/lib/hooks/use-persisted-view-state";
import type { GroupHealthSignals } from "@/components/admin/group-management-shell";
import { lifecycleCategory } from "@/lib/dashboard/labels";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import {
  capacityStatus,
  effectiveCapacity,
  effectiveCapacityFullPct,
  effectiveCapacityWarningPct,
  isExcludedFromCapacityMetrics,
  type MetricDefaults,
} from "@/lib/admin/metrics";
import type { GroupHealthLetter } from "@/types/enums";
import type {
  AttendanceSessionsRow,
  GroupLeadersRow,
  GroupMembershipsRow,
  GroupMetricSettingsRow,
  GroupsRow,
  ProfilesRow,
} from "@/types/database";
import {
  EMPTY_CATEGORIES_BY_AUDIENCE,
  type CategoriesByAudience,
} from "@/components/admin/forms/group-category-options";
import {
  isGroupsViewSnapshot,
  type GroupsViewSnapshot,
} from "@/components/admin/groups/view-snapshot";
import { effectiveGroupsViewMode } from "@/components/admin/groups/view-mode";
import { isTaskListTab } from "@/lib/dashboard/group-list-tabs";
import { GroupCard } from "@/components/admin/groups/group-card";
import { GroupEditorDrawer } from "@/components/admin/groups/group-editor-drawer";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { GroupsTable } from "@/components/admin/groups/groups-table";
import {
  formatWeek,
  leaderTextFor,
  NO_LEADERS,
  NO_SIGNALS,
} from "@/components/admin/groups/groups-helpers";
import {
  EMPTY_TAB_COPY,
  TabBar,
  TABS,
} from "@/components/admin/groups/tab-bar";
import {
  ColumnVisibilityMenu,
  DensityToggle,
  ViewModeToggle,
} from "@/components/admin/groups/view-controls";
import type {
  GroupEditorState,
  GroupStatus,
  ListTab,
  ViewMode,
} from "@/components/admin/groups/types";

type GroupsDirectoryProps = {
  groups: GroupsRow[];
  groupLeaders: GroupLeadersRow[];
  profiles: ProfilesRow[];
  memberships: GroupMembershipsRow[];
  latestSessions: AttendanceSessionsRow[]; // for the week represented by `latestWeek`
  latestWeek: string | null;
  metricDefaults: MetricDefaults;
  groupMetricSettings: GroupMetricSettingsRow[];
  // Group-Health Grade (Q12 computed letter) per group id; absent/null = not
  // assessed. The Health zone reflects this grade, not the health_status enum.
  healthGradesByGroupId: Record<string, GroupHealthLetter | null>;
  // Per-group triage signals beyond the grade letter (missing required ratings,
  // open follow-up, leader-care concern) — drives Needs Health Check + Needs
  // Attention per plan §4. Absent = no concern.
  healthSignalsByGroupId: Record<string, GroupHealthSignals>;
  // Director-tuned Watch threshold from Settings — a group graded at or below
  // it reads as "Needs attention".
  watchGrade: GroupHealthLetter;
  // Signed-in profile id, used only to scope this browser's saved card⇄table
  // view preference per admin (#325). Null falls back to a shared bucket.
  viewerId?: string | null;
  // SAD9: super-admin-only inline permanent delete of a group record.
  isSuperAdmin?: boolean;
  // URL-driven initial tab for direct links from Home/setup recovery.
  initialTab?: ListTab;
  // ADR 0027: the admin arrived via a setup deep-link (?from=setup). Carry the
  // marker into each group's detail link so the roster work keeps the "← Back to
  // setup" affordance.
  fromSetup?: boolean;
  // #398: category-picker options grouped by top type, for the create/edit
  // forms in the editing drawer. Each list is the categories applied (active
  // cell) to that audience.
  categoriesByAudience?: CategoriesByAudience;
};

export function GroupsDirectory(props: GroupsDirectoryProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const initialTab = props.initialTab ?? "all";
  const [tab, setTab] = useState<ListTab>(initialTab);

  // Card⇄table view mode and the table's sort. `mode` is the admin's persisted
  // browsing preference — local, per-browser, profile-scoped (#325) — which
  // drives the `all`/`archived`/attention tabs. SSR + the first client render
  // use these render-time defaults so server and client markup match;
  // usePersistedViewState then adopts the saved choice after its restore effect.
  const [mode, setMode] = useState<ViewMode>("table");
  // #650: the task tabs (Needs setup / Needs health check) default to card
  // layout. `taskViewOverride` lets the admin flip a task tab to a table for the
  // current visit; it is intentionally ephemeral (never persisted, so it can't
  // change the global browsing default) and resets each time the active tab
  // changes, so arriving on a task tab always lands on the card view.
  const [taskViewOverride, setTaskViewOverride] = useState<ViewMode | null>(
    null
  );
  // Sort key + direction live in one state object so the header click handler
  // computes both from a single functional update — nesting one setter inside
  // another's updater would double-fire under React StrictMode's intentional
  // double-invocation and cancel the direction toggle.
  const [sort, setSort] = useState<{
    key: GroupsTableSortKey;
    dir: GroupsTableSortDir;
  }>({ key: "group", dir: "asc" });
  const { key: sortKey, dir: sortDir } = sort;

  // The shown optional table columns and the display density (#333). Like the
  // mode + sort above, SSR + the first client render use these defaults (all
  // optional columns shown, comfortable density) so server and client markup
  // match; the persisted choice is adopted after the restore effect runs.
  const [columns, setColumns] = useState<GroupsTableOptionalColumn[]>(() => [
    ...DEFAULT_GROUPS_TABLE_COLUMNS,
  ]);
  const [density, setDensity] = useState<GroupsTableDensity>(
    DEFAULT_GROUPS_TABLE_DENSITY
  );

  // Resync the active tab when the prop changes. Derived during render rather
  // than in an effect to avoid the cascading-render smell.
  useValueChange(initialTab, (tab) => {
    setTab(tab);
  });

  // Reset the per-visit task-tab view override whenever the active tab changes,
  // so each arrival on a task tab starts from its card default (#650). Switching
  // away and back re-defaults to cards; a non-task tab ignores the override.
  useValueChange(tab, () => {
    setTaskViewOverride(null);
  });

  // The layout actually rendered: task tabs default to cards (unless flipped for
  // this visit), every other tab follows the persisted browsing preference.
  const effectiveMode = effectiveGroupsViewMode({
    tab,
    browsingMode: mode,
    taskOverride: taskViewOverride,
  });
  const onModeChange = useCallback(
    (next: ViewMode) => {
      // On a task tab, record an ephemeral per-visit override; elsewhere, update
      // the persisted browsing preference.
      if (isTaskListTab(tab)) setTaskViewOverride(next);
      else setMode(next);
    },
    [tab]
  );

  usePersistedViewState<GroupsViewSnapshot>({
    surface: "groups",
    scopeId: props.viewerId,
    snapshot: { mode, sortKey, sortDir, columns, density },
    restore: (saved) => {
      setMode(saved.mode);
      setSort({ key: saved.sortKey, dir: saved.sortDir });
      // Normalise the saved column/density values through their own helpers so a
      // stale, partial, or omitted value degrades to the defaults (never hides
      // every column or restores an unknown density).
      setColumns(normalizeGroupsTableColumns(saved.columns));
      setDensity(saved.density ?? DEFAULT_GROUPS_TABLE_DENSITY);
    },
    validate: isGroupsViewSnapshot,
  });

  // Toggle a column header: clicking the active column flips direction;
  // clicking a new column selects it ascending.
  const onSort = useCallback((key: GroupsTableSortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" }
    );
  }, []);

  // Show/hide one optional column. The helper refuses to hide the last column
  // and keeps the canonical render order, so the table never collapses to a
  // name-and-actions strip and columns never reorder.
  const onToggleColumn = useCallback((column: GroupsTableOptionalColumn) => {
    setColumns((prev) => toggleGroupsTableColumn(prev, column));
  }, []);

  // Which record the drawer is editing/creating, plus two flags the open form
  // reports back: `dirtyRef` (edits pending → warn before discarding) and
  // `submittingRef` (a write in flight → block dismissal until it resolves).
  // Refs, not state, so neither typing nor an in-flight save re-renders the
  // list behind the drawer.
  const [editor, setEditor] = useState<GroupEditorState | null>(null);
  // Whether the non-blocking "discard unsaved changes?" prompt is open. State
  // (the rendered dialog reads it), replacing the old blocking `window.confirm`
  // so the dismissal click paints immediately.
  const [discardOpen, setDiscardOpen] = useState(false);
  const dirtyRef = useRef(false);
  const submittingRef = useRef(false);

  const openCreate = useCallback(() => {
    dirtyRef.current = false;
    setEditor({ mode: "create" });
  }, []);
  const openEdit = useCallback((group: GroupsRow) => {
    dirtyRef.current = false;
    setEditor({ mode: "edit", group });
  }, []);
  const markDirty = useCallback(() => {
    dirtyRef.current = true;
  }, []);
  const reportPending = useCallback((pending: boolean) => {
    submittingRef.current = pending;
  }, []);
  const requestClose = useCallback(() => {
    // A save/create/archive is in flight: ignore every dismissal route
    // (Escape, overlay, ×, Cancel) so we don't unmount the form mid-write and
    // drop the close+refresh — it auto-closes via onSaved when the write lands.
    if (submittingRef.current) return;
    // Dirty form: raise the non-blocking confirm dialog instead of closing, and
    // keep the drawer open until the operator answers it.
    if (dirtyRef.current) {
      setDiscardOpen(true);
      return;
    }
    dirtyRef.current = false;
    setEditor(null);
  }, []);
  // The discard prompt's confirm button: drop the unsaved edits and close.
  const confirmDiscard = useCallback(() => {
    setDiscardOpen(false);
    dirtyRef.current = false;
    setEditor(null);
  }, []);
  // Close after a successful save / create / archive and refresh so the list
  // reflects the change immediately (the server action revalidates too).
  const handleSaved = useCallback(() => {
    dirtyRef.current = false;
    submittingRef.current = false;
    setEditor(null);
    router.refresh();
  }, [router]);

  const profilesById = useMemo(
    () => new Map(props.profiles.map((p) => [p.id, p])),
    [props.profiles]
  );

  const leadersByGroupId = useMemo(() => {
    const m = new Map<string, GroupLeadersRow[]>();
    for (const link of props.groupLeaders) {
      if (!link.active) continue;
      const arr = m.get(link.group_id) ?? [];
      arr.push(link);
      m.set(link.group_id, arr);
    }
    return m;
  }, [props.groupLeaders]);

  const activeMemberCountByGroup = useMemo(() => {
    const m = new Map<string, number>();
    for (const link of props.memberships) {
      m.set(link.group_id, (m.get(link.group_id) ?? 0) + 1);
    }
    return m;
  }, [props.memberships]);

  const sessionByGroupId = useMemo(() => {
    const m = new Map<string, AttendanceSessionsRow>();
    for (const s of props.latestSessions) {
      m.set(s.group_id, s);
    }
    return m;
  }, [props.latestSessions]);

  const overrideByGroupId = useMemo(
    () => new Map(props.groupMetricSettings.map((s) => [s.group_id, s])),
    [props.groupMetricSettings]
  );

  // Derive the four independent status categories per group once. The capacity
  // leg reuses the shared capacityStatus rule (ADR 0011) rather than re-rolling
  // the threshold math here.
  const statusByGroupId = useMemo(() => {
    const m = new Map<string, GroupStatus>();
    for (const g of props.groups) {
      const override = overrideByGroupId.get(g.id) ?? null;
      const cap = effectiveCapacity(g, override, props.metricDefaults);
      const status = capacityStatus({
        activeMemberCount: activeMemberCountByGroup.get(g.id) ?? 0,
        effectiveCapacity: cap,
        warningPct: effectiveCapacityWarningPct(override, props.metricDefaults),
        fullPct: effectiveCapacityFullPct(props.metricDefaults),
        excluded: isExcludedFromCapacityMetrics(override),
        allowOverCapacity: Boolean(override?.allow_over_capacity),
      });
      const signals = props.healthSignalsByGroupId[g.id];
      m.set(g.id, {
        lifecycle: lifecycleCategory(g.lifecycle_status),
        setup: setupCategory({
          hasLeader: (leadersByGroupId.get(g.id) ?? NO_LEADERS).length > 0,
          meetingDay: g.meeting_day,
          meetingTime: g.meeting_time,
          // Same defaults → per-group override capacity the card + capacity zone
          // resolve; null = no zone, which keeps the group in Needs Setup.
          effectiveCapacity: cap,
        }),
        health: healthCategory(
          props.healthGradesByGroupId[g.id] ?? null,
          props.watchGrade
        ),
        capacity: capacityCategory(status),
        signals: signals ?? NO_SIGNALS,
      });
    }
    return m;
  }, [
    props.groups,
    props.metricDefaults,
    props.healthGradesByGroupId,
    props.healthSignalsByGroupId,
    props.watchGrade,
    overrideByGroupId,
    activeMemberCountByGroup,
    leadersByGroupId,
  ]);

  // Defer the two inputs that drive the expensive work — the text filter, the
  // locale-aware sort, and the re-render of every group card. The search box
  // (`query`) and the active-tab highlight (`tab`) update urgently so the
  // interaction paints instantly; the heavy list derivation keys off the
  // deferred copies and runs as a low-priority, interruptible render. This
  // keeps keystrokes and tab clicks snappy (low INP) on a long roster without a
  // fixed debounce delay, and React drops superseded renders as you keep typing.
  const deferredQuery = useDeferredValue(query);
  const deferredTab = useDeferredValue(tab);
  // The table-view controls drive the SAME expensive work — re-deriving and
  // re-sorting `tableRows` and re-rendering every row — so they defer too. The
  // urgent state above stays bound to the controls (the clicked header, toggle,
  // density segment, or column checkbox highlights on the same frame); only the
  // heavy list derivation/render keys off these deferred copies, so it runs as a
  // low-priority, interruptible render and the interaction paints instantly.
  // Setters stay plain useState updates so the persisted-state restore is
  // untouched and SSR still emits the render-time defaults (no hydration flash).
  const deferredSort = useDeferredValue(sort);
  const deferredMode = useDeferredValue(effectiveMode);
  const deferredColumns = useDeferredValue(columns);
  const deferredDensity = useDeferredValue(density);
  const trimmed = deferredQuery.trim().toLowerCase();
  // True while the rendered list still reflects the previous input — used to
  // dim it briefly so the stale rows read as catching up, not as the result.
  const listIsStale =
    query !== deferredQuery ||
    tab !== deferredTab ||
    sort !== deferredSort ||
    effectiveMode !== deferredMode ||
    columns !== deferredColumns ||
    density !== deferredDensity;

  const matchesTab = useCallback(
    (g: GroupsRow): boolean => {
      const s = statusByGroupId.get(g.id);
      if (!s) return false;
      // Membership rules live in the pure matchesListTab (plan §4), shared with
      // the focused tests so the spec can't drift from the rendered tabs.
      return matchesListTab(deferredTab, s);
    },
    [deferredTab, statusByGroupId]
  );

  // Per-tab membership counts, shown on the tab pills so the triage buckets
  // read at a glance. Counts deliberately ignore the search box — they size
  // the bucket, not the current query.
  const tabCounts = useMemo(() => {
    const counts: Record<ListTab, number> = {
      all: 0,
      needs_setup: 0,
      needs_health_check: 0,
      needs_attention: 0,
      archived: 0,
    };
    for (const g of props.groups) {
      const s = statusByGroupId.get(g.id);
      if (!s) continue;
      for (const t of TABS) {
        if (matchesListTab(t.key, s)) counts[t.key] += 1;
      }
    }
    return counts;
  }, [props.groups, statusByGroupId]);

  const visible = useMemo(
    () =>
      props.groups
        .filter((g) => {
          if (!matchesTab(g)) return false;
          if (trimmed) {
            const hay =
              `${g.name} ${g.description ?? ""} ${g.location_area ?? ""}`.toLowerCase();
            if (!hay.includes(trimmed)) return false;
          }
          return true;
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    [props.groups, matchesTab, trimmed]
  );

  // Table-mode rows: the same `visible` groups, each paired with the scalars the
  // sort comparators key off (lib/dashboard/groups-table-sort) and the resolved
  // leader/check-in text the row renders. Built from the SAME maps the cards use
  // — no new reads. Only assembled while in table mode so card mode pays nothing.
  const tableRows = useMemo(() => {
    if (deferredMode !== "table") return [];
    const rows = visible.map((g) => {
      const status = statusByGroupId.get(g.id)!;
      const leaders = leadersByGroupId.get(g.id) ?? NO_LEADERS;
      const leaderText = leaderTextFor(leaders, profilesById);
      const session = sessionByGroupId.get(g.id) ?? null;
      const sortRow: GroupsTableSortRow = {
        name: g.name,
        leaderText,
        setup: status.setup,
        health: status.health,
        healthGrade: props.healthGradesByGroupId[g.id] ?? null,
        capacity: status.capacity,
        meetingDayIndex: meetingDayIndexFromName(g.meeting_day),
        meetingMinutes: meetingMinutesFromTime(g.meeting_time),
        checkinRank: checkinRankForStatus(session?.status ?? null),
      };
      return { group: g, status, leaderText, session, sortRow };
    });
    const comparator = compareGroupsBy(deferredSort.key, deferredSort.dir);
    rows.sort((a, b) => comparator(a.sortRow, b.sortRow));
    return rows;
  }, [
    deferredMode,
    visible,
    deferredSort,
    statusByGroupId,
    leadersByGroupId,
    profilesById,
    sessionByGroupId,
    props.healthGradesByGroupId,
  ]);

  const renderCardList = (className?: string) => (
    <ul
      className={cn(
        "m-0 list-none p-0 transition-opacity duration-150",
        listIsStale && "opacity-60",
        className
      )}
    >
      {visible.map((g) => (
        <li key={g.id} className="mb-3.5">
          <GroupCard
            group={g}
            status={statusByGroupId.get(g.id)!}
            leaders={leadersByGroupId.get(g.id) ?? NO_LEADERS}
            profilesById={profilesById}
            activeMemberCount={activeMemberCountByGroup.get(g.id) ?? 0}
            latestSession={sessionByGroupId.get(g.id) ?? null}
            override={overrideByGroupId.get(g.id) ?? null}
            defaults={props.metricDefaults}
            onEdit={openEdit}
            isSuperAdmin={props.isSuperAdmin ?? false}
            fromSetup={props.fromSetup ?? false}
          />
        </li>
      ))}
    </ul>
  );

  return (
    <section className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="hidden flex-wrap items-center gap-3 md:flex">
          <ViewModeToggle mode={effectiveMode} onModeChange={onModeChange} />
          {/* Density + column controls are table-only — they have no meaning for
              the card layout, so they appear once the admin switches to table. */}
          {effectiveMode === "table" ? (
            <>
              <DensityToggle density={density} onDensityChange={setDensity} />
              <ColumnVisibilityMenu
                columns={columns}
                onToggleColumn={onToggleColumn}
              />
            </>
          ) : null}
        </div>
        <Button type="button" variant="primary" size="sm" onClick={openCreate}>
          New group
        </Button>
      </div>

      <div className="grid gap-2">
        <TabBar tab={tab} onTabChange={setTab} counts={tabCounts} />
        {/* The active tab's membership rule, in the operator's words — so a
            group's presence in (or absence from) a bucket is explainable
            without reading code. Urgent `tab`, so it flips with the click. */}
        <p className="m-0 font-sans text-sm leading-normal text-ink3">
          {listTabDescription(tab)}
        </p>
      </div>

      <div className="grid grid-cols-[minmax(220px,1fr)] items-center gap-3 rounded-md border border-line bg-surface px-3.5 py-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, description, location…"
          aria-label="Search groups"
          className={fieldInputClassName}
        />
      </div>

      <div className="text-right font-sans text-2xs text-ink3">
        {visible.length} group{visible.length === 1 ? "" : "s"} shown
        {props.latestWeek
          ? ` · check-in week of ${formatWeek(props.latestWeek)}`
          : ""}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          variant="inline"
          className={cn(
            "rounded-md border border-dashed border-line bg-surface px-6 py-[22px] text-center text-ink2 transition-opacity duration-150",
            listIsStale && "opacity-60"
          )}
          title={
            trimmed
              ? "No groups match your search on this tab. Clear the search to see the full list."
              : EMPTY_TAB_COPY[deferredTab]
          }
        />
      ) : deferredMode === "table" ? (
        <div
          className={cn(
            "transition-opacity duration-150",
            listIsStale && "opacity-60"
          )}
        >
          <div className="hidden md:block">
            <GroupsTable
              rows={tableRows}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={onSort}
              shownColumns={deferredColumns}
              density={deferredDensity}
              activeMemberCountByGroup={activeMemberCountByGroup}
              overrideByGroupId={overrideByGroupId}
              defaults={props.metricDefaults}
              onEdit={openEdit}
              isSuperAdmin={props.isSuperAdmin ?? false}
              fromSetup={props.fromSetup ?? false}
            />
          </div>
          {renderCardList("md:hidden")}
        </div>
      ) : (
        renderCardList()
      )}

      {/* One always-mounted drawer (open toggled) so Radix owns the focus trap
          and focus restore, matching the Group health reference (#259). It
          serves both flows — edit one group, or create a new one. */}
      <GroupEditorDrawer
        editor={editor}
        defaultCapacity={props.metricDefaults.default_group_capacity}
        categoriesByAudience={
          props.categoriesByAudience ?? EMPTY_CATEGORIES_BY_AUDIENCE
        }
        onDirty={markDirty}
        onPendingChange={reportPending}
        onRequestClose={requestClose}
        onSaved={handleSaved}
      />
      {/* Generic wording: the same close path serves both the edit and create
          flows, and during create there is no group to name yet. */}
      <ConfirmDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        title="Discard changes?"
        message="Discard your unsaved changes?"
        confirmLabel="Discard"
        onConfirm={confirmDiscard}
      />
    </section>
  );
}
