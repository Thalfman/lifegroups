import { PageHeader } from "@/components/lg/PageHeader";
import { DashboardClient } from "@/components/lg/admin/dashboard/DashboardClient";
import { requireAdmin } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAdminDashboardData } from "@/lib/dashboard/queries";
import { buildWeekOptions, validateWeekParam } from "@/lib/admin/check-ins";

export const dynamic = "force-dynamic";

type SearchParams = { week?: string | string[] };

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  await requireAdmin();
  const params = (await searchParams) ?? {};
  const selectedWeek = validateWeekParam(params.week);
  const weekOptions = buildWeekOptions(new Date());

  const client = await createSupabaseServerClient();
  const { data } = await getAdminDashboardData(client, {
    selectedWeek,
  });

  return (
    <>
      <PageHeader
        eyebrow="Admin OS"
        title="Shepherd care"
        italic="and launch planning"
        lede="Who needs your attention, and whether the church needs more groups soon. Weekly check-in status is below."
      />
      <DashboardClient data={data} weekOptions={weekOptions} />
    </>
  );
}
