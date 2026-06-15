// The Care needs-contact resolver (issue #636, slice 1). One deep module that
// owns the full "does this Leader need contact?" waterfall, so the three surfaces
// that ask the question — the Care tab, the People management tab, and the
// person-detail page — answer it identically by construction.
//
// Before this module the assembly (resolve the cadence windows + the active-
// coverage set + the care attention-reset baselines, then read the shepherd-care
// directory with all three applied) was copied three ways, and the copies had
// drifted: Care applied the "care" baselines so a freshly-contacted Leader drops
// off its queue, but People and person-detail omitted the baselines and kept
// flagging Leaders that Care had already cleared. Both carried comments promising
// they "never disagree" with Care; they did. This resolver is now the single
// place the rule lives — fix or extend it once and all three surfaces inherit it.
//
// Pure in the reads seam (ADR 0015): production binds the live client through a
// surface adapter; a test binds an in-memory adapter satisfying the same
// interface. Each surface keeps its own seam adapter and maps its directory
// reader onto this module's one consistent name (`fetchCareDirectory`).

import type { OmitClient } from "@/lib/supabase/reads-seam";
import type { ReadResult } from "@/lib/supabase/read-core";
import {
  fetchActiveShepherdCoverageAssignmentsForAdmin,
  fetchShepherdCareDirectoryForAdmin,
  type ActiveShepherdCoverageAssignmentSummary,
  type ShepherdCareDirectoryEntry,
} from "@/lib/supabase/read-models";
import { fetchMetricDefaultsCached } from "@/lib/supabase/cached-config";
import { fetchAttentionResetBaselines } from "@/lib/supabase/maintenance-reads";
import {
  buildSurfaceBaselines,
  type AttentionBaselines,
} from "@/lib/admin/attention-reset";
import {
  careCadenceWindowsFromDefaults,
  decodeMetricDefaults,
} from "@/lib/admin/metrics";
import type { CareCadenceWindows } from "@/lib/admin/shepherd-care-cadence";

// The subset of reads the waterfall needs. The Care surface and the
// People/detail surfaces bind the same underlying admin directory read under
// different seam names (`fetchCareDirectory` vs `fetchShepherdCareDirectory`);
// each maps onto this single name when it calls the resolver.
export type CareNeedsContactReads = {
  fetchActiveAssignments: OmitClient<
    typeof fetchActiveShepherdCoverageAssignmentsForAdmin
  >;
  fetchMetricDefaults: OmitClient<typeof fetchMetricDefaultsCached>;
  fetchAttentionBaselines: OmitClient<typeof fetchAttentionResetBaselines>;
  fetchCareDirectory: OmitClient<typeof fetchShepherdCareDirectoryForAdmin>;
};

// What the resolver returns: the directory read result (with the "care"
// baselines applied), plus the windows + baselines + active-coverage it resolved
// on the way, so the Care surface can reuse them without re-reading.
export type CareNeedsContactResolution = {
  // The shepherd-care directory entries with needs_attention computed under the
  // resolved windows, delegated-shepherd set, and care baselines. Carries the
  // ReadResult so each caller applies its own degrade rule on a failed read.
  directory: ReadResult<ShepherdCareDirectoryEntry[]>;
  // The resolved cadence windows (direct vs delegated staleness days).
  windows: CareCadenceWindows;
  // The "care" surface attention-reset baselines (floors a Leader's last-contact
  // date). A failed baselines read degrades to "no baselines", never fails.
  baselines: AttentionBaselines;
  // The active coverage assignments, surfaced so the Care tab can reuse them.
  assignments: ActiveShepherdCoverageAssignmentSummary[];
  // Whether the active-coverage read succeeded — a failed coverage read
  // suppresses coverage-derived output rather than reporting a false zero.
  assignmentsAvailable: boolean;
  // The active-coverage / metric-defaults read error messages (or null),
  // surfaced so a caller that aggregates a page-level error string (the Care
  // tab) keeps reporting them. The baselines read degrades silently and is not
  // surfaced here.
  assignmentsError: string | null;
  metricDefaultsError: string | null;
};

// Resolve the needs-contact directory: batch the independent feeds (active
// coverage, metric defaults, baselines), derive the windows + delegated-shepherd
// set + "care" baselines, then waterfall the directory read with all three
// applied. The directory is the one read that depends on the others, so it
// cannot join the parallel batch.
//
// Degrade rules (preserved from the Care surface): a failed coverage read leaves
// `delegatedShepherdIds` undefined (the conservative longer window) rather than
// reporting a false zero; a failed baselines read degrades to "no baselines"
// (today's behaviour) instead of failing the page; the directory ReadResult is
// returned as-is so the caller decides how a failed directory read degrades.
export async function resolveCareNeedsContact(
  reads: CareNeedsContactReads,
  options: { todayIso: string }
): Promise<CareNeedsContactResolution> {
  const [assignmentsRes, metricDefaultsRes, attentionBaselinesRes] =
    await Promise.all([
      reads.fetchActiveAssignments(),
      reads.fetchMetricDefaults(),
      reads.fetchAttentionBaselines(),
    ]);

  const windows = careCadenceWindowsFromDefaults(
    decodeMetricDefaults(metricDefaultsRes.data ?? null)
  );
  const delegatedShepherdIds = assignmentsRes.error
    ? undefined
    : new Set((assignmentsRes.data ?? []).map((a) => a.shepherd_profile_id));
  const baselines = buildSurfaceBaselines(
    attentionBaselinesRes.data ?? [],
    "care"
  );

  const directory = await reads.fetchCareDirectory({
    todayIso: options.todayIso,
    windows,
    delegatedShepherdIds,
    baselines,
  });

  return {
    directory,
    windows,
    baselines,
    assignments: assignmentsRes.data ?? [],
    assignmentsAvailable: assignmentsRes.error === null,
    assignmentsError: assignmentsRes.error?.message ?? null,
    metricDefaultsError: metricDefaultsRes.error?.message ?? null,
  };
}

// Derive the People tab's needs-attention profile-id set from a resolved
// directory: the Leaders the directory flags. A failed directory read yields an
// empty set (rows fall back to "No current concerns") — the indicator is
// glanceable context, not a gate.
export function needsContactProfileIds(
  resolution: CareNeedsContactResolution
): Set<string> {
  const { directory } = resolution;
  if (directory.error || !directory.data) return new Set();
  return new Set(
    directory.data.filter((e) => e.needs_attention).map((e) => e.profile.id)
  );
}

// Narrow a resolved directory to a single Leader's needs-attention boolean.
// Fails closed to false (no false "needs contact") when the directory read
// failed.
export function profileNeedsContact(
  resolution: CareNeedsContactResolution,
  profileId: string
): boolean {
  const { directory } = resolution;
  if (directory.error || !directory.data) return false;
  return directory.data.some(
    (e) => e.profile.id === profileId && e.needs_attention
  );
}
