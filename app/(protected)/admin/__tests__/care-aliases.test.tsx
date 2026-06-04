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
// which tab opens first. These tests pin two invariants:
//   1. The shell honors `initialTab`, so an alias can open on its view.
//   2. The alias page modules import the canonical CarePageView with the
//      correct initialTab and never call redirect/permanentRedirect — i.e. they
//      alias-render (200), they don't redirect (3xx).

function tab(key: CareTabKey, label: string): CareTab {
  return { key, label, panel: <div>{label} panel</div> };
}

const TABS: CareTab[] = [
  tab("needs-contact", "Needs Contact"),
  tab("follow-ups", "Follow-ups"),
  tab("due-soon", "Due Soon"),
  tab("recent-care", "Recent Care"),
  tab("completed", "Completed"),
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

describe("CareShell honors initialTab (#328)", () => {
  it("opens on needs-contact by default", () => {
    const html = renderToStaticMarkup(<CareShell tabs={TABS} />);
    expect(selectedTabId(html)).toBe("care-tab-needs-contact");
  });

  it("opens on the follow-ups tab when asked", () => {
    const html = renderToStaticMarkup(
      <CareShell tabs={TABS} initialTab="follow-ups" />
    );
    expect(selectedTabId(html)).toBe("care-tab-follow-ups");
  });

  it("opens on the needs-contact tab when asked", () => {
    const html = renderToStaticMarkup(
      <CareShell tabs={TABS} initialTab="needs-contact" />
    );
    expect(selectedTabId(html)).toBe("care-tab-needs-contact");
  });
});

describe("Care alias entries alias-render the canonical shell, not a redirect (#328)", () => {
  const SHEPHERD_CARE = readAlias("shepherd-care/page.tsx");
  const FOLLOW_UPS = readAlias("follow-ups/page.tsx");

  it("the shepherd-care landing renders CarePageView on the needs-contact tab", () => {
    expect(SHEPHERD_CARE).toContain("CarePageView");
    expect(SHEPHERD_CARE).toContain('initialTab="needs-contact"');
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
});
