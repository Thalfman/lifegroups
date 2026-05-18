import { PastoralAppShell } from "@/components/pastoral/shell";
import { DataSourceBadge } from "@/components/dashboard/data-source-badge";
import { PublicPreviewNotice } from "@/components/dashboard/notices";
import { AdminDashboard } from "@/components/dashboard/admin-dashboard";
import { getAdminDashboardData } from "@/lib/dashboard/queries";

export const dynamic = "force-dynamic";

const PREVIEW_NAV = [
  { href: "/", label: "Home" },
  { href: "/admin-preview", label: "Admin Preview" },
  { href: "/leader-preview", label: "Leader Preview" },
];

export default async function AdminPreviewPage() {
  const { data } = await getAdminDashboardData(null);

  return (
    <PastoralAppShell
      navItems={PREVIEW_NAV}
      eyebrow={`${data.weekLabel} · Admin preview`}
      title="Good morning,"
      titleItalic="Avery."
      lede="Public design preview of the admin dashboard, rendered from demo data."
      headerSlot={<DataSourceBadge source="fallback" />}
    >
      <div style={{ display: "grid", gap: 14 }}>
        <PublicPreviewNotice />
        <AdminDashboard data={data} />
      </div>
    </PastoralAppShell>
  );
}
