// Care cadence (PRD Q5 / ADR 0004 D3, roadmap LDR). Pure module — no DB, no
// I/O. The single source of truth for the per-tier shepherd-care staleness
// model: a shepherd's coverage tier + the date of the last Ministry-Admin
// interaction + the two configured windows -> stale / needs-check-in.
//
// Mirrors lib/admin/group-health.ts / lib/admin/metrics.ts: a tunable config
// (the two windows, decoded from app_settings.metric_defaults) plus pure
// functions a caller feeds bare values, so tests run without a DB.
//
// Coverage tier is DERIVED from existing shepherd_coverage_assignments — there
// is no new per-group field. A shepherd with an active over-shepherd
// assignment is "delegated" (the longer window); otherwise oversight falls
// directly to the Ministry Admin and the shepherd is "directly-overseen" (the
// shorter window).
//
// Clock source — Ministry-Admin interactions only, for now. Over-shepherds
// have no write path yet (#126); when that ships, revisit whether an
// over-shepherd interaction also resets this clock.

export type CoverageTier = "directly_overseen" | "delegated";

export type CareCadenceWindows = {
  // Directly-overseen shepherds fall to the Ministry Admin: shorter window.
  directlyOverseenStaleDays: number;
  // Delegated shepherds have an active over-shepherd assignment: longer window.
  delegatedStaleDays: number;
};

// Proposed defaults (PRD Q5 / ADR 0004 D3): 30 / 60, configurable. Mirrors
// BUILT_IN_METRIC_DEFAULTS.shepherd_care_stale_days_{direct,delegated} — if you
// change one, change the other.
export const BUILT_IN_CARE_CADENCE_WINDOWS: CareCadenceWindows = {
  directlyOverseenStaleDays: 30,
  delegatedStaleDays: 60,
};

/**
 * Derive a shepherd's coverage tier from whether an active over-shepherd
 * assignment covers them. `delegated` when an over-shepherd is on the hook;
 * `directly_overseen` (the default) when oversight falls to the Ministry Admin.
 */
export function coverageTierForShepherd(hasActiveOverShepherd: boolean): CoverageTier {
  return hasActiveOverShepherd ? "delegated" : "directly_overseen";
}

/**
 * The staleness window (in days) for a coverage tier under the given config.
 */
export function staleWindowDaysForTier(
  tier: CoverageTier,
  windows: CareCadenceWindows = BUILT_IN_CARE_CADENCE_WINDOWS,
): number {
  return tier === "delegated"
    ? windows.delegatedStaleDays
    : windows.directlyOverseenStaleDays;
}

// Whole days between two YYYY-MM-DD strings at UTC midnight. Inlined (rather
// than imported from read-models) to keep this module pure and dependency-free;
// it matches lib/supabase/read-models.differenceInDaysIso exactly so the
// per-tier model agrees with the rest of the care date math.
function daysBetweenIso(todayIso: string, thenIso: string): number {
  const a = Date.parse(`${todayIso}T00:00:00Z`);
  const b = Date.parse(`${thenIso}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.POSITIVE_INFINITY;
  return Math.floor((a - b) / 86_400_000);
}

/**
 * "Needs check-in": the last Ministry-Admin interaction is older than the
 * shepherd's tier window. A null last-contact date means no contact has been
 * logged yet, which always needs a check-in. The window is selected from the
 * tier, so a directly-overseen shepherd goes stale sooner than a delegated one.
 */
export function isCareContactStale(args: {
  lastAdminContactIso: string | null;
  todayIso: string;
  tier: CoverageTier;
  windows?: CareCadenceWindows;
}): boolean {
  if (args.lastAdminContactIso === null) return true;
  const window = staleWindowDaysForTier(args.tier, args.windows);
  return daysBetweenIso(args.todayIso, args.lastAdminContactIso) > window;
}
