import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CareShell,
  type CareTab,
  type CareTabKey,
} from "@/components/admin/care/care-shell";

// #328 — /admin/care is the canonical Care entry. /admin/shepherd-care (landing)
// and /admin/follow-ups are thin ALIAS entries that render the same canonical
// Care shell and return 200, NOT a 302 redirect (ADR 0013). They differ only by
// which tab opens first. #334 re-keyed the shell to the PRD IA names; #373 made
// the Over-Shepherd accordion (`over-shepherds`) the canonical default landing
// tab. These tests pin two invariants against the current keys:
//   1. The shell honors `initialTab`, so an alias can open on its view, and the
//      canonical default is the over-shepherds accordion.
//   2. The alias page modules import the canonical CarePageView with the
//      correct initialTab and never call redirect/permanentRedirect — i.e. they
//      alias-render (200), they don't redirect (3xx).

function tab(key: CareTabKey, label: string): CareTab {
  return { key, label, panel: <div>{label} panel</div> };
}

const TABS: CareTab[] = [
  tab("over-shepherds", "Over-Shepherds"),
  tab("dashboard", "Dashboard"),
  tab("directory", "Directory"),
  tab("follow-ups", "Follow-ups"),
  tab("coverage", "Coverage"),
  tab("recent-interactions", "Recent interactions"),
];

// The selected tab is the only button with aria-selected="true". Pull its id so
// we can assert WHICH tab opened.
function selectedTabId(html: string): string | null {
  const match = html.match(/id="(care-tab-[^"]+)"[^>]*aria-selected="true"/);
  return match ? match[1] : null;
}

function readAlias(relPath: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../${relPath}`, import.meta.url)),
    "utf8"
  );
}

describe("CareShell honors initialTab (#328, re-keyed #334, #373)", () => {
  it("opens on the over-shepherds accordion by default (#373)", () => {
    const html = renderToStaticMarkup(<CareShell tabs={TABS} />);
    expect(selectedTabId(html)).toBe("care-tab-over-shepherds");
  });

  it("opens on the follow-ups tab when asked", () => {
    const html = renderToStaticMarkup(
      <CareShell tabs={TABS} initialTab="follow-ups" />
    );
    expect(selectedTabId(html)).toBe("care-tab-follow-ups");
  });

  it("opens on the dashboard tab when asked", () => {
    const html = renderToStaticMarkup(
      <CareShell tabs={TABS} initialTab="dashboard" />
    );
    expect(selectedTabId(html)).toBe("care-tab-dashboard");
  });
});

describe("CareShell re-seeds the active tab when initialTab changes (#328)", () => {
  // If React reuses the client shell across a client-side route transition
  // between aliases, useState(initialTab) alone would keep the old tab and the
  // alias would open on the wrong view. The shell guards against this by
  // re-seeding `active` when `initialTab` changes during render (the documented
  // pattern, no effect). Pin that guard so it can't be silently dropped.
  const SHELL = readFileSync(
    fileURLToPath(
      new URL(
        "../../../../components/admin/care/care-shell.tsx",
        import.meta.url
      )
    ),
    "utf8"
  );

  it("syncs active to a changed initialTab during render", () => {
    expect(SHELL).toMatch(/if\s*\(\s*seededTab\s*!==\s*initialTab\s*\)/);
    expect(SHELL).toContain("setActive(initialTab)");
  });
});

describe("Care alias entries alias-render the canonical shell, not a redirect (#328)", () => {
  const SHEPHERD_CARE = readAlias("shepherd-care/page.tsx");
  const FOLLOW_UPS = readAlias("follow-ups/page.tsx");

  it("the shepherd-care landing renders CarePageView on the dashboard tab", () => {
    expect(SHEPHERD_CARE).toContain("CarePageView");
    expect(SHEPHERD_CARE).toContain('initialTab="dashboard"');
  });

  it("the follow-ups page renders CarePageView on the follow-ups tab", () => {
    expect(FOLLOW_UPS).toContain("CarePageView");
    expect(FOLLOW_UPS).toContain('initialTab="follow-ups"');
  });

  it("neither alias redirects (200, not 3xx)", () => {
    for (const source of [SHEPHERD_CARE, FOLLOW_UPS]) {
      expect(source).not.toMatch(/\bredirect\s*\(/);
      expect(source).not.toMatch(/\bpermanentRedirect\s*\(/);
    }
  });

  it("both aliases reuse the canonical loader path (single shell, no duplicated loader)", () => {
    for (const source of [SHEPHERD_CARE, FOLLOW_UPS]) {
      expect(source).toContain('admin/care/page"');
      // A thin alias must not re-run its own care data load.
      expect(source).not.toContain("loadCareData");
      expect(source).not.toContain("buildShepherdCareDashboardModel");
    }
  });

  // #334 — the embedded Dashboard widgets still drill down via the legacy
  // `?view=directory` / `?coverage=…` params against the /admin/shepherd-care
  // alias path. So the landing must forward searchParams to the canonical shell,
  // which translates them into the matching tab (Directory / Coverage). Pin the
  // forwarding so the drill-down deep links can't be silently re-broken.
  const CARE_PAGE = readAlias("care/page.tsx");

  it("the shepherd-care landing forwards searchParams to the canonical shell", () => {
    expect(SHEPHERD_CARE).toContain("searchParams");
    expect(SHEPHERD_CARE).toMatch(/searchParams=\{searchParams\}/);
  });

  it("the canonical Care view resolves drill-down params to the initial tab", () => {
    expect(CARE_PAGE).toContain("resolveCareInitialTabFromParams");
    // The shell must open on the resolved tab, not the raw default.
    expect(CARE_PAGE).toMatch(/initialTab=\{resolvedTab\}/);
  });

  // #373 — the canonical Care surface defaults to the Over-Shepherd accordion
  // and renders it as a tab panel.
  it("the canonical Care view defaults to the over-shepherds accordion", () => {
    expect(CARE_PAGE).toMatch(/initialTab = "over-shepherds"/);
    expect(CARE_PAGE).toContain("<CareAccordion");
    expect(CARE_PAGE).toContain("buildCareAccordion");
  });
});
