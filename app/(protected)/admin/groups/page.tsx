import { PageHeader, PageBody } from "@/components/lg/PageHeader";
import {
  GroupManagementShell,
  type GroupManagementData,
} from "@/components/admin/group-management-shell";
import { requireAdmin } from "@/lib/auth/session";
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
    groups: "The database is not configured in this environment.",
    leaders: "The database is not configured in this environment.",
    profiles: "The database is not configured in this environment.",
    memberships: "The database is not configured in this environment.",
    sessions: "The database is not configured in this environment.",
    settings: "The database is not configured in this environment.",
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
  await requireAdmin();
  const data = await loadData();

  return (
    <>
      <PageHeader
        eyebrow="Groups"
        title="Groups"
        italic="& lifecycle"
        lede="Filter by lifecycle, health, or meeting day. Capacity stays Unknown until you set it. Archived groups stay in the record and can be restored."
      />
      <PageBody>
        <GroupManagementShell data={data} />
      </PageBody>
    </>
  );
}
