import type { ReactNode } from "react";
import { PageHeader, PageBody } from "@/components/lg/PageHeader";
import { AdminFollowUpsShell } from "@/components/admin/follow-ups/follow-ups-shell";
import { loadAdminFollowUpsData } from "@/components/admin/follow-ups/follow-ups-data";
import { CareItemList } from "@/components/admin/care/care-item-list";
import { SectionHeader } from "@/components/layout/shell";
import { ShepherdCareDashboardSummaryCards } from "@/components/admin/shepherd-care/dashboard-summary-cards";
import { CareAttentionQueue } from "@/components/admin/shepherd-care/care-attention-queue";
import { ShepherdCareDirectoryTable } from "@/components/admin/shepherd-care/directory-table";
import { CoverageByOverShepherdCard } from "@/components/admin/shepherd-care/coverage-by-over-shepherd-card";
import {
  CareShell,
  type CareTab,
  type CareTabKey,
} from "@/components/admin/care/care-shell";
import { resolveCareInitialTabFromParams } from "@/lib/admin/shepherd-care-view";
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
import {
  buildShepherdCareDashboardModel,
  countAllAttentionItems,
} from "@/lib/admin/shepherd-care-dashboard";
import { buildCareArea } from "@/lib/admin/care-area";
import type { GroupsRow } from "@/types/database";
import { P, fontBody, fontSans } from "@/lib/pastoral";

// Bucket heading inside the Follow-ups tab's shepherd-care section. Quieter than
// the SectionHeader title so the two buckets read as subdivisions of one source.
const careGroupHeadingStyle = {
  margin: 0,
  fontFamily: fontSans,
  fontSize: 11,
  letterSpacing: 1.2,
  textTransform: "uppercase",
  fontWeight: 700,
  color: P.ink3,
} as const;

// Care area (ADR 0013, #301; re-keyed to the PRD IA in #334). Care is the entry
// point for Job 1 — "how are my leaders doing?" — and hosts the former Leader
// care + Follow-ups surfaces as the five canonical tabs Dashboard, Directory,
// Follow-ups, Coverage, Recent interactions. Every panel is backed by data
// already loaded below (loadCarePageData) — the re-key introduces NO new reads:
//   • Dashboard      — summary tiles + attention queue (the former Needs Contact
//                      signal — "who needs contact" — now lives here).
//   • Directory      — the full leader roster with coverage owner column.
//   • Follow-ups     — BOTH follow-up sources, clearly labelled: a leading
//                      shepherd-care section (the former Due Soon / Completed
//                      buckets, backed by shepherd_care_follow_ups) plus the
//                      generic open-task queue (the `follow_ups` table). They are
//                      separate tables, not one queue's filters, so both render
//                      here rather than collapsing into the generic queue.
//   • Coverage       — over-shepherd buckets + an Unassigned bucket.
//   • Recent interactions — the recent calls / notes / meetings feed (renamed
//                      from Recent Care).
// It is a NEW route: the frozen /admin/shepherd-care and /admin/follow-ups
// paths, tables, and filenames are unchanged and still alias-render directly
// (200, not 302) (ADR 0008/0009, #328). This is a navigation/layout
// consolidation, not a data or route merge — care-note content stays on the
// per-leader detail page and the generic queue stays on the generic follow_ups
// table; the two only cross-link.
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
    // Only leader / co_leader rows describe groups a care target *leads*;
    // group_leaders also carries role = 'member' rows, which must not show up as
    // a led/related group in the Care tabs.
    groupLeaders: (groupLeadersRes.data ?? [])
      .filter((r) => r.role === "leader" || r.role === "co_leader")
      .map((r) => ({ profile_id: r.profile_id, group_id: r.group_id })),
    windows,
    error:
      overShepherdsRes.error?.message ??
      assignmentsRes.error?.message ??
      recentRes.error?.message ??
      outstandingRes.error?.message ??
      completedRes.error?.message ??
      metricDefaultsRes.error?.message ??
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

// Shared loader + tab/banner builder for the canonical Care shell. The canonical
// /admin/care page and the thin alias entries (/admin/shepherd-care landing and
// /admin/follow-ups) all call this one function so there is a single data path
// and a single set of tabs — the aliases only differ by which tab they open on
// (ADR 0013, #328). It runs the admin guard so a thin alias page is a guarded
// entry just like the canonical page.
export async function loadCarePageData(): Promise<{
  tabs: CareTab[];
  errorBanner: ReactNode;
}> {
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

  // Dashboard model drives the Dashboard tab's summary tiles + attention queue
  // (the former Needs Contact signal) and the Coverage tab's over-shepherd
  // buckets. The attention queue keeps its default top-N slice for the scan
  // surface; countAllAttentionItems gives the true total so the queue can render
  // its "+N more in the Directory" footer.
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
  });
  const totalAttention = countAllAttentionItems(
    care.entries,
    care.assignments,
    today,
    {
      coverageAvailable: care.assignmentsAvailable,
      windows: care.windows,
      careFollowUps: care.outstandingFollowUps,
    }
  );

  // Coverage owner per leader, so the Directory table can render its
  // "Over-shepherd" column from the already-loaded active assignments.
  const coverageByShepherdId = new Map<
    string,
    ActiveShepherdCoverageAssignmentSummary
  >();
  for (const a of care.assignments) {
    coverageByShepherdId.set(a.shepherd_profile_id, a);
  }

  // buildCareArea maps the loaded reads into the enriched care-item rows (owner
  // + group resolved). After the #334 re-key:
  //   • recentCare        → Recent interactions tab.
  //   • dueSoon/completed  → the SHEPHERD-CARE section of the Follow-ups tab.
  // The shepherd_care_follow_ups buckets (dueSoon / completed) MUST keep an
  // actionable home: AdminFollowUpsShell reads only the generic `follow_ups`
  // table, so without this section a due-soon-not-overdue or recently-completed
  // shepherd-care follow-up would have no list to act from anywhere under
  // /admin/care (the Dashboard only counts the overdue ones). needsContact is
  // surfaced via the Dashboard attention queue and so is not consumed here.
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
      key: "dashboard",
      label: "Dashboard",
      count: totalAttention,
      panel: (
        <div style={{ display: "grid", gap: 18 }}>
          <ShepherdCareDashboardSummaryCards
            summary={dashboard.summary}
            coverageAvailable={dashboard.coverageAvailable}
            followUpsAvailable={dashboard.followUpsAvailable}
          />
          <CareAttentionQueue
            items={dashboard.attentionQueue}
            totalCount={totalAttention}
          />
        </div>
      ),
    },
    {
      key: "directory",
      label: "Directory",
      count: care.entries.length,
      panel: (
        <ShepherdCareDirectoryTable
          entries={care.entries}
          coverageByShepherdId={coverageByShepherdId}
        />
      ),
    },
    {
      key: "follow-ups",
      label: "Follow-ups",
      // Two distinct follow-up sources live here, each clearly labelled so they
      // can't be mistaken for one another (#334 P1 — keep shepherd-care
      // follow-ups visible). The shepherd-care buckets (dueSoon / completed,
      // backed by shepherd_care_follow_ups) lead with their own CareItemList so
      // due-soon-not-overdue and recently-completed care follow-ups stay
      // actionable; the generic oversight queue (the `follow_ups` table) follows
      // unchanged so neither host loses functionality.
      panel: (
        <div style={{ display: "grid", gap: 36 }}>
          <section style={{ display: "grid", gap: 18 }}>
            <SectionHeader
              eyebrow="Shepherd care"
              title="Care follow-ups"
              description="Care follow-ups due soon or overdue, plus the ones recently completed. Each links into the leader's detail page where the work happens."
            />
            <div style={{ display: "grid", gap: 24 }}>
              <div style={{ display: "grid", gap: 10 }}>
                <h3 style={careGroupHeadingStyle}>
                  Due soon ({area.dueSoon.length})
                </h3>
                <CareItemList
                  items={area.dueSoon}
                  emptyTitle="Nothing due soon"
                  emptyDescription="No care follow-ups are overdue or due in the next week."
                />
              </div>
              <div style={{ display: "grid", gap: 10 }}>
                <h3 style={careGroupHeadingStyle}>
                  Completed ({area.completed.length})
                </h3>
                <CareItemList
                  items={area.completed}
                  emptyTitle="No completed follow-ups yet"
                  emptyDescription="Care follow-ups you mark complete will land here."
                />
              </div>
            </div>
          </section>
          <AdminFollowUpsShell
            data={followUpsData}
            viewerId={session.profile.id}
          />
        </div>
      ),
    },
    {
      key: "coverage",
      label: "Coverage",
      panel: <CoverageByOverShepherdCard buckets={dashboard.coverageBuckets} />,
    },
    {
      key: "recent-interactions",
      label: "Recent interactions",
      count: area.recentCare.length,
      panel: (
        <CareItemList
          items={area.recentCare}
          emptyTitle="No recent care logged"
          emptyDescription="Logged calls, notes, and meetings will appear here as they happen."
        />
      ),
    },
  ];

  return { tabs, errorBanner };
}

// Legacy Leader-care drill-down params that the embedded Dashboard widgets
// still emit (`?view=directory`, `?coverage=…`) against the frozen
// /admin/shepherd-care alias. The shared entry resolves them to the matching
// canonical tab so those deep links open Directory / Coverage instead of
// reloading the default Dashboard (#334 — PRD "serves its deep links").
export type CareSearchParams = {
  view?: string | string[];
  filter?: string | string[];
  coverage?: string | string[];
};

// The canonical Care surface: one header, one shell. The alias entries render
// this same view, only changing which tab opens first, so the experience is
// identical regardless of which URL resolved it (ADR 0013, #328). `initialTab`
// is the route's default landing tab; the legacy `view` / `coverage` drill-down
// params (when present) override it so embedded-widget deep links resolve to the
// right tab — see resolveCareInitialTabFromParams.
export async function CarePageView({
  initialTab = "dashboard",
  searchParams,
}: {
  initialTab?: CareTabKey;
  searchParams?: Promise<CareSearchParams>;
}) {
  const params = (await searchParams) ?? {};
  const resolvedTab = resolveCareInitialTabFromParams(params, initialTab);
  const { tabs, errorBanner } = await loadCarePageData();

  return (
    <>
      <PageHeader
        eyebrow="Care"
        title="How your leaders"
        italic="are doing"
        lede="Your leaders' care in one place — a dashboard of who needs a touch, the full directory, open follow-ups, coverage by over-shepherd, and recent interactions. Care notes stay admin-only and never leave the leader's detail page."
      />
      <PageBody>
        {/* Page-level so a failed care read is visible from every tab, not just
            the Dashboard — otherwise Directory / Coverage / Recent interactions
            would show their normal empty state and falsely signal "no care
            work". */}
        {errorBanner ? (
          <div style={{ marginBottom: 18 }}>{errorBanner}</div>
        ) : null}
        <CareShell tabs={tabs} initialTab={resolvedTab} />
      </PageBody>
    </>
  );
}

export default async function AdminCarePage({
  searchParams,
}: {
  searchParams?: Promise<CareSearchParams>;
}) {
  return <CarePageView searchParams={searchParams} />;
}
