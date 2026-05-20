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
import {
  LeaderFollowUpsSection,
  type LeaderFollowUpItem,
} from "@/components/leader/leader-follow-ups-section";
import { requireLeader } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getLeaderDashboardData } from "@/lib/dashboard/queries";
import { navItemsForRole } from "@/lib/auth/roles";
import { P, fontBody, fontSans } from "@/lib/pastoral";
import {
  fetchFollowUpsForLeader,
  fetchGroupsByIds,
  fetchGuestNamesByIds,
} from "@/lib/supabase/read-models";

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

  // Phase 5C.0: load follow-ups visible to this leader. We deliberately
  // call fetchFollowUpsForLeader with the leader-safe column list so
  // admin_private_note never reaches the page, even via SSR.
  const leaderFollowUps = await loadLeaderFollowUps(
    client,
    session.profile.id,
    session.assignedGroupIds,
  );

  const groupCount = data.groups.length;
  const lede =
    groupCount === 0
      ? "No active assignments yet. A ministry admin will route a group your way."
      : "Help your group stay connected. Submit this week's check-in and follow up well.";

  return (
    <PastoralAppShell
      navItems={navItemsForRole(session.profile.role)}
      eyebrow="This week"
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
        <LeaderFollowUpsSection items={leaderFollowUps} />
      </div>
    </PastoralAppShell>
  );
}

// Loads follow-ups assigned to the caller or tied to a group they
// actively lead. Returns an empty list (never throws) so a follow-up
// read failure can't take down the leader check-in workflow.
async function loadLeaderFollowUps(
  client: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  profileId: string,
  assignedGroupIds: readonly string[],
): Promise<LeaderFollowUpItem[]> {
  if (!client) return [];
  const followUpsResult = await fetchFollowUpsForLeader(client, {
    profileId,
    assignedGroupIds,
  });
  if (followUpsResult.error || !followUpsResult.data) return [];
  const rows = followUpsResult.data;
  if (rows.length === 0) return [];

  const groupIds = Array.from(
    new Set(
      rows
        .map((r) => r.related_group_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const guestIds = Array.from(
    new Set(
      rows
        .map((r) => r.related_guest_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const [groupsResult, guestNamesResult] = await Promise.all([
    groupIds.length > 0
      ? fetchGroupsByIds(client, groupIds)
      : Promise.resolve({ data: [], error: null as Error | null }),
    guestIds.length > 0
      ? fetchGuestNamesByIds(client, guestIds)
      : Promise.resolve({
          data: new Map<string, string>(),
          error: null as Error | null,
        }),
  ]);
  const groupsById = new Map(
    (groupsResult.data ?? []).map((g) => [g.id, g.name] as const),
  );
  const guestsById = guestNamesResult.data ?? new Map<string, string>();

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    type: row.type,
    priority: row.priority,
    status: row.status,
    dueDate: row.due_date,
    relatedGroupId: row.related_group_id,
    relatedGroupName: row.related_group_id
      ? groupsById.get(row.related_group_id) ?? null
      : null,
    relatedGuestId: row.related_guest_id,
    relatedGuestName: row.related_guest_id
      ? guestsById.get(row.related_guest_id) ?? null
      : null,
    leaderVisibleNote: row.leader_visible_note,
  }));
}
