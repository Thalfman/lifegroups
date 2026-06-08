import { StatusCard } from "@/components/dashboard/cards";
import { P, fontBody } from "@/lib/pastoral";
import type { HealthSummary } from "@/lib/dashboard/types";
import { MiniBarRow, OpenLink } from "./overview-primitives";

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
        <p
          style={{
            margin: 0,
            fontFamily: fontBody,
            fontSize: 12.5,
            color: P.ink3,
          }}
        >
          No active groups yet.
        </p>
      ) : (
        <div>
          <MiniBarRow
            label="Healthy"
            count={healthy}
            total={total}
            tone={P.sage}
          />
          <MiniBarRow
            label="Watch"
            count={watch}
            total={total}
            tone={P.mustard}
          />
          <MiniBarRow
            label="Needs follow-up"
            count={needsFollowUp}
            total={total}
            tone={P.terra}
          />
        </div>
      )}
    </StatusCard>
  );
}
