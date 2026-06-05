// Ministry Year — pure date util. No I/O, no Supabase. ADR 0018 / CONTEXT.md:
// health grades are tracked within the current Ministry Year, which runs
// **August through May**. June and July are OFF — they fall outside any ministry
// year (the summer break), so a date in Jun/Jul belongs to no ministry year.
//
// A ministry year is named by the calendar year of its August start: the
// 2025 ministry year spans Aug 2025 → May 2026. So Sep 2025 and Feb 2026 are
// both in ministry year 2025; Jul 2025 is in none.

// The result of locating a date in the ministry-year calendar.
//   * { year }          — the date is in that ministry year (Aug–May).
//   * { year: null }    — the date is in the Jun/Jul off-season (no year).
export type MinistryYearOf = {
  // The ministry year (its August start's calendar year), or null in Jun/Jul.
  year: number | null;
};

// The inclusive month range that makes up a ministry year, by 0-based month
// index: August (7) through December (11), then January (0) through May (4).
// June (5) and July (6) are deliberately absent — the off-season.
const AUGUST = 7;
const MAY = 4;

// Locate a date in the ministry-year calendar. Returns { year } for Aug–May
// (the August-start calendar year), or { year: null } for the Jun/Jul break.
//
// Aug–Dec belong to the ministry year named by THAT calendar year; Jan–May
// belong to the ministry year named by the PREVIOUS calendar year (the August
// that started the span). The year boundary is therefore Aug 1, not Jan 1.
export function ministryYearOf(date: Date): MinistryYearOf {
  const month = date.getUTCMonth();
  const calendarYear = date.getUTCFullYear();

  // Off-season: June (5) and July (6) belong to no ministry year.
  if (month > MAY && month < AUGUST) {
    return { year: null };
  }

  // Aug–Dec: this calendar year's ministry year. Jan–May: the prior year's.
  return { year: month >= AUGUST ? calendarYear : calendarYear - 1 };
}

// Whether `date` falls inside ministry year `year` (its Aug → following May
// span). A Jun/Jul date is in no ministry year, so this is always false for it.
export function isInMinistryYear(date: Date, year: number): boolean {
  const located = ministryYearOf(date);
  return located.year === year;
}
