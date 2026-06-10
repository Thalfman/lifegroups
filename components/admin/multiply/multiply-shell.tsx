"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  resolveMultiplyInitialTab,
  type MultiplyTabKey,
} from "@/components/admin/multiply/multiply-data";

// The Multiply area's tabs (ADR 0022). Multiply unifies the three faces of the
// church's multiplication tracking into one surface:
//   • Plan      — the per-group multiplication plan (Julian's Doc, ADR 0006):
//                 named groups by Audience × category, with target year,
//                 successor/apprentice, meeting time, and readiness chips. The
//                 working view, so it is the default tab.
//   • Readiness — the per-cell category × top-type grid (ADR 0019/0021): the
//                 at-a-glance "which cells are ready to multiply" signal.
//   • Leaders   — the apprentice pipeline: who is ready to lead the next group.
// The Plan and Leaders panels were previously reachable only behind the frozen
// Planning tab / off-nav routes; this shell re-homes them into the visible
// Multiply area (an intentional partial reversal of ADR 0016's hiding — the data
// was always retained; only the surface moves).
export type { MultiplyTabKey };

export type MultiplyTab = {
  key: MultiplyTabKey;
  label: string;
  // Optional count badge (omitted for the grid, which carries its own coverage
  // numbers per cell).
  count?: number;
  panel: ReactNode;
};

export function MultiplyShell({ tabs }: { tabs: MultiplyTab[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // The active tab is driven by the URL's `?tab=` param (default "plan"), so a
  // deep-link from a Readiness-grid cell (`?tab=plan#seg-…`) always opens the
  // Plan panel — even after the admin has manually switched tabs. Tab buttons
  // sync the URL through the History API, which Next integrates with
  // useSearchParams, so switching tabs updates the URL (and makes the deep-link
  // a real change) WITHOUT a server round-trip.
  const active = resolveMultiplyInitialTab(
    searchParams.get("tab") ?? undefined
  );

  function selectTab(key: MultiplyTabKey) {
    if (key === active) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", key);
    window.history.replaceState(null, "", `${pathname}?${params.toString()}`);
  }

  return (
    <div className="grid gap-6">
      <div
        role="tablist"
        aria-label="Multiply sections"
        className="flex flex-wrap gap-1 self-start rounded-pill border border-line bg-surface p-[3px]"
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={`multiply-tab-${tab.key}`}
            aria-selected={active === tab.key}
            aria-controls={`multiply-panel-${tab.key}`}
            onClick={() => selectTab(tab.key)}
            className={cn(
              "inline-flex cursor-pointer items-center rounded-pill px-3.5 py-2 font-sans text-base leading-tight transition-colors duration-150",
              active === tab.key
                ? "bg-clay font-semibold text-white"
                : "bg-transparent font-medium text-ink3 hover:bg-surfaceAlt hover:text-ink2"
            )}
          >
            {tab.label}
            {typeof tab.count === "number" ? (
              <span
                className={cn(
                  "ml-[7px] text-2xs font-bold tabular-nums",
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
          id={`multiply-panel-${tab.key}`}
          aria-labelledby={`multiply-tab-${tab.key}`}
          hidden={active !== tab.key}
        >
          {tab.panel}
        </div>
      ))}
    </div>
  );
}
