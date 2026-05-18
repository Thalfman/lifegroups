import { SectionHeader } from "@/components/layout/shell";
import { WeekSelector } from "@/components/admin/week-selector";
import { P, fontBody } from "@/lib/pastoral";
import type { AdminDashboardData } from "@/lib/dashboard/types";
import type { WeekOption } from "@/lib/admin/check-ins";
import { SummaryCards } from "./summary-cards";
import { AttentionList } from "./attention-list";
import { CapacitySection } from "./capacity-section";
import { HealthSection } from "./health-section";
import { SetupGapsSection } from "./setup-gaps-section";
import { GuestPipelineSection } from "./guest-pipeline-section";
import { FollowUpsSection } from "./follow-ups-section";

export function AdminDashboard({
  data,
  weekOptions,
}: {
  data: AdminDashboardData;
  weekOptions: WeekOption[];
}) {
  return (
    <div style={{ display: "grid", gap: 22 }}>
      <SummaryCards summary={data.summary} />

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, auto) 1fr",
          gap: 14,
          alignItems: "center",
        }}
      >
        <SectionHeader
          eyebrow={data.isCurrentWeek ? "This week" : "Showing"}
          title={data.weekLabel}
          description="Switch the meeting week to revisit prior check-ins, capacity, and follow-ups. Closed groups stay out of these totals."
        />
        <div style={{ justifySelf: "end" }}>
          <WeekSelector
            meetingWeek={data.meetingWeek}
            weekOptions={weekOptions}
            formAction="/admin"
            selectId="admin-week-select"
          />
        </div>
      </section>

      <AttentionList
        items={data.attentionItems}
        meetingWeek={data.meetingWeek}
      />

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 18,
        }}
      >
        <CapacitySection summary={data.capacitySummary} />
        <HealthSection
          summary={data.healthSummary}
          meetingWeek={data.meetingWeek}
        />
      </section>

      <SetupGapsSection gaps={data.setupGaps} />

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1fr)",
          gap: 18,
        }}
      >
        <GuestPipelineSection breakdown={data.guestPipelineBreakdown} />
        <FollowUpsSection items={data.followUps} />
      </section>

      <p
        style={{
          fontFamily: fontBody,
          fontSize: 12,
          color: P.ink3,
          margin: 0,
          fontStyle: "italic",
        }}
      >
        Capacity warning / full thresholds, default capacity, and per-group
        overrides are configured in /admin/settings. Closed groups never
        appear in the buckets above.
      </p>
    </div>
  );
}
