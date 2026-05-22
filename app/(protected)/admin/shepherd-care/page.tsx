import { PageBody, PageHeader } from "@/components/lg/PageHeader";
import { ShepherdCareDirectoryTable } from "@/components/admin/shepherd-care/directory-table";
import {
  ShepherdCareCoverageFilter,
  ShepherdCareFilterChips,
  type CoverageFilter,
  type DirectoryFilter,
} from "@/components/admin/shepherd-care/filter-chips";
import { ShepherdCareDashboardSummaryCards } from "@/components/admin/shepherd-care/dashboard-summary-cards";
import { CareAttentionQueue } from "@/components/admin/shepherd-care/care-attention-queue";
import { CoverageByOverShepherdCard } from "@/components/admin/shepherd-care/coverage-by-over-shepherd-card";
import { UpcomingTouchpointsCard } from "@/components/admin/shepherd-care/upcoming-touchpoints-card";
import { RecentInteractionsCard } from "@/components/admin/shepherd-care/recent-interactions-card";
import { requireAdmin } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  currentUtcDateIso,
  fetchActiveShepherdCoverageAssignmentsForAdmin,
  fetchOverShepherdsForAdmin,
  fetchRecentShepherdCareInteractionsForAdmin,
  fetchShepherdCareDirectoryForAdmin,
  type ActiveShepherdCoverageAssignmentSummary,
  type OverShepherdListRow,
  type ShepherdCareDirectoryEntry,
  type ShepherdCareRecentInteractionRow,
} from "@/lib/supabase/read-models";
import {
  buildShepherdCareDashboardModel,
  countAllAttentionItems,
} from "@/lib/admin/shepherd-care-dashboard";
import { isUuid } from "@/lib/shared/uuid";
import { P, fontBody } from "@/lib/pastoral";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function resolveFilter(value: string | string[] | undefined): DirectoryFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "needs_attention" ? "needs_attention" : "all";
}

function resolveCoverage(
  value: string | string[] | undefined,
): CoverageFilter | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (raw === "unassigned") return "unassigned";
  if (isUuid(raw)) return raw.toLowerCase();
  return undefined;
}

type LoadedData = {
  entries: ShepherdCareDirectoryEntry[];
  overShepherds: OverShepherdListRow[];
  assignments: ActiveShepherdCoverageAssignmentSummary[];
  assignmentsAvailable: boolean;
  recentInteractions: ShepherdCareRecentInteractionRow[];
  error: string | null;
};

async function loadData(): Promise<LoadedData> {
  const client = await createSupabaseServerClient();
  if (!client) {
    return {
      entries: [],
      overShepherds: [],
      assignments: [],
      assignmentsAvailable: false,
      recentInteractions: [],
      error: "Database is not configured in this environment.",
    };
  }
  // All four reads are independent; run them in parallel so the page TTFB is
  // bounded by the slowest query rather than their sum.
  const [directory, overShepherdsRes, assignmentsRes, recentRes] = await Promise.all([
    fetchShepherdCareDirectoryForAdmin(client),
    fetchOverShepherdsForAdmin(client, { includeArchived: true }),
    fetchActiveShepherdCoverageAssignmentsForAdmin(client),
    fetchRecentShepherdCareInteractionsForAdmin(client, { limit: 10 }),
  ]);
  if (directory.error) {
    return {
      entries: [],
      overShepherds: [],
      assignments: [],
      assignmentsAvailable: false,
      recentInteractions: [],
      error: directory.error.message,
    };
  }
  // If the assignments read fails, treat coverage data as unavailable so the
  // dashboard doesn't silently flip every shepherd to "unassigned" and inject
  // no_over_shepherd into the triage queue. The error message still surfaces
  // in the banner below.
  const assignmentsAvailable = assignmentsRes.error === null;
  return {
    entries: directory.data,
    overShepherds: overShepherdsRes.data ?? [],
    assignments: assignmentsRes.data ?? [],
    assignmentsAvailable,
    recentInteractions: recentRes.data ?? [],
    error:
      overShepherdsRes.error?.message ??
      assignmentsRes.error?.message ??
      recentRes.error?.message ??
      null,
  };
}

export default async function AdminShepherdCarePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();

  const sp = await searchParams;
  const filter = resolveFilter(sp.filter);
  const coverage = resolveCoverage(sp.coverage);

  const {
    entries,
    overShepherds,
    assignments,
    assignmentsAvailable,
    recentInteractions,
    error,
  } = await loadData();

  const coverageByShepherdId = new Map<
    string,
    ActiveShepherdCoverageAssignmentSummary
  >();
  for (const a of assignments) {
    coverageByShepherdId.set(a.shepherd_profile_id, a);
  }

  const today = currentUtcDateIso();
  const dashboard = buildShepherdCareDashboardModel({
    entries,
    assignments,
    overShepherds,
    recentInteractions,
    todayIso: today,
    assignmentsAvailable,
  });
  const totalAttention = countAllAttentionItems(entries, assignments, today, {
    coverageAvailable: assignmentsAvailable,
  });

  const needsAttentionCount = dashboard.summary.needsAttention;
  // When the coverage assignments read fails, the in-memory map is empty
  // which would make every shepherd appear "unassigned" if we let the
  // coverage filter run. Treat the param as absent in that case so the
  // directory keeps showing the correct rows, and hide the coverage filter
  // UI below so the admin isn't offered a control that produces wrong
  // results. The summary banner already explains the failure.
  const effectiveCoverage = assignmentsAvailable ? coverage : undefined;
  const filteredByAttention =
    filter === "needs_attention"
      ? entries.filter((e) => e.needs_attention)
      : entries;
  const visible = filteredByAttention.filter((e) => {
    if (effectiveCoverage === undefined) return true;
    const c = coverageByShepherdId.get(e.profile.id) ?? null;
    if (effectiveCoverage === "unassigned") return c === null;
    return c?.over_shepherd_id === effectiveCoverage;
  });

  return (
    <>
      <PageHeader
        eyebrow="Shepherd care"
        title="Shepherd"
        italic="care"
        lede="Track leader and co-leader care: recent connections, next touchpoints, and current care status. Admin-only — care notes never leave this surface."
      />
      <PageBody>
        <div style={{ display: "grid", gap: 18 }}>
          <ShepherdCareDashboardSummaryCards
            summary={dashboard.summary}
            filter={filter}
            coverage={coverage}
            coverageAvailable={dashboard.coverageAvailable}
          />
          <CareAttentionQueue
            items={dashboard.attentionQueue}
            totalCount={totalAttention}
          />
          <div
            className="lg-m-grid-stack"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 18,
            }}
          >
            {dashboard.coverageAvailable ? (
              <CoverageByOverShepherdCard buckets={dashboard.coverageBuckets} />
            ) : null}
            <UpcomingTouchpointsCard items={dashboard.upcomingTouchpoints} />
          </div>
          <RecentInteractionsCard items={dashboard.recentInteractions} />
          {error ? (
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
              {error}
            </p>
          ) : null}
          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              flexWrap: "wrap",
              justifyContent: "space-between",
            }}
          >
            <ShepherdCareFilterChips
              current={filter}
              totalCount={entries.length}
              needsAttentionCount={needsAttentionCount}
              coverage={effectiveCoverage}
            />
            {dashboard.coverageAvailable ? (
              <ShepherdCareCoverageFilter
                filter={filter}
                coverage={coverage}
                overShepherds={overShepherds}
                unassignedCount={dashboard.summary.unassignedCoverage}
              />
            ) : null}
          </div>
          <ShepherdCareDirectoryTable
            entries={visible}
            coverageByShepherdId={coverageByShepherdId}
          />
        </div>
      </PageBody>
    </>
  );
}
