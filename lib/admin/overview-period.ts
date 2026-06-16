// Period model for the executive overview's "activity this period" band.
// Pure + deterministic (takes `now`) so it unit-tests without a clock. The
// grain drives a [fromIso, toExclusiveIso) window; "all" has no lower bound.
//
// Only the activity band is period-scoped — the vital-signs and domain cards
// are point-in-time (current state) and ignore the grain.

import {
  addDaysIso,
  churchTodayIso,
  isoWeekStart,
} from "@/lib/shared/church-time";

export type OverviewGrain = "all" | "year" | "quarter" | "month" | "week";

// Default-first ordering ("All time" leads): the overview opens on the full
// picture, then the slicer narrows.
export const OVERVIEW_GRAINS: readonly OverviewGrain[] = [
  "all",
  "year",
  "quarter",
  "month",
  "week",
] as const;

const GRAIN_LABEL: Record<OverviewGrain, string> = {
  all: "All time",
  year: "This year",
  quarter: "This quarter",
  month: "This month",
  week: "This week",
};

// Short chip label for the slicer control.
const GRAIN_CHIP: Record<OverviewGrain, string> = {
  all: "All time",
  year: "Year",
  quarter: "Quarter",
  month: "Month",
  week: "Week",
};

export function overviewGrainLabel(grain: OverviewGrain): string {
  return GRAIN_LABEL[grain];
}

export function overviewGrainChip(grain: OverviewGrain): string {
  return GRAIN_CHIP[grain];
}

// Validate an incoming search param to a known grain, defaulting to "all".
export function resolveOverviewGrain(
  param: string | string[] | undefined
): OverviewGrain {
  const value = Array.isArray(param) ? param[0] : param;
  return (OVERVIEW_GRAINS as readonly string[]).includes(value ?? "")
    ? (value as OverviewGrain)
    : "all";
}

export interface OverviewPeriodRange {
  grain: OverviewGrain;
  label: string;
  // Inclusive lower bound (YYYY-MM-DD), or null for all-time (no lower bound).
  fromIso: string | null;
  // Exclusive upper bound (YYYY-MM-DD) = start of tomorrow, so the whole of
  // today is included for both date and timestamp columns.
  toExclusiveIso: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function overviewPeriodRange(
  grain: OverviewGrain,
  now: Date = new Date()
): OverviewPeriodRange {
  // Anchor every boundary to the church-local calendar date (America/Chicago),
  // matching isoWeekStart and the rest of the dashboard. Deriving year/month
  // from the church-local YYYY-MM-DD string avoids the UTC-vs-church rollover
  // window dropping/advancing a day (e.g. 02:00Z is still the previous day in
  // Chicago).
  const todayIso = churchTodayIso(now);
  const year = Number(todayIso.slice(0, 4));
  const monthIndex = Number(todayIso.slice(5, 7)) - 1; // 0-based
  const toExclusiveIso = addDaysIso(todayIso, 1);

  let fromIso: string | null;
  switch (grain) {
    case "all":
      fromIso = null;
      break;
    case "year":
      fromIso = `${year}-01-01`;
      break;
    case "quarter": {
      const quarterStartMonth = Math.floor(monthIndex / 3) * 3; // 0,3,6,9
      fromIso = `${year}-${pad2(quarterStartMonth + 1)}-01`;
      break;
    }
    case "month":
      fromIso = `${year}-${pad2(monthIndex + 1)}-01`;
      break;
    case "week":
      // Reuse the church-week boundary the rest of the dashboard uses.
      fromIso = isoWeekStart(now);
      break;
  }

  return { grain, label: GRAIN_LABEL[grain], fromIso, toExclusiveIso };
}
