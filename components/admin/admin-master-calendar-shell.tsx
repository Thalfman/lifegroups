"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PButton } from "@/components/pastoral/button";
import { usePersistedViewState } from "@/lib/hooks/use-persisted-view-state";
import {
  AdminMasterCalendarGrid,
  type DayClickPayload,
} from "./admin-master-calendar-grid";
import { AdminMasterCalendarList } from "./admin-master-calendar-list";
import { AdminMasterCalendarDrawer } from "./admin-master-calendar-drawer";
import { AdminCalendarLegend } from "./admin-calendar-legend";
import { WEEKDAY_HEADERS, monthBounds } from "@/lib/calendar/occurrences";
import {
  EVENT_STATUS_OPTIONS,
  EVENT_TYPE_OPTIONS,
  friendlyEventTypeLabel,
} from "@/lib/calendar/payload";
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

type ViewMode = "month" | "list";

type CalendarViewSnapshot = {
  viewMode: ViewMode;
  groupFilter: string[];
  typeFilter: GroupCalendarEventType[];
  statusFilter: GroupCalendarEventStatus[];
  dayFilter: number[];
  leaderFilter: string;
};

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");

// Validate a restored calendar view against its current shape. We check
// structure (and the closed `viewMode` set), not membership: a stale group or
// leader id simply matches nothing and the existing empty state offers a reset,
// which is friendlier than silently dropping the whole saved view (#263).
function isCalendarViewSnapshot(value: unknown): value is CalendarViewSnapshot {
  if (value === null || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    (v.viewMode === "month" || v.viewMode === "list") &&
    isStringArray(v.groupFilter) &&
    isStringArray(v.typeFilter) &&
    isStringArray(v.statusFilter) &&
    Array.isArray(v.dayFilter) &&
    v.dayFilter.every((d) => typeof d === "number") &&
    typeof v.leaderFilter === "string"
  );
}

const ALL_TYPE_OPTIONS: { value: GroupCalendarEventType; label: string }[] = [
  ...EVENT_TYPE_OPTIONS,
  { value: "off", label: friendlyEventTypeLabel("off") },
  { value: "cancelled", label: friendlyEventTypeLabel("cancelled") },
];

export function AdminMasterCalendarShell({
  monthIso,
  todayIso,
  occurrences,
  groups,
  leaderOptions,
  viewerId,
}: {
  monthIso: string;
  todayIso: string;
  occurrences: MasterOccurrence[];
  groups: MasterCalendarGroupSummary[];
  leaderOptions: MasterCalendarLeader[];
  // Signed-in profile id, used only to scope this admin's saved view/filters
  // (#263). Omitted/undefined falls back to a shared persistence bucket.
  viewerId?: string | null;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("month");
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

  // Saved views & filters (PRD req 12, #263): remember this admin's view mode
  // and every filter selection across reloads and return visits. Declared
  // before the mobile-default effect below so its restore pass runs first — a
  // restored selection marks the view as user-chosen (userToggledRef), which
  // keeps the responsive auto-default from clobbering it.
  const persistHydrated = usePersistedViewState({
    surface: "calendar",
    scopeId: viewerId,
    snapshot: {
      viewMode,
      groupFilter,
      typeFilter,
      statusFilter,
      dayFilter,
      leaderFilter,
    },
    restore: (saved) => {
      userToggledRef.current = true;
      setViewMode(saved.viewMode);
      setGroupFilter(saved.groupFilter);
      setTypeFilter(saved.typeFilter);
      setStatusFilter(saved.statusFilter);
      setDayFilter(saved.dayFilter);
      setLeaderFilter(saved.leaderFilter);
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
    if (mq.matches) setViewMode("list");
    const onChange = (e: MediaQueryListEvent) => {
      if (userToggledRef.current) return;
      setViewMode(e.matches ? "list" : "month");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [persistHydrated]);

  // Selected occurrence for the drawer. We use a composite key
  // (groupId|date) since the master view has multiple occurrences per
  // date but at most one per group/date.
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [listAnchorDate, setListAnchorDate] = useState<string | null>(null);

  const filtered = useMemo(() => {
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
  }, [
    occurrences,
    groupFilter,
    typeFilter,
    statusFilter,
    dayFilter,
    leaderFilter,
  ]);

  const selected = useMemo(() => {
    if (!selectedKey) return null;
    return (
      filtered.find((o) => `${o.groupId}|${o.date}` === selectedKey) ?? null
    );
  }, [filtered, selectedKey]);

  const hasActiveFilters =
    groupFilter.length +
      typeFilter.length +
      statusFilter.length +
      dayFilter.length +
      (leaderFilter ? 1 : 0) >
    0;

  const resetFilters = () => {
    setGroupFilter([]);
    setTypeFilter([]);
    setStatusFilter([]);
    setDayFilter([]);
    setLeaderFilter("");
  };

  const onSelect = (o: MasterOccurrence) => {
    setSelectedKey(`${o.groupId}|${o.date}`);
  };

  const onMoreFromDay = (payload: DayClickPayload) => {
    setListAnchorDate(payload.date);
    setViewModeManual("list");
  };

  const bounds = monthBounds(monthIso);

  return (
    <div style={{ display: "grid", gap: 16 }}>
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
        totalCount={occurrences.length}
      />

      {filtered.length === 0 ? (
        <EmptyState hasActiveFilters={hasActiveFilters} />
      ) : viewMode === "month" ? (
        <>
          <AdminCalendarLegend />
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
          fromIso={bounds?.firstIso ?? null}
          toIso={bounds?.lastIso ?? null}
          anchorDate={listAnchorDate}
          onAnchorConsumed={() => setListAnchorDate(null)}
          onSelect={onSelect}
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
}) {
  const groupOptions = useMemo(
    () => groups.map((g) => ({ value: g.groupId, label: g.groupName })),
    [groups]
  );

  // Flatten every active selection into removable chips. Order mirrors the
  // field grid (group → type → status → day → leader) so the chip row reads
  // as a compact summary of the controls below it.
  const activeChips = useMemo<ActiveChip[]>(() => {
    const chips: ActiveChip[] = [];
    const groupLabels = new Map(groupOptions.map((o) => [o.value, o.label]));
    const typeLabels = new Map(ALL_TYPE_OPTIONS.map((o) => [o.value, o.label]));
    const statusLabels = new Map(
      EVENT_STATUS_OPTIONS.map((o) => [o.value, o.label])
    );

    for (const id of groupFilter) {
      chips.push({
        key: `group:${id}`,
        category: "Group",
        label: groupLabels.get(id) ?? "Group",
        onRemove: () => setGroupFilter(groupFilter.filter((v) => v !== id)),
      });
    }
    for (const t of typeFilter) {
      chips.push({
        key: `type:${t}`,
        category: "Type",
        label: typeLabels.get(t) ?? friendlyEventTypeLabel(t),
        onRemove: () => setTypeFilter(typeFilter.filter((v) => v !== t)),
      });
    }
    for (const s of statusFilter) {
      chips.push({
        key: `status:${s}`,
        category: "Status",
        label: statusLabels.get(s) ?? s,
        onRemove: () => setStatusFilter(statusFilter.filter((v) => v !== s)),
      });
    }
    for (const d of dayFilter) {
      chips.push({
        key: `day:${d}`,
        category: "Day",
        label: WEEKDAY_HEADERS[d] ?? `Day ${d}`,
        onRemove: () => setDayFilter(dayFilter.filter((v) => v !== d)),
      });
    }
    if (leaderFilter) {
      const name =
        leaderOptions.find((l) => l.profileId === leaderFilter)?.name ??
        "Leader";
      chips.push({
        key: `leader:${leaderFilter}`,
        category: "Leader",
        label: name,
        onRemove: () => setLeaderFilter(""),
      });
    }
    return chips;
  }, [
    groupOptions,
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
    leaderOptions,
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
        borderLeft: `3px solid ${P.terra}`,
        borderRadius: 14,
        padding: "12px 14px 12px 17px",
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
          <ViewToggle viewMode={viewMode} onChange={onChangeView} />
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
          options={ALL_TYPE_OPTIONS}
          value={typeFilter}
          onChange={(next) => setTypeFilter(next)}
        />
        <MultiCheckboxField<GroupCalendarEventStatus>
          label="Status"
          options={EVENT_STATUS_OPTIONS}
          value={statusFilter}
          onChange={(next) => setStatusFilter(next)}
        />
        <MultiCheckboxField<number>
          label="Meeting day"
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
            Group
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
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: V; label: string }[];
  value: V[];
  onChange: (next: V[]) => void;
}) {
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
