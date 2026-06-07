"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  memo,
  useCallback,
  useDeferredValue,
  useMemo,
  useRef,
  useState,
} from "react";
import { ArchiveGroupButton } from "@/components/admin/forms/archive-group-button";
import { GroupCreateForm } from "@/components/admin/forms/group-create-form";
import { GroupEditForm } from "@/components/admin/forms/group-edit-form";
import { RestoreGroupButton } from "@/components/admin/forms/restore-group-button";
import { SuperAdminInlineDelete } from "@/components/admin/super-admin/inline-delete";
import { EditingSurface } from "@/components/lg/admin/editing-surface";
import { PButton } from "@/components/pastoral/button";
import { PBadge, type PTone } from "@/components/pastoral/atoms";
import {
  capacityCategory,
  healthCategory,
  matchesListTab,
  setupCategory,
  type GroupListTab,
  type GroupTriageSignals,
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
  GROUPS_TABLE_DENSITIES,
  GROUPS_TABLE_OPTIONAL_COLUMNS,
  isColumnShown,
  isGroupsTableDensity,
  normalizeGroupsTableColumns,
  toggleGroupsTableColumn,
  type GroupsTableDensity,
  type GroupsTableOptionalColumn,
} from "@/lib/dashboard/groups-table-prefs";
import { usePersistedViewState } from "@/lib/hooks/use-persisted-view-state";
import type { GroupHealthSignals } from "@/components/admin/group-management-shell";
import {
  capacityCategoryLabel,
  healthCategoryLabel,
  lifecycleCategory,
  lifecycleCategoryLabel,
  setupCategoryLabel,
  type GroupCapacityCategory,
  type GroupHealthCategory,
  type GroupLifecycleCategory,
  type GroupSetupCategory,
} from "@/lib/dashboard/labels";
import { P, fontBody, fontDisplay, fontSans } from "@/lib/pastoral";
import {
  capacityStatus,
  effectiveCapacity,
  effectiveCapacityFullPct,
  effectiveCapacityWarningPct,
  isExcludedFromCapacityMetrics,
  unknownCapacity,
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
import type { AttendanceSessionStatus } from "@/types/enums";
import {
  EMPTY_CATEGORIES_BY_AUDIENCE,
  type CategoriesByAudience,
} from "@/components/admin/forms/group-category-options";

// Each of the four independent status categories carries its own badge tone.
// They are shown as four separate chips — never combined into one (issue #300).
const LIFECYCLE_TONE: Record<GroupLifecycleCategory, PTone> = {
  active: "healthy",
  paused: "pause",
  archived: "neutral",
};

const SETUP_TONE: Record<GroupSetupCategory, PTone> = {
  complete: "healthy",
  needs_setup: "watch",
  needs_leader: "followup",
  missing_meeting: "watch",
};

const HEALTH_TONE: Record<GroupHealthCategory, PTone> = {
  not_assessed: "neutral",
  no_concerns: "healthy",
  needs_attention: "followup",
};

const CAPACITY_TONE: Record<GroupCapacityCategory, PTone> = {
  open: "neutral",
  near_full: "watch",
  full: "followup",
};

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
  // #398: category-picker options grouped by top type, for the create/edit
  // forms in the editing drawer. Each list is the categories applied (active
  // cell) to that audience.
  categoriesByAudience?: CategoriesByAudience;
};

// The card⇄table view mode. SSR + first client paint always render "cards"
// (the historical default), then the persisted choice is adopted after the
// restore effect runs — so the server and first client markup match (no flash).
type ViewMode = "cards" | "table";

// The persisted view snapshot for this surface (#325, extended in #333): the
// card⇄table mode, the table's sort column + direction, the shown optional
// columns, and the display density. Local, per-browser, profile-scoped — a UI
// preference, never server state. Held as one snapshot under the surface's
// profile-scoped key so the whole Groups view restores atomically without flash.
type GroupsViewSnapshot = {
  mode: ViewMode;
  sortKey: GroupsTableSortKey;
  sortDir: GroupsTableSortDir;
  // The shown optional columns (#333). Omitted by pre-#333 snapshots; the
  // validator tolerates that and the directory normalises to the default set.
  columns?: GroupsTableOptionalColumn[];
  // The table display density (#333). Omitted by pre-#333 snapshots; defaults
  // to "comfortable" so older saved views keep their historical look.
  density?: GroupsTableDensity;
};

const SORT_KEYS = new Set<GroupsTableSortKey>([
  "group",
  "leader",
  "setup",
  "health",
  "capacity",
  "meeting",
  "checkin",
]);

// Accept any snapshot whose required #325 fields are valid. The #333 additions
// (columns, density) are optional: a pre-#333 saved value omits them, and we
// only reject a present-but-wrong-typed field — the directory then normalises
// columns/density through their own helpers, so a stale or partial value
// degrades to the defaults rather than discarding the whole snapshot.
function isGroupsViewSnapshot(value: unknown): value is GroupsViewSnapshot {
  if (value === null || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (
    !(
      (v.mode === "cards" || v.mode === "table") &&
      typeof v.sortKey === "string" &&
      SORT_KEYS.has(v.sortKey as GroupsTableSortKey) &&
      (v.sortDir === "asc" || v.sortDir === "desc")
    )
  ) {
    return false;
  }
  if (v.columns !== undefined && !Array.isArray(v.columns)) return false;
  if (v.density !== undefined && !isGroupsTableDensity(v.density)) return false;
  return true;
}

// The five list tabs (issue #300). "all" lists every active group; "archived"
// lists closed groups; the three middle tabs are derived attention buckets.
// The tab keys + membership rules live in lib/dashboard/group-status so the spec
// (plan §4) is locked in by tests; the component only renders them.
type ListTab = GroupListTab;

const TABS: { key: ListTab; label: string }[] = [
  { key: "all", label: "All Groups" },
  { key: "needs_setup", label: "Needs Setup" },
  { key: "needs_health_check", label: "Needs Health Check" },
  { key: "needs_attention", label: "Needs Attention" },
  { key: "archived", label: "Archived" },
];

// The four independent status categories for one group, derived from already-
// assembled inputs (ADR 0011: per-surface assembly, reusing shared rules only).
type GroupStatus = {
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
type GroupEditorState = { mode: "create" } | { mode: "edit"; group: GroupsRow };

// One assembled row for the Ops table (#325): the group, its four status
// categories, the resolved leader text + latest-week session it renders, and
// the scalar sort key the comparators ordered it by. Built once per visible
// group from the same maps the cards use — no new reads.
type GroupTableRow = {
  group: GroupsRow;
  status: GroupStatus;
  leaderText: string | null;
  session: AttendanceSessionsRow | null;
  sortRow: GroupsTableSortRow;
};

export function GroupsDirectory(props: GroupsDirectoryProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<ListTab>("all");

  // Card⇄table view mode and the table's sort. SSR + the first client render
  // use these render-time defaults ("cards", sorted by group name ascending) so
  // server and client markup match; usePersistedViewState then adopts the
  // admin's saved choice after its restore effect (no hydration flash). The
  // preference is local, per-browser, and profile-scoped (#325).
  const [mode, setMode] = useState<ViewMode>("cards");
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
    // Generic wording: the same close path serves both the edit and create
    // flows, and during create there is no group to name yet.
    if (dirtyRef.current && !window.confirm("Discard your unsaved changes?")) {
      return;
    }
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
  const deferredMode = useDeferredValue(mode);
  const deferredColumns = useDeferredValue(columns);
  const deferredDensity = useDeferredValue(density);
  const trimmed = deferredQuery.trim().toLowerCase();
  // True while the rendered list still reflects the previous input — used to
  // dim it briefly so the stale rows read as catching up, not as the result.
  const listIsStale =
    query !== deferredQuery ||
    tab !== deferredTab ||
    sort !== deferredSort ||
    mode !== deferredMode ||
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

  const isArchivedTab = tab === "archived";

  return (
    <section style={{ display: "grid", gap: 18 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <ViewModeToggle mode={mode} onModeChange={setMode} />
          {/* Density + column controls are table-only — they have no meaning for
              the card layout, so they appear once the admin switches to table. */}
          {mode === "table" ? (
            <>
              <DensityToggle density={density} onDensityChange={setDensity} />
              <ColumnVisibilityMenu
                columns={columns}
                onToggleColumn={onToggleColumn}
              />
            </>
          ) : null}
        </div>
        <PButton type="button" tone="terra" size="sm" onClick={openCreate}>
          New group
        </PButton>
      </div>

      <TabBar tab={tab} onTabChange={setTab} />

      <div
        className="lg-m-filterbar"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(220px, 1fr)",
          gap: 12,
          alignItems: "center",
          background: P.surface,
          border: `1px solid ${P.line}`,
          borderRadius: 10,
          padding: "12px 14px",
        }}
      >
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, description, location…"
          aria-label="Search groups"
          className="lg-m-input"
          style={{
            padding: "10px 12px",
            borderRadius: 8,
            border: `1px solid ${P.line}`,
            background: P.bg,
            fontFamily: fontBody,
            fontSize: 14,
            color: P.ink,
            outline: "none",
          }}
        />
      </div>

      <div
        style={{
          fontFamily: fontSans,
          fontSize: 11,
          color: P.ink3,
          textAlign: "right",
        }}
      >
        {visible.length} group{visible.length === 1 ? "" : "s"} shown
        {props.latestWeek
          ? ` · check-in week of ${formatWeek(props.latestWeek)}`
          : ""}
      </div>

      {visible.length === 0 ? (
        <div
          style={{
            background: P.surface,
            border: `1px dashed ${P.line}`,
            borderRadius: 10,
            padding: "22px 24px",
            textAlign: "center",
            fontFamily: fontBody,
            fontSize: 13,
            color: P.ink2,
            opacity: listIsStale ? 0.6 : 1,
            transition: "opacity 120ms ease",
          }}
        >
          {isArchivedTab
            ? "No archived groups."
            : "No groups match the current tab."}
        </div>
      ) : deferredMode === "table" ? (
        <div
          style={{
            opacity: listIsStale ? 0.6 : 1,
            transition: "opacity 120ms ease",
          }}
        >
          <GroupsTable
            rows={tableRows}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={onSort}
            shownColumns={deferredColumns}
            density={deferredDensity}
            profilesById={profilesById}
            activeMemberCountByGroup={activeMemberCountByGroup}
            overrideByGroupId={overrideByGroupId}
            defaults={props.metricDefaults}
            onEdit={openEdit}
            isSuperAdmin={props.isSuperAdmin ?? false}
          />
        </div>
      ) : (
        <ul
          style={{
            ...listResetStyle,
            opacity: listIsStale ? 0.6 : 1,
            transition: "opacity 120ms ease",
          }}
        >
          {visible.map((g) => (
            <li key={g.id} style={{ marginBottom: 14 }}>
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
              />
            </li>
          ))}
        </ul>
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
    </section>
  );
}

// ---------------------------------------------------------------------------
// Tab bar
// ---------------------------------------------------------------------------

function TabBar({
  tab,
  onTabChange,
}: {
  tab: ListTab;
  onTabChange: (t: ListTab) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Group list view"
      style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
    >
      {TABS.map((t) => {
        const active = tab === t.key;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onTabChange(t.key)}
            style={{
              padding: "7px 14px",
              borderRadius: 999,
              border: `1px solid ${active ? P.ink : P.line}`,
              background: active ? P.ink : "transparent",
              color: active ? P.surface : P.ink2,
              fontFamily: fontSans,
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card⇄table view toggle (#325)
// ---------------------------------------------------------------------------

// A two-option segmented control that switches the directory between the
// six-zone cards and the dense Ops table. The choice persists per browser,
// scoped to the signed-in admin (usePersistedViewState). Rendered as an explicit
// radiogroup so the current view is announced and keyboard-reachable.
function ViewModeToggle({
  mode,
  onModeChange,
}: {
  mode: ViewMode;
  onModeChange: (m: ViewMode) => void;
}) {
  const options: { key: ViewMode; label: string }[] = [
    { key: "cards", label: "Cards" },
    { key: "table", label: "Table" },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Group list layout"
      style={{
        display: "inline-flex",
        gap: 4,
        padding: 4,
        background: P.surface,
        border: `1px solid ${P.line}`,
        borderRadius: 999,
      }}
    >
      {options.map((o) => {
        const active = mode === o.key;
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onModeChange(o.key)}
            style={{
              padding: "5px 14px",
              borderRadius: 999,
              border: "none",
              background: active ? P.ink : "transparent",
              color: active ? P.surface : P.ink2,
              fontFamily: fontSans,
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Density toggle (#333)
// ---------------------------------------------------------------------------

// A two-option segmented control that switches the Ops table between the roomy
// "comfortable" rows and the tighter "compact" rows. The choice persists per
// browser, scoped to the signed-in admin, alongside the other Groups view prefs.
// Rendered as a radiogroup so the current density is announced and keyboard-
// reachable, matching the card⇄table toggle's pattern.
const DENSITY_LABELS: Record<GroupsTableDensity, string> = {
  comfortable: "Comfortable",
  compact: "Compact",
};

function DensityToggle({
  density,
  onDensityChange,
}: {
  density: GroupsTableDensity;
  onDensityChange: (d: GroupsTableDensity) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Table density"
      style={{
        display: "inline-flex",
        gap: 4,
        padding: 4,
        background: P.surface,
        border: `1px solid ${P.line}`,
        borderRadius: 999,
      }}
    >
      {GROUPS_TABLE_DENSITIES.map((d) => {
        const active = density === d;
        return (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onDensityChange(d)}
            style={{
              padding: "5px 14px",
              borderRadius: 999,
              border: "none",
              background: active ? P.ink : "transparent",
              color: active ? P.surface : P.ink2,
              fontFamily: fontSans,
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {DENSITY_LABELS[d]}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Column visibility menu (#333)
// ---------------------------------------------------------------------------

// Per-column show/hide toggles for the table's optional columns. Each is a
// checkbox so its state is announced, grouped under a labelled fieldset so a
// screen-reader user hears the group purpose. The last shown column can't be
// hidden (the toggle helper refuses it), so it is rendered disabled to make that
// constraint visible. The shown set persists with the other Groups view prefs.
const COLUMN_MENU_LABELS: Record<GroupsTableOptionalColumn, string> = {
  leader: "Leader / co-leader",
  setup: "Setup",
  health: "Health grade",
  capacity: "Capacity",
  meeting: "Meeting day/time",
  checkin: "Latest-week check-in",
};

function ColumnVisibilityMenu({
  columns,
  onToggleColumn,
}: {
  columns: GroupsTableOptionalColumn[];
  onToggleColumn: (column: GroupsTableOptionalColumn) => void;
}) {
  const [open, setOpen] = useState(false);
  const lastShown = columns.length <= 1;
  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        style={{
          padding: "7px 14px",
          borderRadius: 999,
          border: `1px solid ${P.line}`,
          background: P.surface,
          color: P.ink2,
          fontFamily: fontSans,
          fontSize: 12,
          fontWeight: 500,
          cursor: "pointer",
        }}
      >
        Columns
      </button>
      {open ? (
        <fieldset
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            zIndex: 10,
            minWidth: 200,
            margin: 0,
            padding: "12px 14px",
            display: "grid",
            gap: 8,
            background: P.surface,
            border: `1px solid ${P.line}`,
            borderRadius: 10,
            boxShadow: "0 6px 20px rgba(0,0,0,0.10)",
          }}
        >
          <legend
            style={{
              padding: 0,
              fontFamily: fontSans,
              fontSize: 10,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              fontWeight: 600,
              color: P.ink3,
            }}
          >
            Show columns
          </legend>
          {GROUPS_TABLE_OPTIONAL_COLUMNS.map((col) => {
            const shown = isColumnShown(columns, col);
            // The single remaining shown column can't be hidden — disable it so
            // the constraint is visible rather than a silent no-op.
            const disabled = shown && lastShown;
            return (
              <label
                key={col}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontFamily: fontBody,
                  fontSize: 13,
                  color: disabled ? P.ink3 : P.ink2,
                  cursor: disabled ? "default" : "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={shown}
                  disabled={disabled}
                  onChange={() => onToggleColumn(col)}
                />
                {COLUMN_MENU_LABELS[col]}
              </label>
            );
          })}
        </fieldset>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ops table (#325) — a dense, sortable view of the same groups the cards show.
// Warm and pastoral, not a grey spreadsheet: PBadge tones for the four status
// categories, tabular-nums for the capacity figures, and record-context action
// names on every repeated control (the a11y suite enforces uniqueness).
// ---------------------------------------------------------------------------

// The sortable columns, in render order. `numeric` columns get tabular-nums and
// the check-in column reuses the already-loaded latest-week session text. The
// "group" column is structural (never hideable); the rest carry an `optional`
// key so the header can filter them by the admin's saved column choice (#333).
const TABLE_COLUMNS: {
  key: GroupsTableSortKey;
  label: string;
  numeric?: boolean;
  // The matching optional-column key, or undefined for the structural "group"
  // column that is always shown.
  optional?: GroupsTableOptionalColumn;
}[] = [
  { key: "group", label: "Group" },
  { key: "leader", label: "Leader / co-leader", optional: "leader" },
  { key: "setup", label: "Setup", optional: "setup" },
  { key: "health", label: "Health grade", optional: "health" },
  { key: "capacity", label: "Capacity", numeric: true, optional: "capacity" },
  { key: "meeting", label: "Meeting day/time", optional: "meeting" },
  { key: "checkin", label: "Latest-week check-in", optional: "checkin" },
];

// Cell padding per density. Compact tightens the vertical rhythm so more groups
// fit on screen; comfortable keeps the historical roomy rows.
const DENSITY_CELL_PADDING: Record<GroupsTableDensity, string> = {
  comfortable: "12px",
  compact: "6px 12px",
};

const DENSITY_HEADER_PADDING: Record<GroupsTableDensity, string> = {
  comfortable: "10px 12px",
  compact: "6px 12px",
};

// One table row, memoized like GroupCard so the table re-renders cheaply. A sort
// click only reorders these elements — their props are unchanged, so React skips
// re-rendering every row (the main INP win). Column/density toggles do change
// `shownColumns`/`density` for all rows, but those re-renders are cheap memoized
// leaves and run behind the deferred values in GroupsDirectory, off the click's
// critical path. The per-row scalars (override, member count) arrive resolved
// from the parent's stable maps so identical rows stay referentially equal.
const GroupTableRowView = memo(function GroupTableRowView({
  group,
  status,
  leaderText,
  session,
  shownColumns,
  density,
  override,
  memberCount,
  defaults,
  onEdit,
  isSuperAdmin,
}: {
  group: GroupsRow;
  status: GroupStatus;
  leaderText: string | null;
  session: AttendanceSessionsRow | null;
  shownColumns: GroupsTableOptionalColumn[];
  density: GroupsTableDensity;
  override: GroupMetricSettingsRow | null;
  memberCount: number;
  defaults: MetricDefaults;
  onEdit: (group: GroupsRow) => void;
  isSuperAdmin: boolean;
}) {
  const show = (column: GroupsTableOptionalColumn) =>
    isColumnShown(shownColumns, column);
  const dCellStyle: React.CSSProperties = {
    ...cellStyle,
    padding: DENSITY_CELL_PADDING[density],
  };
  const groupLabel = groupAccessibleLabel(group);
  const isArchived = status.lifecycle === "archived";
  const excluded = isExcludedFromCapacityMetrics(override);
  const cap = effectiveCapacity(group, override, defaults);
  const isCapacityUnknown = unknownCapacity(group, override, defaults);
  return (
    <tr
      style={{
        borderBottom: `1px solid ${P.line2}`,
        opacity: isArchived ? 0.7 : 1,
      }}
    >
      {/* Group + lifecycle (structural — always shown) */}
      <td style={dCellStyle}>
        <div style={{ display: "grid", gap: 4, alignContent: "start" }}>
          <span style={{ fontWeight: 500, color: P.ink }}>{group.name}</span>
          <span>
            <PBadge tone={LIFECYCLE_TONE[status.lifecycle]}>
              {lifecycleCategoryLabel(status.lifecycle)}
            </PBadge>
          </span>
        </div>
      </td>
      {/* Leader / co-leader */}
      {show("leader") ? (
        <td style={{ ...dCellStyle, color: P.ink2 }}>
          {leaderText ?? "Unassigned"}
        </td>
      ) : null}
      {/* Setup */}
      {show("setup") ? (
        <td style={dCellStyle}>
          <PBadge tone={SETUP_TONE[status.setup]}>
            {setupCategoryLabel(status.setup)}
          </PBadge>
        </td>
      ) : null}
      {/* Health grade */}
      {show("health") ? (
        <td style={dCellStyle}>
          <PBadge tone={HEALTH_TONE[status.health]}>
            {healthCategoryLabel(status.health)}
          </PBadge>
        </td>
      ) : null}
      {/* Capacity (numeric → tabular-nums, right-aligned) */}
      {show("capacity") ? (
        <td
          style={{
            ...dCellStyle,
            textAlign: "right",
            fontVariantNumeric: "tabular-nums",
            color: P.ink2,
          }}
        >
          <div
            style={{
              display: "inline-flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: 4,
            }}
          >
            <PBadge tone={CAPACITY_TONE[status.capacity]}>
              {capacityCategoryLabel(status.capacity)}
            </PBadge>
            <span>
              {excluded
                ? "Excluded"
                : `${memberCount}${
                    isCapacityUnknown ? " / —" : ` / ${cap ?? "—"}`
                  }`}
            </span>
          </div>
        </td>
      ) : null}
      {/* Meeting day/time */}
      {show("meeting") ? (
        <td style={{ ...dCellStyle, color: P.ink2 }}>{metaLine(group)}</td>
      ) : null}
      {/* Latest-week check-in — reuses the already-loaded session */}
      {show("checkin") ? (
        <td style={{ ...dCellStyle, color: P.ink3 }}>
          {latestCheckinText(session)}
        </td>
      ) : null}
      {/* Actions — record-context names, unique per group */}
      <td style={{ ...dCellStyle, textAlign: "right" }}>
        <div
          style={{
            display: "inline-flex",
            gap: 6,
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          <Link
            href={`/admin/groups/${group.id}`}
            aria-label={`View ${groupLabel}`}
            style={tableLinkStyle}
          >
            View
          </Link>
          {isArchived ? (
            <RestoreGroupButton
              groupId={group.id}
              groupName={group.name}
              ariaLabel={`Restore ${groupLabel}`}
            />
          ) : (
            <>
              <Link
                href={`/admin/groups/${group.id}/calendar`}
                aria-label={`Open ${groupLabel} calendar`}
                style={tableLinkStyle}
              >
                Calendar
              </Link>
              <PButton
                type="button"
                tone="terra"
                size="sm"
                aria-label={`Edit ${groupLabel}`}
                onClick={() => onEdit(group)}
              >
                Edit
              </PButton>
            </>
          )}
          {isSuperAdmin ? (
            <SuperAdminInlineDelete
              entityType="group"
              id={group.id}
              label={group.name}
            />
          ) : null}
        </div>
      </td>
    </tr>
  );
});

function GroupsTable({
  rows,
  sortKey,
  sortDir,
  onSort,
  shownColumns,
  density,
  profilesById,
  activeMemberCountByGroup,
  overrideByGroupId,
  defaults,
  onEdit,
  isSuperAdmin,
}: {
  rows: GroupTableRow[];
  sortKey: GroupsTableSortKey;
  sortDir: GroupsTableSortDir;
  onSort: (key: GroupsTableSortKey) => void;
  shownColumns: GroupsTableOptionalColumn[];
  density: GroupsTableDensity;
  profilesById: Map<string, ProfilesRow>;
  activeMemberCountByGroup: Map<string, number>;
  overrideByGroupId: Map<string, GroupMetricSettingsRow>;
  defaults: MetricDefaults;
  onEdit: (group: GroupsRow) => void;
  isSuperAdmin: boolean;
}) {
  // Render the structural "group" column plus only the optional columns the
  // admin has chosen to show, keeping the table's fixed render order.
  const visibleColumns = TABLE_COLUMNS.filter(
    (col) => !col.optional || isColumnShown(shownColumns, col.optional)
  );
  const headerPad = DENSITY_HEADER_PADDING[density];
  return (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontFamily: fontBody,
          fontSize: 13,
        }}
      >
        <caption style={visuallyHiddenStyle}>
          Groups, with sortable columns for group, leader, setup, health grade,
          capacity, meeting day and time, and the latest-week check-in.
        </caption>
        <thead>
          <tr>
            {visibleColumns.map((col) => {
              const active = sortKey === col.key;
              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={
                    active
                      ? sortDir === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                  style={{
                    textAlign: col.numeric ? "right" : "left",
                    padding: 0,
                    borderBottom: `1px solid ${P.line}`,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onSort(col.key)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      width: "100%",
                      justifyContent: col.numeric ? "flex-end" : "flex-start",
                      padding: headerPad,
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      fontFamily: fontSans,
                      fontSize: 10,
                      letterSpacing: 1.2,
                      textTransform: "uppercase",
                      fontWeight: 600,
                      color: active ? P.ink : P.ink3,
                    }}
                  >
                    {col.label}
                    <span aria-hidden="true" style={{ fontSize: 9 }}>
                      {active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
                    </span>
                  </button>
                </th>
              );
            })}
            <th
              scope="col"
              style={{
                textAlign: "right",
                padding: headerPad,
                borderBottom: `1px solid ${P.line}`,
                fontFamily: fontSans,
                fontSize: 10,
                letterSpacing: 1.2,
                textTransform: "uppercase",
                fontWeight: 600,
                color: P.ink3,
              }}
            >
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ group, status, leaderText, session }) => (
            <GroupTableRowView
              key={group.id}
              group={group}
              status={status}
              leaderText={leaderText}
              session={session}
              shownColumns={shownColumns}
              density={density}
              override={overrideByGroupId.get(group.id) ?? null}
              memberCount={activeMemberCountByGroup.get(group.id) ?? 0}
              defaults={defaults}
              onEdit={onEdit}
              isSuperAdmin={isSuperAdmin}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editing drawer (the propagated Editing Pattern, #266)
// ---------------------------------------------------------------------------

function GroupEditorDrawer({
  editor,
  defaultCapacity,
  categoriesByAudience,
  onDirty,
  onPendingChange,
  onRequestClose,
  onSaved,
}: {
  editor: GroupEditorState | null;
  defaultCapacity: number | null;
  categoriesByAudience: CategoriesByAudience;
  onDirty: () => void;
  onPendingChange: (pending: boolean) => void;
  onRequestClose: () => void;
  onSaved: () => void;
}) {
  const group = editor?.mode === "edit" ? editor.group : null;

  return (
    <EditingSurface
      open={editor !== null}
      onRequestClose={onRequestClose}
      eyebrow={group ? "Edit group" : "New group"}
      title={group ? group.name : "Start a Life Group"}
      description={
        group
          ? "Update this group's details. Saving affects only this group."
          : "Just a name is enough to get started — capacity, day, and leader can be filled in now or later."
      }
      closeLabel={group ? `Close ${group.name} editor` : "Close new group form"}
    >
      {editor?.mode === "edit" ? (
        // Keyed per group so the fields + action state reset when a different
        // group is opened, while the Dialog itself stays mounted.
        <div style={{ display: "grid", gap: 18 }} key={editor.group.id}>
          <GroupEditForm
            group={editor.group}
            categoriesByAudience={categoriesByAudience}
            onCancel={onRequestClose}
            onDirty={onDirty}
            onPendingChange={onPendingChange}
            onSaved={onSaved}
          />
          <ArchiveSection
            group={editor.group}
            onArchived={onSaved}
            onPendingChange={onPendingChange}
          />
        </div>
      ) : editor?.mode === "create" ? (
        <GroupCreateForm
          defaultCapacity={defaultCapacity}
          categoriesByAudience={categoriesByAudience}
          onCancel={onRequestClose}
          onDirty={onDirty}
          onPendingChange={onPendingChange}
          onSaved={onSaved}
        />
      ) : null}
    </EditingSurface>
  );
}

// Archiving lives with editing but is deliberately set apart: it takes the
// group off the active roster (a lifecycle move), which is not the same as
// cancelling the edit above — the old inline panel conflated the two.
function ArchiveSection({
  group,
  onArchived,
  onPendingChange,
}: {
  group: GroupsRow;
  onArchived: () => void;
  onPendingChange: (pending: boolean) => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        gap: 10,
        padding: "12px 16px",
        borderRadius: 10,
        border: `1px solid ${P.line}`,
        background: P.surface,
      }}
    >
      <div style={{ display: "grid", gap: 4 }}>
        <span
          style={{
            fontFamily: fontSans,
            fontSize: 10,
            letterSpacing: 1.6,
            textTransform: "uppercase",
            color: P.ink3,
            fontWeight: 600,
          }}
        >
          Lifecycle &middot; separate from edit
        </span>
        <span
          style={{
            fontFamily: fontBody,
            fontSize: 13,
            color: P.ink2,
            lineHeight: 1.45,
          }}
        >
          Archive takes the group off the active roster. The record stays and
          you can restore it later. This is not the same as cancelling your edit
          above.
        </span>
      </div>
      <ArchiveGroupButton
        groupId={group.id}
        groupName={group.name}
        onArchived={onArchived}
        onPendingChange={onPendingChange}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Group card — six labelled zones (issue #300)
// ---------------------------------------------------------------------------

// Zones: Header (name + lifecycle), Setup (leader + setup completeness),
// Health (Group-Health Grade), Capacity (size vs capacity), Meeting (day/time/
// location), Actions (View group). The four status categories show as four
// separate chips, never a combined one.
//
// Memoized so re-renders that don't change a card's props (e.g. each keystroke
// in the debounced search) skip re-rendering every card. Props are referentially
// stable: the lookup maps are memoized and the rows come straight from props.
const GroupCard = memo(function GroupCard({
  group,
  status,
  leaders,
  profilesById,
  activeMemberCount,
  latestSession,
  override,
  defaults,
  onEdit,
  isSuperAdmin,
}: {
  group: GroupsRow;
  status: GroupStatus;
  leaders: GroupLeadersRow[];
  profilesById: Map<string, ProfilesRow>;
  activeMemberCount: number;
  latestSession: AttendanceSessionsRow | null;
  override: GroupMetricSettingsRow | null;
  defaults: MetricDefaults;
  // Opens the shared editing drawer for this group (#266). The card itself
  // stays a read-only row — editing no longer happens inline.
  onEdit: (group: GroupsRow) => void;
  isSuperAdmin: boolean;
}) {
  const isArchived = status.lifecycle === "archived";
  // Repeated row actions name their group plus a stable discriminator so two
  // groups that share a name stay distinguishable (shared with the table mode).
  const groupLabel = groupAccessibleLabel(group);

  const cap = effectiveCapacity(group, override, defaults);
  const isCapacityUnknown = unknownCapacity(group, override, defaults);
  const excluded = isExcludedFromCapacityMetrics(override);

  const leaderText = leaderTextFor(leaders, profilesById) ?? "Unassigned";

  return (
    <article
      style={{
        background: P.surface,
        border: `1px solid ${P.line}`,
        borderRadius: 12,
        padding: "18px 22px",
        display: "grid",
        gap: 14,
        opacity: isArchived ? 0.7 : 1,
      }}
    >
      {/* Zone 1 — Header: name + lifecycle (only). The other three categories
          live in their own zones below, so the header never combines them. */}
      <header
        className="lg-m-grid-stack"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) auto",
          gap: 12,
          alignItems: "start",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 8,
            }}
          >
            <h3
              style={{
                margin: 0,
                fontFamily: fontDisplay,
                fontSize: 20,
                fontWeight: 500,
                color: P.ink,
                letterSpacing: -0.3,
              }}
            >
              {group.name}
            </h3>
            <PBadge tone={LIFECYCLE_TONE[status.lifecycle]}>
              {lifecycleCategoryLabel(status.lifecycle)}
            </PBadge>
          </div>
        </div>
        {/* Zone 6 — Actions */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          <Link
            href={`/admin/groups/${group.id}`}
            aria-label={`View ${groupLabel}`}
            style={primaryLinkStyle}
          >
            View group
          </Link>
          {isArchived ? (
            <RestoreGroupButton
              groupId={group.id}
              groupName={group.name}
              ariaLabel={`Restore ${groupLabel}`}
            />
          ) : (
            <>
              <Link
                href={`/admin/groups/${group.id}/calendar`}
                aria-label={`Open ${groupLabel} calendar`}
                style={secondaryLinkStyle}
              >
                Calendar
              </Link>
              <PButton
                type="button"
                tone="terra"
                size="sm"
                aria-label={`Edit ${groupLabel}`}
                onClick={() => onEdit(group)}
              >
                Edit
              </PButton>
            </>
          )}
          {isSuperAdmin ? (
            <SuperAdminInlineDelete
              entityType="group"
              id={group.id}
              label={group.name}
            />
          ) : null}
        </div>
      </header>

      <div
        className="lg-m-grid-stack"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 14,
        }}
      >
        {/* Zone 2 — Setup: leader + setup completeness */}
        <Zone label="Setup">
          <PBadge tone={SETUP_TONE[status.setup]}>
            {setupCategoryLabel(status.setup)}
          </PBadge>
          <ZoneText>{leaderText}</ZoneText>
        </Zone>

        {/* Zone 3 — Health: the Group-Health Grade (Q12), not care status */}
        <Zone label="Health">
          <PBadge tone={HEALTH_TONE[status.health]}>
            {healthCategoryLabel(status.health)}
          </PBadge>
        </Zone>

        {/* Zone 4 — Capacity: size vs capacity */}
        <Zone label="Capacity">
          <PBadge tone={CAPACITY_TONE[status.capacity]}>
            {capacityCategoryLabel(status.capacity)}
          </PBadge>
          <ZoneText>
            {excluded
              ? "Excluded from capacity"
              : `${activeMemberCount}${
                  isCapacityUnknown ? " / Unknown" : ` / ${cap ?? "—"}`
                } members`}
          </ZoneText>
        </Zone>

        {/* Zone 5 — Meeting: day/time/location */}
        <Zone label="Meeting">
          <ZoneText>{metaLine(group)}</ZoneText>
          <ZoneText muted>{latestCheckinText(latestSession)}</ZoneText>
        </Zone>
      </div>

      {group.description ? (
        <p
          style={{
            margin: 0,
            fontFamily: fontBody,
            fontSize: 13,
            color: P.ink2,
            lineHeight: 1.5,
          }}
        >
          {group.description}
        </p>
      ) : null}
    </article>
  );
});

function Zone({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "grid", gap: 6, alignContent: "start" }}>
      <div
        style={{
          fontFamily: fontSans,
          fontSize: 10,
          letterSpacing: 1.6,
          textTransform: "uppercase",
          color: P.ink3,
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function ZoneText({
  children,
  muted = false,
}: {
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div
      style={{
        fontFamily: fontBody,
        fontSize: 13,
        color: muted ? P.ink3 : P.ink2,
        lineHeight: 1.4,
      }}
    >
      {children}
    </div>
  );
}

const primaryLinkStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "6px 12px",
  borderRadius: 8,
  background: P.ink,
  border: `1px solid ${P.ink}`,
  color: P.surface,
  fontFamily: fontBody,
  fontSize: 13,
  textDecoration: "none",
  fontWeight: 500,
};

const cellStyle: React.CSSProperties = {
  padding: "12px",
  verticalAlign: "top",
};

const tableLinkStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "5px 10px",
  borderRadius: 8,
  background: P.surface,
  border: `1px solid ${P.line}`,
  color: P.ink,
  fontFamily: fontBody,
  fontSize: 12,
  textDecoration: "none",
  fontWeight: 500,
  whiteSpace: "nowrap",
};

// Off-screen but available to assistive tech — for the table <caption> that
// describes the sortable columns without adding visible chrome.
const visuallyHiddenStyle: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
};

const secondaryLinkStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "6px 12px",
  borderRadius: 8,
  background: P.surface,
  border: `1px solid ${P.line}`,
  color: P.ink,
  fontFamily: fontBody,
  fontSize: 13,
  textDecoration: "none",
  fontWeight: 500,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// The resolved "leader · co-leader" text, or null when the group has no active
// leader. Shared by the card's Setup zone and the table's Leader column so both
// read identically and the table sorts the same text it shows. Null (rather than
// "Unassigned") lets the table sort unassigned groups last and lets the card
// pick its own placeholder.
function leaderTextFor(
  leaders: GroupLeadersRow[],
  profilesById: Map<string, ProfilesRow>
): string | null {
  if (leaders.length === 0) return null;
  return leaders
    .map((l) => {
      const profile = profilesById.get(l.profile_id);
      if (!profile) return "(unknown)";
      return `${profile.full_name} · ${l.role === "co_leader" ? "Co" : "Lead"}`;
    })
    .join(" · ");
}

// Repeated row actions (View / Edit / Calendar / Restore) name their group, but
// group names are not unique in the data model. Append a stable, human-meaningful
// discriminator — meeting area, else meeting day — so two groups that share a
// name stay distinguishable to screen-reader users. Shared by the card and the
// table so both modes carry identical record-context action names (a11y suite).
function groupAccessibleLabel(group: GroupsRow): string {
  const context =
    group.location_area?.trim() || group.meeting_day?.trim() || null;
  return context ? `${group.name} (${context})` : group.name;
}

function metaLine(group: GroupsRow): string {
  const parts: string[] = [];
  if (group.location_area) parts.push(group.location_area);
  const day = group.meeting_day?.trim();
  const time = formatMeetingTime(group.meeting_time);
  if (day && time) parts.push(`${day} · ${time}`);
  else if (day) parts.push(day);
  else if (time) parts.push(time);
  const cadence = cadenceLabel(group);
  if (cadence) parts.push(cadence);
  return parts.length > 0 ? parts.join(" · ") : "No meeting day/time set";
}

function cadenceLabel(group: GroupsRow): string | null {
  if (group.meeting_frequency === "weekly") return null;
  if (group.meeting_frequency === "monthly") return "Monthly";
  // bi-weekly: include parity when known so the line tells the operator
  // which weeks the group actually meets.
  if (group.meeting_week_parity === "odd") return "Bi-weekly · odd weeks";
  if (group.meeting_week_parity === "even") return "Bi-weekly · even weeks";
  return "Bi-weekly";
}

function formatMeetingTime(value: string | null): string | null {
  if (!value) return null;
  const match = /^(\d{2}):(\d{2})/.exec(value);
  if (!match) return value;
  const hour = Number.parseInt(match[1], 10);
  const minute = match[2];
  const suffix = hour >= 12 ? "p" : "a";
  const display = ((hour + 11) % 12) + 1;
  return `${display}:${minute}${suffix}`;
}

function formatWeek(iso: string): string {
  try {
    const d = new Date(`${iso}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return iso;
  }
}

function latestCheckinText(session: AttendanceSessionsRow | null): string {
  if (!session) return "No check-in on record";
  const map: Record<AttendanceSessionStatus, string> = {
    submitted: "Submitted",
    not_submitted: "Missing",
    did_not_meet: "Did not meet",
    planned_pause: "Planned pause",
    admin_entered: "Admin entered",
  };
  const label =
    map[session.status as AttendanceSessionStatus] ?? session.status;
  return `Latest check-in: ${label} · ${formatWeek(session.meeting_week)}`;
}

const listResetStyle = { listStyle: "none", padding: 0, margin: 0 } as const;

// Stable empty array so a leaderless group passes the same reference to the
// memoized GroupCard across renders (a fresh `[]` would defeat React.memo).
const NO_LEADERS: GroupLeadersRow[] = [];

// Stable "no concern" signals for groups with no health-overview row or side-
// read entry (e.g. a group not yet graded). Frozen so it's a shared reference.
const NO_SIGNALS: GroupTriageSignals = Object.freeze({
  missingRequiredRatings: false,
  hasOpenFollowUp: false,
  hasCareConcern: false,
});
