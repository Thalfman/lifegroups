import Link from "next/link";
import { P, fontBody, fontSans } from "@/lib/pastoral";
import { PBadge } from "@/components/pastoral/atoms";
import { formatClock } from "@/lib/calendar/occurrences";
import {
  friendlyEventStatusLabel,
  statusTone,
  weekdayDateLabel,
} from "@/lib/calendar/payload";
import type { GroupCalendarEventStatus } from "@/types/enums";

export type UpcomingCalendarEvent = {
  date: string; // YYYY-MM-DD
  label: string; // already-friendly label (title or fallback type label)
  status: GroupCalendarEventStatus;
  startTime: string | null;
};

export function UpcomingEventsStrip({
  events,
  calendarHref,
  eyebrow = "Upcoming",
}: {
  events: UpcomingCalendarEvent[];
  calendarHref: string;
  eyebrow?: string;
}) {
  if (events.length === 0) {
    return (
      <Link
        href={calendarHref}
        style={{
          display: "block",
          background: P.bgDeep,
          border: `1px dashed ${P.line}`,
          borderRadius: 12,
          padding: "10px 14px",
          textDecoration: "none",
          color: P.ink2,
          fontFamily: fontBody,
          fontSize: 13,
        }}
      >
        <div
          style={{
            fontFamily: fontSans,
            fontSize: 10,
            letterSpacing: 1.5,
            textTransform: "uppercase",
            color: P.ink3,
            fontWeight: 600,
            marginBottom: 4,
          }}
        >
          {eyebrow}
        </div>
        Add a calendar event &rarr;
      </Link>
    );
  }
  return (
    <Link
      href={calendarHref}
      style={{
        display: "block",
        background: P.surface,
        border: `1px solid ${P.line}`,
        borderRadius: 12,
        padding: "10px 14px",
        textDecoration: "none",
        color: P.ink,
      }}
    >
      <div
        style={{
          fontFamily: fontSans,
          fontSize: 10,
          letterSpacing: 1.5,
          textTransform: "uppercase",
          color: P.ink3,
          fontWeight: 600,
          marginBottom: 6,
        }}
      >
        {eyebrow}
      </div>
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "grid",
          gap: 6,
        }}
      >
        {events.map((event, idx) => {
          const dateLabel = weekdayDateLabel(event.date);
          const startLabel = formatClock(event.startTime);
          return (
            <li
              key={`${event.date}-${idx}`}
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                justifyContent: "space-between",
                fontFamily: fontBody,
                fontSize: 13,
                color: P.ink,
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  minWidth: 0,
                }}
              >
                <span style={{ fontWeight: 500 }}>{event.label}</span>
                <span style={{ color: P.ink2, fontSize: 12 }}>
                  {dateLabel}
                  {startLabel && event.status === "scheduled"
                    ? ` · ${startLabel}`
                    : ""}
                </span>
              </div>
              <PBadge tone={statusTone(event.status)}>
                {friendlyEventStatusLabel(event.status)}
              </PBadge>
            </li>
          );
        })}
      </ul>
    </Link>
  );
}
