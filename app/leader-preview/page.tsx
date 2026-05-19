import Link from "next/link";
import { PastoralAppShell } from "@/components/pastoral/shell";
import { EmptyState } from "@/components/dashboard/cards";
import { DataSourceBadge } from "@/components/dashboard/data-source-badge";
import { PublicPreviewNotice } from "@/components/dashboard/notices";
import { LeaderGroupCard } from "@/components/dashboard/leader-group-card";
import { getLeaderDashboardData } from "@/lib/dashboard/queries";
import { P, fontSans } from "@/lib/pastoral";

export const dynamic = "force-dynamic";

const PREVIEW_NAV = [
  { href: "/", label: "Home" },
  { href: "/admin-preview", label: "Admin Preview" },
  { href: "/leader-preview", label: "Leader Preview" },
];

export default async function LeaderPreviewPage() {
  const { data } = await getLeaderDashboardData(null, { assignedGroupIds: [] });
  const dashboard = data.groups[0] ?? null;

  return (
    <PastoralAppShell
      navItems={PREVIEW_NAV}
      eyebrow="Leader preview · This week"
      title="Welcome back,"
      titleItalic="Mark."
      lede="Public design preview of a leader's weekly workflow, rendered from demo data."
      contentMaxWidth={720}
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
            href="/leader-preview/fallback-leader-group/calendar"
            style={{ color: P.terra, textDecoration: "underline" }}
          >
            Group calendar preview →
          </Link>
        </div>
        {!dashboard ? (
          <EmptyState
            title="No assigned group yet"
            description="When a leader has an active group assignment, their workflow will load here."
          />
        ) : (
          <LeaderGroupCard dashboard={dashboard} preview />
        )}
      </div>
    </PastoralAppShell>
  );
}
