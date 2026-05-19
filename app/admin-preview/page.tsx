import Link from "next/link";
import { PastoralAppShell } from "@/components/pastoral/shell";
import { DataSourceBadge } from "@/components/dashboard/data-source-badge";
import { PublicPreviewNotice } from "@/components/dashboard/notices";
import { AdminDashboard } from "@/components/dashboard/admin-dashboard";
import { getAdminDashboardData } from "@/lib/dashboard/queries";
import { buildWeekOptions } from "@/lib/admin/check-ins";
import { P, fontSans } from "@/lib/pastoral";

export const dynamic = "force-dynamic";

const PREVIEW_NAV = [
  { href: "/", label: "Home" },
  { href: "/admin-preview", label: "Admin Preview" },
  { href: "/leader-preview", label: "Leader Preview" },
];

export default async function AdminPreviewPage() {
  const { data } = await getAdminDashboardData(null);
  const weekOptions = buildWeekOptions(new Date());

  return (
    <PastoralAppShell
      navItems={PREVIEW_NAV}
      eyebrow="Ministry command center · Preview"
      title="Life Groups,"
      titleItalic="this week."
      lede="Public design preview of the admin dashboard, rendered from demo data."
      headerSlot={<DataSourceBadge source="fallback" />}
    >
      <div style={{ display: "grid", gap: 14 }}>
        <PublicPreviewNotice />
        <div
          style={{
            background: P.surface,
            border: `1px dashed ${P.line}`,
            borderRadius: 12,
            padding: "10px 14px",
            fontFamily: fontSans,
            fontSize: 12,
            color: P.ink2,
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <span>Preview surfaces:</span>
          <Link
            href="/admin-preview/groups/fallback-preview-group/calendar"
            style={{ color: P.terra, textDecoration: "underline" }}
          >
            Group calendar preview →
          </Link>
        </div>
        <AdminDashboard data={data} weekOptions={weekOptions} />
      </div>
    </PastoralAppShell>
  );
}
