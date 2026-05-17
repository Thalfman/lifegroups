import { AppShell } from "@/components/layout/shell";
import { EmptyState } from "@/components/dashboard/cards";
import { DataSourceBadge } from "@/components/dashboard/data-source-badge";
import {
  ConfiguredDataNotice,
  DashboardErrorNotice,
  FallbackDataNotice,
} from "@/components/dashboard/notices";
import { UserPill } from "@/components/auth/user-pill";
import { LogoutButton } from "@/components/auth/logout-button";
import { LeaderGroupCard } from "@/components/dashboard/leader-group-card";
import { requireLeader } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getLeaderDashboardData } from "@/lib/dashboard/queries";
import { navItemsForRole } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

export default async function LeaderPage() {
  const session = await requireLeader();
  const client = await createSupabaseServerClient();
  const { source, data, error } = await getLeaderDashboardData(client, {
    assignedGroupIds: session.assignedGroupIds,
  });

  return (
    <AppShell
      title="Leader Dashboard"
      subtitle="Your weekly workflow across every group you lead."
      phaseLabel="Leader"
      navItems={navItemsForRole(session.profile.role)}
      headerSlot={
        <>
          <DataSourceBadge source={source} />
          <UserPill name={session.profile.full_name} email={session.profile.email} role={session.profile.role} />
          <LogoutButton />
        </>
      }
    >
      {source === "live" ? <ConfiguredDataNotice /> : <FallbackDataNotice />}
      {error ? <DashboardErrorNotice message={error} /> : null}

      {data.groups.length === 0 ? (
        <EmptyState
          title="No active group assignments"
          description="A ministry admin will assign you to a group from the admin tools. Once that happens, your group will appear here."
        />
      ) : (
        <div className="space-y-6">
          {data.groups.map((dashboard) => (
            <LeaderGroupCard key={dashboard.group.groupId} dashboard={dashboard} />
          ))}
        </div>
      )}
    </AppShell>
  );
}
