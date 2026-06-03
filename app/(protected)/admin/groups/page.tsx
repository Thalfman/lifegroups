import { PageHeader, PageBody } from "@/components/lg/PageHeader";
import {
  GroupManagementShell,
  type GroupHealthSignals,
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
  fetchOpenFollowUps,
  fetchProfilesForAdmin,
} from "@/lib/supabase/read-models";
import { fetchShepherdCareDirectoryForAdmin } from "@/lib/supabase/shepherd-care-reads";
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
  healthSignalsByGroupId: {},
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
    openFollowUpsResult,
    careDirectoryResult,
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
    // Needs Attention's follow-up leg (plan §4): the group's open generic
    // follow-ups. Reuses the same read the detail Follow-ups tab uses; we only
    // need presence per group, not the rows (ADR 0011 — no parallel module).
    fetchOpenFollowUps(client),
    // Needs Attention's care leg (plan §4): per-leader shepherd-care concerns.
    // Care is per-leader (PRD), so we map a group's leader/co-leader concern,
    // never member records — reusing the canonical care directory read.
    fetchShepherdCareDirectoryForAdmin(client),
  ]);

  const latestWeek = latestWeekResult.data ?? null;
  const sessionsResult = latestWeek
    ? await fetchAttendanceSessions(client, { meetingWeek: latestWeek })
    : { data: [], error: null as Error | null };

  const healthGradesByGroupId: Record<string, GroupHealthLetter | null> = {};
  // The set of leader/co-leader profile ids whose care row currently needs
  // attention — the per-leader care concern signal (PRD). Members are not in
  // this directory at all, so they can never be counted.
  const careConcernProfileIds = new Set<string>();
  for (const entry of careDirectoryResult.data ?? []) {
    if (entry.needs_attention) careConcernProfileIds.add(entry.profile.id);
  }
  // Groups with a leader/co-leader who needs care attention.
  const careConcernGroupIds = new Set<string>();
  for (const link of leadersResult.data ?? []) {
    if (link.active && careConcernProfileIds.has(link.profile_id)) {
      careConcernGroupIds.add(link.group_id);
    }
  }
  // Groups with at least one open / in-progress generic follow-up.
  const followUpGroupIds = new Set<string>();
  for (const fu of openFollowUpsResult.data ?? []) {
    if (fu.related_group_id) followUpGroupIds.add(fu.related_group_id);
  }

  const healthSignalsByGroupId: Record<string, GroupHealthSignals> = {};
  for (const row of healthOverview.data ?? []) {
    healthGradesByGroupId[row.group_id] = row.computed_letter;
    healthSignalsByGroupId[row.group_id] = {
      // Missing required ratings is distinct from "not assessed": a group can
      // have an attendance-derived grade letter while still lacking one or both
      // 1–5 ratings (plan §4 keeps both in Needs Health Check).
      missingRequiredRatings:
        row.spiritual_growth_score === null ||
        row.group_question_score === null,
      // Follow-up concern: either an open generic follow-up tied to the group,
      // or the director's group-health "needs follow-up" flag (#265).
      hasOpenFollowUp:
        followUpGroupIds.has(row.group_id) || row.needs_follow_up,
      hasCareConcern: careConcernGroupIds.has(row.group_id),
    };
  }
  // A group can have a follow-up or care concern even when the overview never
  // returned a row for it (e.g. a brand-new group not yet in the health read).
  // Stamp those groups too so they aren't dropped from Needs Attention.
  for (const groupId of new Set<string>([
    ...followUpGroupIds,
    ...careConcernGroupIds,
  ])) {
    if (healthSignalsByGroupId[groupId]) continue;
    healthSignalsByGroupId[groupId] = {
      missingRequiredRatings: false,
      hasOpenFollowUp: followUpGroupIds.has(groupId),
      hasCareConcern: careConcernGroupIds.has(groupId),
    };
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
    healthSignalsByGroupId,
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
