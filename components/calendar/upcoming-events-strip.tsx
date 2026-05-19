import Link from "next/link";
import { P, fontBody, fontSans } from "@/lib/pastoral";
import { PBadge, type PTone } from "@/components/pastoral/atoms";
import { friendlyEventStatusLabel } from "@/lib/calendar/payload";
import type { GroupCalendarEventStatus } from "@/types/enums";

export type UpcomingCalendarEvent = {
  date: string; // YYYY-MM-DD
  label: string; // already-friendly label (title or fallback type label)
  status: GroupCalendarEventStatus;
  startTime: string | null;
};

function statusTone(status: GroupCalendarEventStatus): PTone {
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

function formatStart(t: string | null): string | null {
  if (!t) return null;
  const [h, m] = t.split(":");
  const hour = Number.parseInt(h ?? "0", 10);
  const minute = Number.parseInt(m ?? "0", 10);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  const suffix = hour >= 12 ? "PM" : "AM";
  const display = ((hour + 11) % 12) + 1;
  const minuteStr = minute === 0 ? "" : `:${String(minute).padStart(2, "0")}`;
  return `${display}${minuteStr} ${suffix}`;
}

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
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
        {events.map((event, idx) => {
          const dateLabel = formatDate(event.date);
          const startLabel = formatStart(event.startTime);
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
              <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <span style={{ fontWeight: 500 }}>{event.label}</span>
                <span style={{ color: P.ink2, fontSize: 12 }}>
                  {dateLabel}
                  {startLabel && event.status === "scheduled" ? ` · ${startLabel}` : ""}
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
