import type { ReactNode } from "react";
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
      <div className="rounded-md border border-dashed border-line bg-surface px-5 py-[18px] font-sans text-base text-ink2">
        {emptyMessage ?? "No calendar overrides."}
      </div>
    );
  }

  if (!archivedSeparate) {
    return (
      <ul className="m-0 grid list-none gap-2.5 p-0">
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
    <div className="grid gap-4">
      {active.length > 0 ? (
        <ul className="m-0 grid list-none gap-2.5 p-0">
          {active.map((event) => (
            <CalendarEventRow
              key={event.id}
              event={event}
              renderActions={renderActions}
            />
          ))}
        </ul>
      ) : (
        <div className="rounded-md border border-dashed border-line bg-surface px-[18px] py-3.5 font-sans text-base text-ink2">
          {emptyMessage ?? "No overrides yet."}
        </div>
      )}

      {archived.length > 0 ? (
        <details className="rounded-md border border-line bg-surface px-4 py-2.5 font-sans">
          <summary className="cursor-pointer font-sans text-2xs font-semibold uppercase tracking-[1.5px] text-ink3">
            Archived ({archived.length})
          </summary>
          <ul className="m-0 mb-1 mt-2.5 grid list-none gap-2.5 p-0">
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
      className={`lg-m-grid-stack grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 rounded-md border border-line px-4 py-3.5 ${
        archived ? "bg-sidebar opacity-70" : "bg-surface"
      }`}
    >
      <div className="grid min-w-0 gap-1">
        <div className="font-sans text-2xs font-semibold uppercase tracking-[1.5px] text-ink3">
          {dateLabel}
        </div>
        <div className="font-display text-[18px] font-medium leading-[1.25] text-ink">
          {displayLabel}
        </div>
        {showTypeAside ? (
          <div className="font-sans text-xs italic text-ink2">{typeLabel}</div>
        ) : null}
        {event.description ? (
          <p className="m-0 mt-1 font-sans text-sm leading-normal text-ink2">
            {event.description}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col items-end gap-2">
        <PBadge tone={statusTone(event.status)}>{statusLabel}</PBadge>
        {renderActions ? renderActions(event) : null}
      </div>
    </li>
  );
}
