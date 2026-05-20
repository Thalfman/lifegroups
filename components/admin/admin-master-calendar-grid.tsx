"use client";

import { Card, Pill, type PillTone } from "@/components/pastoral/primitives";
import {
  WEEKDAY_HEADERS,
  dayNumberLabel,
  formatClock,
  gridCellsForMonth,
  type GridCell,
} from "@/lib/calendar/occurrences";
import {
  friendlyEventStatusLabel,
  friendlyEventTypeLabel,
} from "@/lib/calendar/payload";
import type { MasterOccurrence } from "@/lib/admin/master-calendar";

export type DayClickPayload = { date: string };

const MAX_PILLS_PER_CELL = 3;

// Different statuses get visually distinct left stripes on the pills so
// OFF and Cancelled are never confused with each other or with normal
// scheduled meetings.
function stripeColor(status: MasterOccurrence["status"]): string {
  if (status === "off") return "var(--c-ink4)";
  if (status === "cancelled") return "var(--c-clay)";
  return "var(--c-sage)";
}

function statusPillTone(status: MasterOccurrence["status"]): PillTone {
  if (status === "off") return "neutral";
  if (status === "cancelled") return "clay";
  return "sage";
}

export function AdminMasterCalendarGrid({
  monthIso,
  todayIso,
  occurrences,
  onSelect,
  onMoreFromDay,
}: {
  monthIso: string;
  todayIso: string;
  occurrences: MasterOccurrence[];
  onSelect: (o: MasterOccurrence) => void;
  onMoreFromDay: (payload: DayClickPayload) => void;
}) {
  const cells = gridCellsForMonth(monthIso, todayIso);
  const occurrencesByDate = new Map<string, MasterOccurrence[]>();
  for (const o of occurrences) {
    const bucket = occurrencesByDate.get(o.date) ?? [];
    bucket.push(o);
    occurrencesByDate.set(o.date, bucket);
  }

  return (
    <Card padded={false} style={{ padding: 16, display: "grid", gap: 10 }}>
      <div
        className="lg-m-cal-weekdays"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
          gap: 6,
          fontFamily: "var(--font-body)",
          fontSize: 10,
          letterSpacing: 1.6,
          textTransform: "uppercase",
          color: "var(--c-ink3)",
          fontWeight: 600,
        }}
      >
        {WEEKDAY_HEADERS.map((label) => (
          <div key={label} style={{ padding: "2px 6px" }}>
            {label}
          </div>
        ))}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
          gap: 6,
        }}
      >
        {cells.map((cell) => (
          <GridCellView
            key={cell.date}
            cell={cell}
            occurrences={occurrencesByDate.get(cell.date) ?? []}
            onSelect={onSelect}
            onMoreFromDay={onMoreFromDay}
          />
        ))}
      </div>
    </Card>
  );
}

function GridCellView({
  cell,
  occurrences,
  onSelect,
  onMoreFromDay,
}: {
  cell: GridCell;
  occurrences: MasterOccurrence[];
  onSelect: (o: MasterOccurrence) => void;
  onMoreFromDay: (payload: DayClickPayload) => void;
}) {
  const baseBg = cell.inMonth ? "var(--c-surface)" : "var(--c-surfaceAlt)";
  const dayColor = cell.inMonth ? "var(--c-ink2)" : "var(--c-ink4)";
  const opacity = cell.inMonth ? 1 : 0.85;
  const visible = occurrences.slice(0, MAX_PILLS_PER_CELL);
  const overflow = occurrences.length - visible.length;

  return (
    <div
      className="lg-m-cal-cell"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        minHeight: 100,
        padding: "8px 8px 10px",
        opacity,
        background: baseBg,
        border: "1px solid var(--c-lineSoft)",
        borderRadius: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontFamily: "var(--font-body)",
          fontSize: 11,
          fontWeight: 600,
          color: cell.isToday ? "var(--c-clay)" : dayColor,
        }}
      >
        {dayNumberLabel(cell.date)}
        {cell.isToday ? (
          <span
            style={{
              fontSize: 9,
              letterSpacing: 1,
              textTransform: "uppercase",
              color: "var(--c-clay)",
              fontWeight: 700,
            }}
          >
            Today
          </span>
        ) : null}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {visible.map((o) => (
          <OccurrencePill
            key={`${o.groupId}|${o.date}`}
            occurrence={o}
            onClick={() => onSelect(o)}
          />
        ))}
        {overflow > 0 ? (
          <button
            type="button"
            onClick={() => onMoreFromDay({ date: cell.date })}
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 11,
              color: "var(--c-clay)",
              background: "transparent",
              border: "none",
              padding: "2px 0",
              textAlign: "left",
              cursor: "pointer",
              fontWeight: 600,
              letterSpacing: 0.1,
            }}
          >
            +{overflow} more
          </button>
        ) : null}
      </div>
    </div>
  );
}

function OccurrencePill({
  occurrence,
  onClick,
}: {
  occurrence: MasterOccurrence;
  onClick: () => void;
}) {
  const clock = formatClock(occurrence.inheritedMeetingTime);
  const typeLabel = friendlyEventTypeLabel(occurrence.eventType);
  const showStatusBadge = occurrence.status !== "scheduled";
  const isCancelled = occurrence.status === "cancelled";
  const isOff = occurrence.status === "off";
  // Cancelled titles get a strikethrough so the OFF/Cancelled distinction
  // is readable even at the smallest pill size.
  const titleDecoration = isCancelled ? "line-through" : "none";
  const titleColor = isCancelled || isOff ? "var(--c-ink3)" : "var(--c-ink)";

  return (
    <button
      type="button"
      onClick={onClick}
      title={`${occurrence.groupName} · ${typeLabel}${clock ? ` · ${clock}` : ""}`}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        textAlign: "left",
        background: "var(--c-surfaceAlt)",
        border: "1px solid var(--c-lineSoft)",
        borderLeft: `3px solid ${stripeColor(occurrence.status)}`,
        borderRadius: 6,
        padding: "4px 6px",
        cursor: "pointer",
        fontFamily: "var(--font-body)",
      }}
    >
      <span
        className="lg-m-cal-pill"
        style={{
          fontSize: 11.5,
          color: titleColor,
          fontWeight: 600,
          lineHeight: 1.2,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          textDecoration: titleDecoration,
        }}
      >
        {occurrence.groupName}
      </span>
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          flexWrap: "wrap",
          fontFamily: "var(--font-body)",
          fontSize: 10,
          color: "var(--c-ink3)",
          letterSpacing: 0.2,
        }}
      >
        {showStatusBadge ? (
          <Pill tone={statusPillTone(occurrence.status)}>
            {friendlyEventStatusLabel(occurrence.status)}
          </Pill>
        ) : (
          <span>{typeLabel}</span>
        )}
        {clock ? <span>· {clock}</span> : null}
      </span>
    </button>
  );
}
