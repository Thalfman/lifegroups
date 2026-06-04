"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { P, fontSans } from "@/lib/pastoral";

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
    <div style={{ display: "grid", gap: 20 }}>
      <div
        role="tablist"
        aria-label="Leader care sections"
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
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={`leader-tab-${tab.key}`}
            aria-selected={active === tab.key}
            aria-controls={`leader-panel-${tab.key}`}
            onClick={() => setActive(tab.key)}
            style={tabItemStyle(active === tab.key)}
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
