import type { ReactNode } from "react";
import { ErrorBanner } from "@/components/lg/ErrorBanner";
import { StaffingSupplyCard } from "@/components/admin/launch-planning/staffing-supply-card";
import {
  LaunchPlanningAnswerCards,
  LaunchPlanningBreakdownCards,
} from "@/components/admin/launch-planning/summary-cards";
import { LaunchPlanningResultsPanel } from "@/components/admin/launch-planning/results-panel";
import { LaunchPlanningSetupWarnings } from "@/components/admin/launch-planning/setup-warnings";
// All of these live behind closed tabs on first load, so they are loaded
// lazily (ssr:false) to keep their code off this route's First Load JS.
import {
  CapacityBoard,
  ChurchAttendanceCard,
  LaunchPlanningAssumptionsForm,
  MultiplicationPlanner,
  ScenariosPanel,
} from "@/components/admin/launch-planning/lazy-panels";
import { P, fontBody, fontSans } from "@/lib/pastoral";
import type { LaunchPlanningPageData } from "./launch-planning-data";

// The tab panels for launch planning, built once from the shared loader and
// reused by both the frozen /admin/launch-planning route (inside
// LaunchPlanningShell) and the Planning area (#303). Keeping the markup here
// means the two hosts can't drift in what they render.
export type LaunchPlanningPanels = {
  notice: ReactNode;
  // Forecast-confidence signals (read failures, no groups). Always shown in the
  // hero, never tab-gated, so they can't hide under the answer (#233 review).
  warnings: ReactNode;
  answer: ReactNode;
  overview: ReactNode;
  forecast: ReactNode;
  scenarios: ReactNode;
  // The combined capacity board + multiplication planner, for the frozen
  // launch-planning route's single "Groups and multiplication" tab.
  groups: ReactNode;
  // The two halves of `groups`, so the Planning area can split them across its
  // Capacity and Multiplication tabs.
  capacityBoard: ReactNode;
  multiplicationPlanner: ReactNode;
};

function SectionEyebrow({ children }: { children: ReactNode }) {
  return (
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
      {children}
    </span>
  );
}

export function buildLaunchPlanningPanels(
  data: LaunchPlanningPageData
): LaunchPlanningPanels {
  // The assumptions banner / note that sits atop the glance hero. The
  // "Adjust forecast" affordance moved into the shell (it switches tabs), so
  // the note here no longer carries a link.
  const notice = data.assumptionsError ? (
    <ErrorBanner>
      Saved assumptions could not be loaded. Showing built-in defaults:{" "}
      {data.assumptionsError}
    </ErrorBanner>
  ) : (
    <div
      style={{
        margin: 0,
        fontFamily: fontBody,
        fontSize: 13,
        color: P.ink2,
        background: P.bgDeep,
        borderRadius: 8,
        padding: "10px 14px",
      }}
    >
      {data.assumptionsAvailable
        ? "This forecast uses your saved assumptions."
        : "This forecast is live now on Fox Valley's built-in starting assumptions — tune it to your numbers any time."}
    </div>
  );

  const overview = (
    <div style={{ display: "grid", gap: 24 }}>
      <LaunchPlanningBreakdownCards
        inputs={data.inputs}
        outputs={data.outputs}
      />

      {data.pipelineError ? (
        <ErrorBanner>
          The leader pipeline could not be loaded, so the staffing supply below
          may understate who is ready. {data.pipelineError}
        </ErrorBanner>
      ) : (
        <StaffingSupplyCard
          forecast={data.staffingForecast}
          inputs={data.inputs}
          sourceLabel={data.staffingSourceLabel}
        />
      )}
    </div>
  );

  // Forecast-confidence signals (read failures, no active groups, missing
  // capacities). These stay in the always-visible glance hero — never behind a
  // tab — so a read failure or first-run state can't be hidden under a
  // plausible-looking answer (#233 review). Renders nothing when all is well.
  const warnings = (
    <LaunchPlanningSetupWarnings
      inputs={data.inputs}
      errors={data.inputsBundle.errors}
    />
  );

  const forecast = (
    <div style={{ display: "grid", gap: 20 }}>
      {/* The two ministry-specific forecast inputs live together here: current
          church attendance (this card) and target participation (the form). */}
      <ChurchAttendanceCard
        currentChurchAttendance={data.assumptions.current_church_attendance}
        currentParticipants={data.inputs.current_participants}
        participationPct={data.participationPct}
      />

      <div
        className="lg-m-grid-stack"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: 20,
          alignItems: "start",
        }}
      >
        <section
          style={{
            background: P.surface,
            border: `1px solid ${P.line}`,
            borderRadius: 14,
            padding: "22px 24px",
          }}
        >
          <header style={{ marginBottom: 16 }}>
            <SectionEyebrow>Forecast</SectionEyebrow>
            <h2
              style={{
                margin: "4px 0 0",
                fontFamily: fontBody,
                fontSize: 18,
                color: P.ink,
                fontWeight: 600,
              }}
            >
              Forecast inputs
            </h2>
          </header>
          <LaunchPlanningAssumptionsForm assumptions={data.assumptions} />
        </section>

        <LaunchPlanningResultsPanel
          assumptions={data.assumptions}
          inputs={data.inputs}
          outputs={data.outputs}
        />
      </div>
    </div>
  );

  const scenarios = (
    <div style={{ display: "grid", gap: 24 }}>
      {data.scenariosError ? (
        <ErrorBanner>
          Scenarios could not be loaded: {data.scenariosError}
        </ErrorBanner>
      ) : null}

      <ScenariosPanel
        scenarios={data.activeScenarios}
        baseline={data.assumptions}
        inputs={data.inputs}
        baselineOutputs={data.outputs}
        comparison={data.comparison}
      />
    </div>
  );

  // The capacity board and the multiplication planner are built separately so
  // the Planning area (#303) can place the board under its Capacity tab (the
  // reduction plan defines Capacity as "current and forecasted group capacity")
  // and the planner under Multiplication. The frozen /admin/launch-planning
  // route keeps them combined in its single "Groups and multiplication" tab via
  // `groups` below.
  const capacityBoard = data.capacityError ? (
    <ErrorBanner>
      The capacity board could not be loaded: {data.capacityError}
    </ErrorBanner>
  ) : (
    // It owns the single "Suggested to multiply" panel — derived from capacity
    // data, not the leader pipeline — so it stays visible even when the pipeline
    // read (which only gates the planner) fails.
    <CapacityBoard model={data.capacityModel} />
  );

  const multiplicationPlanner = data.multiplicationError ? (
    <ErrorBanner>
      The multiplication pipeline could not be loaded:{" "}
      {data.multiplicationError}
    </ErrorBanner>
  ) : (
    // Suggestions render in the capacity board, so they are suppressed here.
    <MultiplicationPlanner
      segments={data.segments}
      availableGroups={data.availableGroups}
      apprenticesByGroup={data.apprenticesByGroup}
      suggestions={[]}
    />
  );

  const groups = (
    <div style={{ display: "grid", gap: 24 }}>
      {capacityBoard}
      {multiplicationPlanner}
    </div>
  );

  const answer = (
    <LaunchPlanningAnswerCards inputs={data.inputs} outputs={data.outputs} />
  );

  return {
    notice,
    warnings,
    answer,
    overview,
    forecast,
    scenarios,
    groups,
    capacityBoard,
    multiplicationPlanner,
  };
}
