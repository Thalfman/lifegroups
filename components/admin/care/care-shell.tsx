"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { P, fontSans } from "@/lib/pastoral";

// The Care area's five tabs (ADR 0013, #301, re-keyed in #334). Care is the
// entry point for Job 1 — "how are my leaders doing?" — and hosts the former
// Leader care + Follow-ups surfaces. The keys ARE the canonical PRD IA names
// (Dashboard · Directory · Follow-ups · Coverage · Recent interactions) so they
// are the single source of truth any future alias/nav reference can rely on.
// It is a NEW route: /admin/shepherd-care and /admin/follow-ups keep their
// files and still alias-render (200, not 302) (ADR 0008/0009, #328).
//
// Migration map from the prior keys (no functionality lost, #334):
//   needs-contact → folded into `dashboard` (the attention queue IS who needs
//                   contact); `due-soon` + `completed` → folded into
//                   `follow-ups` (the generic queue already filters by due
//                   window and Done status); recent-care → `recent-interactions`
//                   (rename). `directory` + `coverage` are net-new panels, each
//                   backed by data already loaded in loadCarePageData() — no new
//                   reads, no placeholders.
export type CareTabKey =
  | "dashboard"
  | "directory"
  | "follow-ups"
  | "coverage"
  | "recent-interactions";

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
  initialTab = "dashboard",
}: {
  tabs: CareTab[];
  initialTab?: CareTabKey;
}) {
  const [active, setActive] = useState<CareTabKey>(initialTab);

  // Alias routes (/admin/shepherd-care, /admin/follow-ups) render this same
  // client shell with a different initialTab. If React reuses the instance
  // across a client-side route transition, useState would keep the old tab and
  // the alias would open on the wrong view — breaking the "200 at the matching
  // tab" contract. Re-seed active whenever initialTab changes (the documented
  // "adjust state when a prop changes during render" pattern — no effect).
  const [seededTab, setSeededTab] = useState<CareTabKey>(initialTab);
  if (seededTab !== initialTab) {
    setSeededTab(initialTab);
    setActive(initialTab);
  }

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
