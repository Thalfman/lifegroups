"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { PBadge, type PTone } from "@/components/pastoral/atoms";
import { dateLabel, formatClock } from "@/lib/calendar/occurrences";
import {
  friendlyEventStatusLabel,
  friendlyEventTypeLabel,
} from "@/lib/calendar/payload";
import { P, fontBody, fontSans } from "@/lib/pastoral";
import type { MasterOccurrence } from "@/lib/admin/master-calendar";
import { statusStripeColor } from "./admin-master-calendar-status";

function statusTone(status: MasterOccurrence["status"]): PTone {
  if (status === "off") return "pause";
  if (status === "cancelled") return "followup";
  return "healthy";
}

export function AdminMasterCalendarList({
  occurrences,
  fromIso,
  toIso,
  anchorDate,
  onAnchorConsumed,
  onSelect,
}: {
  occurrences: MasterOccurrence[];
  fromIso: string | null;
  toIso: string | null;
  anchorDate: string | null;
  onAnchorConsumed: () => void;
  onSelect: (o: MasterOccurrence) => void;
}) {
  const grouped = useMemo(() => {
    const byDate = new Map<string, MasterOccurrence[]>();
    for (const o of occurrences) {
      // Restrict the list to the visible month bounds, but allow saved
      // overrides whose date falls within the same month (mergeOverrides
      // already constrained the set; this is defense-in-depth).
      if (fromIso && o.date < fromIso) continue;
      if (toIso && o.date > toIso) continue;
      const bucket = byDate.get(o.date) ?? [];
      bucket.push(o);
      byDate.set(o.date, bucket);
    }
    return Array.from(byDate.entries()).sort((a, b) =>
      a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0
    );
  }, [occurrences, fromIso, toIso]);

  const anchorRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!anchorDate) return;
    if (anchorRef.current) {
      anchorRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    onAnchorConsumed();
  }, [anchorDate, onAnchorConsumed]);

  if (grouped.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        display: "grid",
        gap: 14,
      }}
    >
      {grouped.map(([date, dayOccurrences]) => (
        <section
          key={date}
          ref={date === anchorDate ? anchorRef : undefined}
          style={{
            background: P.surface,
            border: `1px solid ${P.line}`,
            borderRadius: 14,
            padding: "14px 16px",
            display: "grid",
            gap: 10,
          }}
        >
          <h3
            style={{
              fontFamily: fontSans,
              fontSize: 12,
              letterSpacing: 1.5,
              textTransform: "uppercase",
              color: P.ink3,
              fontWeight: 700,
              margin: 0,
              paddingBottom: 6,
              borderBottom: `1px solid ${P.line2}`,
            }}
          >
            {dateLabel(date)}
          </h3>
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "grid",
              gap: 8,
            }}
          >
            {dayOccurrences.map((o) => (
              <OccurrenceCard
                key={`${o.groupId}|${o.date}`}
                occurrence={o}
                onSelect={onSelect}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function OccurrenceCard({
  occurrence,
  onSelect,
}: {
  occurrence: MasterOccurrence;
  onSelect: (o: MasterOccurrence) => void;
}) {
  const clock = formatClock(occurrence.inheritedMeetingTime);
  const typeLabel = friendlyEventTypeLabel(occurrence.eventType);
  const tone = statusTone(occurrence.status);
  const stripe = statusStripeColor(occurrence.status);
  // Explicit, meaningful accessible name (#322): without it the button's name
  // is the concatenated child text (group + status/type + clock + leaders),
  // which reads as a run-on. Lead with the group, then date keeps it unique
  // across a recurring group's dates, and type/status keep it unique when two
  // groups share a date.
  const statusOrType =
    occurrence.status === "scheduled"
      ? typeLabel
      : friendlyEventStatusLabel(occurrence.status);
  const detailParts = [statusOrType];
  if (clock) detailParts.push(clock);
  const cardAriaLabel = `View ${occurrence.groupName} on ${dateLabel(
    occurrence.date
  )} — ${detailParts.join(", ")}`;
  return (
    <li
      style={{
        background: P.bg,
        border: `1px solid ${P.line2}`,
        borderLeft: `3px solid ${stripe}`,
        borderRadius: 10,
        padding: "12px 12px 12px 15px",
        display: "grid",
        gap: 8,
      }}
    >
      <button
        type="button"
        onClick={() => onSelect(occurrence)}
        aria-label={cardAriaLabel}
        style={{
          background: "transparent",
          border: "none",
          padding: 0,
          textAlign: "left",
          cursor: "pointer",
          display: "grid",
          gap: 4,
          minHeight: 44,
        }}
      >
        <div
          style={{
            fontFamily: fontBody,
            fontSize: 15,
            fontWeight: 600,
            color: P.ink,
            lineHeight: 1.3,
          }}
        >
          {occurrence.groupName}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
            fontFamily: fontSans,
            fontSize: 12,
            color: P.ink2,
          }}
        >
          {occurrence.status !== "scheduled" ? (
            <PBadge tone={tone}>
              {friendlyEventStatusLabel(occurrence.status)}
            </PBadge>
          ) : (
            <PBadge tone="healthy">{typeLabel}</PBadge>
          )}
          {clock ? <span>{clock}</span> : null}
          {occurrence.leaders.length > 0 ? (
            <span style={{ color: P.ink3 }}>
              · {occurrence.leaders.map((l) => l.name).join(", ")}
            </span>
          ) : null}
        </div>
      </button>
      <Link
        href={`/admin/groups/${occurrence.groupId}/calendar?month=${occurrence.date.slice(0, 7)}`}
        aria-label={`Open ${occurrence.groupName} calendar — ${dateLabel(occurrence.date)}`}
        style={{
          fontFamily: fontSans,
          fontSize: 11,
          fontWeight: 600,
          color: P.terra,
          textDecoration: "none",
          letterSpacing: 1.2,
          textTransform: "uppercase",
          alignSelf: "start",
        }}
      >
        Open group calendar →
      </Link>
    </li>
  );
}
