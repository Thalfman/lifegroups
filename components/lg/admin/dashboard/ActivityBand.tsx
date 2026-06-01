import { MetricCard } from "@/components/dashboard/cards";
import { P } from "@/lib/pastoral";
import type { OverviewActivitySummary } from "@/lib/dashboard/types";

// Activity within the selected period. Groups launched / guests welcomed are
// always present; members joined / follow-ups completed / care touchpoints come
// from the activity-counts read and show "—" when it's unavailable.
export function ActivityBand({
  activity,
}: {
  activity: OverviewActivitySummary;
}) {
  const dash = (n: number | null) =>
    n == null
      ? { value: "—", empty: true }
      : { value: String(n), empty: false };
  const meta = (empty: boolean) =>
    empty ? "Data unavailable" : activity.label;

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
        title="Guests welcomed"
        value={String(activity.guestsWelcomed)}
        meta={activity.label}
        accent={P.terra}
        valueColor={P.ink}
      />
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
