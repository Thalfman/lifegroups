"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  normalizeCareTabKey,
  type CanonicalCareTabKey,
  type CareTabKey,
} from "@/lib/admin/shepherd-care-view";

// The Care area's tabs (ADR 0013/0016, #301, re-keyed in #334, #373,
// consolidated to four in #477). Care is the entry point for Job 1 — "how are
// my leaders doing?". The canonical view is the Over-Shepherd accordion
// (`over-shepherds`), the default landing tab; the other three are the
// All-leaders roster, Follow-ups, and Recent updates. The legacy six-tab keys
// (dashboard / directory / coverage) stay accepted `initialTab` inputs forever
// — normalizeCareTabKey maps them onto the canonical four — so the
// /admin/shepherd-care and /admin/follow-ups alias entries and old deep links
// still land on a coherent tab and alias-render (200, not 302)
// (ADR 0008/0009, #328). Key types + normalization live in the pure
// lib/admin/shepherd-care-view module; re-exported here so existing importers
// keep resolving.
export type { CanonicalCareTabKey, CareTabKey };

export type CareTab = {
  // The rendered tabs use canonical keys only — legacy keys are inputs, never
  // panels (#477: exactly four tabs, no two answering the same question).
  key: CanonicalCareTabKey;
  label: string;
  // Optional count badge. Follow-ups carries the combined open count across
  // its two queues (#479); a tab omits the badge when its backing read failed,
  // so a badge never reports a false low number.
  count?: number;
  panel: ReactNode;
};

export function CareShell({
  tabs,
  initialTab = "over-shepherds",
}: {
  tabs: CareTab[];
  initialTab?: CareTabKey;
}) {
  // Legacy keys (dashboard / directory / coverage) normalize onto the
  // canonical four (#477) so a stale caller or bookmark can never select a
  // tab that no longer renders.
  const target = normalizeCareTabKey(initialTab);
  const [active, setActive] = useState<CanonicalCareTabKey>(target);

  // Alias routes (/admin/shepherd-care, /admin/follow-ups) render this same
  // client shell with a different initialTab. If React reuses the instance
  // across a client-side route transition, useState would keep the old tab and
  // the alias would open on the wrong view — breaking the "200 at the matching
  // tab" contract. Re-seed active whenever the (normalized) target changes
  // (the documented "adjust state when a prop changes during render" pattern —
  // no effect).
  const [seededTab, setSeededTab] = useState<CanonicalCareTabKey>(target);
  if (seededTab !== target) {
    setSeededTab(target);
    setActive(target);
  }

  // WAI-ARIA tabs keyboard pattern (roving tabindex): exactly one tab is in the
  // Tab order at a time; Arrow keys move between tabs, Home/End jump to the
  // ends, and selection follows focus (automatic activation). Without this a
  // keyboard user lands on every tab one Tab-stop at a time and can't arrow
  // across them — the behaviour assistive tech expects from a tablist.
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function focusTabAt(index: number) {
    const count = tabs.length;
    if (count === 0) return;
    // Wrap around both ends so Arrow keys cycle through the tabs.
    const next = ((index % count) + count) % count;
    const tab = tabs[next];
    if (!tab) return;
    setActive(tab.key);
    tabRefs.current[next]?.focus();
  }

  function onTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number
  ) {
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        focusTabAt(index + 1);
        break;
      case "ArrowLeft":
        event.preventDefault();
        focusTabAt(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusTabAt(0);
        break;
      case "End":
        event.preventDefault();
        focusTabAt(tabs.length - 1);
        break;
    }
  }

  return (
    <div className="grid gap-6">
      <div
        role="tablist"
        aria-label="Care sections"
        className="flex flex-wrap gap-1 self-start rounded-pill border border-line bg-surface p-[3px]"
      >
        {tabs.map((tab, index) => (
          <button
            key={tab.key}
            ref={(el) => {
              tabRefs.current[index] = el;
            }}
            type="button"
            role="tab"
            id={`care-tab-${tab.key}`}
            aria-selected={active === tab.key}
            aria-controls={`care-panel-${tab.key}`}
            tabIndex={active === tab.key ? 0 : -1}
            onClick={() => setActive(tab.key)}
            onKeyDown={(event) => onTabKeyDown(event, index)}
            className={tabItemClassName(active === tab.key)}
          >
            {tab.label}
            {typeof tab.count === "number" ? (
              <span
                className={cn(
                  "ml-2 text-xs font-bold",
                  active === tab.key ? "opacity-90" : "opacity-70"
                )}
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

function tabItemClassName(activeTab: boolean): string {
  return cn(
    "inline-flex cursor-pointer items-center rounded-pill border-none px-3.5 py-2 font-sans text-sm transition-colors duration-150",
    activeTab
      ? "bg-clay font-bold text-surface"
      : "bg-transparent font-medium text-ink3 hover:bg-surfaceAlt"
  );
}
