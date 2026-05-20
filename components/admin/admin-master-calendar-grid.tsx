"use client";

import { PBadge, type PTone } from "@/components/pastoral/atoms";
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
import { P, fontBody, fontSans } from "@/lib/pastoral";
import type { MasterOccurrence } from "@/lib/admin/master-calendar";

export type DayClickPayload = { date: string };

const MAX_PILLS_PER_CELL = 3;

function statusTone(status: MasterOccurrence["status"]): PTone {
  if (status === "off") return "pause";
  if (status === "cancelled") return "followup";
  return "healthy";
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
    <div
      style={{
        background: P.surface,
        border: `1px solid ${P.line}`,
        borderRadius: 14,
        padding: 16,
        display: "grid",
        gap: 10,
      }}
    >
      <div
        className="lg-m-cal-weekdays"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
          gap: 6,
          fontFamily: fontSans,
          fontSize: 10,
          letterSpacing: 1.5,
          textTransform: "uppercase",
          color: P.ink3,
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
    </div>
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
  const baseBg = cell.inMonth ? P.bg : P.surface;
  const dayColor = cell.inMonth ? P.ink2 : P.ink3;
  const opacity = cell.inMonth ? 1 : 0.55;
  const visible = occurrences.slice(0, MAX_PILLS_PER_CELL);
  const overflow = occurrences.length - visible.length;

  return (
    <div
      className="lg-m-cal-cell"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        minHeight: 96,
        padding: "8px 8px 10px",
        opacity,
        background: baseBg,
        border: `1px solid ${P.line}`,
        borderRadius: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          fontFamily: fontSans,
          fontSize: 11,
          fontWeight: 600,
          color: cell.isToday ? P.terra : dayColor,
        }}
      >
        {dayNumberLabel(cell.date)}
        {cell.isToday ? (
          <span
            style={{
              fontSize: 9,
              letterSpacing: 1,
              textTransform: "uppercase",
              color: P.terra,
              fontWeight: 700,
            }}
          >
            Today
          </span>
        ) : null}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {visible.map((o) => (
          <OccurrencePill key={`${o.groupId}|${o.date}`} occurrence={o} onClick={() => onSelect(o)} />
        ))}
        {overflow > 0 ? (
          <button
            type="button"
            onClick={() => onMoreFromDay({ date: cell.date })}
            style={{
              fontFamily: fontSans,
              fontSize: 11,
              color: P.terra,
              background: "transparent",
              border: "none",
              padding: "2px 0",
              textAlign: "left",
              cursor: "pointer",
              fontWeight: 600,
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
  const tone = statusTone(occurrence.status);
  const showStatusBadge = occurrence.status !== "scheduled";

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
        background: P.surface,
        border: `1px solid ${P.line}`,
        borderLeft: `3px solid ${
          occurrence.status === "off"
            ? "#8a8166"
            : occurrence.status === "cancelled"
              ? P.terra
              : P.sage
        }`,
        borderRadius: 6,
        padding: "4px 6px",
        cursor: "pointer",
        fontFamily: fontBody,
      }}
    >
      <span
        style={{
          fontSize: 11.5,
          color: P.ink,
          fontWeight: 600,
          lineHeight: 1.2,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
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
          fontFamily: fontSans,
          fontSize: 10,
          color: P.ink3,
          letterSpacing: 0.2,
        }}
      >
        {showStatusBadge ? (
          <PBadge tone={tone}>{friendlyEventStatusLabel(occurrence.status)}</PBadge>
        ) : (
          <span>{typeLabel}</span>
        )}
        {clock ? <span>· {clock}</span> : null}
      </span>
    </button>
  );
}
