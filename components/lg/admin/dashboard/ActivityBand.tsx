import { MetricCard } from "@/components/dashboard/cards";
import { P } from "@/lib/pastoral";
import type { OverviewActivitySummary } from "@/lib/dashboard/types";

// Activity within the selected period. Groups launched is always present;
// Prospects added (#471, live Interest Funnel intake) / members joined /
// follow-ups completed / care touchpoints come from the activity-counts read
// and show "—" when it's unavailable. The frozen-guests "Guests welcomed" tile
// renders only while that surface's flag is live.
export function ActivityBand({
  activity,
  guestsLive,
}: {
  activity: OverviewActivitySummary;
  guestsLive: boolean;
}) {
  const dash = (n: number | null) =>
    n == null
      ? { value: "—", empty: true }
      : { value: String(n), empty: false };
  const meta = (empty: boolean) =>
    empty ? "Data unavailable" : activity.label;

  const prospects = dash(activity.prospectsAdded);
  const members = dash(activity.membersJoined);
  const followUps = dash(activity.followUpsCompleted);
  const care = dash(activity.careTouchpoints);

  return (
    <div
      className="lg-m-grid-stack"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(178px, 1fr))",
        gap: 12,
      }}
    >
      <MetricCard
        title="Groups launched"
        value={String(activity.groupsLaunched)}
        meta={activity.label}
        accent={P.sage}
        valueColor={P.ink}
      />
      <MetricCard
        title="Prospects added"
        value={prospects.value}
        empty={prospects.empty}
        meta={meta(prospects.empty)}
        accent={P.terra}
        valueColor={P.ink}
      />
      {guestsLive ? (
        <MetricCard
          title="Guests welcomed"
          value={String(activity.guestsWelcomed)}
          meta={activity.label}
          accent={P.terra}
          valueColor={P.ink}
        />
      ) : null}
      <MetricCard
        title="Members joined"
        value={members.value}
        empty={members.empty}
        meta={meta(members.empty)}
        accent={P.sage}
        valueColor={P.ink}
      />
      <MetricCard
        title="Follow-ups completed"
        value={followUps.value}
        empty={followUps.empty}
        meta={meta(followUps.empty)}
        accent={P.mustard}
        valueColor={P.ink}
      />
      <MetricCard
        title="Care touchpoints"
        value={care.value}
        empty={care.empty}
        meta={meta(care.empty)}
        accent={P.terra}
        valueColor={P.ink}
      />
    </div>
  );
}
