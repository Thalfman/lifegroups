import { PastoralAppShell } from "@/components/pastoral/shell";
import { UserPill } from "@/components/auth/user-pill";
import { LogoutButton } from "@/components/auth/logout-button";
import {
  GroupManagementShell,
  type GroupManagementData,
} from "@/components/admin/group-management-shell";
import { requireAdmin } from "@/lib/auth/session";
import { navItemsForRole } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  fetchActiveMemberships,
  fetchAllGroupLeaders,
  fetchAllGroupMetricSettings,
  fetchAllGroups,
  fetchAttendanceSessions,
  fetchLatestMeetingWeek,
  fetchMetricDefaults,
  fetchProfilesForAdmin,
} from "@/lib/supabase/read-models";
import { BUILT_IN_METRIC_DEFAULTS, decodeMetricDefaults } from "@/lib/admin/metrics";

export const dynamic = "force-dynamic";

const EMPTY_DATA: GroupManagementData = {
  groups: [],
  groupLeaders: [],
  profiles: [],
  memberships: [],
  latestSessions: [],
  latestWeek: null,
  metricDefaults: BUILT_IN_METRIC_DEFAULTS,
  groupMetricSettings: [],
  errors: {
    groups: "Supabase is not configured in this environment.",
    leaders: "Supabase is not configured in this environment.",
    profiles: "Supabase is not configured in this environment.",
    memberships: "Supabase is not configured in this environment.",
    sessions: "Supabase is not configured in this environment.",
    settings: "Supabase is not configured in this environment.",
  },
};

async function loadData(): Promise<GroupManagementData> {
  const client = await createSupabaseServerClient();
  if (!client) return EMPTY_DATA;

  const [
    groupsResult,
    leadersResult,
    profilesResult,
    membershipsResult,
    latestWeekResult,
    defaultsResult,
    settingsResult,
  ] = await Promise.all([
    fetchAllGroups(client),
    fetchAllGroupLeaders(client, { activeOnly: true }),
    fetchProfilesForAdmin(client, {
      roles: ["leader", "co_leader"],
      statuses: ["active", "inactive"],
    }),
    fetchActiveMemberships(client),
    fetchLatestMeetingWeek(client),
    fetchMetricDefaults(client),
    fetchAllGroupMetricSettings(client),
  ]);

  const latestWeek = latestWeekResult.data ?? null;
  const sessionsResult = latestWeek
    ? await fetchAttendanceSessions(client, { meetingWeek: latestWeek })
    : { data: [], error: null as Error | null };

  return {
    groups: groupsResult.data ?? [],
    groupLeaders: leadersResult.data ?? [],
    profiles: profilesResult.data ?? [],
    memberships: membershipsResult.data ?? [],
    latestSessions: sessionsResult.data ?? [],
    latestWeek,
    metricDefaults: decodeMetricDefaults(defaultsResult.data ?? null),
    groupMetricSettings: settingsResult.data ?? [],
    errors: {
      groups: groupsResult.error?.message ?? null,
      leaders: leadersResult.error?.message ?? null,
      profiles: profilesResult.error?.message ?? null,
      memberships: membershipsResult.error?.message ?? null,
      sessions:
        latestWeekResult.error?.message ??
        sessionsResult.error?.message ??
        null,
      settings: settingsResult.error?.message ?? null,
    },
  };
}

export default async function AdminGroupsPage() {
  const session = await requireAdmin();
  const data = await loadData();

  return (
    <PastoralAppShell
      navItems={navItemsForRole(session.profile.role)}
      eyebrow="Groups"
      title="Groups"
      lede="Filter by lifecycle, health, or meeting day. Capacity stays Unknown until you set it. Archived groups stay in the record and can be restored."
      headerSlot={
        <>
          <UserPill
            name={session.profile.full_name}
            email={session.profile.email}
            role={session.profile.role}
          />
          <LogoutButton />
        </>
      }
    >
      <GroupManagementShell data={data} />
    </PastoralAppShell>
  );
}
