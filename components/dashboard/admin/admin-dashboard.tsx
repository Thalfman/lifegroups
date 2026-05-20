import { Card, SectionLabel } from "@/components/pastoral/primitives";
import { WeekSelector } from "@/components/admin/week-selector";
import type { AdminDashboardData } from "@/lib/dashboard/types";
import type { WeekOption } from "@/lib/admin/check-ins";
import { SummaryCards } from "./summary-cards";
import { AttentionList } from "./attention-list";
import { CapacityBuckets } from "./capacity-buckets";
import { HealthBuckets } from "./health-buckets";
import { FollowUpsMini } from "./follow-ups-mini";
import { SetupGapsCard } from "./setup-gaps";

// Life Groups Prototype "Command" variant. Layout:
//   1. Row of 6 summary tiles.
//   2. Two-column row: AttentionList (1.55fr) + side column with
//      CapacityBuckets + FollowUpsMini (1fr).
//   3. 7-tile weekly Health row.
//   4. Setup-gaps card.

export function AdminDashboard({
  data,
  weekOptions,
}: {
  data: AdminDashboardData;
  weekOptions: WeekOption[];
}) {
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <SummaryCards summary={data.summary} />

      <section
        className="lg-m-grid-stack lg-m-attention-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "1.55fr 1fr",
          gap: 18,
          alignItems: "start",
        }}
      >
        <Card>
          <div
            className="lg-m-attention-header"
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 16,
              marginBottom: 14,
              flexWrap: "wrap",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <h2
                style={{
                  margin: 0,
                  fontFamily: "var(--font-display)",
                  fontSize: 20,
                  fontWeight: 500,
                  color: "var(--c-ink)",
                }}
              >
                Groups needing attention
              </h2>
              <div
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: 12.5,
                  color: "var(--c-ink3)",
                  marginTop: 4,
                }}
              >
                {data.isCurrentWeek ? "This week" : `Showing ${data.weekLabel}`}{" "}
                · prioritized — care signals first, capacity next.
              </div>
            </div>
            <WeekSelector
              meetingWeek={data.meetingWeek}
              weekOptions={weekOptions}
              formAction="/admin"
              selectId="admin-week-select"
            />
          </div>
          <AttentionList items={data.attentionItems} meetingWeek={data.meetingWeek} />
        </Card>

        <div style={{ display: "grid", gap: 18, gridAutoRows: "min-content" }}>
          <Card>
            <SectionLabel hint="this week">Capacity</SectionLabel>
            <CapacityBuckets summary={data.capacitySummary} />
          </Card>
          <Card>
            <SectionLabel hint={`${data.followUps.length} open`}>
              Follow-ups
            </SectionLabel>
            <FollowUpsMini items={data.followUps} />
          </Card>
        </div>
      </section>

      <Card>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 14,
            flexWrap: "wrap",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontFamily: "var(--font-display)",
              fontSize: 20,
              fontWeight: 500,
              color: "var(--c-ink)",
            }}
          >
            Weekly health
          </h2>
          <div
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 12.5,
              color: "var(--c-ink3)",
            }}
          >
            Click a bucket to open that slice in Check-ins.
          </div>
        </div>
        <HealthBuckets summary={data.healthSummary} meetingWeek={data.meetingWeek} />
      </Card>

      <Card>
        <SectionLabel hint="don't ship a group with these unfilled">
          Setup gaps
        </SectionLabel>
        <SetupGapsCard gaps={data.setupGaps} />
      </Card>
    </div>
  );
}
