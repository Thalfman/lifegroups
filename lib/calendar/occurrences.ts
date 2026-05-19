// Phase 5A.6 correction: generate expected meeting occurrences from a
// group's default schedule (Phase 5A.5 cadence) for a visible calendar
// month, then merge in saved override rows. The calendar page no longer
// asks leaders to create every default meeting; the grid auto-renders
// cadence-driven occurrences and saved rows act as exceptions.
//
// Calendar time overrides are intentionally disabled: meeting time is
// always inherited from the group schedule (`meeting_time`). The
// `start_time` / `end_time` columns on `group_calendar_events` are
// retained for backward compatibility with merged migration
// 20260518140000_phase5a6_group_calendar.sql but ignored everywhere.

import { isoWeekNumberOf } from "@/lib/admin/check-in-due";
import { CHURCH_TIMEZONE } from "@/lib/leader/validation";
import type { GroupCalendarEventsRow } from "@/types/database";
import type {
  GroupCalendarEventStatus,
  GroupCalendarEventType,
  MeetingFrequency,
  MeetingWeekParity,
} from "@/types/enums";

// Canonical day names mapped to JS Date.getDay() (0 = Sunday).
const DAY_INDEX: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

export type GroupSchedule = {
  meetingDay: string | null;
  meetingTime: string | null;
  meetingFrequency: MeetingFrequency;
  meetingWeekParity: MeetingWeekParity | null;
};

export type GeneratedOccurrence = {
  date: string; // YYYY-MM-DD (church-local calendar date)
  meetingTime: string; // group's meeting_time normalized to HH:mm
  isMeetingOccurrence: true;
};

export type SavedOverride = {
  id: string;
  date: string;
  eventType: GroupCalendarEventType;
  status: GroupCalendarEventStatus;
  title: string | null;
  description: string | null;
};

export type ResolvedOccurrence = {
  date: string;
  // meetingTime is always derived from the group's schedule. For special
  // one-off rows on non-meeting dates with no group meeting_time set, it
  // can be null (no time to render).
  meetingTime: string | null;
  // True when this occurrence was generated from the schedule (or has an
  // override on a generated date). False for special one-off rows on
  // non-meeting dates.
  isMeetingOccurrence: boolean;
  eventType: GroupCalendarEventType;
  status: GroupCalendarEventStatus;
  title: string | null;
  description: string | null;
  // null = pure generated default; non-null = the date has a saved row.
  overrideId: string | null;
};

// ---------------------------------------------------------------------------
// Church-local date helpers.
// ---------------------------------------------------------------------------

const CHURCH_YMD_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: CHURCH_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function todayChurchIso(now: Date = new Date()): string {
  return CHURCH_YMD_FMT.format(now);
}

// Returns YYYY-MM for the church-local month containing `d`.
export function churchMonthIso(d: Date = new Date()): string {
  return todayChurchIso(d).slice(0, 7);
}

function parseMonthIso(monthIso: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(monthIso);
  if (!match) return null;
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  if (!Number.isFinite(year) || month < 1 || month > 12) return null;
  return { year, month };
}

export function shiftMonthIso(monthIso: string, delta: number): string | null {
  const parsed = parseMonthIso(monthIso);
  if (!parsed) return null;
  const total = parsed.year * 12 + (parsed.month - 1) + delta;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

const MONTH_NAMES_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function monthLabel(monthIso: string): string {
  const parsed = parseMonthIso(monthIso);
  if (!parsed) return monthIso;
  return `${MONTH_NAMES_LONG[parsed.month - 1]} ${parsed.year}`;
}

// First and last calendar day of a YYYY-MM month, as YYYY-MM-DD.
export function monthBounds(monthIso: string): {
  firstIso: string;
  lastIso: string;
} | null {
  const parsed = parseMonthIso(monthIso);
  if (!parsed) return null;
  const first = new Date(Date.UTC(parsed.year, parsed.month - 1, 1));
  const last = new Date(Date.UTC(parsed.year, parsed.month, 0));
  return {
    firstIso: first.toISOString().slice(0, 10),
    lastIso: last.toISOString().slice(0, 10),
  };
}

function addDaysIso(iso: string, days: number): string {
  const anchor = new Date(`${iso}T00:00:00Z`);
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return anchor.toISOString().slice(0, 10);
}

function dayOfWeekIso(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

// Normalize "HH:mm:ss" (Postgres `time`) or "HH:mm" to "HH:mm". Returns
// null when the input is unparseable.
export function normalizeHhMm(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  return `${match[1]}:${match[2]}`;
}

// "Saturday, May 16" — friendly date label, anchored to UTC parse to
// avoid runtime-timezone drift on calendar dates.
const DATE_LABEL_FMT = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

export function dateLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return DATE_LABEL_FMT.format(d);
}

// "Sat 16" — short date label for grid cells.
const DATE_SHORT_FMT = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  timeZone: "UTC",
});

export function dayNumberLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return DATE_SHORT_FMT.format(d);
}

// "6:00 PM" — friendly clock label from a normalized HH:mm.
export function formatClock(hhmm: string | null): string | null {
  const normalized = normalizeHhMm(hhmm);
  if (!normalized) return null;
  const [h, m] = normalized.split(":");
  const hour = Number.parseInt(h, 10);
  const minute = Number.parseInt(m, 10);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  const suffix = hour >= 12 ? "PM" : "AM";
  const display = ((hour + 11) % 12) + 1;
  const minuteStr = minute === 0 ? "" : `:${String(minute).padStart(2, "0")}`;
  return `${display}${minuteStr} ${suffix}`;
}

// ---------------------------------------------------------------------------
// Occurrence generation.
// ---------------------------------------------------------------------------

// Returns true when a group is scheduled to meet on the given date,
// based on cadence + parity. Mirrors lib/admin/check-in-due.ts's
// `groupMeetsInWeek` logic but operates on a single date so the
// generator can iterate day-by-day.
//
// Monthly groups: simplification — meet on the *first* occurrence of
// meeting_day within the calendar month. Future enhancement could
// support "second Saturday" / specific day-of-month if the schedule
// schema is extended.
function groupMeetsOnDate(
  schedule: GroupSchedule,
  iso: string,
  meetingDayIndex: number,
): boolean {
  if (dayOfWeekIso(iso) !== meetingDayIndex) return false;
  if (schedule.meetingFrequency === "weekly") return true;
  if (schedule.meetingFrequency === "biweekly") {
    const week = isoWeekNumberOf(iso);
    if (week == null) return true; // unparseable — surface a meeting rather than hide
    const isOdd = week % 2 === 1;
    if (schedule.meetingWeekParity === "odd") return isOdd;
    if (schedule.meetingWeekParity === "even") return !isOdd;
    // parity not set: surface every matching weekday so the gap is
    // visible; the page renders a "parity not set" warning separately.
    return true;
  }
  // monthly
  const anchor = new Date(`${iso}T00:00:00Z`);
  const dayOfMonth = anchor.getUTCDate();
  return dayOfMonth <= 7; // first matching weekday within the first calendar week
}

export function generateMonthOccurrences(
  schedule: GroupSchedule,
  monthIso: string,
): GeneratedOccurrence[] {
  const bounds = monthBounds(monthIso);
  if (!bounds) return [];
  return generateOccurrencesInRange(schedule, bounds.firstIso, bounds.lastIso);
}

// Generate cadence-driven occurrences for any [fromIso, toIso] date
// range (inclusive). Used by the monthly calendar grid (via
// `generateMonthOccurrences`) and by the leader dashboard's upcoming-
// events strip, which needs occurrences over the next 8 weeks so default
// meetings show up even when no override row has been saved.
export function generateOccurrencesInRange(
  schedule: GroupSchedule,
  fromIso: string,
  toIso: string,
): GeneratedOccurrence[] {
  if (!schedule.meetingDay || !schedule.meetingTime) return [];
  const dayIndex = DAY_INDEX[schedule.meetingDay];
  if (dayIndex == null) return [];
  const meetingTime = normalizeHhMm(schedule.meetingTime);
  if (!meetingTime) return [];
  if (fromIso > toIso) return [];

  const occurrences: GeneratedOccurrence[] = [];
  let cursor = fromIso;
  while (cursor <= toIso) {
    if (groupMeetsOnDate(schedule, cursor, dayIndex)) {
      occurrences.push({
        date: cursor,
        meetingTime,
        isMeetingOccurrence: true,
      });
    }
    cursor = addDaysIso(cursor, 1);
  }
  return occurrences;
}

// Merge generated occurrences with saved override rows. Saved rows on a
// generated date override the gathering type / status / title /
// description; meeting_time always comes from the group schedule.
// Saved rows on a non-generated date become special one-off
// occurrences. Archived rows are filtered out before this function
// runs (the caller fetches active-only).
export function mergeOverrides(
  generated: GeneratedOccurrence[],
  saved: SavedOverride[],
  groupMeetingTime: string | null,
): ResolvedOccurrence[] {
  const normalizedGroupTime = normalizeHhMm(groupMeetingTime);
  const generatedByDate = new Map<string, GeneratedOccurrence>();
  for (const g of generated) generatedByDate.set(g.date, g);

  const savedByDate = new Map<string, SavedOverride>();
  for (const s of saved) savedByDate.set(s.date, s);

  const dates = new Set<string>([
    ...generatedByDate.keys(),
    ...savedByDate.keys(),
  ]);
  const sortedDates = Array.from(dates).sort();
  return sortedDates.map((date) => {
    const gen = generatedByDate.get(date);
    const override = savedByDate.get(date);
    if (gen && override) {
      return {
        date,
        meetingTime: gen.meetingTime,
        isMeetingOccurrence: true,
        eventType: override.eventType,
        status: override.status,
        title: override.title,
        description: override.description,
        overrideId: override.id,
      };
    }
    if (gen) {
      return {
        date,
        meetingTime: gen.meetingTime,
        isMeetingOccurrence: true,
        // Default occurrence: assume a Study unless a leader says
        // otherwise. The product team can revisit "what is the default
        // gathering type per group" in a later phase; "Study" matches
        // the table default and the most common rotation slot.
        eventType: "study",
        status: "scheduled",
        title: null,
        description: null,
        overrideId: null,
      };
    }
    // Special one-off date with no generated occurrence on it. Time is
    // inherited from the group schedule too -- per spec, the calendar
    // editor never sets a per-event time.
    return {
      date,
      meetingTime: normalizedGroupTime,
      isMeetingOccurrence: false,
      eventType: override!.eventType,
      status: override!.status,
      title: override!.title,
      description: override!.description,
      overrideId: override!.id,
    };
  });
}

// Helper to map a GroupCalendarEventsRow into the lean SavedOverride
// shape consumed by mergeOverrides. Skips archived rows.
export function toSavedOverrides(
  rows: ReadonlyArray<GroupCalendarEventsRow>,
): SavedOverride[] {
  return rows
    .filter((r) => r.archived_at == null)
    .map((r) => ({
      id: r.id,
      date: r.event_date,
      eventType: r.event_type,
      status: r.status,
      title: r.title,
      description: r.description,
    }));
}

// ---------------------------------------------------------------------------
// Grid layout helpers.
// ---------------------------------------------------------------------------

export type GridCell = {
  date: string; // YYYY-MM-DD
  inMonth: boolean;
  isToday: boolean;
};

// Returns a 6-week grid (always 42 cells) for the given month. Leading
// cells fill in from the previous month so the first row starts on
// Sunday; trailing cells fill in from the next month. inMonth=false
// cells are rendered greyed-out by the grid component.
export function gridCellsForMonth(
  monthIso: string,
  todayIso: string,
): GridCell[] {
  const bounds = monthBounds(monthIso);
  if (!bounds) return [];
  const firstDow = dayOfWeekIso(bounds.firstIso);
  const start = addDaysIso(bounds.firstIso, -firstDow);
  const cells: GridCell[] = [];
  let cursor = start;
  for (let i = 0; i < 42; i++) {
    cells.push({
      date: cursor,
      inMonth: cursor >= bounds.firstIso && cursor <= bounds.lastIso,
      isToday: cursor === todayIso,
    });
    cursor = addDaysIso(cursor, 1);
  }
  return cells;
}

export const WEEKDAY_HEADERS: ReadonlyArray<string> = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
];
