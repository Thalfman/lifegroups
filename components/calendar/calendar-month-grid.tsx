import type { ReactNode } from "react";
import { PBadge } from "@/components/pastoral/atoms";
import {
  CalendarOccurrenceEditor,
  type CalendarOccurrenceEditorActions,
  type CalendarOccurrenceEditorOccurrence,
} from "./calendar-occurrence-editor";
import {
  WEEKDAY_HEADERS,
  dateLabel,
  dayNumberLabel,
  formatClock,
  gridCellsForMonth,
  type GridCell,
  type ResolvedOccurrence,
} from "@/lib/calendar/occurrences";
import {
  eventDisplayLabel,
  friendlyEventStatusLabel,
  friendlyEventTypeLabel,
  statusTone,
} from "@/lib/calendar/payload";

// Build an explicit, meaningful accessible name for a calendar cell's edit
// trigger (#322). Without it the button's name is the concatenated child text
// (day # + "Today" + type + clock + status + "Special"), which reads as a
// run-on string. For a date with an occurrence we summarize it ("Edit
// Saturday, May 16 — Study, 6:00 PM, Scheduled"); an empty editable date reads
// "Add event on <date>". The date keeps the name unique across the grid, and
// type/status keep it unique when two groups collide on the same date.
function buildTriggerAriaLabel(
  occurrence: ResolvedOccurrence | null,
  date: string,
  groupMeetingTime: string | null
): string {
  const friendlyDate = dateLabel(date);
  if (!occurrence) return `Add event on ${friendlyDate}`;
  const typeLabel = eventDisplayLabel({
    title: occurrence.title,
    event_type: occurrence.eventType,
  });
  const clock =
    formatClock(occurrence.meetingTime) ?? formatClock(groupMeetingTime);
  const statusLabel = friendlyEventStatusLabel(occurrence.status);
  // Lead with the (possibly title-overridden) display label, then the canonical
  // gathering type when a custom title masks it, so the name stays meaningful.
  const canonicalType = friendlyEventTypeLabel(occurrence.eventType);
  const typePart =
    typeLabel === canonicalType ? typeLabel : `${typeLabel} (${canonicalType})`;
  const parts = [typePart];
  if (clock && occurrence.status === "scheduled") parts.push(clock);
  parts.push(statusLabel);
  return `Edit ${friendlyDate} — ${parts.join(", ")}`;
}

// Phase 5A.6 (corrected) monthly calendar grid. Generates the cells for
// the visible month and renders cadence-driven occurrence pills with
// optional overrides merged in. Clicking a cell -- whether it has a
// pill or not -- opens an editor modal scoped to that date.
export function CalendarMonthGrid({
  monthIso,
  todayIso,
  occurrences,
  groupId,
  groupMeetingTime,
  actions,
  canEdit,
  disabledReason,
  previewNotice,
}: {
  monthIso: string;
  todayIso: string;
  occurrences: ResolvedOccurrence[];
  groupId: string;
  groupMeetingTime: string | null;
  actions: CalendarOccurrenceEditorActions;
  canEdit: boolean;
  disabledReason?: string;
  previewNotice?: string;
}) {
  const cells = gridCellsForMonth(monthIso, todayIso);
  const occurrencesByDate = new Map<string, ResolvedOccurrence>();
  for (const o of occurrences) occurrencesByDate.set(o.date, o);

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
            occurrence={occurrencesByDate.get(cell.date) ?? null}
            groupId={groupId}
            groupMeetingTime={groupMeetingTime}
            actions={actions}
            canEdit={canEdit && cell.inMonth}
            disabledReason={cell.inMonth ? disabledReason : undefined}
            previewNotice={previewNotice}
          />
        ))}
      </div>
    </div>
  );
}

function GridCellView({
  cell,
  occurrence,
  groupId,
  groupMeetingTime,
  actions,
  canEdit,
  disabledReason,
  previewNotice,
}: {
  cell: GridCell;
  occurrence: ResolvedOccurrence | null;
  groupId: string;
  groupMeetingTime: string | null;
  actions: CalendarOccurrenceEditorActions;
  canEdit: boolean;
  disabledReason?: string;
  previewNotice?: string;
}) {
  // Out-of-month cells differ by background + a muted (AA-clearing) day
  // color — never an opacity wash, which floors text contrast below 4.5:1.
  const baseBgClass = cell.inMonth ? "bg-bg" : "bg-surface";
  const dayColorClass = cell.isToday
    ? "text-clay"
    : cell.inMonth
      ? "text-ink2"
      : "text-ink3";

  const cellInner = (
    <div className="lg-m-cal-cell flex min-h-[84px] flex-col gap-1 px-2 pb-2.5 pt-2">
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
      {occurrence ? (
        <OccurrencePill
          occurrence={occurrence}
          groupMeetingTime={groupMeetingTime}
        />
      ) : null}
    </div>
  );

  // Build an editor occurrence shape for both saved-override dates and
  // dates with no row yet (default cadence occurrence, or a fresh
  // non-meeting date). The editor uses overrideId === null to decide
  // between create and update.
  const editorOccurrence: CalendarOccurrenceEditorOccurrence = occurrence ?? {
    date: cell.date,
    meetingTime: groupMeetingTime,
    eventType: "study",
    status: "scheduled",
    title: null,
    description: null,
    overrideId: null,
    isMeetingOccurrence: false,
  };

  const wrapperClassName = `block min-h-[84px] w-full rounded-sm border border-line ${baseBgClass}`;

  const triggerAriaLabel = buildTriggerAriaLabel(
    occurrence,
    cell.date,
    groupMeetingTime
  );

  return (
    <CalendarOccurrenceEditor
      groupId={groupId}
      groupMeetingTime={groupMeetingTime}
      occurrence={editorOccurrence}
      actions={actions}
      triggerLabel={cellInner}
      triggerAriaLabel={triggerAriaLabel}
      triggerClassName={wrapperClassName}
      canEdit={canEdit}
      disabledReason={disabledReason}
      previewNotice={previewNotice}
    />
  );
}

function OccurrencePill({
  occurrence,
  groupMeetingTime,
}: {
  occurrence: ResolvedOccurrence;
  groupMeetingTime: string | null;
}) {
  const clock =
    formatClock(occurrence.meetingTime) ??
    formatClock(groupMeetingTime) ??
    null;
  const typeLabel = eventDisplayLabel({
    title: occurrence.title,
    event_type: occurrence.eventType,
  });
  const tone = statusTone(occurrence.status);

  return (
    <div className="mt-0.5 flex flex-col gap-1">
      {/* Truncate long titles inside the narrow cell; full label is in
          the editor modal. */}
      <div className="lg-m-cal-pill overflow-hidden text-ellipsis whitespace-nowrap font-sans text-xs font-medium leading-[1.3] text-ink">
        {typeLabel}
      </div>
      {clock && occurrence.status === "scheduled" ? (
        <div className="font-sans text-[10px] tracking-[0.2px] text-ink3">
          {clock}
        </div>
      ) : null}
      {occurrence.status !== "scheduled" ? (
        <div>
          <PBadge tone={tone}>
            {friendlyEventStatusLabel(occurrence.status)}
          </PBadge>
        </div>
      ) : null}
      {!occurrence.isMeetingOccurrence ? (
        <div className="font-sans text-[9px] uppercase tracking-[0.5px] text-ink3">
          Special
        </div>
      ) : null}
    </div>
  );
}

// Compact summary line used above the grid: "Anderson Life Group meets
// Saturdays at 6:00 PM (weekly)". When the schedule is incomplete it
// returns null so the page can render a setup-gap notice instead.
export function describeSchedule(opts: {
  meetingDay: string | null;
  meetingTime: string | null;
  meetingFrequency: string;
  meetingWeekParity: string | null;
}): ReactNode | null {
  if (!opts.meetingDay || !opts.meetingTime) return null;
  const clock = formatClock(opts.meetingTime);
  if (!clock) return null;
  const cadenceFragments: string[] = [];
  if (opts.meetingFrequency === "weekly") cadenceFragments.push("weekly");
  if (opts.meetingFrequency === "biweekly") {
    if (opts.meetingWeekParity === "odd")
      cadenceFragments.push("bi-weekly · odd weeks");
    else if (opts.meetingWeekParity === "even")
      cadenceFragments.push("bi-weekly · even weeks");
    else cadenceFragments.push("bi-weekly (parity not set)");
  }
  if (opts.meetingFrequency === "monthly") cadenceFragments.push("monthly");
  const cadence =
    cadenceFragments.length > 0 ? ` (${cadenceFragments.join(" ")})` : "";
  return (
    <>
      Meets <strong className="text-ink">{opts.meetingDay}s</strong> at{" "}
      <strong className="text-ink">{clock}</strong>
      {cadence}
    </>
  );
}
