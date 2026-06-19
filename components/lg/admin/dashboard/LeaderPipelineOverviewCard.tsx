import { StatusCard, EmptyState } from "@/components/dashboard/cards";
import { P } from "@/lib/pastoral";
import {
  LEADER_READINESS_STAGES,
  STAGE_LABEL,
} from "@/lib/admin/leader-pipeline";
import type { LeaderReadinessStage } from "@/types/enums";
import type { LeaderPipelineDashboardSummary } from "@/lib/dashboard/types";
import { CardNote, MiniBarRow, OpenLink } from "./overview-primitives";

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
        eyebrow="People"
        title="Shepherd pipeline"
        action={
          <OpenLink href="/admin/leader-pipeline" label="Review pipeline" />
        }
      >
        <EmptyState
          title="Pipeline data unavailable"
          description={
            summary.error ?? "The shepherd pipeline could not be loaded."
          }
        />
      </StatusCard>
    );
  }

  return (
    <StatusCard
      eyebrow="People"
      title="Shepherd pipeline"
      action={
        <OpenLink href="/admin/leader-pipeline" label="Review pipeline" />
      }
    >
      {summary.total === 0 ? (
        <CardNote>
          No apprentices yet — future Shepherds will gather here as they are
          identified.
        </CardNote>
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
