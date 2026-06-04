"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { P, fontSans } from "@/lib/pastoral";

// The Care area's five tabs (ADR 0013, #301). Care is the entry point for Job 1
// — "who needs attention?" — and hosts the former Leader care + Follow-ups
// surfaces. Needs Contact / Due Soon / Recent Care / Completed reorganize the
// leader-care signals by urgency and completion; Follow-ups is the generic
// open-task queue. It is a NEW route: /admin/shepherd-care and
// /admin/follow-ups keep their files and still resolve (ADR 0008/0009).
export type CareTabKey =
  | "needs-contact"
  | "follow-ups"
  | "due-soon"
  | "recent-care"
  | "completed";

export type CareTab = {
  key: CareTabKey;
  label: string;
  // Optional count badge (omitted for the generic Follow-ups queue, which
  // carries its own filters/counts).
  count?: number;
  panel: ReactNode;
};

export function CareShell({
  tabs,
  initialTab = "needs-contact",
}: {
  tabs: CareTab[];
  initialTab?: CareTabKey;
}) {
  const [active, setActive] = useState<CareTabKey>(initialTab);

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <div
        role="tablist"
        aria-label="Care sections"
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
            id={`care-tab-${tab.key}`}
            aria-selected={active === tab.key}
            aria-controls={`care-panel-${tab.key}`}
            onClick={() => setActive(tab.key)}
            style={tabItemStyle(active === tab.key)}
          >
            {tab.label}
            {typeof tab.count === "number" ? (
              <span
                style={{
                  marginLeft: 7,
                  fontSize: 11,
                  fontWeight: 700,
                  opacity: active === tab.key ? 0.9 : 0.7,
                }}
              >
                {tab.count}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {tabs.map((tab) => (
        <div
          key={tab.key}
          role="tabpanel"
          id={`care-panel-${tab.key}`}
          aria-labelledby={`care-tab-${tab.key}`}
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
    display: "inline-flex",
    alignItems: "center",
  };
}
