import { PastoralAppShell } from "@/components/pastoral/shell";
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

function greetingName(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0];
  return first ? `${first}.` : `${fullName}.`;
}

export default async function LeaderPage() {
  const session = await requireLeader();
  const client = await createSupabaseServerClient();
  const { source, data, error } = await getLeaderDashboardData(client, {
    assignedGroupIds: session.assignedGroupIds,
  });

  const groupCount = data.groups.length;
  const lede =
    groupCount === 0
      ? "No active assignments yet. A ministry admin will route a group your way."
      : groupCount === 1
        ? "One group, every week. Two minutes on the couch — then you're done."
        : `${groupCount} groups, every week. Two minutes on the couch each — then you're done.`;

  return (
    <PastoralAppShell
      navItems={navItemsForRole(session.profile.role)}
      eyebrow="Leader · This week"
      title="Welcome back,"
      titleItalic={greetingName(session.profile.full_name)}
      lede={lede}
      contentMaxWidth={720}
      headerSlot={
        <>
          <DataSourceBadge source={source} />
          <UserPill
            name={session.profile.full_name}
            email={session.profile.email}
            role={session.profile.role}
          />
          <LogoutButton />
        </>
      }
    >
      <div style={{ display: "grid", gap: 14 }}>
        {source === "live" ? <ConfiguredDataNotice /> : <FallbackDataNotice />}
        {error ? <DashboardErrorNotice message={error} /> : null}

        {groupCount === 0 ? (
          <EmptyState
            title="No active group assignments"
            description="A ministry admin will assign you to a group from the admin tools. Once that happens, your group will appear here."
          />
        ) : (
          <div style={{ display: "grid", gap: 18 }}>
            {data.groups.map((dashboard) => (
              <LeaderGroupCard key={dashboard.group.groupId} dashboard={dashboard} />
            ))}
          </div>
        )}
      </div>
    </PastoralAppShell>
  );
}
