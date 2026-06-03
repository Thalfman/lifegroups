import { PageHeader } from "@/components/lg/PageHeader";
import { DashboardClient } from "@/components/lg/admin/dashboard/DashboardClient";
import { requireAdmin } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAdminDashboardData } from "@/lib/dashboard/queries";
import { resolveOverviewGrain } from "@/lib/admin/overview-period";
import { isFrozenSurfaceLive } from "@/lib/admin/frozen-surface";

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
  const [dashboard, guestsLive] = await Promise.all([
    getAdminDashboardData(client, { grain }),
    isFrozenSurfaceLive("guests"),
  ]);
  const { data } = dashboard;
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
        guestsLive={guestsLive}
        degraded={degraded}
        scopeId={session.profile.id}
      />
    </>
  );
}
