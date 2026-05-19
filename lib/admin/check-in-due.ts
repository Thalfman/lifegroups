// Phase 5A.5: shared check-in due-date logic.
//
// Each group's check-in is due `offset_hours` after that group's
// scheduled meeting day + meeting time. The offset comes from the
// global metric_defaults.check_in_due_offset_hours, optionally
// overridden per group via group_metric_settings.check_in_due_offset_hours_override.
//
// Putting the calculation here keeps admin dashboard, the leader
// check-in screen, and the admin check-ins review aligned -- no
// component recomputes "due" with its own date math.

import { CHURCH_TIMEZONE } from "@/lib/leader/validation";
import {
  effectiveCheckInDueOffsetHours,
  type MetricDefaults,
} from "@/lib/admin/metrics";
import type { GroupMetricSettingsRow } from "@/types/database";

// Canonical Sunday-Saturday names map to JS Date.getDay() (0 = Sunday).
const DAY_INDEX: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

const TIME_RE = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

function parseMeetingTime(value: string | null): { hour: number; minute: number } | null {
  if (!value) return null;
  const match = TIME_RE.exec(value);
  if (!match) return null;
  const hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2], 10);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 23) return null;
  if (minute < 0 || minute > 59) return null;
  return { hour, minute };
}

// All church-local date math here uses the church timezone for the
// day/clock components -- the absolute Date instance returned is the
// nearest matching UTC instant we can derive without a full timezone
// library. Single-tenant US Central deployment: small DST drift around
// transitions is acceptable for "due 24 hours after the meeting"
// messaging, which doesn't need second-level precision.

const CHURCH_DATE_PARTS_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: CHURCH_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

type ChurchClockParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  // 0 = Sunday, 6 = Saturday
  dayOfWeek: number;
};

function churchClockParts(d: Date): ChurchClockParts {
  const parts = CHURCH_DATE_PARTS_FMT.formatToParts(d);
  const out: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") out[p.type] = p.value;
  }
  const year = Number.parseInt(out.year ?? "0", 10);
  const month = Number.parseInt(out.month ?? "0", 10);
  const day = Number.parseInt(out.day ?? "0", 10);
  const hour24Raw = out.hour ?? "0";
  // en-CA hour12=false can emit "24" for midnight; normalize.
  const hour = (Number.parseInt(hour24Raw, 10) % 24) | 0;
  const minute = Number.parseInt(out.minute ?? "0", 10);
  // Determine day-of-week using the church-local calendar date (UTC anchor
  // of that ymd is safe because we only need weekday math).
  const yearStr = String(year).padStart(4, "0");
  const monthStr = String(month).padStart(2, "0");
  const dayStr = String(day).padStart(2, "0");
  const anchor = new Date(`${yearStr}-${monthStr}-${dayStr}T00:00:00Z`);
  const dayOfWeek = anchor.getUTCDay();
  return { year, month, day, hour, minute, dayOfWeek };
}

// Returns total minutes-since-epoch as if church-local wall-clock were
// the universal clock. Used for relative arithmetic where DST drift
// inside a 24-48h window is acceptable.
function churchWallClockMinutes(d: Date): number {
  const p = churchClockParts(d);
  return ymdHmToMinutes(p.year, p.month, p.day, p.hour, p.minute);
}

function ymdHmToMinutes(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): number {
  // Construct a fake UTC instant and use it as a stable
  // wall-clock-minutes value. The absolute number is meaningless --
  // only differences between two values matter.
  const yearStr = String(year).padStart(4, "0");
  const monthStr = String(month).padStart(2, "0");
  const dayStr = String(day).padStart(2, "0");
  const hourStr = String(hour).padStart(2, "0");
  const minuteStr = String(minute).padStart(2, "0");
  const t = Date.parse(`${yearStr}-${monthStr}-${dayStr}T${hourStr}:${minuteStr}:00Z`);
  return Math.round(t / 60000);
}

// Find the most recent church-local meeting instant relative to `now`:
// the closest past (or present) occurrence of `targetDay` at the given
// hour/minute. Returns a (year, month, day, hour, minute) tuple in
// church-local terms.
function lastMeetingChurchLocal(
  nowParts: ChurchClockParts,
  targetDay: number,
  meetingHour: number,
  meetingMinute: number,
): ChurchClockParts {
  // Days-since-Sunday delta to walk back to the target day.
  let daysBack = (nowParts.dayOfWeek - targetDay + 7) % 7;
  // If we're on the meeting day, only treat it as today if the meeting
  // time has already passed; otherwise the most recent meeting is a
  // week earlier.
  if (daysBack === 0) {
    const meetingMinutes = meetingHour * 60 + meetingMinute;
    const nowMinutes = nowParts.hour * 60 + nowParts.minute;
    if (nowMinutes < meetingMinutes) {
      daysBack = 7;
    }
  }
  // Walk back `daysBack` church-local calendar days.
  const yearStr = String(nowParts.year).padStart(4, "0");
  const monthStr = String(nowParts.month).padStart(2, "0");
  const dayStr = String(nowParts.day).padStart(2, "0");
  const anchor = new Date(`${yearStr}-${monthStr}-${dayStr}T00:00:00Z`);
  anchor.setUTCDate(anchor.getUTCDate() - daysBack);
  return {
    year: anchor.getUTCFullYear(),
    month: anchor.getUTCMonth() + 1,
    day: anchor.getUTCDate(),
    hour: meetingHour,
    minute: meetingMinute,
    dayOfWeek: targetDay,
  };
}

export type CheckInDueInput = {
  meetingDay: string | null;
  meetingTime: string | null; // "HH:mm" or "HH:mm:ss"
};

export type CheckInDueResult = {
  // Church-local wall-clock parts for the next "due" instant. Null when
  // we don't have enough information.
  due: ChurchClockParts | null;
  // The hours offset that was applied (for display).
  offsetHours: number;
  // True if the current moment is at or past the due instant
  // (compared in church-local wall-clock minutes).
  isOverdue: boolean;
  // Minutes between now and the due instant (positive = future,
  // negative = past). 0 when due is null.
  minutesUntilDue: number;
};

export function computeCheckInDue(args: {
  group: CheckInDueInput;
  override:
    | Pick<GroupMetricSettingsRow, "check_in_due_offset_hours_override">
    | null;
  defaults: MetricDefaults;
  now?: Date;
}): CheckInDueResult {
  const offsetHours = effectiveCheckInDueOffsetHours(
    args.override,
    args.defaults,
  );
  const now = args.now ?? new Date();
  const dayName = args.group.meetingDay?.trim() ?? "";
  const timeParts = parseMeetingTime(args.group.meetingTime);
  if (!(dayName in DAY_INDEX) || !timeParts) {
    return {
      due: null,
      offsetHours,
      isOverdue: false,
      minutesUntilDue: 0,
    };
  }
  const nowParts = churchClockParts(now);
  const meeting = lastMeetingChurchLocal(
    nowParts,
    DAY_INDEX[dayName],
    timeParts.hour,
    timeParts.minute,
  );
  const meetingMinutes = ymdHmToMinutes(
    meeting.year,
    meeting.month,
    meeting.day,
    meeting.hour,
    meeting.minute,
  );
  const dueMinutes = meetingMinutes + offsetHours * 60;
  const nowMinutes = churchWallClockMinutes(now);
  const minutesUntilDue = dueMinutes - nowMinutes;
  // Reconstruct due wall-clock parts by adding offsetHours to the meeting
  // wall-clock value.
  const dueParts = addMinutesToChurchClock(meeting, offsetHours * 60);
  return {
    due: dueParts,
    offsetHours,
    isOverdue: minutesUntilDue <= 0,
    minutesUntilDue,
  };
}

function addMinutesToChurchClock(
  parts: ChurchClockParts,
  minutes: number,
): ChurchClockParts {
  const yearStr = String(parts.year).padStart(4, "0");
  const monthStr = String(parts.month).padStart(2, "0");
  const dayStr = String(parts.day).padStart(2, "0");
  const hourStr = String(parts.hour).padStart(2, "0");
  const minuteStr = String(parts.minute).padStart(2, "0");
  const anchor = new Date(
    `${yearStr}-${monthStr}-${dayStr}T${hourStr}:${minuteStr}:00Z`,
  );
  anchor.setUTCMinutes(anchor.getUTCMinutes() + minutes);
  return {
    year: anchor.getUTCFullYear(),
    month: anchor.getUTCMonth() + 1,
    day: anchor.getUTCDate(),
    hour: anchor.getUTCHours(),
    minute: anchor.getUTCMinutes(),
    dayOfWeek: anchor.getUTCDay(),
  };
}

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const MONTH_NAMES_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatHourMinute(hour: number, minute: number): string {
  const suffix = hour >= 12 ? "PM" : "AM";
  const display = ((hour + 11) % 12) + 1;
  const minuteStr = minute === 0 ? "" : `:${String(minute).padStart(2, "0")}`;
  return `${display}${minuteStr} ${suffix}`;
}

// "Monday, May 19 at 6:00 PM" — friendly label.
export function formatCheckInDueLabel(due: ChurchClockParts | null): string | null {
  if (!due) return null;
  const dayName = DAY_NAMES[due.dayOfWeek] ?? "";
  const month = MONTH_NAMES_SHORT[(due.month - 1) % 12] ?? "";
  return `${dayName}, ${month} ${due.day} at ${formatHourMinute(due.hour, due.minute)}`;
}

// "due in 4h" / "due 2h ago"
export function formatCheckInDueRelative(
  result: { minutesUntilDue: number; due: ChurchClockParts | null },
): string | null {
  if (!result.due) return null;
  const minutes = result.minutesUntilDue;
  const past = minutes < 0;
  const abs = Math.abs(minutes);
  if (abs < 60) {
    if (past) return `due ${abs}m ago`;
    return `due in ${abs}m`;
  }
  const hours = Math.round(abs / 60);
  if (hours < 48) {
    if (past) return `due ${hours}h ago`;
    return `due in ${hours}h`;
  }
  const days = Math.round(hours / 24);
  if (past) return `due ${days}d ago`;
  return `due in ${days}d`;
}
