import { PageBody, PageHeader } from "@/components/lg/PageHeader";
import { ShepherdCareDirectoryTable } from "@/components/admin/shepherd-care/directory-table";
import {
  ShepherdCareCoverageFilter,
  ShepherdCareFilterChips,
} from "@/components/admin/shepherd-care/filter-chips";
import { ShepherdCareDashboardSummaryCards } from "@/components/admin/shepherd-care/dashboard-summary-cards";
import { CareAttentionQueue } from "@/components/admin/shepherd-care/care-attention-queue";
import { CoverageByOverShepherdCard } from "@/components/admin/shepherd-care/coverage-by-over-shepherd-card";
import { UpcomingTouchpointsCard } from "@/components/admin/shepherd-care/upcoming-touchpoints-card";
import { RecentInteractionsCard } from "@/components/admin/shepherd-care/recent-interactions-card";
import { ShepherdCareViewToggle } from "@/components/admin/shepherd-care/view-toggle";
import { requireAdmin } from "@/lib/auth/session";
import { currentUtcDateIso } from "@/lib/supabase/read-models";
import type { ActiveShepherdCoverageAssignmentSummary } from "@/lib/supabase/read-models";
import { loadShepherdCareData } from "@/components/admin/shepherd-care/shepherd-care-data";
import {
  buildShepherdCareDashboardModel,
  countAllAttentionItems,
} from "@/lib/admin/shepherd-care-dashboard";
import { resolveShepherdCareViewState } from "@/lib/admin/shepherd-care-view";
import { P, fontBody } from "@/lib/pastoral";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function AdminShepherdCarePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();

  const sp = await searchParams;
  const { view, filter, coverage } = resolveShepherdCareViewState(sp);

  // Pin "today" once at the top so every read and composition step uses
  // the same calendar day. Without this, a request crossing UTC midnight
  // could compute entry.needs_attention against one day in the directory
  // read while the dashboard summary / queue used a different day.
  const today = currentUtcDateIso();

  const {
    entries,
    overShepherds,
    assignments,
    assignmentsAvailable,
    recentInteractions,
    recentInteractionsAvailable,
    careFollowUps,
    careFollowUpsAvailable,
    windows,
    error,
  } = await loadShepherdCareData(today);

  const coverageByShepherdId = new Map<
    string,
    ActiveShepherdCoverageAssignmentSummary
  >();
  for (const a of assignments) {
    coverageByShepherdId.set(a.shepherd_profile_id, a);
  }

  const dashboard = buildShepherdCareDashboardModel({
    entries,
    assignments,
    overShepherds,
    recentInteractions,
    careFollowUps,
    careFollowUpsAvailable,
    todayIso: today,
    assignmentsAvailable,
    windows,
  });
  const totalAttention = countAllAttentionItems(entries, assignments, today, {
    coverageAvailable: assignmentsAvailable,
    windows,
    careFollowUps,
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

  // The error / data-unavailable banner surfaces in whichever view is active,
  // since a failed read affects both the dashboard model and the directory.
  const errorBanner = error ? (
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
  ) : null;

  return (
    <>
      <PageHeader
        eyebrow="Leader care"
        title="Leader"
        italic="care"
        lede="Track leader and co-leader care: recent connections, next touchpoints, and current care status. Admin-only — care notes never leave this surface."
      />
      <PageBody>
        <div style={{ display: "grid", gap: 18 }}>
          <ShepherdCareViewToggle
            current={view}
            filter={filter}
            coverage={coverage}
          />
          {view === "dashboard" ? (
            <>
              {/* Lead with the daily decision — who needs attention — so the
                  queue is what loads. The summary cards and the rest of the
                  dashboard follow it; the full directory stays behind the
                  Directory view toggle above (#218 / family C). */}
              <CareAttentionQueue
                items={dashboard.attentionQueue}
                totalCount={totalAttention}
              />
              <ShepherdCareDashboardSummaryCards
                summary={dashboard.summary}
                coverageAvailable={dashboard.coverageAvailable}
                followUpsAvailable={dashboard.followUpsAvailable}
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
                  <CoverageByOverShepherdCard
                    buckets={dashboard.coverageBuckets}
                  />
                ) : null}
                <UpcomingTouchpointsCard
                  items={dashboard.upcomingTouchpoints}
                />
              </div>
              <RecentInteractionsCard
                items={dashboard.recentInteractions}
                available={recentInteractionsAvailable}
              />
              {errorBanner}
            </>
          ) : (
            <>
              {errorBanner}
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
            </>
          )}
        </div>
      </PageBody>
    </>
  );
}
