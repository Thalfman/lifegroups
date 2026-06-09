import { StatusCard, EmptyState } from "@/components/dashboard/cards";
import { P, fontBody, fontSans } from "@/lib/pastoral";
import { CANDIDATE_STATUS_LABEL } from "@/lib/admin/multiplication";
import type { MultiplicationCandidateStatus } from "@/types/enums";
import type {
  MultiplicationDashboardSummary,
  MultiplyReadinessDashboardSummary,
} from "@/lib/dashboard/types";
import { OpenLink, StatTile, StatTileGrid } from "./overview-primitives";

const CANDIDATE_ORDER: MultiplicationCandidateStatus[] = [
  "watching",
  "planned",
  "launched",
  "deferred",
];

// Multiplication overview (#470, ADR 0019/0021/0022): "X of Y cells ready"
// from the per-cell readiness signal, plus the planner's candidate counts,
// drilling into /admin/multiply. The readiness summary is built purely over
// the same Multiply grid the deep surface renders (buildMultiplyHomeSummary),
// so Home can never disagree with it. A failed grid read flips available:false
// and the whole card degrades to an unavailable state — never a false
// "0 of 0 ready". The candidate footer carries its own availability, mirroring
// the Capacity & launch card's multiplication line.
export function MultiplyOverviewCard({
  summary,
  multiplication,
}: {
  summary: MultiplyReadinessDashboardSummary;
  multiplication: MultiplicationDashboardSummary;
}) {
  if (!summary.available) {
    return (
      <StatusCard
        eyebrow="Multiply"
        title="Multiplication readiness"
        action={<OpenLink href="/admin/multiply" label="Review readiness" />}
      >
        <EmptyState
          title="Readiness data unavailable"
          description={summary.error ?? "Cell readiness could not be loaded."}
        />
      </StatusCard>
    );
  }

  return (
    <StatusCard
      eyebrow="Multiply"
      title="Multiplication readiness"
      action={<OpenLink href="/admin/multiply" label="Review readiness" />}
    >
      {summary.activeCells === 0 ? (
        <p
          style={{
            margin: 0,
            fontFamily: fontBody,
            fontSize: 12.5,
            color: P.ink3,
          }}
        >
          No active cells yet — readiness will gather here once group types are
          set up in Settings.
        </p>
      ) : (
        <StatTileGrid>
          <StatTile
            label="Cells ready"
            value={summary.readyCells}
            valueColor={summary.readyCells > 0 ? P.sage : P.ink}
            hint={`of ${summary.activeCells}`}
          />
        </StatTileGrid>
      )}

      <div
        style={{
          marginTop: 14,
          paddingTop: 12,
          borderTop: `1px solid ${P.line2}`,
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontFamily: fontSans,
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: 1.3,
            color: P.ink3,
            fontWeight: 600,
          }}
        >
          Planner
        </span>
        {/* Render an explicit unavailable note rather than dropping the line,
            so a failed candidate read doesn't read as "no candidates". */}
        <span
          style={{
            fontFamily: fontBody,
            fontSize: 12.5,
            color: multiplication.available ? P.ink2 : P.ink3,
            fontStyle: multiplication.available ? "normal" : "italic",
          }}
        >
          {multiplication.available
            ? CANDIDATE_ORDER.map(
                (s, i) =>
                  `${CANDIDATE_STATUS_LABEL[s]} ${multiplication.counts[s]}${
                    i < CANDIDATE_ORDER.length - 1 ? "  ·  " : ""
                  }`
              ).join("")
            : "Data unavailable"}
        </span>
      </div>
    </StatusCard>
  );
}
