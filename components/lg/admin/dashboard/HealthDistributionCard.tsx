import { StatusCard } from "@/components/dashboard/cards";
import { P, fontBody } from "@/lib/pastoral";
import type { HealthSummary } from "@/lib/dashboard/types";
import { MiniBarRow, OpenLink } from "./overview-primitives";

// Group-health pulse distribution (healthy / watch / needs follow-up). This
// data was already fetched for the landing but never rendered; the executive
// overview surfaces it. Links to the deep Group health surface.
export function HealthDistributionCard({
  counts,
}: {
  counts: HealthSummary["counts"];
}) {
  const total = counts.healthy + counts.watch + counts.needs_follow_up;

  return (
    <StatusCard
      eyebrow="Group health"
      title="Health pulse"
      action={<OpenLink href="/admin/group-health" />}
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
          No health pulse recorded yet.
        </p>
      ) : (
        <div>
          <MiniBarRow
            label="Healthy"
            count={counts.healthy}
            total={total}
            tone={P.sage}
          />
          <MiniBarRow
            label="Watch"
            count={counts.watch}
            total={total}
            tone={P.mustard}
          />
          <MiniBarRow
            label="Needs follow-up"
            count={counts.needs_follow_up}
            total={total}
            tone={P.terra}
          />
        </div>
      )}
    </StatusCard>
  );
}
