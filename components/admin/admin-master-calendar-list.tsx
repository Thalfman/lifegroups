"use client";

import Link from "next/link";
import { memo, useEffect, useMemo, useRef } from "react";
import { PBadge } from "@/components/pastoral/atoms";
import { dateLabel, formatClock } from "@/lib/calendar/occurrences";
import {
  friendlyEventStatusLabel,
  friendlyEventTypeLabel,
} from "@/lib/calendar/payload";
import type { MasterOccurrence } from "@/lib/admin/master-calendar";
import {
  occurrenceAccessibleName,
  occurrenceCalendarLinkName,
} from "@/lib/admin/master-calendar-label";
import { occurrenceStatusTone } from "./admin-master-calendar-status";

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
    <div className="grid gap-3.5">
      {grouped.map(([date, dayOccurrences]) => (
        <section
          key={date}
          ref={date === anchorDate ? anchorRef : undefined}
          // lg-cv-row: content-visibility skips layout/paint for day sections
          // scrolled out of view — the month list can run to dozens of them.
          className="lg-cv-row grid gap-2.5 rounded-lg border border-line bg-surface px-4 py-3.5"
        >
          <h3 className="m-0 border-b border-lineSoft pb-1.5 font-sans text-xs font-bold uppercase tracking-[1.5px] text-ink3">
            {dateLabel(date)}
          </h3>
          <ul className="m-0 grid list-none gap-2 p-0">
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
    <li className="grid gap-2 rounded-sm border border-lineSoft bg-bg p-3">
      <button
        type="button"
        onClick={() => onSelect(occurrence)}
        aria-label={cardAriaLabel}
        className="grid min-h-11 cursor-pointer gap-1 border-none bg-transparent p-0 text-left"
      >
        <div className="font-sans text-md font-semibold leading-[1.3] text-ink">
          {occurrence.groupName}
        </div>
        <div className="flex flex-wrap items-center gap-2 font-sans text-xs text-ink2">
          {occurrence.status !== "scheduled" ? (
            <PBadge tone={tone}>
              {friendlyEventStatusLabel(occurrence.status)}
            </PBadge>
          ) : (
            <PBadge tone="healthy">{typeLabel}</PBadge>
          )}
          {clock ? <span>{clock}</span> : null}
          {occurrence.leaders.length > 0 ? (
            <span className="text-ink3">
              · {occurrence.leaders.map((l) => l.name).join(", ")}
            </span>
          ) : null}
        </div>
      </button>
      {showCalendarLink ? (
        <Link
          href={`/admin/groups/${occurrence.groupId}/calendar?month=${occurrence.date.slice(0, 7)}`}
          aria-label={occurrenceCalendarLinkName(occurrence)}
          className="self-start font-sans text-2xs font-semibold uppercase tracking-[1.2px] text-clay no-underline"
        >
          Open group calendar →
        </Link>
      ) : null}
    </li>
  );
});
