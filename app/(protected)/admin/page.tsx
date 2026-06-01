import { PageHeader } from "@/components/lg/PageHeader";
import { DashboardClient } from "@/components/lg/admin/dashboard/DashboardClient";
import { requireAdmin } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAdminDashboardData } from "@/lib/dashboard/queries";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireAdmin();

  const client = await createSupabaseServerClient();
  const { data } = await getAdminDashboardData(client);

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
