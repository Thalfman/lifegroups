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
import { P, fontBody, fontSans } from "@/lib/pastoral";

export const dynamic = "force-dynamic";

function greetingName(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0];
  return first ? `${first}.` : `${fullName}.`;
}

export default async function LeaderPage({
  searchParams,
}: {
  searchParams?: Promise<{ checkin?: string }>;
}) {
  const session = await requireLeader();
  const params = (await searchParams) ?? {};
  const savedNoticeVisible = params.checkin === "saved";
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
        {savedNoticeVisible ? (
          <div
            role="status"
            style={{
              background: P.sageSoft,
              border: `1px solid ${P.sage}`,
              borderLeft: `3px solid ${P.sage}`,
              borderRadius: 8,
              padding: "12px 16px",
              fontFamily: fontBody,
              fontSize: 13.5,
              color: "#3e4f29",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                fontFamily: fontSans,
                fontSize: 11,
                letterSpacing: 1.5,
                textTransform: "uppercase",
                fontWeight: 600,
              }}
            >
              Saved
            </span>
            <span>Your check-in is in the record. Thanks for keeping it fresh.</span>
          </div>
        ) : null}

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
