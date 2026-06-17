"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { type KeyboardEvent, type ReactNode, useRef, useState } from "react";
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
  // One ref per tab button so keyboard navigation can move DOM focus to the
  // newly selected tab (the roving-tabindex half of the WAI-ARIA tabs pattern).
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // The active tab is driven by the URL's `?tab=` param (default "plan"), so a
  // deep-link from a Readiness-grid cell (`?tab=plan#seg-…`) always opens the
  // Plan panel — even after the admin has manually switched tabs. Tab buttons
  // sync the URL through the History API, which Next integrates with
  // useSearchParams, so switching tabs updates the URL (and makes the deep-link
  // a real change) WITHOUT a server round-trip.
  const active = resolveMultiplyInitialTab(
    searchParams.get("tab") ?? undefined
  );

  // Lazy-mount the panels: render a tab's panel only once it has been the
  // active tab, then keep it mounted so switching back is instant and preserves
  // its in-panel state (filters, expanded rows). On first load only the active
  // tab (default "plan") is mounted, so the heavy Readiness grid and Leaders
  // pipeline aren't server-rendered or hydrated until they're opened — a real
  // saving on the common path, where the page already loads all three tabs'
  // data server-side. The panel wrappers below stay in the DOM regardless so
  // every tab's `aria-controls` target always resolves. (This is the
  // documented "adjust state when a prop changes during render" pattern — the
  // active tab is URL-derived, so seed it on mount and fold in each new active
  // tab without an effect, matching CareShell.)
  const [mounted, setMounted] = useState<Set<MultiplyTabKey>>(
    () => new Set([active])
  );
  if (!mounted.has(active)) {
    setMounted((prev) => new Set(prev).add(active));
  }

  function selectTab(key: MultiplyTabKey) {
    if (key === active) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", key);
    window.history.replaceState(null, "", `${pathname}?${params.toString()}`);
  }

  // Arrow / Home / End move between tabs (automatic activation: focus and
  // selection move together, the right model for these few panels). Without
  // this a keyboard user has to Tab through every tab button; the roving
  // tabIndex below keeps the tablist a single Tab stop instead.
  function onTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number
  ) {
    const last = tabs.length - 1;
    let nextIndex: number;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        nextIndex = index === last ? 0 : index + 1;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        nextIndex = index === 0 ? last : index - 1;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = last;
        break;
      default:
        return;
    }
    event.preventDefault();
    selectTab(tabs[nextIndex].key);
    tabRefs.current[nextIndex]?.focus();
  }

  return (
    <div className="grid gap-6">
      <div
        role="tablist"
        aria-label="Multiply sections"
        className="flex flex-wrap gap-1 self-start rounded-pill border border-line bg-surface p-[3px]"
      >
        {tabs.map((tab, index) => (
          <button
            key={tab.key}
            ref={(node) => {
              tabRefs.current[index] = node;
            }}
            type="button"
            role="tab"
            id={`multiply-tab-${tab.key}`}
            aria-selected={active === tab.key}
            aria-controls={`multiply-panel-${tab.key}`}
            // Roving tabIndex: only the active tab is in the Tab order; the
            // rest are reached with the arrow keys handled above.
            tabIndex={active === tab.key ? 0 : -1}
            onClick={() => selectTab(tab.key)}
            onKeyDown={(event) => onTabKeyDown(event, index)}
            className={cn(
              "inline-flex cursor-pointer items-center rounded-pill px-3.5 py-2 font-sans text-sm leading-tight transition-colors duration-150",
              active === tab.key
                ? "bg-clay font-bold text-surface"
                : "bg-transparent font-medium text-ink3 hover:bg-surfaceAlt hover:text-ink2"
            )}
          >
            {tab.label}
            {typeof tab.count === "number" ? (
              <span
                className={cn(
                  "ml-2 text-xs font-bold tabular-nums",
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
          {mounted.has(tab.key) ? tab.panel : null}
        </div>
      ))}
    </div>
  );
}
