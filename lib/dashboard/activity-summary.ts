import type { fetchOverviewActivityCounts } from "@/lib/supabase/overview-reads";
import type { ReadResult } from "@/lib/supabase/read-core";
import {
  overviewPeriodRange,
  type OverviewGrain,
  type OverviewPeriodRange,
} from "@/lib/admin/overview-period";
import { addDaysIso } from "@/lib/shared/church-time";
import type { OverviewActivitySummary } from "./types";

// The "Recent activity" rollup, extracted from the admin dashboard orchestration
// (#802 follow-up) so it can be read + rendered in its own streamed Suspense
// boundary (RecentActivitySection) instead of gating the above-the-fold paint.
// Pure functions only — exercised directly by a unit test, no Supabase client.

// The later of two ISO date / week-start strings (null = unbounded). Dates are
// YYYY-MM-DD, so lexicographic order is date order. Used to fold the activity-
// reset baseline into the period's lower bound: a reset floors EVERY grain at
// max(period start, baseline), so the band reads zero right after a reset and
// the chosen period can never reach back before it.
export function laterIso(a: string | null, b: string | null): string | null {
  if (a == null) return b;
  if (b == null) return a;
  return a >= b ? a : b;
}

// Resolve the period window + effective lower bound for a grain, folding in the
// activity-reset baseline. The reset must drop the band to zero immediately, so
// the reset DAY itself is excluded: the effective floor is the day AFTER the
// baseline, applied inclusively. baseline_on is a church-local date and the
// tiles span both date columns (launched_on, first_attended_date) and
// timestamptz columns — none of which can distinguish time-of-day against a
// same-day floor — so a whole-day exclusion is the one cutoff that zeroes every
// tile uniformly. The counts read uses `floorIso` so the SQL tiles measure from
// the SAME "as-of" as the TS-side tiles in buildActivitySummary.
export function resolveActivityWindow(
  grain: OverviewGrain,
  now: Date,
  baselineOn: string | null
): { period: OverviewPeriodRange; floorIso: string | null } {
  const period = overviewPeriodRange(grain, now);
  const resetFloorIso = baselineOn ? addDaysIso(baselineOn, 1) : null;
  return { period, floorIso: laterIso(period.fromIso, resetFloorIso) };
}

// "Activity this period" rollup. groupsLaunched + guestsWelcomed are derived
// from the groups / guests reads; the four productivity counts (incl. Prospects
// added, #471) come from fetchOverviewActivityCounts. EVERY tile degrades to
// null on its read's failure so it renders "—", never a false zero — the groups
// and guests reads are now passed as ReadResults (not arrays) so a failed one is
// distinguishable from a genuinely-empty one. Date columns are YYYY-MM-DD, so
// lexicographic comparison against the half-open [floorIso, toExclusiveIso)
// window is correct. `floorIso` is the period start already folded with the
// activity-reset baseline (see resolveActivityWindow); `baselineOn` is surfaced
// raw so the Home control can show "since {date}" / offer Undo.
export function buildActivitySummary(
  period: OverviewPeriodRange,
  floorIso: string | null,
  baselineOn: string | null,
  groupsRes: ReadResult<readonly { launched_on: string | null }[]>,
  guestsRes: ReadResult<readonly { first_attended_date: string | null }[]>,
  activityRes: Awaited<ReturnType<typeof fetchOverviewActivityCounts>>
): OverviewActivitySummary {
  const inRange = (iso: string | null): boolean => {
    if (!iso) return false;
    if (iso >= period.toExclusiveIso) return false;
    if (floorIso && iso < floorIso) return false;
    return true;
  };
  const extended = activityRes.error ? null : activityRes.data;
  return {
    grain: period.grain,
    label: period.label,
    groupsLaunched: groupsRes.error
      ? null
      : (groupsRes.data ?? []).filter((g) => inRange(g.launched_on)).length,
    guestsWelcomed: guestsRes.error
      ? null
      : (guestsRes.data ?? []).filter((g) => inRange(g.first_attended_date))
          .length,
    prospectsAdded: extended ? extended.prospectsAdded : null,
    membersJoined: extended ? extended.membersJoined : null,
    followUpsCompleted: extended ? extended.followUpsCompleted : null,
    careTouchpoints: extended ? extended.careTouchpoints : null,
    extendedAvailable: activityRes.error === null,
    error: activityRes.error?.message ?? null,
    resetBaselineOn: baselineOn,
  };
}
