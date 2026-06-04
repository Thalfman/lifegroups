import { PageHeader, PageBody } from "@/components/lg/PageHeader";
import { AdminFollowUpsShell } from "@/components/admin/follow-ups/follow-ups-shell";
import { loadAdminFollowUpsData } from "@/components/admin/follow-ups/follow-ups-data";
import { CareItemList } from "@/components/admin/care/care-item-list";
import { CareShell, type CareTab } from "@/components/admin/care/care-shell";
import { requireAdmin } from "@/lib/auth/session";
import { currentUtcDateIso } from "@/lib/supabase/read-models";
import { loadCareData } from "@/components/admin/care/care-data";
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

// Resolve each leader's group name(s) from the active group_leaders rows joined
// to the groups list (already loaded for the Follow-ups tab, so no extra read).
function buildGroupNameByShepherdId(
  groupLeaders: { profile_id: string; group_id: string }[],
  groups: GroupsRow[]
): Map<string, string> {
  // Only active groups: closing a group updates groups.lifecycle_status but
  // leaves its group_leaders rows active, so a closed group would otherwise
  // surface as a current related group.
  const nameById = new Map(
    groups
      .filter((g) => g.lifecycle_status === "active")
      .map((g) => [g.id, g.name])
  );
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
        <CareItemList
          items={area.needsContact}
          emptyTitle="No leaders need outreach right now"
          emptyDescription="Everyone is within their care cadence. Check back as touchpoints come due."
        />
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
        {/* Page-level so a failed care read is visible from every tab, not just
            Needs Contact — otherwise Due Soon / Recent Care / Completed would
            show their normal empty state and falsely signal "no care work". */}
        {errorBanner ? (
          <div style={{ marginBottom: 18 }}>{errorBanner}</div>
        ) : null}
        <CareShell tabs={tabs} />
      </PageBody>
    </>
  );
}
