import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CareShell, type CareTab } from "@/components/admin/care/care-shell";

// The Care tab bar implements the WAI-ARIA tabs roving-tabindex pattern: exactly
// one tab is in the Tab order (tabindex 0) while the rest are reachable only via
// the Arrow keys (tabindex -1). The keyboard movement itself is a client
// interaction (not exercisable in this node/SSR test env), so these tests pin
// the static a11y contract the pattern depends on.

function tabs(): CareTab[] {
  return [
    { key: "over-shepherds", label: "Over-Shepherds", panel: <p>os</p> },
    { key: "all-leaders", label: "All leaders", count: 3, panel: <p>all</p> },
    { key: "notes", label: "Notes", panel: <p>notes</p> },
  ];
}

describe("CareShell", () => {
  it("puts only the active tab in the Tab order (roving tabindex)", () => {
    const html = renderToStaticMarkup(
      <CareShell tabs={tabs()} initialTab="all-leaders" />
    );

    expect(html).toMatch(/id="care-tab-all-leaders"[^>]*tabindex="0"/);
    expect(html).toMatch(/id="care-tab-over-shepherds"[^>]*tabindex="-1"/);
    expect(html).toMatch(/id="care-tab-notes"[^>]*tabindex="-1"/);
  });

  it("marks the active tab selected and wires each tab to its panel", () => {
    const html = renderToStaticMarkup(
      <CareShell tabs={tabs()} initialTab="over-shepherds" />
    );

    expect(html).toMatch(
      /id="care-tab-over-shepherds"[^>]*aria-selected="true"/
    );
    expect(html).toMatch(/id="care-tab-all-leaders"[^>]*aria-selected="false"/);
    expect(html).toContain('aria-controls="care-panel-over-shepherds"');
    expect(html).toContain('id="care-panel-over-shepherds"');
  });

  it("normalizes a legacy initialTab onto the canonical active tab", () => {
    // `directory` is a retired key that maps onto the All-leaders tab (#477).
    const html = renderToStaticMarkup(
      <CareShell tabs={tabs()} initialTab="directory" />
    );

    expect(html).toMatch(/id="care-tab-all-leaders"[^>]*tabindex="0"/);
  });
});
