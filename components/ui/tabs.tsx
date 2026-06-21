"use client";

import {
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

// Thin, accessible Tabs primitive — the shared shape behind surface tab rails
// (Settings, Care, Multiply, …) so the WAI-ARIA tabs pattern lives in one
// place. Surfaces keep their own copy and tablist styling by passing `idPrefix`,
// `ariaLabel`, and `tablistClassName`; the roving-tabindex keyboard model and
// mount-only-the-active-panel behavior are shared.
//
// a11y: native ARIA tabs pattern (role="tablist" / role="tab" / role="tabpanel")
// with roving tabindex and arrow-key navigation, per the WAI-ARIA Authoring
// Practices. Only the selected tab is in the tab order; Left/Right (and Up/Down,
// Home/End) move selection. The active panel is the only one mounted so its
// controls stay genuinely visible.

export type TabItem = {
  id: string;
  label: ReactNode;
  panel: ReactNode;
};

export function Tabs({
  tabs,
  defaultTabId,
  idPrefix,
  ariaLabel,
  className,
  tablistClassName,
  tabClassName,
  activeTabClassName,
  inactiveTabClassName,
}: {
  tabs: TabItem[];
  // Falls back to the first tab when the supplied id isn't present.
  defaultTabId?: string;
  // Namespaces the generated tab / panel ids so multiple Tabs can coexist.
  idPrefix: string;
  ariaLabel: string;
  className?: string;
  tablistClassName?: string;
  tabClassName?: string;
  activeTabClassName?: string;
  inactiveTabClassName?: string;
}) {
  const initial =
    defaultTabId && tabs.some((t) => t.id === defaultTabId)
      ? defaultTabId
      : (tabs[0]?.id ?? "");
  const [activeId, setActiveId] = useState(initial);
  const [, startTransition] = useTransition();
  const tabRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());

  function focusTab(id: string) {
    // Keyboard selection stays urgent: DOM focus and selection must move
    // together (roving tabindex), so this is NOT wrapped in a transition.
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
    <div className={cn("grid gap-6", className)}>
      <div
        role="tablist"
        aria-label={ariaLabel}
        className={cn(
          "flex w-fit max-w-full flex-wrap gap-1 rounded-pill border border-line bg-sidebar p-1",
          tablistClassName
        )}
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
              id={`${idPrefix}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${idPrefix}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              // Pointer selection swaps the panel as a low-priority transition so
              // the click (tab highlight) paints first and a heavy panel mounts
              // off the interaction frame (lower INP). Keyboard selection above
              // stays urgent for focus a11y.
              onClick={() => startTransition(() => setActiveId(tab.id))}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cn(
                "inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-pill border px-4 font-sans text-base font-medium leading-tight transition-colors duration-150",
                tabClassName,
                selected
                  ? cn(
                      "border-line bg-surface font-semibold text-ink",
                      activeTabClassName
                    )
                  : cn(
                      "border-transparent bg-transparent text-ink2 hover:bg-surface/60",
                      inactiveTabClassName
                    )
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
          id={`${idPrefix}-panel-${activeTab.id}`}
          aria-labelledby={`${idPrefix}-tab-${activeTab.id}`}
          tabIndex={0}
        >
          {activeTab.panel}
        </div>
      ) : null}
    </div>
  );
}
