import "server-only";

// The Over-Shepherd landing page's read-orchestration, as a pure function of
// a reads seam (ADR 0015 — this surface and the Leader landing were the two
// login tiers the admin-focused migration never reached; 2026-07-06 review
// candidate 3). Production binds the live client through
// `bindOverShepherdReads`; a test binds an in-memory adapter satisfying the
// same interface. Two adapters, one seam.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { measureReadBundle } from "@/lib/observability/read-timing";
import {
  bindOverShepherdReads,
  type OverShepherdReads,
} from "@/lib/over-shepherd/over-shepherd-reads";
import type { ShepherdCareDirectoryEntry } from "@/lib/supabase/shepherd-care-directory-reads";
import {
  careCadenceWindowsFromDefaults,
  decodeMetricDefaults,
} from "@/lib/admin/metrics";
import { churchTodayIso } from "@/lib/shared/church-time";

// The subset of the surface's seam this page needs (ADR 0015: per-surface
// interfaces, not one god-interface — and per-page subsets of those).
export type OverShepherdLandingReads = Pick<
  OverShepherdReads,
  | "fetchOverShepherdCoverageForCaller"
  | "readFirstRunOrientationSeen"
  | "fetchMetricDefaultsCached"
  | "fetchOverShepherdCareDirectory"
>;

// The page switches on `kind` and keeps the effects to itself: `no_access`
// becomes redirect("/unauthorized") (redirect() throws, so it must stay in
// the Server Component), `unavailable` becomes the controlled empty state.
export type OverShepherdData =
  | {
      kind: "ok";
      entries: ShepherdCareDirectoryEntry[];
      orientationSeen: boolean;
      lede: string;
    }
  | { kind: "no_access" }
  | { kind: "unavailable" };

export async function buildOverShepherdData(
  reads: OverShepherdLandingReads,
  options: { todayIso?: string } = {}
): Promise<OverShepherdData> {
  // The first-run "seen" flag (#560) is independent of the coverage read, so
  // fetch them in parallel rather than serially on first paint. A failed
  // orientation read degrades to "seen" (inside the helper) so the card never
  // nags on a flaky load.
  const [orientationSeen, coverageResult] = await Promise.all([
    reads.readFirstRunOrientationSeen(),
    reads.fetchOverShepherdCoverageForCaller(),
  ]);

  // Either backend read failing — surface one controlled empty state rather
  // than leaking a 500.
  if (coverageResult.error) return { kind: "unavailable" };

  // Bridge contract (fetchOverShepherdCoverageForCaller): a null payload with
  // no error means no-access — the caller's profile resolved to zero or an
  // ambiguous (>1) active roster row. That is NOT an over_shepherd with an
  // empty assignment list (which resolves to { coveredShepherdIds: [] }), so
  // deny the surface rather than masking a broken/ambiguous email bridge as a
  // benign "no Shepherds assigned" page (Codex #5).
  const coverage = coverageResult.data;
  if (coverage === null) return { kind: "no_access" };
  const coveredIds = coverage.coveredShepherdIds;

  // Honor the admin-configured delegated staleness window so this directory's
  // needs_attention agrees with the admin surfaces (#123). Every covered
  // Shepherd is delegated by definition, so only the delegated window matters;
  // a missing/failed settings read falls back to the documented baseline.
  const metricDefaultsRes = await reads.fetchMetricDefaultsCached();
  const windows = careCadenceWindowsFromDefaults(
    decodeMetricDefaults(metricDefaultsRes.data ?? null)
  );

  const directoryResult = await reads.fetchOverShepherdCareDirectory(
    coveredIds,
    { windows, todayIso: options.todayIso }
  );

  if (directoryResult.error) return { kind: "unavailable" };

  const entries = directoryResult.data;
  const lede =
    entries.length === 0
      ? "No Shepherds are assigned to your care yet. A ministry admin will route coverage your way."
      : "The Shepherds you cover, with their current care status.";

  return { kind: "ok", entries, orientationSeen, lede };
}

// Production wrapper: bind the live client (or degrade to the same
// `unavailable` arm a failed coverage read produces today when Supabase env
// is absent) and time the bundle. Resolve one church-local business date per
// request and thread it through the directory assembly.
export async function loadOverShepherdData(): Promise<OverShepherdData> {
  const client = await createSupabaseServerClient();
  if (!client) return { kind: "unavailable" };
  return measureReadBundle(
    "over_shepherd_landing",
    () =>
      buildOverShepherdData(bindOverShepherdReads(client), {
        todayIso: churchTodayIso(),
      }),
    (result) => ({ result_kind: result.kind })
  );
}
