import type { CSSProperties } from "react";
import { measureReadBundle } from "@/lib/observability/read-timing";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  EMPTY_PROSPECT_STATE_COUNTS,
  fetchProspectStateCounts,
} from "@/lib/supabase/prospect-reads";
import { loadMultiplyGridData } from "@/components/admin/multiply/multiply-grid-data";
import { buildMultiplyHomeSummary } from "@/lib/admin/group-type-coverage";
import {
  INTEREST_FUNNEL_FALLBACK,
  MULTIPLY_READINESS_FALLBACK,
} from "@/lib/dashboard/fallback-data";
import type {
  AdminDashboardData,
  InterestFunnelDashboardSummary,
  MultiplyReadinessDashboardSummary,
} from "@/lib/dashboard/types";
import { MinistrySnapshotSection } from "./MinistrySnapshotSection";

// Streaming boundary B for /admin Home (#777 WS2). The two slowest dashboard
// reads — the narrow Prospect-state count (Plan) and the 4-read Multiply grid
// (Multiply) — feed ONLY the Ministry-snapshot section (the vital-signs band's
// funnel/readiness tiles + the Plan/Multiply overview cards). Awaiting them in
// the page's first boundary held the above-the-fold LCP path (Needs attention /
// This week) behind the slowest read.
//
// This async server child does those two reads on its own, derives the #470
// summaries, and renders the snapshot — wrapped by the page in its own
// <Suspense> so it streams in AFTER the main paint. `data` and the nav-gate
// inputs come from the page's already-resolved first boundary (no re-fetch:
// getAdminDashboardData is not React.cache-wrapped).
//
// Each read degrades PER CARD: a failed read renders that card/tile as
// unavailable, never a false zero; the no-client preview renders the typed demo
// seeds. The bundles are timed separately so the production `read_bundle` logs
// still show which read dominates this hot page's TTFB.
export async function MultiplyOverviewSection({
  data,
  degraded,
  guestsLive,
  scopeId,
  hiddenNavAreas,
}: {
  data: AdminDashboardData;
  degraded: boolean;
  guestsLive: boolean;
  scopeId?: string | null;
  // Top-level area hrefs hidden from nav (ADR 0016): the launch-planning and
  // leader-pipeline snapshot cards/cells ride these gates, matching the page's
  // own derivation for the LCP-path cards.
  hiddenNavAreas: readonly string[];
}) {
  const client = await createSupabaseServerClient();

  const [prospectCounts, multiplyGridData] = await Promise.all([
    client
      ? measureReadBundle(
          "admin_home_prospect_counts",
          () => fetchProspectStateCounts(client),
          (r) => ({ result_kind: r.error ? "error" : "ok" })
        )
      : null,
    client
      ? measureReadBundle(
          "admin_home_multiply_grid",
          () => loadMultiplyGridData(),
          (r) => ({ result_kind: r.error ? "error" : "ok" })
        )
      : null,
  ]);

  const interestFunnel: InterestFunnelDashboardSummary =
    prospectCounts === null
      ? INTEREST_FUNNEL_FALLBACK
      : prospectCounts.error !== null
        ? {
            counts: EMPTY_PROSPECT_STATE_COUNTS,
            available: false,
            error: prospectCounts.error.message,
          }
        : { counts: prospectCounts.data, available: true, error: null };

  // loadMultiplyGridData reports a non-null error whenever ANY of its reads
  // failed; the grid it returns is then partial, so the summary must not be
  // built over it (a partial grid would read as a false "0 of 0 ready").
  const multiplyReadiness: MultiplyReadinessDashboardSummary =
    multiplyGridData === null
      ? MULTIPLY_READINESS_FALLBACK
      : multiplyGridData.error !== null
        ? {
            readyCells: 0,
            activeCells: 0,
            available: false,
            error: multiplyGridData.error,
          }
        : {
            ...buildMultiplyHomeSummary(multiplyGridData.rows),
            available: true,
            error: null,
          };

  const hidden = new Set(hiddenNavAreas);
  const showLaunchPlanning = !hidden.has("/admin/planning");
  const showLeaderPipeline = !hidden.has("/admin/people");

  return (
    <MinistrySnapshotSection
      data={data}
      interestFunnel={interestFunnel}
      multiplyReadiness={multiplyReadiness}
      showLaunchPlanning={showLaunchPlanning}
      showLeaderPipeline={showLeaderPipeline}
      guestsLive={guestsLive}
      scopeId={scopeId}
      degraded={degraded}
    />
  );
}

// Streaming fallback for the snapshot boundary: a bordered pulse block sized like
// the vital-signs band plus a collapsed-overview placeholder, so the section
// reserves its space (no layout shift) while the two slow reads resolve.
function Bar({ style }: { style?: CSSProperties }) {
  return (
    <div
      aria-hidden="true"
      className="animate-pulse rounded-md bg-lineSoft"
      style={style}
    />
  );
}

export function MinistrySnapshotSkeleton() {
  return (
    <div role="status" aria-live="polite" className="grid gap-3">
      <span className="sr-only">Loading ministry snapshot…</span>
      <Bar style={{ height: 150, borderRadius: 12 }} />
      <Bar style={{ height: 56, borderRadius: 12 }} />
    </div>
  );
}
