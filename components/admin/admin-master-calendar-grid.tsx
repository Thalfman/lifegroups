"use client";

import { PBadge } from "@/components/pastoral/atoms";
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
import type { MasterOccurrence } from "@/lib/admin/master-calendar";
import { occurrenceAccessibleName } from "@/lib/admin/master-calendar-label";
import {
  occurrenceStatusTone,
  STATUS_STRIPE_BORDER_CLASS,
} from "./admin-master-calendar-status";

export type DayClickPayload = { date: string };

const MAX_PILLS_PER_CELL = 3;

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
    <div className="grid gap-2.5 rounded-lg border border-line bg-surface p-4">
      <div className="lg-m-cal-weekdays grid grid-cols-7 gap-1.5 font-sans text-[10px] font-semibold uppercase tracking-[1.5px] text-ink3">
        {WEEKDAY_HEADERS.map((label) => (
          <div key={label} className="px-1.5 py-0.5">
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
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
  // Out-of-month cells are distinguished by background + a muted (but still
  // AA-clearing) day color — never an opacity wash, which floors text
  // contrast below 4.5:1.
  const baseBgClass = cell.inMonth ? "bg-bg" : "bg-surface";
  const dayColorClass = cell.isToday
    ? "text-clay"
    : cell.inMonth
      ? "text-ink2"
      : "text-ink3";
  const visible = occurrences.slice(0, MAX_PILLS_PER_CELL);
  const overflow = occurrences.length - visible.length;

  return (
    <div
      className={`lg-m-cal-cell flex min-h-[96px] flex-col gap-1.5 rounded-sm border border-line px-2 pb-2.5 pt-2 ${baseBgClass} ${
        cell.isToday ? "shadow-[inset_0_0_0_1px_var(--c-clay)]" : ""
      }`}
    >
      <div
        className={`flex items-center gap-1 font-sans text-2xs font-semibold ${dayColorClass}`}
      >
        {dayNumberLabel(cell.date)}
        {cell.isToday ? (
          <span className="text-2xs font-bold uppercase tracking-[1px] text-clay">
            Today
          </span>
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        {visible.map((o) => (
          <OccurrencePill
            key={`${o.groupId}|${o.date}`}
            occurrence={o}
            onClick={() => onSelect(o)}
          />
        ))}
        {overflow > 0 ? (
          <button
            type="button"
            onClick={() => onMoreFromDay({ date: cell.date })}
            className="cursor-pointer self-start rounded-[6px] border-none bg-transparent px-1 py-0.5 text-left font-sans text-2xs font-semibold text-clayDeep"
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
  const tone = occurrenceStatusTone(occurrence.status);
  const showStatusBadge = occurrence.status !== "scheduled";
  // Explicit, meaningful accessible name (#322): the pill's child text reads as
  // a run-on to a screen reader. The shared helper keeps it unique across a
  // recurring group's cells (date) and across two same-named groups sharing a
  // date (leader discriminator — group names are not unique).
  const pillAriaLabel = occurrenceAccessibleName(occurrence);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={pillAriaLabel}
      title={`${occurrence.groupName} · ${typeLabel}${clock ? ` · ${clock}` : ""}`}
      // Status carried by a full border (legend-explained), not a stripe.
      className={`lg-m-cal-pill flex cursor-pointer flex-col gap-0.5 rounded-[6px] border bg-surface px-1.5 py-1 text-left font-sans ${STATUS_STRIPE_BORDER_CLASS[occurrence.status]}`}
    >
      <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[11.5px] font-semibold leading-[1.2] text-ink">
        {occurrence.groupName}
      </span>
      <span className="flex flex-wrap items-center gap-1 font-sans text-[10px] tracking-[0.2px] text-ink3">
        {showStatusBadge ? (
          <PBadge tone={tone}>
            {friendlyEventStatusLabel(occurrence.status)}
          </PBadge>
        ) : (
          <span>{typeLabel}</span>
        )}
        {clock ? <span>· {clock}</span> : null}
      </span>
    </button>
  );
}
