import type { ReactNode } from "react";
import { P, fontBody, fontDisplay, fontSans } from "@/lib/pastoral";
import { PBadge } from "@/components/pastoral/atoms";
import {
  eventDisplayLabel,
  friendlyEventStatusLabel,
  friendlyEventTypeLabel,
  statusTone,
  weekdayDateLabel,
} from "@/lib/calendar/payload";
import type { GroupCalendarEventsRow } from "@/types/database";

// Phase 5A.6 (corrected): list used by the archived tab. The main
// calendar surface is now the grid + modal editor. We no longer render
// per-event start_time / end_time -- meeting time is inherited from the
// group schedule and shown in the page header.
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
        {emptyMessage ?? "No calendar overrides."}
      </div>
    );
  }

  if (!archivedSeparate) {
    return (
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "grid",
          gap: 10,
        }}
      >
        {events.map((event) => (
          <CalendarEventRow
            key={event.id}
            event={event}
            renderActions={renderActions}
            archived={event.archived_at != null}
          />
        ))}
      </ul>
    );
  }

  const active = events.filter((e) => e.archived_at == null);
  const archived = events.filter((e) => e.archived_at != null);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {active.length > 0 ? (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "grid",
            gap: 10,
          }}
        >
          {active.map((event) => (
            <CalendarEventRow
              key={event.id}
              event={event}
              renderActions={renderActions}
            />
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
          {emptyMessage ?? "No overrides yet."}
        </div>
      )}

      {archived.length > 0 ? (
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
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: "10px 0 4px",
              display: "grid",
              gap: 10,
            }}
          >
            {archived.map((event) => (
              <CalendarEventRow
                key={event.id}
                event={event}
                renderActions={renderActions}
                archived
              />
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
  const dateLabel = weekdayDateLabel(event.event_date);
  const displayLabel = eventDisplayLabel(event);
  const typeLabel = friendlyEventTypeLabel(event.event_type);
  const statusLabel = friendlyEventStatusLabel(event.status);
  const showTypeAside =
    displayLabel !== typeLabel && event.status === "scheduled";

  return (
    <li
      className="lg-m-grid-stack"
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
          <div
            style={{
              fontFamily: fontBody,
              fontSize: 12,
              color: P.ink2,
              fontStyle: "italic",
            }}
          >
            {typeLabel}
          </div>
        ) : null}
        {event.description ? (
          <p
            style={{
              fontFamily: fontBody,
              fontSize: 13,
              color: P.ink2,
              margin: "4px 0 0",
              lineHeight: 1.5,
            }}
          >
            {event.description}
          </p>
        ) : null}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          alignItems: "flex-end",
        }}
      >
        <PBadge tone={statusTone(event.status)}>{statusLabel}</PBadge>
        {renderActions ? renderActions(event) : null}
      </div>
    </li>
  );
}
