import type { OverviewActivitySummary } from "@/lib/dashboard/types";

// Activity within the selected period, as ONE summary row — figure + label
// pairs in a single quiet band, not a wall of stat cards. Groups launched is
// always present; Prospects added (#471, live Interest Funnel intake) /
// members joined / follow-ups completed / care touchpoints come from the
// activity-counts read and show "—" when it's unavailable. The frozen-guests
// "Guests welcomed" figure renders only while that surface's flag is live.
export function ActivityBand({
  activity,
  guestsLive,
}: {
  activity: OverviewActivitySummary;
  guestsLive: boolean;
}) {
  const value = (n: number | null) => (n == null ? "—" : String(n));

  const figures: { label: string; value: string }[] = [
    { label: "Groups launched", value: String(activity.groupsLaunched) },
    { label: "Prospects added", value: value(activity.prospectsAdded) },
    ...(guestsLive
      ? [{ label: "Guests welcomed", value: String(activity.guestsWelcomed) }]
      : []),
    { label: "Members joined", value: value(activity.membersJoined) },
    {
      label: "Follow-ups completed",
      value: value(activity.followUpsCompleted),
    },
    { label: "Care touchpoints", value: value(activity.careTouchpoints) },
  ];

  return (
    <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 rounded-lg border border-line bg-surface px-4 py-3.5">
      {figures.map((f) => (
        <span key={f.label} className="flex items-baseline gap-2">
          <span className="font-display text-xl tabular-nums leading-none text-ink">
            {f.value}
          </span>
          <span className="font-sans text-sm text-ink3">{f.label}</span>
        </span>
      ))}
      <span className="ml-auto font-sans text-xs text-ink3">
        {activity.label}
      </span>
    </div>
  );
}
