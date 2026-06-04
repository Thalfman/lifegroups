"use client";

import { useState, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import { P, fontBody, fontSans } from "@/lib/pastoral";
import { PButton } from "@/components/pastoral/button";
import type { LaunchPlanningAssumptions } from "@/lib/admin/launch-planning";

// The scenario form is only mounted after "Plan a launch" is clicked, so its
// (sizable) code is deferred to a chunk that loads on first open. ssr:false is
// safe precisely because it never renders on the server.
const CreateScenarioForm = dynamic(
  () =>
    import("@/components/admin/launch-planning/scenario-form").then(
      (m) => m.CreateScenarioForm
    ),
  { ssr: false }
);

// The "Plan a launch" action, lifted out of LaunchPlanningShell so the Planning
// area's Launches tab can offer the same one-click "save a named scenario from
// your current forecast" affordance (#303) without the frozen route's
// tab-switching hero. Tuning the forecast is one tab-click away (the Capacity
// tab), so this widget drops the shell's "Adjust forecast" shortcut.
export function PlanLaunchWidget({
  baseline,
}: {
  baseline: LaunchPlanningAssumptions;
}) {
  const [planning, setPlanning] = useState(false);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <PButton
          type="button"
          tone="terra"
          size="md"
          onClick={() => setPlanning((open) => !open)}
        >
          {planning ? "Cancel" : "Plan a launch"}
        </PButton>
        {!planning ? (
          <span style={{ fontFamily: fontBody, fontSize: 12, color: P.ink3 }}>
            Save a named scenario from your current forecast, or tune the
            forecast inputs in the Capacity tab.
          </span>
        ) : null}
      </div>

      {planning ? (
        <div
          style={{
            background: P.surface,
            border: `1px solid ${P.line}`,
            borderRadius: 14,
            padding: "22px 24px",
          }}
        >
          <header style={{ marginBottom: 14 }}>
            <span style={eyebrowStyle}>Plan a launch</span>
            <h2 style={panelTitleStyle}>
              New launch scenario from your current forecast
            </h2>
          </header>
          <CreateScenarioForm
            idPrefix="plan_launch"
            defaults={baseline}
            onClose={() => setPlanning(false)}
          />
        </div>
      ) : null}
    </div>
  );
}

const eyebrowStyle: CSSProperties = {
  fontFamily: fontSans,
  fontSize: 10,
  letterSpacing: 1.5,
  textTransform: "uppercase",
  color: P.ink3,
  fontWeight: 600,
};

const panelTitleStyle: CSSProperties = {
  margin: "4px 0 0",
  fontFamily: fontBody,
  fontSize: 18,
  color: P.ink,
  fontWeight: 600,
};
