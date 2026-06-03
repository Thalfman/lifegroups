import { PageHeader, PageBody } from "@/components/lg/PageHeader";
import { AdminFollowUpsShell } from "@/components/admin/follow-ups/follow-ups-shell";
import { loadAdminFollowUpsData } from "@/components/admin/follow-ups/follow-ups-data";
import { CareItemList } from "@/components/admin/care/care-item-list";
import { CareShell, type CareTab } from "@/components/admin/care/care-shell";
import { requireAdmin } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  currentUtcDateIso,
  fetchActiveShepherdCoverageAssignmentsForAdmin,
  fetchAllGroupLeaders,
  fetchOutstandingCareFollowUpsForAdmin,
  fetchOverShepherdsForAdmin,
  fetchRecentShepherdCareInteractionsForAdmin,
  fetchRecentlyCompletedCareFollowUpsForAdmin,
  fetchShepherdCareDirectoryForAdmin,
  type ActiveShepherdCoverageAssignmentSummary,
  type CareFollowUpCompletedRow,
  type CareFollowUpDashboardRow,
  type OverShepherdListRow,
  type ShepherdCareDirectoryEntry,
  type ShepherdCareRecentInteractionRow,
} from "@/lib/supabase/read-models";
import { fetchMetricDefaultsCached } from "@/lib/supabase/cached-config";
import {
  careCadenceWindowsFromDefaults,
  decodeMetricDefaults,
} from "@/lib/admin/metrics";
import type { CareCadenceWindows } from "@/lib/admin/shepherd-care-cadence";
import { buildShepherdCareDashboardModel } from "@/lib/admin/shepherd-care-dashboard";
import { buildCareArea } from "@/lib/admin/care-area";
import type { GroupsRow } from "@/types/database";
import { P, fontBody } from "@/lib/pastoral";

// Care area (ADR 0013, #301). Care is the entry point for Job 1 — "who needs
// attention?" — and hosts the former Leader care + Follow-ups surfaces as the
// five tabs Needs Contact, Follow-ups, Due Soon, Recent Care, Completed. It is
// a NEW route: the frozen /admin/shepherd-care and /admin/follow-ups paths,
// tables, and filenames are unchanged and still resolve directly (ADR
// 0008/0009). This is a navigation/layout consolidation, not a data or route
// merge — care-note content stays on the per-leader detail page and the generic
// queue stays on the generic follow_ups table; the two only cross-link.
export const dynamic = "force-dynamic";

type CareData = {
  entries: ShepherdCareDirectoryEntry[];
  assignments: ActiveShepherdCoverageAssignmentSummary[];
  assignmentsAvailable: boolean;
  overShepherds: OverShepherdListRow[];
  recentInteractions: ShepherdCareRecentInteractionRow[];
  outstandingFollowUps: CareFollowUpDashboardRow[];
  outstandingFollowUpsAvailable: boolean;
  completedFollowUps: CareFollowUpCompletedRow[];
  groupLeaders: { profile_id: string; group_id: string }[];
  windows: CareCadenceWindows;
  error: string | null;
};

function emptyCareData(error: string): CareData {
  return {
    entries: [],
    assignments: [],
    assignmentsAvailable: false,
    overShepherds: [],
    recentInteractions: [],
    outstandingFollowUps: [],
    outstandingFollowUpsAvailable: false,
    completedFollowUps: [],
    groupLeaders: [],
    windows: careCadenceWindowsFromDefaults(decodeMetricDefaults(null)),
    error,
  };
}

async function loadCareData(todayIso: string): Promise<CareData> {
  const client = await createSupabaseServerClient();
  if (!client) {
    return emptyCareData("Database is not configured in this environment.");
  }

  // The directory needs the configured staleness windows + the active-coverage
  // set (so its needs_attention matches the dashboard's), so resolve those
  // first; everything else is independent and joins the batch.
  const [
    overShepherdsRes,
    assignmentsRes,
    recentRes,
    outstandingRes,
    completedRes,
    metricDefaultsRes,
    groupLeadersRes,
  ] = await Promise.all([
    fetchOverShepherdsForAdmin(client, { includeArchived: true }),
    fetchActiveShepherdCoverageAssignmentsForAdmin(client),
    fetchRecentShepherdCareInteractionsForAdmin(client, { limit: 30 }),
    fetchOutstandingCareFollowUpsForAdmin(client),
    fetchRecentlyCompletedCareFollowUpsForAdmin(client, { limit: 50 }),
    fetchMetricDefaultsCached(client),
    fetchAllGroupLeaders(client, { activeOnly: true }),
  ]);

  const windows = careCadenceWindowsFromDefaults(
    decodeMetricDefaults(metricDefaultsRes.data ?? null)
  );
  const delegatedShepherdIds = assignmentsRes.error
    ? undefined
    : new Set((assignmentsRes.data ?? []).map((a) => a.shepherd_profile_id));

  const directory = await fetchShepherdCareDirectoryForAdmin(client, {
    todayIso,
    windows,
    delegatedShepherdIds,
  });
  if (directory.error) return emptyCareData(directory.error.message);

  return {
    entries: directory.data,
    assignments: assignmentsRes.data ?? [],
    assignmentsAvailable: assignmentsRes.error === null,
    overShepherds: overShepherdsRes.data ?? [],
    recentInteractions: recentRes.data ?? [],
    outstandingFollowUps: outstandingRes.data ?? [],
    outstandingFollowUpsAvailable: outstandingRes.error === null,
    completedFollowUps: completedRes.data ?? [],
    groupLeaders: (groupLeadersRes.data ?? []).map((r) => ({
      profile_id: r.profile_id,
      group_id: r.group_id,
    })),
    windows,
    error:
      overShepherdsRes.error?.message ??
      assignmentsRes.error?.message ??
      recentRes.error?.message ??
      outstandingRes.error?.message ??
      completedRes.error?.message ??
      groupLeadersRes.error?.message ??
      null,
  };
}

// Resolve each leader's group name(s) from the active group_leaders rows joined
// to the groups list (already loaded for the Follow-ups tab, so no extra read).
function buildGroupNameByShepherdId(
  groupLeaders: { profile_id: string; group_id: string }[],
  groups: GroupsRow[]
): Map<string, string> {
  const nameById = new Map(groups.map((g) => [g.id, g.name]));
  const namesByLeader = new Map<string, string[]>();
  for (const gl of groupLeaders) {
    const name = nameById.get(gl.group_id);
    if (!name) continue;
    const list = namesByLeader.get(gl.profile_id) ?? [];
    if (!list.includes(name)) list.push(name);
    namesByLeader.set(gl.profile_id, list);
  }
  const out = new Map<string, string>();
  for (const [leaderId, names] of namesByLeader) {
    out.set(leaderId, names.sort((a, b) => a.localeCompare(b)).join(", "));
  }
  return out;
}

export default async function AdminCarePage() {
  const session = await requireAdmin();
  const today = currentUtcDateIso();

  const [followUpsData, care] = await Promise.all([
    loadAdminFollowUpsData(),
    loadCareData(today),
  ]);

  const ownerNameByShepherdId = new Map<string, string>();
  for (const a of care.assignments) {
    ownerNameByShepherdId.set(a.shepherd_profile_id, a.over_shepherd.full_name);
  }
  const groupNameByShepherdId = buildGroupNameByShepherdId(
    care.groupLeaders,
    followUpsData.groups
  );

  // The full triage queue (not the dashboard's top-N slice) so Needs Contact
  // lists every leader/co-leader who needs outreach.
  const dashboard = buildShepherdCareDashboardModel({
    entries: care.entries,
    assignments: care.assignments,
    overShepherds: care.overShepherds,
    recentInteractions: care.recentInteractions,
    careFollowUps: care.outstandingFollowUps,
    careFollowUpsAvailable: care.outstandingFollowUpsAvailable,
    todayIso: today,
    assignmentsAvailable: care.assignmentsAvailable,
    windows: care.windows,
    limits: { attention: Math.max(care.entries.length, 1) },
  });

  const area = buildCareArea({
    entries: care.entries,
    attentionQueue: dashboard.attentionQueue,
    outstandingFollowUps: care.outstandingFollowUps,
    completedFollowUps: care.completedFollowUps,
    recentInteractions: care.recentInteractions,
    ownerNameByShepherdId,
    groupNameByShepherdId,
    todayIso: today,
  });

  const errorBanner = care.error ? (
    <p
      style={{
        fontFamily: fontBody,
        color: "#923220",
        background: P.terraSoft,
        padding: "10px 14px",
        borderRadius: 8,
        margin: 0,
      }}
    >
      {care.error}
    </p>
  ) : null;

  const tabs: CareTab[] = [
    {
      key: "needs-contact",
      label: "Needs Contact",
      count: area.needsContact.length,
      panel: (
        <div style={{ display: "grid", gap: 16 }}>
          {errorBanner}
          <CareItemList
            items={area.needsContact}
            emptyTitle="No leaders need outreach right now"
            emptyDescription="Everyone is within their care cadence. Check back as touchpoints come due."
          />
        </div>
      ),
    },
    {
      key: "follow-ups",
      label: "Follow-ups",
      panel: (
        <AdminFollowUpsShell
          data={followUpsData}
          viewerId={session.profile.id}
        />
      ),
    },
    {
      key: "due-soon",
      label: "Due Soon",
      count: area.dueSoon.length,
      panel: (
        <CareItemList
          items={area.dueSoon}
          emptyTitle="Nothing due soon"
          emptyDescription="No care follow-ups are overdue or due in the next week."
        />
      ),
    },
    {
      key: "recent-care",
      label: "Recent Care",
      count: area.recentCare.length,
      panel: (
        <CareItemList
          items={area.recentCare}
          emptyTitle="No recent care logged"
          emptyDescription="Logged calls, notes, and meetings will appear here as they happen."
        />
      ),
    },
    {
      key: "completed",
      label: "Completed",
      count: area.completed.length,
      panel: (
        <CareItemList
          items={area.completed}
          emptyTitle="No completed follow-ups yet"
          emptyDescription="Care follow-ups you mark complete will land here."
        />
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Care"
        title="Who needs"
        italic="attention"
        lede="How your leaders are doing, in one place — who needs outreach, open follow-ups, what's due, and recent care. Care notes stay admin-only and never leave the leader's detail page."
      />
      <PageBody>
        <CareShell tabs={tabs} />
      </PageBody>
    </>
  );
}
