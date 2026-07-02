import type {
  GroupHealthSignals,
  GroupManagementData,
} from "@/components/admin/group-management-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { bindReads, type BoundReads } from "@/lib/supabase/reads-seam";
import { currentUtcDateIso } from "@/lib/supabase/read-core";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import { fetchActiveShepherdCoverageAssignmentsForAdmin } from "@/lib/supabase/shepherd-care-reads";
import {
  fetchAllGroupLeaders,
  fetchAllGroups,
} from "@/lib/supabase/group-reads";
import {
  fetchActiveMemberships,
  fetchProfilesForAdmin,
} from "@/lib/supabase/membership-reads";
import {
  fetchAttendanceSessions,
  fetchLatestMeetingWeek,
} from "@/lib/supabase/attendance-reads";
import { fetchOpenFollowUps } from "@/lib/supabase/overview-reads";
import { fetchAllGroupMetricSettings } from "@/lib/supabase/settings-reads";
import { fetchShepherdCareDirectoryForAdmin } from "@/lib/supabase/shepherd-care-reads";
import { fetchAttentionResetBaselines } from "@/lib/supabase/maintenance-reads";
import {
  needsContactProfileIds,
  resolveCareNeedsContact,
} from "@/lib/admin/care-needs-contact";
import {
  fetchMetricDefaultsCached,
  fetchGroupTypesCached,
} from "@/lib/supabase/cached-config";
import {
  BUILT_IN_METRIC_DEFAULTS,
  decodeMetricDefaults,
} from "@/lib/admin/metrics";
import { listGroupHealthOverview } from "@/lib/admin/group-health-read";
import { currentPeriodMonthIso } from "@/lib/admin/ministry-year";
import type { GroupHealthLetter } from "@/types/enums";

// The Groups surface's data, as a pure function of the reads seam (ADR 0015).
// The assembly here — care-concern sets, follow-up presence, the health-signal
// stamping that keeps a brand-new group in Needs Attention — is the part with
// real branching, and it is now reachable from a test through an in-memory
// `reads` adapter instead of a live client.

const GROUP_MANAGEMENT_FETCHERS = {
  fetchAllGroups,
  fetchAllGroupLeaders,
  fetchProfilesForAdmin,
  fetchActiveMemberships,
  fetchLatestMeetingWeek,
  fetchMetricDefaults: fetchMetricDefaultsCached,
  fetchAllGroupMetricSettings,
  listGroupHealthOverview,
  fetchOpenFollowUps,
  fetchShepherdCareDirectory: fetchShepherdCareDirectoryForAdmin,
  // The active-coverage and care attention-reset reads the shared needs-contact
  // resolver waterfalls over the directory (windows + coverage + baselines), so
  // Groups answers "needs care contact" identically to Care/People/person-detail.
  fetchActiveAssignments: fetchActiveShepherdCoverageAssignmentsForAdmin,
  fetchAttentionBaselines: fetchAttentionResetBaselines,
  fetchAttendanceSessions,
  // The admin-managed free-text group-type list for the create/edit forms.
  fetchGroupTypes: fetchGroupTypesCached,
};

export type GroupManagementReads = BoundReads<typeof GROUP_MANAGEMENT_FETCHERS>;

export function supabaseGroupManagementReads(
  client: AppSupabaseClient
): GroupManagementReads {
  return bindReads(client, GROUP_MANAGEMENT_FETCHERS, "group_management");
}

export const EMPTY_GROUP_MANAGEMENT_DATA: GroupManagementData = {
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
  groupTypes: [],
  errors: {
    groups: "The database is not configured in this environment.",
    leaders: "The database is not configured in this environment.",
    profiles: "The database is not configured in this environment.",
    memberships: "The database is not configured in this environment.",
    sessions: "The database is not configured in this environment.",
    settings: "The database is not configured in this environment.",
    health: "The database is not configured in this environment.",
    groupTypes: "The database is not configured in this environment.",
  },
};

export async function buildGroupManagementData(
  reads: GroupManagementReads,
  options: { period?: string; todayIso?: string } = {}
): Promise<GroupManagementData> {
  const period = options.period ?? currentPeriodMonthIso();
  const todayIso = options.todayIso ?? currentUtcDateIso();

  // The Health zone reflects the Group-Health Grade (Q12 computed grade), not
  // the groups.health_status enum. We read the same live overview the Group
  // Health surface uses and project just each group's computed letter. It is
  // independent of the other reads, so it joins the same parallel batch rather
  // than waterfalling. A read failure leaves the grade map empty, but it is
  // surfaced via errors.health (below) so the page warns rather than silently
  // showing every group as "Not assessed"; the rest of the page still loads.
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
    careNeedsContact,
    groupTypesResult,
  ] = await Promise.all([
    reads.fetchAllGroups(),
    reads.fetchAllGroupLeaders({ activeOnly: true }),
    reads.fetchProfilesForAdmin({
      roles: ["leader", "co_leader"],
      statuses: ["active", "inactive"],
    }),
    reads.fetchActiveMemberships(),
    reads.fetchLatestMeetingWeek(),
    reads.fetchMetricDefaults(),
    reads.fetchAllGroupMetricSettings(),
    reads.listGroupHealthOverview(period),
    // Needs Attention's follow-up leg (plan §4): the group's open generic
    // follow-ups. Reuses the same read the detail Follow-ups tab uses; we only
    // need presence per group, not the rows (ADR 0011 — no parallel module).
    reads.fetchOpenFollowUps(),
    // Needs Attention's care leg (plan §4): per-leader shepherd-care concerns.
    // Care is per-leader (PRD), so we map a group's leader/co-leader concern,
    // never member records. Routed through the shared needs-contact resolver
    // (lib/admin/care-needs-contact.ts) — the same windows + active-coverage +
    // "care" attention-reset baselines + directory waterfall Care/People/
    // person-detail use — so Groups answers "needs care contact" identically
    // and the rule lives in one place. The resolver reads the directory once,
    // with context, so we no longer read it raw here.
    resolveCareNeedsContact(
      {
        fetchActiveAssignments: reads.fetchActiveAssignments,
        fetchMetricDefaults: reads.fetchMetricDefaults,
        fetchAttentionBaselines: reads.fetchAttentionBaselines,
        fetchCareDirectory: reads.fetchShepherdCareDirectory,
      },
      { todayIso }
    ),
    // The admin-managed free-text group-type list, for the create/edit forms'
    // type picker. A read failure degrades to an empty list (the picker then
    // only offers Untyped) rather than blocking the page.
    reads.fetchGroupTypes(),
  ]);

  const groupTypes = groupTypesResult.data ?? [];
  const groupTypesError = groupTypesResult.error?.message ?? null;

  const latestWeek = latestWeekResult.data ?? null;
  const sessionsResult = latestWeek
    ? await reads.fetchAttendanceSessions({ meetingWeek: latestWeek })
    : { data: [], error: null as Error | null };

  const healthGradesByGroupId: Record<string, GroupHealthLetter | null> = {};
  // The set of leader/co-leader profile ids whose care row currently needs
  // attention — the per-leader care concern signal (PRD), now derived from the
  // shared resolver rather than an inline raw-flag loop. Members are not in the
  // directory at all, so they can never be counted; a failed directory read
  // degrades to an empty set (no false concerns).
  const careConcernProfileIds = needsContactProfileIds(careNeedsContact);
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
    groupTypes,
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
      health: healthOverview.error?.message ?? null,
      groupTypes: groupTypesError,
    },
  };
}

export async function loadGroupManagementData(): Promise<GroupManagementData> {
  const client = await createSupabaseServerClient();
  if (!client) return EMPTY_GROUP_MANAGEMENT_DATA;
  return buildGroupManagementData(supabaseGroupManagementReads(client));
}
