import type { ReactNode } from "react";
import { PBadge, type PTone } from "@/components/pastoral/atoms";
import {
  CalendarOccurrenceEditor,
  type CalendarOccurrenceEditorActions,
  type CalendarOccurrenceEditorOccurrence,
} from "./calendar-occurrence-editor";
import {
  WEEKDAY_HEADERS,
  dayNumberLabel,
  formatClock,
  gridCellsForMonth,
  type GridCell,
  type ResolvedOccurrence,
} from "@/lib/calendar/occurrences";
import {
  eventDisplayLabel,
  friendlyEventStatusLabel,
} from "@/lib/calendar/payload";
import { P, fontBody, fontSans } from "@/lib/pastoral";

function statusTone(status: ResolvedOccurrence["status"]): PTone {
  if (status === "off") return "pause";
  if (status === "cancelled") return "followup";
  return "healthy";
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
    <div
      style={{
        background: P.surface,
        border: `1px solid ${P.line}`,
        borderRadius: 14,
        padding: 16,
        display: "grid",
        gap: 10,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
          gap: 6,
          fontFamily: fontSans,
          fontSize: 10,
          letterSpacing: 1.5,
          textTransform: "uppercase",
          color: P.ink3,
          fontWeight: 600,
        }}
      >
        {WEEKDAY_HEADERS.map((label) => (
          <div key={label} style={{ padding: "2px 6px" }}>
            {label}
          </div>
        ))}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
          gap: 6,
        }}
      >
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
  const baseBg = cell.inMonth ? P.bg : P.surface;
  const dayColor = cell.inMonth ? P.ink2 : P.ink3;
  const opacity = cell.inMonth ? 1 : 0.55;

  const cellInner = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        minHeight: 84,
        padding: "8px 8px 10px",
        opacity,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          fontFamily: fontSans,
          fontSize: 11,
          fontWeight: 600,
          color: cell.isToday ? P.terra : dayColor,
        }}
      >
        {dayNumberLabel(cell.date)}
        {cell.isToday ? (
          <span
            style={{
              fontSize: 9,
              letterSpacing: 1,
              textTransform: "uppercase",
              color: P.terra,
              fontWeight: 700,
            }}
          >
            Today
          </span>
        ) : null}
      </div>
      {occurrence ? (
        <OccurrencePill occurrence={occurrence} groupMeetingTime={groupMeetingTime} />
      ) : null}
    </div>
  );

  // Build an editor occurrence shape for both saved-override dates and
  // dates with no row yet (default cadence occurrence, or a fresh
  // non-meeting date). The editor uses overrideId === null to decide
  // between create and update.
  const editorOccurrence: CalendarOccurrenceEditorOccurrence =
    occurrence ?? {
      date: cell.date,
      meetingTime: groupMeetingTime,
      eventType: "study",
      status: "scheduled",
      title: null,
      description: null,
      overrideId: null,
      isMeetingOccurrence: false,
    };

  const wrapperStyle: React.CSSProperties = {
    border: `1px solid ${P.line}`,
    borderRadius: 10,
    background: baseBg,
    minHeight: 84,
    display: "block",
    width: "100%",
  };

  return (
    <CalendarOccurrenceEditor
      groupId={groupId}
      groupMeetingTime={groupMeetingTime}
      occurrence={editorOccurrence}
      actions={actions}
      triggerLabel={cellInner}
      triggerStyle={wrapperStyle}
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
    formatClock(occurrence.meetingTime) ?? formatClock(groupMeetingTime) ?? null;
  const typeLabel = eventDisplayLabel({
    title: occurrence.title,
    event_type: occurrence.eventType,
  });
  const tone = statusTone(occurrence.status);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        marginTop: 2,
      }}
    >
      <div
        style={{
          fontFamily: fontBody,
          fontSize: 12,
          color: P.ink,
          fontWeight: 500,
          lineHeight: 1.3,
          // Truncate long titles inside the narrow cell; full label is in
          // the editor modal.
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {typeLabel}
      </div>
      {clock && occurrence.status === "scheduled" ? (
        <div
          style={{
            fontFamily: fontSans,
            fontSize: 10,
            color: P.ink3,
            letterSpacing: 0.2,
          }}
        >
          {clock}
        </div>
      ) : null}
      {occurrence.status !== "scheduled" ? (
        <div>
          <PBadge tone={tone}>{friendlyEventStatusLabel(occurrence.status)}</PBadge>
        </div>
      ) : null}
      {!occurrence.isMeetingOccurrence ? (
        <div
          style={{
            fontFamily: fontSans,
            fontSize: 9,
            color: P.ink3,
            letterSpacing: 0.5,
            textTransform: "uppercase",
          }}
        >
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
    if (opts.meetingWeekParity === "odd") cadenceFragments.push("bi-weekly · odd weeks");
    else if (opts.meetingWeekParity === "even")
      cadenceFragments.push("bi-weekly · even weeks");
    else cadenceFragments.push("bi-weekly (parity not set)");
  }
  if (opts.meetingFrequency === "monthly") cadenceFragments.push("monthly");
  const cadence = cadenceFragments.length > 0 ? ` (${cadenceFragments.join(" ")})` : "";
  return (
    <>
      Meets <strong style={{ color: P.ink }}>{opts.meetingDay}s</strong> at{" "}
      <strong style={{ color: P.ink }}>{clock}</strong>
      {cadence}
    </>
  );
}
