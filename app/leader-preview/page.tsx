import { PastoralAppShell } from "@/components/pastoral/shell";
import { EmptyState } from "@/components/dashboard/cards";
import { DataSourceBadge } from "@/components/dashboard/data-source-badge";
import { PublicPreviewNotice } from "@/components/dashboard/notices";
import { LeaderGroupCard } from "@/components/dashboard/leader-group-card";
import { getLeaderDashboardData } from "@/lib/dashboard/queries";

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
