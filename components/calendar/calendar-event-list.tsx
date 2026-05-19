import type { ReactNode } from "react";
import { P, fontBody, fontDisplay, fontSans } from "@/lib/pastoral";
import { PBadge, type PTone } from "@/components/pastoral/atoms";
import {
  eventDisplayLabel,
  friendlyEventStatusLabel,
  friendlyEventTypeLabel,
} from "@/lib/calendar/payload";
import type { GroupCalendarEventsRow } from "@/types/database";

function statusTone(status: GroupCalendarEventsRow["status"]): PTone {
  if (status === "off") return "pause";
  if (status === "cancelled") return "followup";
  return "healthy";
}

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatTimeRange(start: string | null, end: string | null): string | null {
  const fmt = (t: string | null) => {
    if (!t) return null;
    const [h, m] = t.split(":");
    const hour = Number.parseInt(h ?? "0", 10);
    const minute = Number.parseInt(m ?? "0", 10);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    const suffix = hour >= 12 ? "PM" : "AM";
    const display = ((hour + 11) % 12) + 1;
    const minuteStr = minute === 0 ? "" : `:${String(minute).padStart(2, "0")}`;
    return `${display}${minuteStr} ${suffix}`;
  };
  const a = fmt(start);
  const b = fmt(end);
  if (a && b) return `${a} – ${b}`;
  if (a) return a;
  return null;
}

export function CalendarEventList({
  events,
  emptyMessage,
  renderActions,
  archivedSeparate = true,
}: {
  events: GroupCalendarEventsRow[];
  emptyMessage?: string;
  renderActions?: (event: GroupCalendarEventsRow) => ReactNode;
  archivedSeparate?: boolean;
}) {
  if (events.length === 0) {
    return (
      <div
        style={{
          background: P.surface,
          border: `1px dashed ${P.line}`,
          borderRadius: 12,
          padding: "18px 20px",
          fontFamily: fontBody,
          fontSize: 14,
          color: P.ink2,
        }}
      >
        {emptyMessage ?? "No calendar events yet."}
      </div>
    );
  }

  const active = events.filter((e) => e.archived_at == null);
  const archived = events.filter((e) => e.archived_at != null);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {active.length > 0 ? (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
          {active.map((event) => (
            <CalendarEventRow key={event.id} event={event} renderActions={renderActions} />
          ))}
        </ul>
      ) : (
        <div
          style={{
            background: P.surface,
            border: `1px dashed ${P.line}`,
            borderRadius: 12,
            padding: "14px 18px",
            fontFamily: fontBody,
            fontSize: 14,
            color: P.ink2,
          }}
        >
          {emptyMessage ?? "No upcoming events yet."}
        </div>
      )}

      {archivedSeparate && archived.length > 0 ? (
        <details
          style={{
            border: `1px solid ${P.line}`,
            borderRadius: 12,
            background: P.surface,
            padding: "10px 16px",
            fontFamily: fontBody,
          }}
        >
          <summary
            style={{
              fontFamily: fontSans,
              fontSize: 11,
              letterSpacing: 1.5,
              textTransform: "uppercase",
              color: P.ink3,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Archived ({archived.length})
          </summary>
          <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 4px", display: "grid", gap: 10 }}>
            {archived.map((event) => (
              <CalendarEventRow key={event.id} event={event} renderActions={renderActions} archived />
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function CalendarEventRow({
  event,
  renderActions,
  archived = false,
}: {
  event: GroupCalendarEventsRow;
  renderActions?: (event: GroupCalendarEventsRow) => ReactNode;
  archived?: boolean;
}) {
  const dateLabel = formatDate(event.event_date);
  const timeLabel = formatTimeRange(event.start_time, event.end_time);
  const displayLabel = eventDisplayLabel(event);
  const typeLabel = friendlyEventTypeLabel(event.event_type);
  const statusLabel = friendlyEventStatusLabel(event.status);
  const showTypeAside = displayLabel !== typeLabel && event.status === "scheduled";

  return (
    <li
      style={{
        background: archived ? P.bgDeep : P.surface,
        border: `1px solid ${P.line}`,
        borderRadius: 12,
        padding: "14px 16px",
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto",
        alignItems: "start",
        gap: 12,
        opacity: archived ? 0.7 : 1,
      }}
    >
      <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
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
          {dateLabel}
          {timeLabel ? ` · ${timeLabel}` : ""}
        </div>
        <div
          style={{
            fontFamily: fontDisplay,
            fontSize: 18,
            color: P.ink,
            fontWeight: 500,
            lineHeight: 1.25,
          }}
        >
          {displayLabel}
        </div>
        {showTypeAside ? (
          <div style={{ fontFamily: fontBody, fontSize: 12, color: P.ink2, fontStyle: "italic" }}>
            {typeLabel}
          </div>
        ) : null}
        {event.description ? (
          <p style={{ fontFamily: fontBody, fontSize: 13, color: P.ink2, margin: "4px 0 0", lineHeight: 1.5 }}>
            {event.description}
          </p>
        ) : null}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
        <PBadge tone={statusTone(event.status)}>{statusLabel}</PBadge>
        {renderActions ? renderActions(event) : null}
      </div>
    </li>
  );
}
