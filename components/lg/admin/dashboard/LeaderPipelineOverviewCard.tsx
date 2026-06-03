import { StatusCard, EmptyState } from "@/components/dashboard/cards";
import { P, fontBody } from "@/lib/pastoral";
import {
  LEADER_READINESS_STAGES,
  STAGE_LABEL,
} from "@/lib/admin/leader-pipeline";
import type { LeaderReadinessStage } from "@/types/enums";
import type { LeaderPipelineDashboardSummary } from "@/lib/dashboard/types";
import { MiniBarRow, OpenLink } from "./overview-primitives";

function stageTone(stage: LeaderReadinessStage): string {
  if (stage === "ready_to_lead") return P.sage;
  if (stage === "launched") return P.sageTextStrong;
  return P.mustard;
}

// Leadership supply by readiness stage — the apprentice pipeline that feeds
// multiplication. Reuses the canonical stage order + labels so it matches
// /admin/leader-pipeline.
export function LeaderPipelineOverviewCard({
  summary,
}: {
  summary: LeaderPipelineDashboardSummary;
}) {
  if (!summary.available) {
    return (
      <StatusCard
        eyebrow="Leaders"
        title="Leader pipeline"
        action={
          <OpenLink href="/admin/leader-pipeline" label="Review pipeline" />
        }
      >
        <EmptyState
          title="Pipeline data unavailable"
          description={
            summary.error ?? "The leader pipeline could not be loaded."
          }
        />
      </StatusCard>
    );
  }

  return (
    <StatusCard
      eyebrow="Leaders"
      title="Leader pipeline"
      action={
        <OpenLink href="/admin/leader-pipeline" label="Review pipeline" />
      }
    >
      {summary.total === 0 ? (
        <p
          style={{
            margin: 0,
            fontFamily: fontBody,
            fontSize: 12.5,
            color: P.ink3,
          }}
        >
          No apprentices in the pipeline yet.
        </p>
      ) : (
        <div>
          {LEADER_READINESS_STAGES.map((stage) => (
            <MiniBarRow
              key={stage}
              label={STAGE_LABEL[stage]}
              count={summary.counts[stage]}
              total={summary.total}
              tone={stageTone(stage)}
            />
          ))}
        </div>
      )}
    </StatusCard>
  );
}
