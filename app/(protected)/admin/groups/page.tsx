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
  fetchProfilesForAdmin,
} from "@/lib/supabase/read-models";
import { fetchMetricDefaultsCached } from "@/lib/supabase/cached-config";
import {
  BUILT_IN_METRIC_DEFAULTS,
  decodeMetricDefaults,
} from "@/lib/admin/metrics";
import {
  currentPeriodMonthIso,
  listGroupHealthOverview,
} from "@/lib/admin/group-health-read";
import type { GroupHealthLetter } from "@/types/enums";

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
  healthGradesByGroupId: {},
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

  // The Health zone reflects the Group-Health Grade (Q12 computed grade), not
  // the groups.health_status enum. We read the same live overview the Group
  // Health surface uses and project just each group's computed letter. It is
  // independent of the other reads, so it joins the same parallel batch rather
  // than waterfalling. A read failure leaves the map empty (groups read as
  // "Not assessed") rather than failing the whole page — the rest still loads.
  const [
    groupsResult,
    leadersResult,
    profilesResult,
    membershipsResult,
    latestWeekResult,
    defaultsResult,
    settingsResult,
    healthOverview,
  ] = await Promise.all([
    fetchAllGroups(client),
    fetchAllGroupLeaders(client, { activeOnly: true }),
    fetchProfilesForAdmin(client, {
      roles: ["leader", "co_leader"],
      statuses: ["active", "inactive"],
    }),
    fetchActiveMemberships(client),
    fetchLatestMeetingWeek(client),
    fetchMetricDefaultsCached(client),
    fetchAllGroupMetricSettings(client),
    listGroupHealthOverview(client, currentPeriodMonthIso()),
  ]);

  const latestWeek = latestWeekResult.data ?? null;
  const sessionsResult = latestWeek
    ? await fetchAttendanceSessions(client, { meetingWeek: latestWeek })
    : { data: [], error: null as Error | null };

  const healthGradesByGroupId: Record<string, GroupHealthLetter | null> = {};
  for (const row of healthOverview.data ?? []) {
    healthGradesByGroupId[row.group_id] = row.computed_letter;
  }

  return {
    groups: groupsResult.data ?? [],
    groupLeaders: leadersResult.data ?? [],
    profiles: profilesResult.data ?? [],
    memberships: membershipsResult.data ?? [],
    latestSessions: sessionsResult.data ?? [],
    latestWeek,
    metricDefaults: decodeMetricDefaults(defaultsResult.data ?? null),
    groupMetricSettings: settingsResult.data ?? [],
    healthGradesByGroupId,
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
        italic="setup · health · capacity"
        lede="The single home for group setup, health, capacity, and lifecycle. Each group's standing reads as four independent labels — lifecycle, setup, health (the Group-Health Grade), and capacity. Open a group for its Health, Attendance, Follow-ups, and Events."
      />
      <PageBody>
        <GroupManagementShell data={data} />
      </PageBody>
    </>
  );
}
