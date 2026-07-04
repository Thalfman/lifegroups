import { StatusCard } from "@/components/dashboard/cards";
import type { HealthSummary } from "@/lib/dashboard/types";
import { CardNote, MiniBarRow, OpenLink } from "./overview-primitives";

// Group-health pulse distribution (healthy / watch / needs follow-up).
//
// The health buckets partition every active group, but the watch /
// needs_follow_up buckets take precedence over the session-state buckets
// (submitted / missing / did_not_meet / planned_pause), so a normally-submitted
// healthy group lands in `submitted`, not `healthy`. We therefore total ALL
// buckets and treat "Healthy" as everything not flagged watch/needs-follow-up —
// otherwise a normal week (groups submitted, none flagged) would total 0 and
// the card would falsely read "no pulse recorded".
export function HealthDistributionCard({
  counts,
}: {
  counts: HealthSummary["counts"];
}) {
  const total =
    counts.submitted +
    counts.missing +
    counts.did_not_meet +
    counts.planned_pause +
    counts.needs_follow_up +
    counts.watch +
    counts.healthy;
  const watch = counts.watch;
  const needsFollowUp = counts.needs_follow_up;
  // Every group not flagged watch/needs-follow-up reads as healthy on the pulse.
  const healthy = total - watch - needsFollowUp;

  return (
    <StatusCard
      eyebrow="Group health"
      title="Health pulse"
      action={<OpenLink href="/admin/care" label="Review group health" />}
    >
      {total === 0 ? (
        <CardNote>
          No groups are meeting yet — the health pulse will gather here as
          groups begin.
        </CardNote>
      ) : (
        <div>
          <MiniBarRow
            label="Healthy"
            count={healthy}
            total={total}
            toneClassName="bg-sage"
          />
          <MiniBarRow
            label="Watch"
            count={watch}
            total={total}
            toneClassName="bg-amber"
          />
          <MiniBarRow
            label="Needs follow-up"
            count={needsFollowUp}
            total={total}
            toneClassName="bg-clay"
          />
        </div>
      )}
    </StatusCard>
  );
}
