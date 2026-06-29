import { Suspense } from "react";
import { PageHeader } from "@/components/lg/PageHeader";
import { PageSkeleton } from "@/components/lg/PageSkeleton";
import { DashboardClient } from "@/components/lg/admin/dashboard/DashboardClient";
import { requireAdmin } from "@/lib/auth/session";
import { measureReadBundle } from "@/lib/observability/read-timing";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAdminDashboardData } from "@/lib/dashboard/queries";
import {
  MinistrySnapshotSkeleton,
  MultiplyOverviewSection,
} from "@/components/lg/admin/dashboard/MultiplyOverviewSection";
import { RecentActivityData } from "@/components/lg/admin/dashboard/recent-activity-data";
import { RecentActivitySkeleton } from "@/components/lg/admin/dashboard/RecentActivitySection";
import { resolveOverviewGrain } from "@/lib/admin/overview-period";
import { isFrozenSurfaceLive } from "@/lib/admin/frozen-surface";
import { firstParam } from "@/lib/shared/search-params";
import { getMutedAttentionKeys } from "@/lib/admin/needs-attention-mutes";
import { loadHiddenNavAreas } from "@/lib/nav/hidden-nav";

export const dynamic = "force-dynamic";

type SearchParams = {
  period?: string | string[];
  from?: string | string[];
};

// Thin shell: guard, resolve the URL params, and render the page header
// synchronously, then stream the data-heavy dashboard behind a <Suspense>
// boundary. On a fresh open this flushes the header + body skeleton in the first
// response chunk instead of withholding all HTML until the ~21-read dashboard
// resolves — the perceived-load win (the in-app navigation path was already fast
// via the route loading.tsx + sidebar prefetch). requireAdmin() runs here so an
// unauthorized user redirects before any shell/header is emitted.
export default async function AdminPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  await requireAdmin();

  const params = (await searchParams) ?? {};
  const grain = resolveOverviewGrain(params.period);
  // ADR 0027: a setup deep-link's "← Back to setup" affordance returns here with
  // ?from=setup, so Home re-focuses the next incomplete step.
  const fromSetup = firstParam(params.from) === "setup";

  return (
    <>
      <PageHeader
        eyebrow="Ministry Admin"
        title="Home"
        lede="What needs your attention first — then the week ahead, the ministry snapshot, and recent activity."
      />
      <Suspense fallback={<PageSkeleton bodyOnly />}>
        <AdminHomeData grain={grain} fromSetup={fromSetup} />
      </Suspense>
    </>
  );
}

// Data child: the dashboard read fan-out + view-model derivation, isolated so it
// can suspend independently of the header above. requireAdmin() is re-asserted
// for type-narrowing (session.profile) at zero round-trip cost — getCurrentSession
// is React.cache-wrapped, so it shares the parent's getUser()/profile read.
async function AdminHomeData({
  grain,
  fromSetup,
}: {
  grain: ReturnType<typeof resolveOverviewGrain>;
  fromSetup: boolean;
}) {
  const session = await requireAdmin();

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
  //
  // Boundary A — the LCP path (#777 WS2). This first boundary fetches only what
  // the above-the-fold content (Needs attention / This week) needs. The two
  // slowest reads — the Prospect-state count (Plan) and the 4-read Multiply grid
  // (Multiply) — feed ONLY the below-the-fold Ministry-snapshot section, so they
  // move into the streamed `MultiplyOverviewSection` (Boundary B) and no longer
  // block this paint.
  const [dashboard, guestsLive, mutedKeys, hiddenNavAreas] = await Promise.all([
    measureReadBundle(
      "admin_home_dashboard",
      () => getAdminDashboardData(client, { grain }),
      (d) => ({
        result_kind: d.source,
        degraded: d.source === "fallback" && d.error != null,
      })
    ),
    measureReadBundle("admin_home_guests_flag", () =>
      isFrozenSurfaceLive("guests")
    ),
    measureReadBundle(
      "admin_home_muted_keys",
      () => getMutedAttentionKeys(),
      (keys) => ({ muted: keys.length })
    ),
    measureReadBundle(
      "admin_home_hidden_nav",
      () => loadHiddenNavAreas(),
      (set) => ({ hidden: set.size })
    ),
  ]);
  const { data } = dashboard;

  // A degraded read returns demo fallback data carrying an error; the deliberate
  // no-client demo preview is `fallback` without an error and is not degraded.
  // The Needs-attention area suppresses itself when degraded so it never
  // presents demo counts as live work to do (req 7).
  const degraded = dashboard.source === "fallback" && dashboard.error != null;

  return (
    <DashboardClient
      data={data}
      degraded={degraded}
      scopeId={session.profile.id}
      mutedKeys={mutedKeys}
      hiddenNavAreas={[...hiddenNavAreas]}
      isSuperAdmin={session.profile.role === "super_admin"}
      fromSetup={fromSetup}
      // Boundary C — the Recent-activity section streams in its own boundary
      // after the main paint: its async child does the activity-reset baseline +
      // period-scoped counts reads (the second serial round trip) so they no
      // longer gate the above-the-fold Needs-attention / This-week paint.
      activitySlot={
        <Suspense fallback={<RecentActivitySkeleton />}>
          <RecentActivityData
            grain={grain}
            guestsLive={guestsLive}
            canResetActivity={session.profile.role === "super_admin"}
          />
        </Suspense>
      }
      // Boundary B — the Ministry-snapshot body streams in after the main paint:
      // its async server child does the two slow reads, then renders the band +
      // overview cards. `data` is reused from Boundary A (no re-fetch).
      snapshotSlot={
        <Suspense fallback={<MinistrySnapshotSkeleton />}>
          <MultiplyOverviewSection
            data={data}
            degraded={degraded}
            guestsLive={guestsLive}
            scopeId={session.profile.id}
            hiddenNavAreas={[...hiddenNavAreas]}
          />
        </Suspense>
      }
    />
  );
}
