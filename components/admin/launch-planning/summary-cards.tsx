import { MetricCard } from "@/components/dashboard/cards";
import type {
  LaunchPlanningInputs,
  LaunchPlanningOutputs,
} from "@/lib/admin/launch-planning";
import { riskTone } from "@/lib/admin/launch-planning";

// Small uppercase tier label, matching the eyebrow treatment used on the cards
// themselves, so the two tiers read as "answer" then "the inputs behind it".
const TIER_LABEL =
  "mb-2.5 font-sans text-[10px] font-semibold uppercase tracking-[1.5px] text-ink3";

const EMPTY_METRIC_LABEL = "No data yet";

// A non-finite metric (e.g. a ratio computed from zero groups or zero
// attendance) renders as a labelled empty state rather than a cryptic em dash
// — see MetricCard's `empty` prop. Finite values format as a rounded integer.
function metricValue(n: number): { value: string; empty: boolean } {
  if (!Number.isFinite(n)) return { value: EMPTY_METRIC_LABEL, empty: true };
  return { value: String(Math.round(n)), empty: false };
}

// L1 (#225): the at-a-glance capacity answer. This is the only forecast block
// shown on first load — it sits in the glance hero, above the tabs, so the lead
// question ("how many groups, and when") is answered before any detail.
export function LaunchPlanningAnswerCards({
  inputs,
  outputs,
}: {
  inputs: LaunchPlanningInputs;
  outputs: LaunchPlanningOutputs;
}) {
  const risk = riskTone(outputs.risk_level);
  const availableSeatsMeta =
    inputs.unknown_capacity_group_count > 0
      ? `${inputs.unknown_capacity_group_count} active group${
          inputs.unknown_capacity_group_count === 1 ? "" : "s"
        } missing a capacity`
      : "Across active, in-capacity groups.";

  return (
    <section aria-labelledby="lp-answer">
      <div id="lp-answer" className={TIER_LABEL}>
        At a glance
      </div>
      <div className="lg-m-cards-grid grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
        <MetricCard
          title="Risk level"
          value={risk.label}
          meta={
            outputs.risk_level === "ok"
              ? "Current capacity covers projected demand."
              : outputs.risk_level === "watch"
                ? "Gap is within configured buffer headroom."
                : "Gap exceeds configured buffer. Plan a launch."
          }
          accentClassName={risk.text}
          valueClassName={risk.text}
        />
        <MetricCard
          title="Recommended new groups"
          {...metricValue(outputs.recommended_new_groups)}
          meta="To meet projected demand with buffer."
          accentClassName="text-sage"
        />
        <MetricCard
          title="Available seats"
          {...metricValue(inputs.available_seats)}
          meta={availableSeatsMeta}
        />
      </div>
    </section>
  );
}

// L1 (#225): the inputs and intermediate figures behind the answer. Relocated
// to the Overview tab so first load stays on the answer alone.
export function LaunchPlanningBreakdownCards({
  inputs,
  outputs,
}: {
  inputs: LaunchPlanningInputs;
  outputs: LaunchPlanningOutputs;
}) {
  return (
    <section aria-labelledby="lp-supporting">
      <div id="lp-supporting" className={TIER_LABEL}>
        Capacity breakdown
      </div>
      <div className="lg-m-cards-grid grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3.5">
        <MetricCard
          title="Active groups"
          {...metricValue(inputs.active_group_count)}
          meta={
            inputs.excluded_active_group_count > 0
              ? `${inputs.excluded_active_group_count} excluded from capacity math.`
              : "Lifecycle = active."
          }
        />
        <MetricCard
          title="Effective capacity"
          {...metricValue(inputs.effective_total_capacity)}
          meta="Sum of effective capacities."
        />
        <MetricCard
          title="Current participants"
          {...metricValue(inputs.current_participants)}
          meta="Active memberships in non-excluded groups."
        />
        <MetricCard
          title="Projected demand"
          {...metricValue(outputs.projected_group_demand)}
          meta="Attendance × target participation %."
          accentClassName="text-sage"
        />
        <MetricCard
          title="Estimated new shepherds"
          {...metricValue(outputs.estimated_new_leaders_needed)}
          meta="New groups × shepherds per new group."
          accentClassName="text-sage"
        />
      </div>
    </section>
  );
}
