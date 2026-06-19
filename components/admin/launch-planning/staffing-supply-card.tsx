import { P, fontBody, fontSans } from "@/lib/pastoral";
import type { StaffingForecast } from "@/lib/admin/launch-planning";
import type { LaunchPlanningInputs } from "@/lib/admin/launch-planning";

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

  const gapColor = gap > 0 ? "#7d3621" : "#3e4f29";
  const gapBg = gap > 0 ? P.terraSoft : P.sageSoft;
  const gapBorder = gap > 0 ? P.terra : P.sage;
  const gapText =
    gap > 0
      ? `short ${shortfall} shepherd${shortfall === 1 ? "" : "s"}`
      : gap < 0
        ? `surplus of ${-gap} shepherd${-gap === 1 ? "" : "s"}`
        : "fully staffed";

  return (
    <section
      style={{
        background: P.surface,
        border: `1px solid ${P.line}`,
        borderRadius: 14,
        padding: "20px 22px",
        display: "grid",
        gap: 12,
      }}
    >
      <header>
        <span
          style={{
            fontFamily: fontSans,
            fontSize: 10,
            letterSpacing: 1.5,
            textTransform: "uppercase",
            color: P.ink3,
            fontWeight: 600,
          }}
        >
          Staffing supply (leaders)
        </span>
        <p
          style={{
            margin: "6px 0 0",
            fontFamily: fontBody,
            fontSize: 12,
            color: P.ink3,
            lineHeight: 1.5,
          }}
        >
          The leader gap — separate from seat capacity, never summed. From{" "}
          {sourceLabel}.
        </p>
      </header>

      {plannedLaunchCount === 0 ? (
        <p
          style={{
            fontFamily: fontBody,
            fontSize: 13,
            color: P.ink2,
            margin: 0,
          }}
        >
          No launches planned yet. Set a planned launch count and target season
          on a scenario to see the leader gap.
        </p>
      ) : (
        <>
          <p
            style={{
              fontFamily: fontBody,
              fontSize: 14,
              color: P.ink,
              margin: 0,
              lineHeight: 1.6,
            }}
          >
            {plannedLaunchCount} group{plannedLaunchCount === 1 ? "" : "s"}{" "}
            planned
            {targetDateIso ? ` for ${targetDateIso}` : ""} · need {demand}{" "}
            leader{demand === 1 ? "" : "s"} ({leadersPerNewGroup}/group) ·{" "}
            {supply} Ready ·{" "}
            <strong
              style={{
                color: gapColor,
                background: gapBg,
                border: `1px solid ${gapBorder}`,
                borderRadius: 999,
                padding: "2px 10px",
              }}
            >
              {gapText}
            </strong>
          </p>
        </>
      )}

      <p
        style={{
          fontFamily: fontBody,
          fontSize: 12,
          color: P.ink3,
          margin: 0,
        }}
      >
        Capacity supply (seats), reported separately: {inputs.available_seats}{" "}
        open seat{inputs.available_seats === 1 ? "" : "s"} across existing
        groups.
      </p>
    </section>
  );
}
