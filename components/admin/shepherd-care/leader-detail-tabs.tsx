"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// The per-leader care detail tabs (#301): Overview, Contact History, Follow-ups,
// Notes, Group. A layout change only — it does not move the frozen
// /admin/shepherd-care/[profileId] route, and the Notes tab is included by the
// server ONLY for ministry_admin (the private-note boundary, ADR 0002, stays
// intact; over-shepherd / leader surfaces never get a Notes tab).
export type LeaderDetailTab = {
  key: string;
  label: string;
  panel: ReactNode;
};

export function LeaderDetailTabs({
  tabs,
  initialKey,
}: {
  tabs: LeaderDetailTab[];
  initialKey?: string;
}) {
  const valid = tabs.some((t) => t.key === initialKey)
    ? (initialKey as string)
    : (tabs[0]?.key ?? "");
  const [active, setActive] = useState(valid);

  return (
    <div className="grid gap-5">
      <div
        role="tablist"
        aria-label="Shepherd care sections"
        className="flex flex-wrap gap-1 self-start rounded-pill border border-line bg-surface p-[3px]"
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={`leader-tab-${tab.key}`}
            aria-selected={active === tab.key}
            aria-controls={`leader-panel-${tab.key}`}
            onClick={() => setActive(tab.key)}
            className={tabItemClassName(active === tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {tabs.map((tab) => (
        <div
          key={tab.key}
          role="tabpanel"
          id={`leader-panel-${tab.key}`}
          aria-labelledby={`leader-tab-${tab.key}`}
          hidden={active !== tab.key}
        >
          {tab.panel}
        </div>
      ))}
    </div>
  );
}

function tabItemClassName(activeTab: boolean): string {
  return cn(
    "cursor-pointer rounded-pill border-none px-3.5 py-2 font-sans text-sm transition-colors duration-150",
    activeTab
      ? "bg-clay font-bold text-surface"
      : "bg-transparent font-medium text-ink3 hover:bg-surfaceAlt"
  );
}
