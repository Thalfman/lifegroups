import { Card } from "@/components/lg/Card";
import { SectionLabel } from "@/components/lg/SectionLabel";
import { PageBody } from "@/components/lg/PageHeader";
import type { AdminDashboardData } from "@/lib/dashboard/types";
import type { WeekOption } from "@/lib/admin/check-ins";
import { SummaryTiles } from "./SummaryTiles";
import { AttentionQueue } from "./AttentionQueue";
import { CapacityBuckets } from "./CapacityBuckets";
import { FollowUpsMini } from "./FollowUpsMini";
import { WeeklyHealthBuckets } from "./WeeklyHealthBuckets";
import { SetupGaps } from "./SetupGaps";
import { WeekSelector } from "./WeekSelector";
import { ShepherdCareTriageCard } from "./ShepherdCareTriageCard";
import { LaunchPlanningSnapshotCard } from "./LaunchPlanningSnapshotCard";

// Julian admin OS landing — shepherd care + launch planning lead, with
// weekly check-in surfaces (Attention queue, Capacity, Follow-ups,
// Weekly health) supporting below. See
// docs/PRODUCT_SURFACE_AUDIT_2026-05.md for the pivot rationale.
export function DashboardClient({
  data,
  weekOptions,
}: {
  data: AdminDashboardData;
  weekOptions: WeekOption[];
}) {
  return (
    <PageBody>
      <div style={{ display: "grid", gap: 18 }}>
        <SummaryTiles summary={data.summary} />

        <div
          className="lg-shell-grid-2"
          style={{
            display: "grid",
            gridTemplateColumns: "1.55fr 1fr",
            gap: 18,
          }}
        >
          <ShepherdCareTriageCard summary={data.shepherdCare} />
          <LaunchPlanningSnapshotCard snapshot={data.launchPlanning} />
        </div>

        <div
          className="lg-shell-grid-2"
          style={{
            display: "grid",
            gridTemplateColumns: "1.55fr 1fr",
            gap: 18,
          }}
        >
          <Card>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                marginBottom: 14,
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div>
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
                  Prioritized — care + capacity signals first, weekly cadence after.
                </div>
              </div>
              <WeekSelector
                meetingWeek={data.meetingWeek}
                weekOptions={weekOptions}
                formAction="/admin"
              />
            </div>
            <AttentionQueue
              items={data.attentionItems}
              meetingWeek={data.meetingWeek}
            />
          </Card>

          <div
            style={{
              display: "grid",
              gap: 18,
              gridAutoRows: "min-content",
            }}
          >
            <Card>
              <SectionLabel hint="this week">Capacity</SectionLabel>
              <CapacityBuckets summary={data.capacitySummary} />
            </Card>
            <Card>
              <SectionLabel hint={data.followUps.length === 0 ? "all quiet" : "open"}>
                Follow-ups
              </SectionLabel>
              <FollowUpsMini items={data.followUps} />
            </Card>
          </div>
        </div>

        <Card>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              marginBottom: 14,
              gap: 12,
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
              Check-in submission status for the selected week.
            </div>
          </div>
          <WeeklyHealthBuckets
            summary={data.healthSummary}
            meetingWeek={data.meetingWeek}
          />
        </Card>

        <Card>
          <SectionLabel hint="don't ship a group with these unfilled">
            Setup gaps
          </SectionLabel>
          <SetupGaps data={data.setupGaps} />
        </Card>
      </div>
    </PageBody>
  );
}
