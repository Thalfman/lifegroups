import { PageHeader } from "@/components/lg/PageHeader";
import { DashboardClient } from "@/components/lg/admin/dashboard/DashboardClient";
import { requireAdmin } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAdminDashboardData } from "@/lib/dashboard/queries";
import { resolveOverviewGrain } from "@/lib/admin/overview-period";

export const dynamic = "force-dynamic";

type SearchParams = { period?: string | string[] };

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  await requireAdmin();

  const params = (await searchParams) ?? {};
  const grain = resolveOverviewGrain(params.period);

  const client = await createSupabaseServerClient();
  const { data } = await getAdminDashboardData(client, { grain });

  return (
    <>
      <PageHeader
        eyebrow="Ministry Admin"
        title="Ministry"
        italic="overview"
        lede="The state of your life groups at a glance — engagement, capacity, leader care, and what needs your attention."
      />
      <DashboardClient data={data} />
    </>
  );
}
