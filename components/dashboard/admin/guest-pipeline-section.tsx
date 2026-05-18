import { StatusCard, EmptyState } from "@/components/dashboard/cards";
import { P, fontBody, fontDisplay, fontSans } from "@/lib/pastoral";
import type { PipelineStageCount } from "@/lib/dashboard/types";

const PIPELINE_COLORS = [P.terra, P.mustard, P.sage, "#4f6e57"];

export function GuestPipelineSection({
  breakdown,
}: {
  breakdown: PipelineStageCount[];
}) {
  const totalPipeline = breakdown.reduce((sum, row) => sum + row.count, 0);

  return (
    <StatusCard
      title="Guest pipeline"
      eyebrow="From the front door to a seat at the table"
      action={`${totalPipeline} in flight`}
    >
      {totalPipeline === 0 ? (
        <EmptyState
          title="No guests yet"
          description="Guests added in Supabase will appear in this pipeline."
        />
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          <div
            role="img"
            aria-label={`Guest pipeline: ${totalPipeline} guest${totalPipeline === 1 ? "" : "s"} tracked.`}
            style={{
              display: "flex",
              height: 12,
              width: "100%",
              overflow: "hidden",
              borderRadius: 99,
              background: P.line2,
            }}
          >
            {breakdown.map((row, idx) => {
              if (row.count === 0) return null;
              const width = (row.count / totalPipeline) * 100;
              return (
                <div
                  key={row.stage}
                  aria-hidden="true"
                  style={{
                    height: "100%",
                    width: `${width}%`,
                    background: PIPELINE_COLORS[idx % PIPELINE_COLORS.length],
                  }}
                />
              );
            })}
          </div>
          <ul
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: 12,
              listStyle: "none",
              padding: 0,
              margin: 0,
            }}
          >
            {breakdown.map((row, idx) => (
              <li
                key={row.stage}
                style={{
                  borderTop: `2px solid ${PIPELINE_COLORS[idx % PIPELINE_COLORS.length]}`,
                  paddingTop: 10,
                }}
              >
                <div
                  style={{
                    fontFamily: fontSans,
                    fontSize: 10,
                    letterSpacing: 1.2,
                    textTransform: "uppercase",
                    color: P.ink3,
                    fontWeight: 600,
                  }}
                >
                  {row.label}
                </div>
                <div
                  style={{
                    fontFamily: fontDisplay,
                    fontSize: 30,
                    fontWeight: 500,
                    letterSpacing: -1,
                    color: PIPELINE_COLORS[idx % PIPELINE_COLORS.length],
                    lineHeight: 1,
                    marginTop: 4,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {row.count}
                </div>
              </li>
            ))}
          </ul>
          <p
            style={{
              fontFamily: fontBody,
              fontSize: 12,
              color: P.ink3,
              margin: 0,
              fontStyle: "italic",
            }}
          >
            Pipeline edits live with the people directory in Phase 5C.
          </p>
        </div>
      )}
    </StatusCard>
  );
}
