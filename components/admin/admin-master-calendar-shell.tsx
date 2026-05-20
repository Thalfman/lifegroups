"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PButton } from "@/components/pastoral/button";
import { Card, SegmentedControl } from "@/components/pastoral/primitives";
import {
  AdminMasterCalendarGrid,
  type DayClickPayload,
} from "./admin-master-calendar-grid";
import { AdminMasterCalendarList } from "./admin-master-calendar-list";
import { AdminMasterCalendarDrawer } from "./admin-master-calendar-drawer";
import {
  WEEKDAY_HEADERS,
  monthBounds,
} from "@/lib/calendar/occurrences";
import {
  EVENT_STATUS_OPTIONS,
  EVENT_TYPE_OPTIONS,
  friendlyEventTypeLabel,
} from "@/lib/calendar/payload";
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

// Single-letter weekday labels keep the day filter compact on mobile.
const WEEKDAY_SHORT = ["S", "M", "T", "W", "T", "F", "S"] as const;

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

  const [groupFilter, setGroupFilter] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState<GroupCalendarEventType[]>([]);
  const [statusFilter, setStatusFilter] = useState<GroupCalendarEventStatus[]>(
    [],
  );
  const [dayFilter, setDayFilter] = useState<number[]>([]); // 0=Sun..6=Sat
  // Leader filter keyed on profile_id so two profiles with the same
  // display name don't collapse into one option.
  const [leaderFilter, setLeaderFilter] = useState<string>("");

  // Composite key (groupId|date): the master view has multiple occurrences
  // per date but at most one per group/date.
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
      />

      {filtered.length === 0 ? (
        <EmptyState />
      ) : viewMode === "month" ? (
        <AdminMasterCalendarGrid
          monthIso={monthIso}
          todayIso={todayIso}
          occurrences={filtered}
          onSelect={onSelect}
          onMoreFromDay={onMoreFromDay}
        />
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

function EmptyState() {
  return (
    <Card style={{ padding: "36px 18px", textAlign: "center" }}>
      <div
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 11,
          letterSpacing: 1.8,
          textTransform: "uppercase",
          color: "var(--c-ink3)",
          fontWeight: 600,
          marginBottom: 6,
        }}
      >
        No matches
      </div>
      <div
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 14,
          color: "var(--c-ink2)",
        }}
      >
        No group meetings match these filters. Try clearing one or more.
      </div>
    </Card>
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
}) {
  const groupOptions = useMemo(
    () => groups.map((g) => ({ value: g.groupId, label: g.groupName })),
    [groups],
  );

  // Mutual-exclusion state: at most one dropdown popover is open at a
  // time. Stored in the parent so opening one closes any other. Refs
  // power the click-outside / Escape handlers below.
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const filterRowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (openDropdown === null) return;
    const onMouseDown = (event: MouseEvent) => {
      const root = filterRowRef.current;
      if (!root) return;
      if (event.target instanceof Node && root.contains(event.target)) return;
      setOpenDropdown(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenDropdown(null);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openDropdown]);

  return (
    <Card padded={false} style={{ padding: "12px 14px" }}>
      <div
        style={{
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
              fontFamily: "var(--font-body)",
              fontSize: 11,
              letterSpacing: 1.8,
              textTransform: "uppercase",
              color: "var(--c-ink3)",
              fontWeight: 600,
            }}
          >
            Filters
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
            <SegmentedControl
              ariaLabel="Calendar view"
              size="sm"
              value={viewMode}
              onChange={onChangeView}
              options={[
                { value: "month", label: "Month" },
                { value: "list", label: "List" },
              ]}
            />
          </div>
        </div>
        <div
          ref={filterRowRef}
          className="lg-m-master-calendar-filters"
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 8,
          }}
        >
          <FilterDropdown
            id="group"
            label="Group"
            options={groupOptions}
            value={groupFilter}
            onChange={setGroupFilter}
            isOpen={openDropdown === "group"}
            onOpenChange={(open) => setOpenDropdown(open ? "group" : null)}
            scrollable
          />
          <FilterDropdown<GroupCalendarEventType>
            id="type"
            label="Type"
            options={ALL_TYPE_OPTIONS}
            value={typeFilter}
            onChange={setTypeFilter}
            isOpen={openDropdown === "type"}
            onOpenChange={(open) => setOpenDropdown(open ? "type" : null)}
          />
          <FilterDropdown<GroupCalendarEventStatus>
            id="status"
            label="Status"
            options={EVENT_STATUS_OPTIONS}
            value={statusFilter}
            onChange={setStatusFilter}
            isOpen={openDropdown === "status"}
            onOpenChange={(open) => setOpenDropdown(open ? "status" : null)}
          />
          <DayChips value={dayFilter} onChange={setDayFilter} />
          <LeaderSelect
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
      </div>
    </Card>
  );
}

// Controlled chip-shaped dropdown. Single source of truth for which
// dropdown is open lives in the parent FilterBar, so opening one closes
// any other and click-outside / Escape close the active one.
function FilterDropdown<V extends string | number>({
  id,
  label,
  options,
  value,
  onChange,
  isOpen,
  onOpenChange,
  scrollable = false,
}: {
  id: string;
  label: string;
  options: { value: V; label: string }[];
  value: V[];
  onChange: (next: V[]) => void;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  scrollable?: boolean;
}) {
  const selectedSet = useMemo(() => new Set(value), [value]);
  const count = value.length;
  const summaryText = count === 0 ? "All" : `${count}`;
  const isActive = count > 0;
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  // Right-align the popover when the trigger sits in the right half of
  // the viewport — keeps the 220–320px popover inside the viewport on
  // narrow widths without measuring the popover itself.
  const [alignRight, setAlignRight] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const triggerCenter = rect.left + rect.width / 2;
    setAlignRight(triggerCenter > window.innerWidth / 2);
  }, [isOpen]);

  return (
    <div style={{ position: "relative", margin: 0 }}>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        onClick={() => onOpenChange(!isOpen)}
        className="lg-m-cal-filter-trigger"
        style={{
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderRadius: 999,
          background: isActive ? "var(--c-sageSoft)" : "var(--c-surfaceAlt)",
          border: `1px solid ${isActive ? "var(--c-sage)" : "var(--c-line)"}`,
          color: isActive ? "var(--c-sageDeep)" : "var(--c-ink2)",
          fontFamily: "var(--font-body)",
          fontSize: 12.5,
          fontWeight: 500,
          minHeight: 36,
          whiteSpace: "nowrap",
        }}
      >
        <span>{label}</span>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: 22,
            padding: "1px 7px",
            borderRadius: 999,
            background: isActive ? "var(--c-surface)" : "transparent",
            border: isActive ? "none" : "1px solid var(--c-line)",
            color: isActive ? "var(--c-sageDeep)" : "var(--c-ink3)",
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {summaryText}
        </span>
        <span
          aria-hidden="true"
          style={{ fontSize: 10, lineHeight: 1, opacity: 0.7 }}
        >
          ▾
        </span>
      </button>
      {isOpen ? (
        <div
          role="listbox"
          aria-label={label}
          id={`filter-popover-${id}`}
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            // Anchor to the trigger edge nearest the viewport center so
            // the popover never overflows the right edge on narrow
            // screens.
            ...(alignRight ? { right: 0 } : { left: 0 }),
            minWidth: 220,
            maxWidth: "min(320px, calc(100vw - 24px))",
            background: "var(--c-surface)",
            border: "1px solid var(--c-line)",
            borderRadius: 12,
            boxShadow: "var(--c-shadowLg)",
            padding: 10,
            zIndex: 5,
            display: "grid",
            gap: 6,
            maxHeight: scrollable ? 280 : undefined,
            overflowY: scrollable ? "auto" : undefined,
          }}
        >
          {options.map((opt) => {
            const checked = selectedSet.has(opt.value);
            return (
              <label
                key={String(opt.value)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  borderRadius: 8,
                  cursor: "pointer",
                  background: checked ? "var(--c-sageSoft)" : "transparent",
                  color: checked ? "var(--c-sageDeep)" : "var(--c-ink2)",
                  fontFamily: "var(--font-body)",
                  fontSize: 13,
                  userSelect: "none",
                  minHeight: 36,
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    if (e.target.checked) onChange([...value, opt.value]);
                    else onChange(value.filter((v) => v !== opt.value));
                  }}
                  style={{ accentColor: "var(--c-sage)", margin: 0 }}
                />
                <span>{opt.label}</span>
              </label>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

// Compact 7-letter weekday chip row. Toggling a chip filters by that
// weekday index (0=Sun..6=Sat). Visual chip is 32×32 on desktop with
// generous padding around the row so the row total is ≥ 44px tall; on
// mobile the chips and row both bump up via a globals.css rule.
function DayChips({
  value,
  onChange,
}: {
  value: number[];
  onChange: (next: number[]) => void;
}) {
  const selected = useMemo(() => new Set(value), [value]);
  return (
    <div
      role="group"
      aria-label="Meeting day"
      className="lg-m-cal-day-row"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "4px 8px 4px 12px",
        borderRadius: 999,
        background: "var(--c-surfaceAlt)",
        border: "1px solid var(--c-line)",
        minHeight: 44,
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 11,
          letterSpacing: 1.4,
          textTransform: "uppercase",
          color: "var(--c-ink3)",
          fontWeight: 600,
        }}
      >
        Day
      </span>
      {WEEKDAY_SHORT.map((letter, idx) => {
        const checked = selected.has(idx);
        const fullLabel = WEEKDAY_HEADERS[idx];
        return (
          <button
            key={idx}
            type="button"
            aria-pressed={checked}
            aria-label={fullLabel}
            title={fullLabel}
            onClick={() => {
              if (checked) onChange(value.filter((v) => v !== idx));
              else onChange([...value, idx]);
            }}
            className="lg-m-cal-day-chip"
            style={{
              width: 32,
              height: 32,
              borderRadius: 999,
              border: checked
                ? "1px solid var(--c-sage)"
                : "1px solid transparent",
              background: checked ? "var(--c-sageSoft)" : "transparent",
              color: checked ? "var(--c-sageDeep)" : "var(--c-ink3)",
              fontFamily: "var(--font-body)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              padding: 0,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {letter}
          </button>
        );
      })}
    </div>
  );
}

function LeaderSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (next: string) => void;
  options: { value: string; label: string }[];
}) {
  const isActive = value !== "";
  return (
    <label
      className="lg-m-cal-filter-trigger"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "0 4px 0 12px",
        borderRadius: 999,
        background: isActive ? "var(--c-sageSoft)" : "var(--c-surfaceAlt)",
        border: `1px solid ${isActive ? "var(--c-sage)" : "var(--c-line)"}`,
        minHeight: 36,
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 11,
          letterSpacing: 1.4,
          textTransform: "uppercase",
          color: isActive ? "var(--c-sageDeep)" : "var(--c-ink3)",
          fontWeight: 600,
          whiteSpace: "nowrap",
        }}
      >
        Leader
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          appearance: "none",
          background: "transparent",
          border: "none",
          color: isActive ? "var(--c-sageDeep)" : "var(--c-ink2)",
          fontFamily: "var(--font-body)",
          fontSize: 12.5,
          fontWeight: 500,
          padding: "8px 24px 8px 4px",
          maxWidth: 180,
          cursor: "pointer",
          outline: "none",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          overflow: "hidden",
          // Inline caret via SVG so we can keep the chip-height styling
          // without a giant native browser arrow eating vertical space.
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'><path d='M2 4l4 4 4-4' fill='none' stroke='%239c8a6d' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/></svg>\")",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 8px center",
          backgroundSize: "12px 12px",
        }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
