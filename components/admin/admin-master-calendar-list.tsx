"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { Card, Pill, type PillTone } from "@/components/pastoral/primitives";
import { dateLabel, formatClock } from "@/lib/calendar/occurrences";
import {
  friendlyEventStatusLabel,
  friendlyEventTypeLabel,
} from "@/lib/calendar/payload";
import type { MasterOccurrence } from "@/lib/admin/master-calendar";

function statusPillTone(status: MasterOccurrence["status"]): PillTone {
  if (status === "off") return "neutral";
  if (status === "cancelled") return "clay";
  return "sage";
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
      a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0,
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
    <div style={{ display: "grid", gap: 14 }}>
      {grouped.map(([date, dayOccurrences]) => (
        <DayGroup
          key={date}
          date={date}
          occurrences={dayOccurrences}
          anchorDate={anchorDate}
          anchorRef={anchorRef}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function DayGroup({
  date,
  occurrences,
  anchorDate,
  anchorRef,
  onSelect,
}: {
  date: string;
  occurrences: MasterOccurrence[];
  anchorDate: string | null;
  anchorRef: React.RefObject<HTMLDivElement | null>;
  onSelect: (o: MasterOccurrence) => void;
}) {
  return (
    <div ref={date === anchorDate ? anchorRef : undefined}>
      <Card padded={false} style={{ padding: "14px 16px", display: "grid", gap: 10 }}>
        <h3
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 11,
            letterSpacing: 1.8,
            textTransform: "uppercase",
            color: "var(--c-ink3)",
            fontWeight: 600,
            margin: 0,
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
          {occurrences.map((o) => (
            <OccurrenceCard
              key={`${o.groupId}|${o.date}`}
              occurrence={o}
              onSelect={onSelect}
            />
          ))}
        </ul>
      </Card>
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
  const isCancelled = occurrence.status === "cancelled";
  return (
    <li
      style={{
        background: "var(--c-surfaceAlt)",
        border: "1px solid var(--c-lineSoft)",
        borderRadius: 10,
        padding: 12,
        display: "grid",
        gap: 8,
      }}
    >
      <button
        type="button"
        onClick={() => onSelect(occurrence)}
        style={{
          background: "transparent",
          border: "none",
          padding: 0,
          textAlign: "left",
          cursor: "pointer",
          display: "grid",
          gap: 6,
          minHeight: 44,
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 15,
            fontWeight: 600,
            color: "var(--c-ink)",
            lineHeight: 1.3,
            textDecoration: isCancelled ? "line-through" : "none",
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
            fontFamily: "var(--font-body)",
            fontSize: 12.5,
            color: "var(--c-ink2)",
          }}
        >
          {occurrence.status !== "scheduled" ? (
            <Pill tone={statusPillTone(occurrence.status)}>
              {friendlyEventStatusLabel(occurrence.status)}
            </Pill>
          ) : (
            <Pill tone="sage">{typeLabel}</Pill>
          )}
          {clock ? <span>{clock}</span> : null}
          {occurrence.leaders.length > 0 ? (
            <span style={{ color: "var(--c-ink3)" }}>
              · {occurrence.leaders.map((l) => l.name).join(", ")}
            </span>
          ) : null}
        </div>
      </button>
      <Link
        href={`/admin/groups/${occurrence.groupId}/calendar?month=${occurrence.date.slice(0, 7)}`}
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 12,
          fontWeight: 600,
          color: "var(--c-clay)",
          textDecoration: "none",
          letterSpacing: 0.3,
          alignSelf: "start",
          padding: "6px 10px",
          borderRadius: 999,
          border: "1px solid var(--c-line)",
          background: "var(--c-surface)",
        }}
      >
        Open group calendar →
      </Link>
    </li>
  );
}
