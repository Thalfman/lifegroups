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
import { DrillDownStrip, type DrillDownItem } from "./DrillDownStrip";
import { ActivityBand } from "./ActivityBand";
import { PeriodSlicer } from "./PeriodSlicer";

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
}: {
  data: AdminDashboardData;
  guestsLive: boolean;
}) {
  const setupGapTotal =
    data.setupGaps.counts.noCapacity +
    data.setupGaps.counts.noLeader +
    data.setupGaps.counts.noMeetingDayTime +
    data.setupGaps.counts.noMembers;
  const capacityWatch =
    data.capacitySummary.counts.full + data.capacitySummary.counts.warning;

  const drillItems: DrillDownItem[] = [
    {
      label: "Groups need attention",
      count: data.attentionItems.length,
      href: "/admin/groups",
      tone: P.terra,
    },
    {
      label: "On capacity watch",
      count: capacityWatch,
      href: "/admin/launch-planning",
      tone: P.mustard,
    },
    {
      label: "Open follow-ups",
      count: data.followUps.length,
      href: "/admin/follow-ups",
      tone: P.terra,
      // The open follow-ups read is capped, so present it as a minimum.
      plus: data.followUps.length >= 8,
    },
    {
      label: "Setup gaps",
      count: setupGapTotal,
      href: "/admin/groups",
      tone: P.mustard,
    },
  ];

  return (
    <PageBody>
      <div style={{ display: "grid", gap: 18 }}>
        <VitalSignsBand data={data} />

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

        <div style={{ display: "grid", gap: 10 }}>
          <SectionHeading>Needs your attention</SectionHeading>
          <DrillDownStrip items={drillItems} />
        </div>
      </div>
    </PageBody>
  );
}
