"use client";

import Link from "next/link";
import { memo, useEffect, useMemo, useRef, type CSSProperties } from "react";
import { PBadge } from "@/components/pastoral/atoms";
import { dateLabel, formatClock } from "@/lib/calendar/occurrences";
import {
  friendlyEventStatusLabel,
  friendlyEventTypeLabel,
} from "@/lib/calendar/payload";
import { P, fontBody, fontSans } from "@/lib/pastoral";
import type { MasterOccurrence } from "@/lib/admin/master-calendar";
import {
  occurrenceAccessibleName,
  occurrenceCalendarLinkName,
} from "@/lib/admin/master-calendar-label";
import {
  occurrenceStatusTone,
  statusStripeColor,
} from "./admin-master-calendar-status";

// Static style objects hoisted to module scope: they reference only the pastoral
// palette constants, so rebuilding them per render (across potentially dozens of
// day sections and occurrence cards) only churned the GC for identical objects.
const LIST_WRAP_STYLE: CSSProperties = { display: "grid", gap: 14 };
const DAY_SECTION_STYLE: CSSProperties = {
  background: P.surface,
  border: `1px solid ${P.line}`,
  borderRadius: 14,
  padding: "14px 16px",
  display: "grid",
  gap: 10,
};
const DAY_HEADING_STYLE: CSSProperties = {
  fontFamily: fontSans,
  fontSize: 12,
  letterSpacing: 1.5,
  textTransform: "uppercase",
  color: P.ink3,
  fontWeight: 700,
  margin: 0,
  paddingBottom: 6,
  borderBottom: `1px solid ${P.line2}`,
};
const DAY_LIST_STYLE: CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: 0,
  display: "grid",
  gap: 8,
};
const CARD_STYLE: CSSProperties = {
  background: P.bg,
  border: `1px solid ${P.line2}`,
  borderRadius: 10,
  padding: 12,
  display: "grid",
  gap: 8,
};
const CARD_BUTTON_STYLE: CSSProperties = {
  background: "transparent",
  border: "none",
  padding: 0,
  textAlign: "left",
  cursor: "pointer",
  display: "grid",
  gap: 4,
  minHeight: 44,
};
const CARD_TITLE_STYLE: CSSProperties = {
  fontFamily: fontBody,
  fontSize: 15,
  fontWeight: 600,
  color: P.ink,
  lineHeight: 1.3,
};
const CARD_META_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
  fontFamily: fontSans,
  fontSize: 12,
  color: P.ink2,
};
const CARD_LEADERS_STYLE: CSSProperties = { color: P.ink3 };
const CARD_LINK_STYLE: CSSProperties = {
  fontFamily: fontSans,
  fontSize: 11,
  fontWeight: 600,
  color: P.terra,
  textDecoration: "none",
  letterSpacing: 1.2,
  textTransform: "uppercase",
  alignSelf: "start",
};

export function AdminMasterCalendarList({
  occurrences,
  fromIso,
  toIso,
  anchorDate,
  onAnchorConsumed,
  onSelect,
  denoiseGroupLinks = false,
}: {
  occurrences: MasterOccurrence[];
  fromIso: string | null;
  toIso: string | null;
  anchorDate: string | null;
  onAnchorConsumed: () => void;
  onSelect: (o: MasterOccurrence) => void;
  // De-noise the repeated "Open group calendar" links (#331). A group recurring
  // across the month renders one identical deep-link per occurrence row, which
  // reads as noise. When set, the per-row link is dropped; the calendar stays
  // reachable through the occurrence drawer's single "Open group calendar"
  // action (one entry point per group), and the Planning shell's "By leader"
  // view surfaces a single per-group link. The frozen /admin/calendar route
  // leaves this off so its rows are unchanged.
  denoiseGroupLinks?: boolean;
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
    <div style={LIST_WRAP_STYLE}>
      {grouped.map(([date, dayOccurrences]) => (
        <section
          key={date}
          ref={date === anchorDate ? anchorRef : undefined}
          // content-visibility skips layout/paint for day sections scrolled out
          // of view — the month list can run to dozens of them.
          className="lg-cv-row"
          style={DAY_SECTION_STYLE}
        >
          <h3 style={DAY_HEADING_STYLE}>{dateLabel(date)}</h3>
          <ul style={DAY_LIST_STYLE}>
            {dayOccurrences.map((o) => (
              <OccurrenceCard
                key={`${o.groupId}|${o.date}`}
                occurrence={o}
                onSelect={onSelect}
                showCalendarLink={!denoiseGroupLinks}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

const OccurrenceCard = memo(function OccurrenceCard({
  occurrence,
  onSelect,
  showCalendarLink = true,
}: {
  occurrence: MasterOccurrence;
  onSelect: (o: MasterOccurrence) => void;
  showCalendarLink?: boolean;
}) {
  const clock = formatClock(occurrence.inheritedMeetingTime);
  const typeLabel = friendlyEventTypeLabel(occurrence.eventType);
  const tone = occurrenceStatusTone(occurrence.status);
  // Explicit, meaningful accessible name (#322): without it the button's name
  // is the concatenated child text (group + status/type + clock + leaders),
  // which reads as a run-on. The shared helper leads with the group, then the
  // date (unique across a recurring group's dates) and a leader discriminator
  // (group names are not unique, so two same-named groups sharing a date stay
  // distinct).
  const cardAriaLabel = occurrenceAccessibleName(occurrence);
  return (
    <li style={CARD_STYLE}>
      <button
        type="button"
        onClick={() => onSelect(occurrence)}
        aria-label={cardAriaLabel}
        style={CARD_BUTTON_STYLE}
      >
        <div style={CARD_TITLE_STYLE}>{occurrence.groupName}</div>
        <div style={CARD_META_STYLE}>
          {occurrence.status !== "scheduled" ? (
            <PBadge tone={tone}>
              {friendlyEventStatusLabel(occurrence.status)}
            </PBadge>
          ) : (
            <PBadge tone="healthy">{typeLabel}</PBadge>
          )}
          {clock ? <span>{clock}</span> : null}
          {occurrence.leaders.length > 0 ? (
            <span style={CARD_LEADERS_STYLE}>
              · {occurrence.leaders.map((l) => l.name).join(", ")}
            </span>
          ) : null}
        </div>
      </button>
      {showCalendarLink ? (
        <Link
          href={`/admin/groups/${occurrence.groupId}/calendar?month=${occurrence.date.slice(0, 7)}`}
          aria-label={occurrenceCalendarLinkName(occurrence)}
          style={CARD_LINK_STYLE}
        >
          Open group calendar →
        </Link>
      ) : null}
    </li>
  );
});
