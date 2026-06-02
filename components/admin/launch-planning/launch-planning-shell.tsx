"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { P, fontBody, fontSans } from "@/lib/pastoral";
import { PButton } from "@/components/pastoral/button";
import type { LaunchPlanningAssumptions } from "@/lib/admin/launch-planning";

// The scenario form is only mounted after the "Plan a launch" button is
// clicked — it is never part of the initial render — so its (sizable) code
// has no business in this route's First Load JS. Defer it to a chunk that
// loads on first open. ssr:false is safe precisely because it never renders
// on the server.
const CreateScenarioForm = dynamic(
  () =>
    import("@/components/admin/launch-planning/scenario-form").then(
      (m) => m.CreateScenarioForm
    ),
  { ssr: false }
);

type TabKey = "overview" | "forecast" | "scenarios" | "groups";

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "forecast", label: "Forecast" },
  { key: "scenarios", label: "Scenarios" },
  { key: "groups", label: "Groups and multiplication" },
];

// L1 (#225) + L2 (#226): progressive disclosure for the densest admin surface.
// First load shows only the at-a-glance answer and one primary action — "Plan a
// launch" (creates a scenario from current inputs via
// adminCreateLaunchPlanningScenario). Everything else lives behind four tabs.
export function LaunchPlanningShell({
  baseline,
  notice,
  warnings,
  answer,
  overview,
  forecast,
  scenarios,
  groups,
}: {
  baseline: LaunchPlanningAssumptions;
  notice: ReactNode;
  // Forecast-confidence signals (read failures, no groups). Always shown in the
  // hero, never tab-gated, so they can't hide under the answer (#233 review).
  warnings: ReactNode;
  answer: ReactNode;
  overview: ReactNode;
  forecast: ReactNode;
  scenarios: ReactNode;
  groups: ReactNode;
}) {
  // No tab is open on first load, so the glance hero (the at-a-glance answer +
  // the one primary action) is all that shows — the rest is opened on demand
  // (#225, AC: "first load shows only the at-a-glance answer and one action").
  const [active, setActive] = useState<TabKey | null>(null);
  const [planning, setPlanning] = useState(false);

  const panels: Record<TabKey, ReactNode> = {
    overview,
    forecast,
    scenarios,
    groups,
  };

  return (
    <div style={{ display: "grid", gap: 24 }}>
      {/* Glance hero — the only forecast detail shown on first load. */}
      <section style={{ display: "grid", gap: 16 }}>
        {notice}
        {warnings}
        {answer}

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
          <PButton
            type="button"
            tone="ghost"
            size="md"
            onClick={() => setActive("forecast")}
          >
            Adjust forecast
          </PButton>
          {!planning ? (
            <span
              style={{
                fontFamily: fontBody,
                fontSize: 12,
                color: P.ink3,
              }}
            >
              Save a named scenario from your current forecast, or tune the
              forecast inputs.
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
      </section>

      {/* Tabs hold everything the glance doesn't. */}
      <div
        role="tablist"
        aria-label="Launch planning sections"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 4,
          background: P.surface,
          border: `1px solid ${P.line}`,
          borderRadius: 999,
          padding: 3,
          alignSelf: "start",
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={`lp-tab-${tab.key}`}
            aria-selected={active === tab.key}
            aria-controls={`lp-panel-${tab.key}`}
            onClick={() => setActive(tab.key)}
            style={tabItemStyle(active === tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {active === null ? (
        <p
          style={{
            margin: 0,
            fontFamily: fontBody,
            fontSize: 13,
            color: P.ink3,
          }}
        >
          Pick a section above for the full capacity breakdown, forecast inputs,
          scenarios, and groups.
        </p>
      ) : null}

      {TABS.map((tab) => (
        <div
          key={tab.key}
          role="tabpanel"
          id={`lp-panel-${tab.key}`}
          aria-labelledby={`lp-tab-${tab.key}`}
          hidden={active !== tab.key}
        >
          {panels[tab.key]}
        </div>
      ))}
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

function tabItemStyle(activeTab: boolean): CSSProperties {
  return {
    fontFamily: fontSans,
    fontSize: 13,
    fontWeight: activeTab ? 700 : 500,
    color: activeTab ? P.surface : P.ink3,
    background: activeTab ? P.terra : "transparent",
    border: "none",
    padding: "8px 14px",
    cursor: "pointer",
    borderRadius: 999,
  };
}
