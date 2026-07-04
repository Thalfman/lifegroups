import { StatusCard, EmptyState } from "@/components/dashboard/cards";
import type { ProspectState } from "@/types/enums";
import { PROSPECT_STATE_LABEL } from "@/lib/admin/prospect-funnel";
import { ACTIVE_BOARD_STATES } from "@/lib/supabase/prospect-reads";
import type { InterestFunnelDashboardSummary } from "@/lib/dashboard/types";
import { CardNote, MiniBarRow, OpenLink } from "./overview-primitives";

// Tone the funnel by state, matching the board's colour story: interested is
// the warm intake (yellow), matched is in-flight, not-at-this-time reads as
// parked/muted. Joined renders as the roll-up footer, not a bar.
function stateToneClassName(state: ProspectState): string {
  if (state === "interested") return "bg-amber";
  if (state === "matched") return "bg-clay";
  return "bg-ink3";
}

// Interest Funnel overview (#470, ADR 0016): Prospects by state on the Home
// snapshot, drilling into /admin/plan. This card takes the slot the frozen
// Guests placeholder held by default — the legacy guests card now renders only
// when the guests frozen-surface flag is live. Counts come from the narrow
// fetchProspectStateCounts read (state + archived only); a failed read flips
// available:false and this card degrades to an unavailable state rather than
// presenting a false zero.
export function InterestFunnelOverviewCard({
  summary,
}: {
  summary: InterestFunnelDashboardSummary;
}) {
  if (!summary.available) {
    return (
      <StatusCard
        eyebrow="Plan"
        title="Interest Funnel"
        action={<OpenLink href="/admin/plan" label="Work the funnel" />}
      >
        <EmptyState
          title="Funnel data unavailable"
          description={
            summary.error ?? "The Interest Funnel could not be loaded."
          }
        />
      </StatusCard>
    );
  }

  // The three live states scale the bars; Joined is the collapsed roll-up.
  const activeTotal = ACTIVE_BOARD_STATES.reduce(
    (sum, state) => sum + summary.counts[state],
    0
  );
  const joined = summary.counts.joined;

  return (
    <StatusCard
      eyebrow="Plan"
      title="Interest Funnel"
      action={<OpenLink href="/admin/plan" label="Work the funnel" />}
    >
      {activeTotal === 0 && joined === 0 ? (
        <CardNote>
          No Prospects in the Interest Funnel yet — new interest will gather
          here.
        </CardNote>
      ) : (
        <div>
          {ACTIVE_BOARD_STATES.map((state) => (
            <MiniBarRow
              key={state}
              label={PROSPECT_STATE_LABEL[state]}
              count={summary.counts[state]}
              total={activeTotal}
              toneClassName={stateToneClassName(state)}
            />
          ))}
          <p className="m-0 mt-2.5 font-sans text-xs text-ink3">
            {activeTotal} in the funnel · {joined} joined a group
          </p>
        </div>
      )}
    </StatusCard>
  );
}
