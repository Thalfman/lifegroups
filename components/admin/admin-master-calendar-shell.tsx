"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PButton } from "@/components/pastoral/button";
import {
  AdminMasterCalendarGrid,
  type DayClickPayload,
} from "./admin-master-calendar-grid";
import { AdminMasterCalendarList } from "./admin-master-calendar-list";
import { AdminMasterCalendarDrawer } from "./admin-master-calendar-drawer";
import { AdminCalendarLegend } from "./admin-calendar-legend";
import {
  WEEKDAY_HEADERS,
  monthBounds,
} from "@/lib/calendar/occurrences";
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
}: {
  monthIso: string;
  todayIso: string;
  occurrences: MasterOccurrence[];
  groups: MasterCalendarGroupSummary[];
  leaderOptions: MasterCalendarLeader[];
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const userToggledRef = useRef(false);

  // Hydration-safe mobile default: stay on "month" through SSR and the
  // first client render, then flip to "list" only if the viewport
  // matches AND the user hasn't manually picked a view yet.
  useEffect(() => {
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
  }, []);

  const setViewModeManual = (next: ViewMode) => {
    userToggledRef.current = true;
    setViewMode(next);
  };

  // Filter state.
  const [groupFilter, setGroupFilter] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState<GroupCalendarEventType[]>([]);
  const [statusFilter, setStatusFilter] = useState<GroupCalendarEventStatus[]>(
    [],
  );
  const [dayFilter, setDayFilter] = useState<number[]>([]); // 0=Sun..6=Sat
  // Leader filter keyed on profile_id so two profiles with the same
  // display name don't collapse into one option (and so picking one
  // doesn't over-match the other).
  const [leaderFilter, setLeaderFilter] = useState<string>("");

  // Selected occurrence for the drawer. We use a composite key
  // (groupId|date) since the master view has multiple occurrences per
  // date but at most one per group/date.
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [listAnchorDate, setListAnchorDate] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return occurrences.filter((o) => {
      if (groupFilter.length > 0 && !groupFilter.includes(o.groupId)) return false;
      if (typeFilter.length > 0 && !typeFilter.includes(o.eventType)) return false;
      if (statusFilter.length > 0 && !statusFilter.includes(o.status)) return false;
      if (dayFilter.length > 0 && !dayFilter.includes(o.weekdayIndex)) return false;
      if (leaderFilter && !o.leaders.some((l) => l.profileId === leaderFilter))
        return false;
      return true;
    });
  }, [occurrences, groupFilter, typeFilter, statusFilter, dayFilter, leaderFilter]);

  const selected = useMemo(() => {
    if (!selectedKey) return null;
    return filtered.find((o) => `${o.groupId}|${o.date}` === selectedKey) ?? null;
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
        <EmptyState />
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

function EmptyState() {
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
      <div style={{ fontWeight: 600, color: P.ink }}>
        No group meetings match these filters.
      </div>
      <div style={{ fontSize: 13, color: P.ink3 }}>
        Try clearing a filter or pick a different month.
      </div>
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
    [groups],
  );
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
