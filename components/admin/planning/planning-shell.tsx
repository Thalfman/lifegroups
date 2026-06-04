"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { P, fontSans } from "@/lib/pastoral";

// The Planning area's five tabs (ADR 0013, #303). Planning answers "what is
// coming next?" and hosts the former Launch Planning + Calendar surfaces. The
// four launch tabs are the launch-planning panels under their reduction-plan
// labels (Overview → Launches, Forecast → Capacity, Scenarios → Scenarios,
// Groups and multiplication → Multiplication); Calendar leads because it is the
// most direct answer to "what's next".
export type PlanningTabKey =
  | "calendar"
  | "launches"
  | "capacity"
  | "scenarios"
  | "multiplication";

const TABS: { key: PlanningTabKey; label: string }[] = [
  { key: "calendar", label: "Calendar" },
  { key: "launches", label: "Launches" },
  { key: "capacity", label: "Capacity" },
  { key: "scenarios", label: "Scenarios" },
  { key: "multiplication", label: "Multiplication" },
];

export function PlanningShell({
  calendar,
  launches,
  capacity,
  scenarios,
  multiplication,
  initialTab = "calendar",
}: {
  calendar: ReactNode;
  launches: ReactNode;
  capacity: ReactNode;
  scenarios: ReactNode;
  multiplication: ReactNode;
  initialTab?: PlanningTabKey;
}) {
  const [active, setActive] = useState<PlanningTabKey>(initialTab);

  // Alias routes (/admin/launch-planning, /admin/calendar) render this same
  // client shell with a different initialTab. If React reuses the instance
  // across a client-side route transition, useState would keep the old tab and
  // the alias would open on the wrong view — breaking the "200 at the matching
  // tab" contract. Re-seed active whenever initialTab changes (the documented
  // "adjust state when a prop changes during render" pattern — no effect).
  const [seededTab, setSeededTab] = useState<PlanningTabKey>(initialTab);
  if (seededTab !== initialTab) {
    setSeededTab(initialTab);
    setActive(initialTab);
  }

  const panels: Record<PlanningTabKey, ReactNode> = {
    calendar,
    launches,
    capacity,
    scenarios,
    multiplication,
  };

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <div
        role="tablist"
        aria-label="Planning sections"
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
            id={`planning-tab-${tab.key}`}
            aria-selected={active === tab.key}
            aria-controls={`planning-panel-${tab.key}`}
            onClick={() => setActive(tab.key)}
            style={tabItemStyle(active === tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {TABS.map((tab) => (
        <div
          key={tab.key}
          role="tabpanel"
          id={`planning-panel-${tab.key}`}
          aria-labelledby={`planning-tab-${tab.key}`}
          hidden={active !== tab.key}
        >
          {panels[tab.key]}
        </div>
      ))}
    </div>
  );
}

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
