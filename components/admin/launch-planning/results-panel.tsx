import type {
  LaunchPlanningAssumptions,
  LaunchPlanningInputs,
  LaunchPlanningOutputs,
} from "@/lib/admin/launch-planning";
import { fmtNumber, riskTone } from "@/lib/admin/launch-planning";
import { eyebrowClassName } from "./section-styles";

function fmtPct(ratio: number): string {
  const pct = ratio * 100;
  return Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(1)}%`;
}

function recommendation(
  outputs: LaunchPlanningOutputs,
  assumptions: LaunchPlanningAssumptions
): string {
  const { recommended_new_groups, capacity_gap, suggested_launch_by_date } =
    outputs;
  if (recommended_new_groups === 0) {
    return `Current effective capacity covers projected demand. No new groups are needed under these assumptions.`;
  }
  const leaders = outputs.estimated_new_leaders_needed;
  const groupWord = recommended_new_groups === 1 ? "group" : "groups";
  const leaderWord = leaders === 1 ? "shepherd" : "shepherds";
  const gapWord = `${fmtNumber(Math.max(0, capacity_gap))} seat${
    Math.max(0, capacity_gap) === 1 ? "" : "s"
  }`;

  const tail =
    suggested_launch_by_date && assumptions.expected_growth_date
      ? ` Aim to have them launched by ${suggested_launch_by_date} (about 30 days before your ${assumptions.expected_growth_date} growth date).`
      : "";
  return `To close the projected ${gapWord} gap with a ${fmtPct(
    assumptions.launch_buffer_pct
  )} buffer, plan to launch ${recommended_new_groups} new ${groupWord} (~${leaders} ${leaderWord}).${tail}`;
}

export function LaunchPlanningResultsPanel({
  assumptions,
  inputs,
  outputs,
}: {
  assumptions: LaunchPlanningAssumptions;
  inputs: LaunchPlanningInputs;
  outputs: LaunchPlanningOutputs;
}) {
  const risk = riskTone(outputs.risk_level);
  return (
    <section className="grid gap-[18px] rounded-lg border border-line bg-surface px-6 py-[22px]">
      <header className="grid gap-1.5">
        <span className={eyebrowClassName}>Recommendation</span>
        <h2 className="m-0 font-display text-2xl font-medium leading-[1.15] text-ink">
          What the math says
        </h2>
      </header>

      <p className="m-0 font-sans text-md leading-[1.55] text-ink">
        {recommendation(outputs, assumptions)}
      </p>

      <div
        className={`inline-flex items-center gap-2.5 self-start rounded-pill border bg-bg px-3 py-1.5 font-sans text-xs font-semibold uppercase tracking-[1.2px] ${risk.text} ${risk.border}`}
      >
        Risk: {risk.label}
      </div>

      {/* The figures below overlap the summary cards above by design — they
          are the derivation behind the recommendation, framed as supporting
          detail (small caption + subdued numbers) rather than a second copy of
          the headline answer. */}
      <div className={`${eyebrowClassName} border-t border-line pt-4`}>
        Behind the recommendation
      </div>

      <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3.5">
        <Detail
          label="Projected total attendance"
          value={fmtNumber(outputs.projected_total_attendance)}
          hint={`${fmtNumber(assumptions.current_church_attendance)} today + ${fmtNumber(
            assumptions.expected_growth
          )} expected`}
        />
        <Detail
          label="Projected group demand"
          value={fmtNumber(outputs.projected_group_demand, 0)}
          hint={`Attendance × ${fmtPct(assumptions.target_group_participation_pct)} participation`}
        />
        <Detail
          label="Target capacity with buffer"
          value={fmtNumber(outputs.target_capacity_with_buffer, 0)}
          hint={`Demand ÷ (1 − ${fmtPct(assumptions.launch_buffer_pct)})`}
        />
        <Detail
          label="Current effective capacity"
          value={fmtNumber(inputs.effective_total_capacity)}
          hint={`${inputs.active_group_count} active group${
            inputs.active_group_count === 1 ? "" : "s"
          }`}
        />
        <Detail
          label="Capacity gap"
          value={fmtNumber(outputs.capacity_gap, 0)}
          hint={
            outputs.capacity_gap > 0
              ? "Positive = need more seats"
              : "Negative = headroom"
          }
        />
        <Detail
          label="Average group size"
          value={fmtNumber(assumptions.average_group_size)}
          hint="Used to convert gap → group count"
        />
      </dl>

      {outputs.suggested_launch_by_date ? (
        <p className="m-0 font-sans text-sm leading-[1.55] text-ink2">
          Suggested launch by{" "}
          <strong className="text-ink">
            {outputs.suggested_launch_by_date}
          </strong>
          {", "}
          about 30 days before your{" "}
          <strong className="text-ink">
            {assumptions.expected_growth_date}
          </strong>{" "}
          growth date.
        </p>
      ) : null}
    </section>
  );
}

function Detail({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="grid gap-1">
      <dt className={`m-0 ${eyebrowClassName}`}>{label}</dt>
      <dd className="m-0 font-display text-[19px] leading-[1.1] tabular-nums text-ink2">
        {value}
      </dd>
      <span className="font-sans text-xs italic text-ink3">{hint}</span>
    </div>
  );
}
