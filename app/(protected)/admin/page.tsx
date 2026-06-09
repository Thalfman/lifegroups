import { PageHeader } from "@/components/lg/PageHeader";
import { DashboardClient } from "@/components/lg/admin/dashboard/DashboardClient";
import { requireAdmin } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAdminDashboardData } from "@/lib/dashboard/queries";
import {
  EMPTY_PROSPECT_STATE_COUNTS,
  fetchProspectStateCounts,
} from "@/lib/supabase/prospect-reads";
import { loadMultiplyGridData } from "@/components/admin/multiply/multiply-grid-data";
import { buildMultiplyHomeSummary } from "@/lib/admin/multiply-grid";
import {
  INTEREST_FUNNEL_FALLBACK,
  MULTIPLY_READINESS_FALLBACK,
} from "@/lib/dashboard/fallback-data";
import type {
  InterestFunnelDashboardSummary,
  MultiplyReadinessDashboardSummary,
} from "@/lib/dashboard/types";
import { resolveOverviewGrain } from "@/lib/admin/overview-period";
import { isFrozenSurfaceLive } from "@/lib/admin/frozen-surface";
import { getMutedAttentionKeys } from "@/lib/admin/needs-attention-mutes";
import { loadHiddenNavAreas } from "@/lib/nav/hidden-nav";

export const dynamic = "force-dynamic";

type SearchParams = { period?: string | string[] };

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const session = await requireAdmin();

  const params = (await searchParams) ?? {};
  const grain = resolveOverviewGrain(params.period);

  const client = await createSupabaseServerClient();
  // The guest pipeline is frozen by default (ADR 0002 / 0009). Resolve the flag
  // alongside the dashboard read — not after it — so the dashboard never
  // presents Guests as an active workflow unless it has been re-enabled-and-
  // verified (#256), without adding a serial round trip to this hot page.
  // The launch-optics mutes (which time-based Needs-attention categories a Super
  // Admin has hidden) resolve through the admin-readable feature-flags RPC, so a
  // ministry_admin sees the same muted Home as the Super Admin who set it.
  // Resolve it alongside the dashboard read — not after — to keep this hot page
  // to a single round of parallel reads.
  // hiddenNavAreas (ADR 0016): the Super-Admin nav-visibility flags also govern
  // which Ministry-snapshot cards Home shows, so a retired tab leaves no stats
  // behind. Resolved alongside the dashboard read to keep this hot page to a
  // single round of parallel reads.
  // The pivot overview cards (#470) load alongside the dashboard read in the
  // same parallel round: a narrow Prospect count read (Plan) and the Multiply
  // grid (Multiply). Each degrades PER CARD below — a failed read renders that
  // card unavailable, never a false zero — and the no-client preview renders
  // the typed demo seeds instead.
  const [
    dashboard,
    guestsLive,
    mutedKeys,
    hiddenNavAreas,
    prospectCounts,
    multiplyGridData,
  ] = await Promise.all([
    getAdminDashboardData(client, { grain }),
    isFrozenSurfaceLive("guests"),
    getMutedAttentionKeys(),
    loadHiddenNavAreas(),
    client ? fetchProspectStateCounts(client) : null,
    client ? loadMultiplyGridData() : null,
  ]);
  const { data } = dashboard;

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
            ...buildMultiplyHomeSummary(multiplyGridData.grid),
            available: true,
            error: null,
          };
  // A degraded read returns demo fallback data carrying an error; the deliberate
  // no-client demo preview is `fallback` without an error and is not degraded.
  // The Needs-attention area suppresses itself when degraded so it never
  // presents demo counts as live work to do (req 7).
  const degraded = dashboard.source === "fallback" && dashboard.error != null;

  return (
    <>
      <PageHeader
        eyebrow="Ministry Admin"
        title="Home"
        lede="What needs your attention first — then the week ahead, the ministry snapshot, and recent activity."
      />
      <DashboardClient
        data={data}
        interestFunnel={interestFunnel}
        multiplyReadiness={multiplyReadiness}
        guestsLive={guestsLive}
        degraded={degraded}
        scopeId={session.profile.id}
        mutedKeys={mutedKeys}
        canResetActivity={session.profile.role === "super_admin"}
        hiddenNavAreas={[...hiddenNavAreas]}
      />
    </>
  );
}
