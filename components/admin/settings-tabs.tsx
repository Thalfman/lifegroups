"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Issue #304: a small, accessible tab control for the Settings configuration
// area. Settings is a quiet secondary surface, so the tabs read as a calm
// segmented control rather than a loud operational toolbar.
//
// a11y: native ARIA tabs pattern (role="tablist" / role="tab" / role="tabpanel")
// with roving tabindex and arrow-key navigation, per the WAI-ARIA Authoring
// Practices. Only the selected tab is in the tab order; Left/Right (and
// Home/End) move selection between tabs. The active panel is the only one
// mounted so its controls stay genuinely visible (the Settings a11y spec asserts
// every control carries a *visibly rendered* label — hidden panels would fail
// that gate).

export type SettingsTab = {
  id: string;
  label: string;
  panel: ReactNode;
};

export function SettingsTabs({
  tabs,
  defaultTabId,
}: {
  tabs: SettingsTab[];
  // Default selection. Thresholds is the natural landing tab because it holds
  // the metric defaults the operator changes most; callers pass it explicitly.
  defaultTabId: string;
}) {
  const initial = tabs.some((t) => t.id === defaultTabId)
    ? defaultTabId
    : (tabs[0]?.id ?? "");
  const [activeId, setActiveId] = useState(initial);
  const tabRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());

  function focusTab(id: string) {
    setActiveId(id);
    // Move DOM focus to the newly selected tab so keyboard navigation tracks
    // the selection (roving tabindex).
    requestAnimationFrame(() => {
      tabRefs.current.get(id)?.focus();
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (index + 1) % tabs.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (index - 1 + tabs.length) % tabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = tabs.length - 1;
    }
    if (nextIndex === null) return;
    event.preventDefault();
    const next = tabs[nextIndex];
    if (next) focusTab(next.id);
  }

  const activeTab = tabs.find((t) => t.id === activeId) ?? tabs[0];

  return (
    <div className="grid gap-6">
      {/* A self-contained pill rail rather than full-width tabs: keeps Settings
          reading as a quiet, secondary control instead of a primary nav bar. */}
      <div
        role="tablist"
        aria-label="Settings sections"
        className="flex w-fit max-w-full flex-wrap gap-1 rounded-pill border border-line bg-sidebar p-1"
      >
        {tabs.map((tab, index) => {
          const selected = tab.id === activeId;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current.set(tab.id, el);
              }}
              type="button"
              role="tab"
              id={`settings-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`settings-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveId(tab.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cn(
                "inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-pill border px-4 font-sans text-base font-medium leading-tight transition-colors duration-150",
                selected
                  ? "border-line bg-surface font-semibold text-ink"
                  : "border-transparent bg-transparent text-ink2 hover:bg-surface/60"
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab ? (
        <div
          role="tabpanel"
          id={`settings-panel-${activeTab.id}`}
          aria-labelledby={`settings-tab-${activeTab.id}`}
          tabIndex={0}
        >
          {activeTab.panel}
        </div>
      ) : null}
    </div>
  );
}
