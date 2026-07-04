"use client";

import { useState, type ReactNode } from "react";

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

// The two tab-button variants (mirrors master-calendar/filter-styles'
// pillButtonClassName, at this tab rail's 13px size).
const TAB_BASE_CLASSNAME =
  "cursor-pointer rounded-pill border-none px-3.5 py-2 font-sans text-sm";
const TAB_CLASSNAME_ACTIVE = `${TAB_BASE_CLASSNAME} bg-clay font-bold text-surface`;
const TAB_CLASSNAME_INACTIVE = `${TAB_BASE_CLASSNAME} bg-transparent font-medium text-ink3`;

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
    <div className="grid gap-6">
      <div
        role="tablist"
        aria-label="Planning sections"
        className="flex flex-wrap gap-1 self-start rounded-pill border border-line bg-surface p-[3px]"
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
            className={
              active === tab.key ? TAB_CLASSNAME_ACTIVE : TAB_CLASSNAME_INACTIVE
            }
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
