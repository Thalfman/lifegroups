import { MetricCard } from "@/components/dashboard/cards";
import { P } from "@/lib/pastoral";
import type {
  LaunchPlanningInputs,
  LaunchPlanningOutputs,
  LaunchPlanningRiskLevel,
} from "@/lib/admin/launch-planning";

// Map the three risk-level tokens to a card accent + plain-English label.
// Risk-level colors are intentionally distinct from the capacity-status
// colours used on the admin dashboard so a quick scan tells you which
// page you're looking at.
function riskTone(level: LaunchPlanningRiskLevel): {
  label: string;
  accent: string;
} {
  switch (level) {
    case "ok":
      return { label: "OK", accent: P.sage };
    case "watch":
      return { label: "Watch", accent: P.terra };
    case "launch_needed":
      return { label: "Launch needed", accent: "#923220" };
  }
}

function fmtInt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return String(Math.round(n));
}

export function LaunchPlanningSummaryCards({
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
    <div
      className="lg-m-cards-grid"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 16,
      }}
    >
      <MetricCard
        title="Active groups"
        value={fmtInt(inputs.active_group_count)}
        meta={
          inputs.excluded_active_group_count > 0
            ? `${inputs.excluded_active_group_count} excluded from capacity math.`
            : "Lifecycle = active."
        }
      />
      <MetricCard
        title="Effective capacity"
        value={fmtInt(inputs.effective_total_capacity)}
        meta="Sum of effective capacities."
      />
      <MetricCard
        title="Current participants"
        value={fmtInt(inputs.current_participants)}
        meta="Active memberships in non-excluded groups."
      />
      <MetricCard
        title="Available seats"
        value={fmtInt(inputs.available_seats)}
        meta={availableSeatsMeta}
      />
      <MetricCard
        title="Projected demand"
        value={fmtInt(outputs.projected_group_demand)}
        meta="Attendance × target participation %."
        accent={P.sage}
      />
      <MetricCard
        title="Recommended new groups"
        value={fmtInt(outputs.recommended_new_groups)}
        meta="To meet projected demand with buffer."
        accent={P.sage}
      />
      <MetricCard
        title="Estimated new leaders"
        value={fmtInt(outputs.estimated_new_leaders_needed)}
        meta="New groups × leaders per new group."
        accent={P.sage}
      />
      <MetricCard
        title="Risk level"
        value={risk.label}
        meta={
          outputs.risk_level === "ok"
            ? "Current capacity covers projected demand."
            : outputs.risk_level === "watch"
              ? "Gap is within configured buffer headroom."
              : "Gap exceeds configured buffer — plan a launch."
        }
        accent={risk.accent}
        valueColor={risk.accent}
      />
    </div>
  );
}
