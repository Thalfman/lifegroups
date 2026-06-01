import { StatusCard } from "@/components/dashboard/cards";
import { P, fontBody } from "@/lib/pastoral";
import type { GuestPipelineStage } from "@/types/enums";
import type { PipelineStageCount } from "@/lib/dashboard/types";
import { MiniBarRow, OpenLink } from "./overview-primitives";

// Tone the funnel so the destination stages read as "good" and the parked
// stage reads muted; everything in-flight is terra.
function stageTone(stage: GuestPipelineStage): string {
  if (stage === "placed") return P.sageTextStrong;
  if (stage === "attended") return P.sage;
  if (stage === "not_now") return P.ink3;
  return P.terra;
}

// Guest pipeline funnel. The breakdown was already fetched for the landing but
// never rendered; the executive overview surfaces it as a funnel. Links to the
// guests surface (resolves by direct URL even though it's off the nav).
//
// `total` is the active-pipeline headline (excludes the terminal placed /
// not_now stages); the bars are scaled against the sum of ALL rendered stages
// so terminal stages aren't divided by a denominator that omits them.
export function GuestPipelineFunnelCard({
  breakdown,
  total,
}: {
  breakdown: PipelineStageCount[];
  total: number;
}) {
  const barTotal = breakdown.reduce((sum, s) => sum + s.count, 0);
  return (
    <StatusCard
      eyebrow="Guests"
      title="Pipeline funnel"
      action={<OpenLink href="/admin/guests" />}
    >
      {barTotal === 0 ? (
        <p
          style={{
            margin: 0,
            fontFamily: fontBody,
            fontSize: 12.5,
            color: P.ink3,
          }}
        >
          No guests in the pipeline yet.
        </p>
      ) : (
        <div>
          {breakdown.map((s) => (
            <MiniBarRow
              key={s.stage}
              label={s.label}
              count={s.count}
              total={barTotal}
              tone={stageTone(s.stage)}
            />
          ))}
          <p
            style={{
              margin: "10px 0 0",
              fontFamily: fontBody,
              fontSize: 12,
              color: P.ink3,
            }}
          >
            {total} in active pipeline
          </p>
        </div>
      )}
    </StatusCard>
  );
}
