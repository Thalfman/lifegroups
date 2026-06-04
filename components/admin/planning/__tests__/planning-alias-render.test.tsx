import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PlanningShell, type PlanningTabKey } from "../planning-shell";

// Canonicalize Planning entries (#329, ADR 0013 alias-render). The frozen
// /admin/launch-planning and /admin/calendar surfaces RENDER the canonical
// Planning shell at a matching tab — a 200 at the right initial view, never a
// 302 redirect. These tests pin two invariants:
//
//   1. PlanningShell honours `initialTab`: the requested tab is the selected one
//      and its panel is the visible (non-hidden) panel on first paint. This is
//      the "correct initial view" half of the acceptance criteria.
//   2. The three Planning entry pages (canonical + both aliases) contain NO
//      redirect()/permanentRedirect() call, so they resolve 200 rather than 3xx.

// Sentinel content per tab so we can tell which panel rendered visible.
const SENTINELS: Record<PlanningTabKey, string> = {
  calendar: "SENTINEL_CALENDAR",
  launches: "SENTINEL_LAUNCHES",
  capacity: "SENTINEL_CAPACITY",
  scenarios: "SENTINEL_SCENARIOS",
  multiplication: "SENTINEL_MULTIPLICATION",
};

function renderShell(initialTab: PlanningTabKey): string {
  return renderToStaticMarkup(
    <PlanningShell
      initialTab={initialTab}
      calendar={<div>{SENTINELS.calendar}</div>}
      launches={<div>{SENTINELS.launches}</div>}
      capacity={<div>{SENTINELS.capacity}</div>}
      scenarios={<div>{SENTINELS.scenarios}</div>}
      multiplication={<div>{SENTINELS.multiplication}</div>}
    />
  );
}

// The opening tag containing `id="<marker>"` — from the id back to its `<` and
// forward to the tag's closing `>`, so attribute checks stay scoped to that one
// element and never bleed into the next sibling.
function openingTagWithId(html: string, marker: string): string {
  const idAt = html.indexOf(`id="${marker}"`);
  if (idAt < 0) return "";
  const start = html.lastIndexOf("<", idAt);
  const end = html.indexOf(">", idAt);
  if (start < 0 || end < 0) return "";
  return html.slice(start, end + 1);
}

// The tab button for `key` carries aria-selected="true" when it is the active
// tab.
function tabIsSelected(html: string, key: PlanningTabKey): boolean {
  const tag = openingTagWithId(html, `planning-tab-${key}`);
  return tag.includes('aria-selected="true"');
}

// The panel for `key` is visible when its tabpanel wrapper is NOT hidden.
function panelIsVisible(html: string, key: PlanningTabKey): boolean {
  const tag = openingTagWithId(html, `planning-panel-${key}`);
  return tag.length > 0 && !tag.includes("hidden");
}

describe("PlanningShell initial view (#329 alias-render)", () => {
  it("defaults to the Calendar tab when no initialTab is given", () => {
    const html = renderToStaticMarkup(
      <PlanningShell
        calendar={<div>{SENTINELS.calendar}</div>}
        launches={<div>{SENTINELS.launches}</div>}
        capacity={<div>{SENTINELS.capacity}</div>}
        scenarios={<div>{SENTINELS.scenarios}</div>}
        multiplication={<div>{SENTINELS.multiplication}</div>}
      />
    );
    expect(tabIsSelected(html, "calendar")).toBe(true);
    expect(panelIsVisible(html, "calendar")).toBe(true);
  });

  it("opens on the Launches tab for the /admin/launch-planning alias", () => {
    const html = renderShell("launches");
    expect(tabIsSelected(html, "launches")).toBe(true);
    expect(panelIsVisible(html, "launches")).toBe(true);
    // Only the launches panel is visible; the others are hidden.
    expect(panelIsVisible(html, "calendar")).toBe(false);
  });

  it("opens on the Calendar tab for the /admin/calendar alias", () => {
    const html = renderShell("calendar");
    expect(tabIsSelected(html, "calendar")).toBe(true);
    expect(panelIsVisible(html, "calendar")).toBe(true);
    expect(panelIsVisible(html, "launches")).toBe(false);
  });
});

const PAGES = {
  canonical: "../../../../app/(protected)/admin/planning/page.tsx",
  launchPlanningAlias:
    "../../../../app/(protected)/admin/launch-planning/page.tsx",
  calendarAlias: "../../../../app/(protected)/admin/calendar/page.tsx",
} as const;

function readPage(relPath: string): string {
  return readFileSync(fileURLToPath(new URL(relPath, import.meta.url)), "utf8");
}

describe("PlanningShell re-seeds the active tab when initialTab changes (#329)", () => {
  // If React reuses the client shell across a client-side route transition
  // between aliases, useState(initialTab) alone would keep the old tab and the
  // alias would open on the wrong view. The shell guards against this by
  // re-seeding `active` when `initialTab` changes during render (the documented
  // pattern, no effect). Pin that guard so it can't be silently dropped.
  const SHELL = readFileSync(
    fileURLToPath(new URL("../planning-shell.tsx", import.meta.url)),
    "utf8"
  );

  it("syncs active to a changed initialTab during render", () => {
    expect(SHELL).toMatch(/if\s*\(\s*seededTab\s*!==\s*initialTab\s*\)/);
    expect(SHELL).toContain("setActive(initialTab)");
  });
});

describe("Planning entry pages resolve 200, not 3xx (#329)", () => {
  it("the canonical page and both aliases never redirect", () => {
    for (const relPath of Object.values(PAGES)) {
      const src = readPage(relPath);
      expect(src).not.toMatch(/\bredirect\s*\(/);
      expect(src).not.toMatch(/\bpermanentRedirect\s*\(/);
    }
  });

  it("each alias renders the shared PlanningView with its initial tab", () => {
    const launchSrc = readPage(PAGES.launchPlanningAlias);
    expect(launchSrc).toContain("PlanningView");
    expect(launchSrc).toContain('initialTab="launches"');

    const calendarSrc = readPage(PAGES.calendarAlias);
    expect(calendarSrc).toContain("PlanningView");
    expect(calendarSrc).toContain('initialTab="calendar"');

    // The canonical page shares the same view and keeps its first-view default.
    const canonicalSrc = readPage(PAGES.canonical);
    expect(canonicalSrc).toContain("PlanningView");
    expect(canonicalSrc).toContain('initialTab="calendar"');
  });
});
