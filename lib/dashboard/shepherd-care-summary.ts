// The Care headline-card rule: fold the shepherd-care directory + coverage
// reads into the dashboard's ShepherdCareDashboardSummary. Extracted from
// lib/dashboard/queries.ts so the live assembler and the no-client demo
// fallback (lib/dashboard/fallback-data.ts) derive the summary from the SAME
// rule — the fallback feeds demo-seed reads through this function instead of
// hardcoding counts that drift when the rule changes.

import type { ReadResult } from "@/lib/supabase/read-core";
import type { ShepherdCareDirectoryEntry } from "@/lib/supabase/shepherd-care-directory-reads";
import type {
  ActiveShepherdCoverageAssignmentSummary,
  OverShepherdListRow,
} from "@/lib/supabase/shepherd-coverage-reads";
import {
  buildShepherdCareDashboardModel,
  countAllAttentionItems,
} from "@/lib/admin/shepherd-care-dashboard";
import type { CareCadenceWindows } from "@/lib/admin/shepherd-care-cadence";
import type { AttentionBaselines } from "@/lib/admin/attention-reset";
import type { ShepherdCareDashboardSummary } from "./types";

export function buildShepherdCareSummary(
  shepherdDirectoryRes: ReadResult<ShepherdCareDirectoryEntry[]>,
  overShepherdsRes: ReadResult<OverShepherdListRow[]>,
  assignmentsRes: ReadResult<ActiveShepherdCoverageAssignmentSummary[]>,
  windows: CareCadenceWindows,
  todayIso: string,
  baselines: AttentionBaselines
): ShepherdCareDashboardSummary {
  // Active over-shepherds (coaches) — the list is fetched with archived rows
  // included, so filter to active. null when that read failed, so a transient
  // error renders as "—" rather than a misleading real "0 coverage capacity".
  const activeOverShepherds = overShepherdsRes.error
    ? null
    : (overShepherdsRes.data ?? []).filter((o) => o.active).length;
  if (shepherdDirectoryRes.error || !shepherdDirectoryRes.data) {
    return {
      totalActiveShepherds: 0,
      needsAttention: 0,
      overdueTouchpoints: 0,
      notContactedRecently: 0,
      noCareProfile: 0,
      unassignedCoverage: 0,
      activeOverShepherds,
      attentionItemsTotal: 0,
      coverageAvailable: false,
      available: false,
      error: shepherdDirectoryRes.error?.message ?? "unavailable",
    };
  }
  const assignmentsAvailable = assignmentsRes.error === null;
  const model = buildShepherdCareDashboardModel({
    entries: shepherdDirectoryRes.data,
    assignments: assignmentsRes.data ?? [],
    overShepherds: overShepherdsRes.data ?? [],
    recentInteractions: [],
    todayIso,
    assignmentsAvailable,
    windows,
    baselines,
  });
  const attentionItemsTotal = countAllAttentionItems(
    shepherdDirectoryRes.data,
    assignmentsRes.data ?? [],
    todayIso,
    { coverageAvailable: assignmentsAvailable, windows, baselines }
  );
  return {
    totalActiveShepherds: model.summary.totalActiveShepherds,
    needsAttention: model.summary.needsAttention,
    overdueTouchpoints: model.summary.overdueTouchpoints,
    notContactedRecently: model.summary.notContactedRecently,
    noCareProfile: model.summary.noCareProfile,
    unassignedCoverage: model.summary.unassignedCoverage,
    activeOverShepherds,
    attentionItemsTotal,
    coverageAvailable: model.coverageAvailable,
    available: true,
    // If the coverage assignments read failed, surface the error so the
    // dashboard card can warn that the unassigned-coverage count and the
    // no_over_shepherd reason are suppressed — matches the explicit
    // error banner shown on /admin/shepherd-care.
    error: assignmentsAvailable
      ? null
      : (assignmentsRes.error?.message ?? "Coverage data unavailable."),
  };
}
