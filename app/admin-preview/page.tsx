import { AppShell } from "@/components/layout/shell";
import { DataSourceBadge } from "@/components/dashboard/data-source-badge";
import { PublicPreviewNotice } from "@/components/dashboard/notices";
import { AdminDashboard } from "@/components/dashboard/admin-dashboard";
import { getAdminDashboardData } from "@/lib/dashboard/queries";

export const dynamic = "force-dynamic";

export default async function AdminPreviewPage() {
  const { data } = await getAdminDashboardData(null);

  return (
    <AppShell
      title="Admin Dashboard Preview"
      subtitle="Public design preview of the admin dashboard, rendered from demo data."
      headerSlot={<DataSourceBadge source="fallback" />}
    >
      <PublicPreviewNotice />
      <AdminDashboard data={data} />
    </AppShell>
  );
}
