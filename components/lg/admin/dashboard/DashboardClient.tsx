import type { ReactNode } from "react";
import { PageBody } from "@/components/lg/PageHeader";
import { P, fontSans } from "@/lib/pastoral";
import type { AdminDashboardData } from "@/lib/dashboard/types";
import { VitalSignsBand } from "./VitalSignsBand";
import { LeaderCareOverviewCard } from "./LeaderCareOverviewCard";
import { LaunchPlanningOverviewCard } from "./LaunchPlanningOverviewCard";
import { HealthDistributionCard } from "./HealthDistributionCard";
import { GuestPipelineFunnelCard } from "./GuestPipelineFunnelCard";
import { LeaderPipelineOverviewCard } from "./LeaderPipelineOverviewCard";
import { NeedsAttentionArea } from "./NeedsAttentionArea";
import { ActivityBand } from "./ActivityBand";
import { PeriodSlicer } from "./PeriodSlicer";
import { CollapsibleOverview } from "./CollapsibleOverview";

// Executive overview for the /admin landing. Re-skinned warm (pastoral palette)
// so it meshes with the Leader care / Launch planning surfaces instead of
// clashing in near-white lg cards. Leads with point-in-time "vital signs", then
// domain overview cards that drill into the deep pages, then a compact
// drill-down strip that replaces the former on-page operational queues.
// See docs/PRODUCT_SURFACE_AUDIT_2026-05.md for the admin-OS landing rationale.

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontFamily: fontSans,
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: 1.8,
        color: P.ink3,
        fontWeight: 600,
      }}
    >
      {children}
    </div>
  );
}

export function DashboardClient({
  data,
  guestsLive,
  degraded,
  scopeId,
}: {
  data: AdminDashboardData;
  guestsLive: boolean;
  // True when the dashboard read failed and `data` is demo fallback.
  degraded?: boolean;
  // Signed-in profile id, scoping the collapsible-overview saved default (#292).
  scopeId?: string | null;
}) {
  return (
    <PageBody>
      <div style={{ display: "grid", gap: 18 }}>
        <VitalSignsBand data={data} />

        {/* Most actionable content leads (#291): the ranked next actions sit
            directly beneath the vital signs rather than at the page foot. */}
        <div style={{ display: "grid", gap: 10 }}>
          <SectionHeading>Top next actions</SectionHeading>
          <NeedsAttentionArea data={data} degraded={degraded} />
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <SectionHeading>Activity</SectionHeading>
            <PeriodSlicer current={data.activity.grain} />
          </div>
          <ActivityBand activity={data.activity} />
        </div>

        <CollapsibleOverview scopeId={scopeId}>
          <div
            className="lg-shell-grid-2"
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}
          >
            <LeaderCareOverviewCard summary={data.shepherdCare} />
            <LaunchPlanningOverviewCard
              snapshot={data.launchPlanning}
              multiplication={data.multiplication}
            />
          </div>

          <div
            className="lg-shell-grid-3"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 18,
            }}
          >
            <HealthDistributionCard counts={data.healthSummary.counts} />
            <GuestPipelineFunnelCard
              breakdown={data.guestPipelineBreakdown}
              total={data.guestPipelineCount}
              live={guestsLive}
            />
            <LeaderPipelineOverviewCard summary={data.leaderPipeline} />
          </div>
        </CollapsibleOverview>
      </div>
    </PageBody>
  );
}
