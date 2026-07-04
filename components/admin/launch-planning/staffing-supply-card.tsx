import type { StaffingForecast } from "@/lib/admin/launch-planning";
import type { LaunchPlanningInputs } from "@/lib/admin/launch-planning";
import { eyebrowClassName } from "./section-styles";

// Capacity & Multiplication #186: the staffing (leader) axis of the forecast,
// reported beside seat capacity but NEVER summed with it (PRD §3.4). When the
// scenario carries no planned launches, this reads as "no launch planned".
export function StaffingSupplyCard({
  forecast,
  inputs,
  sourceLabel,
}: {
  forecast: StaffingForecast;
  // Seat capacity, shown alongside so the two supply axes sit side by side.
  inputs: Pick<LaunchPlanningInputs, "available_seats">;
  // Which assumptions the staffing forecast came from (e.g. "current scenario:
  // Stretch" or "baseline").
  sourceLabel: string;
}) {
  const {
    plannedLaunchCount,
    leadersPerNewGroup,
    demand,
    supply,
    gap,
    shortfall,
    targetDateIso,
  } = forecast;

  const gapClassName =
    gap > 0
      ? "border-clay bg-claySoft text-clayDeep"
      : "border-sage bg-sageSoft text-sageDeep";
  const gapText =
    gap > 0
      ? `short ${shortfall} shepherd${shortfall === 1 ? "" : "s"}`
      : gap < 0
        ? `surplus of ${-gap} shepherd${-gap === 1 ? "" : "s"}`
        : "fully staffed";

  return (
    <section className="grid gap-3 rounded-lg border border-line bg-surface px-[22px] py-5">
      <header>
        <span className={eyebrowClassName}>Staffing supply (leaders)</span>
        <p className="m-0 mt-1.5 font-sans text-xs leading-normal text-ink3">
          The leader gap — separate from seat capacity, never summed. From{" "}
          {sourceLabel}.
        </p>
      </header>

      {plannedLaunchCount === 0 ? (
        <p className="m-0 font-sans text-sm text-ink2">
          No launches planned yet. Set a planned launch count and target season
          on a scenario to see the shepherd gap.
        </p>
      ) : (
        <>
          <p className="m-0 font-sans text-base leading-[1.6] text-ink">
            {plannedLaunchCount} group{plannedLaunchCount === 1 ? "" : "s"}{" "}
            planned
            {targetDateIso ? ` for ${targetDateIso}` : ""} · need {demand}{" "}
            leader{demand === 1 ? "" : "s"} ({leadersPerNewGroup}/group) ·{" "}
            {supply} Ready ·{" "}
            <strong
              className={`rounded-pill border px-2.5 py-0.5 ${gapClassName}`}
            >
              {gapText}
            </strong>
          </p>
        </>
      )}

      <p className="m-0 font-sans text-xs text-ink3">
        Capacity supply (seats), reported separately: {inputs.available_seats}{" "}
        open seat{inputs.available_seats === 1 ? "" : "s"} across existing
        groups.
      </p>
    </section>
  );
}
