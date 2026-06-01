// Canonical home for the church's wall-clock and calendar-week
// primitives. The app is a single-tenant deployment for one church, so
// "today", "this month", "this ISO week", and "which week number" are
// all answered against one fixed timezone rather than the server's UTC
// clock or the browser's local zone.
//
// Before this module these primitives were scattered: CHURCH_TIMEZONE
// lived in lib/leader/validation, the church-local YMD formatter was
// duplicated there and in lib/calendar/occurrences, and isoWeekNumberOf
// lived in lib/admin/check-in-due where the calendar generator reached
// *backwards* into check-in logic to borrow it. Both the check-in and
// calendar clusters now depend downward on this one module, and the
// intricate ISO-week + DST-boundary math has a single test surface.

// Single-tenant church deployment: the entire app uses one wall-clock
// timezone for "today" and "this week" computations. Without this, a UTC
// `new Date()` rolls over to Monday during a Sunday-evening Central
// submission and the leader's check-in lands in the wrong ISO week
// (the dashboard would then show "this week" as not submitted even
// though the leader just submitted). Fox Valley Church is in Wisconsin
// (US Central), so we anchor on America/Chicago, which handles CST/CDT
// transitions automatically.
//
// If the app ever goes multi-tenant, this becomes per-org configuration.
export const CHURCH_TIMEZONE = "America/Chicago";

// `Intl.DateTimeFormat` with `en-CA` locale returns ISO `YYYY-MM-DD` form
// and respects the timeZone option exactly. Using "en-CA" instead of
// "en-US" avoids the `MM/DD/YYYY` formatting and gives a stable
// parse-target.
const CHURCH_YMD_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: CHURCH_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// Today's church-local calendar date as YYYY-MM-DD. Replaces the former
// `localTodayIso` (lib/leader/validation) and `todayChurchIso`
// (lib/calendar/occurrences), which were byte-identical.
export function churchTodayIso(now: Date = new Date()): string {
  return CHURCH_YMD_FMT.format(now);
}

// Church-local month as YYYY-MM for the instant `d`.
export function churchMonthIso(d: Date = new Date()): string {
  return churchTodayIso(d).slice(0, 7);
}

// Offset (ms) of CHURCH_TIMEZONE from UTC at `instant`, read from the zone via
// Intl so CST/CDT are handled automatically. Positive when the zone is ahead of
// UTC. (America/Chicago is always behind, so this is negative.)
function churchTzOffsetMs(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CHURCH_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(instant);
  const get = (type: string): number =>
    Number(parts.find((p) => p.type === type)?.value);
  // en-US with hour12:false renders midnight as "24"; normalize to 0.
  const hour = get("hour") % 24;
  const wallAsUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    hour,
    get("minute"),
    get("second")
  );
  return wallAsUtc - instant.getTime();
}

// The UTC instant (ISO string) of 00:00 church-local time on `dateIso`
// (YYYY-MM-DD). Use this to filter timestamptz columns by church-local calendar
// day: a date-only bound compared to a timestamptz is read as UTC midnight,
// which is 5-6h off the church day. Midnight always exists in America/Chicago
// (DST transitions happen at 02:00), so the offset read at the date is exact.
export function churchDayStartUtcIso(dateIso: string): string {
  const naiveUtc = new Date(`${dateIso}T00:00:00Z`).getTime();
  const offsetMs = churchTzOffsetMs(new Date(naiveUtc));
  return new Date(naiveUtc - offsetMs).toISOString();
}

// Returns the Monday-of-ISO-week as YYYY-MM-DD for the given input.
//
// When passed a Date, the date is first projected into CHURCH_TIMEZONE so
// the day-of-week reflects the church's local calendar. When passed a
// YYYY-MM-DD string, the string is treated as a pure calendar date (no
// timezone) and the Monday-offset math runs directly on it -- this is
// what we want when a leader picks a meeting_date in the form.
export function isoWeekStart(date: Date | string): string {
  const dateIso =
    typeof date === "string" ? date.slice(0, 10) : churchTodayIso(date);
  // Anchoring on UTC midnight here is safe: dateIso is already a fixed
  // calendar date, and getUTCDay returns the same weekday regardless of
  // the runtime's local timezone.
  const anchor = new Date(`${dateIso}T00:00:00Z`);
  const dayOfWeek = anchor.getUTCDay();
  const mondayOffset = (dayOfWeek + 6) % 7;
  anchor.setUTCDate(anchor.getUTCDate() - mondayOffset);
  return anchor.toISOString().slice(0, 10);
}

// ISO week number (1..53) for any YYYY-MM-DD date. Works on a Monday
// (the cadence check `groupMeetsInWeek` passes the Monday-of-week per
// `isoWeekStart`) as well as on arbitrary calendar dates (used by the
// occurrence generator in `lib/calendar/occurrences.ts` when iterating
// day-by-day). One implementation keeps the calendar generator and the
// check-in cadence check aligned on the same week numbering.
export function isoWeekNumberOf(meetingWeekIso: string): number | null {
  const anchor = new Date(`${meetingWeekIso}T00:00:00Z`);
  if (Number.isNaN(anchor.getTime())) return null;
  // Standard ISO week calculation: nearest Thursday is in the right year,
  // then count weeks from that year's first Thursday.
  const d = new Date(
    Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate())
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

// Canonical day-of-week name → JS `Date.getDay()` / `getUTCDay()` index
// (Sunday = 0). Resolving a group's scheduled meeting day against the
// church week is shared between calendar occurrence generation
// (lib/calendar/occurrences) and check-in due-date math
// (lib/admin/check-in-due), which previously each held a byte-identical
// copy of this map.
export const DAY_INDEX: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};
