import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The shell reads the active tab from the URL; with no `?tab=` it resolves to
// the default "readiness" tab (ADR 0030). Mock next/navigation so the client
// hooks resolve in the node test environment (there's no router provider here).
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/multiply",
  useSearchParams: () => new URLSearchParams(""),
}));

import { MultiplyShell } from "@/components/admin/multiply/multiply-shell";

// Grab the open `<button …>` tag for a given tab id, so attribute assertions
// don't depend on React's attribute-emit order.
function tabTag(html: string, key: string): string {
  return (
    html.match(new RegExp(`<button[^>]*id="multiply-tab-${key}"[^>]*>`))?.[0] ??
    ""
  );
}

const TABS = [
  { key: "readiness" as const, label: "Readiness", panel: <p>readiness</p> },
  {
    key: "pipeline" as const,
    label: "Pipeline",
    count: 3,
    panel: <p>pipeline</p>,
  },
  {
    key: "leaders" as const,
    label: "Shepherds",
    count: 0,
    panel: <p>leaders</p>,
  },
];

describe("MultiplyShell tab accessibility", () => {
  const html = renderToStaticMarkup(<MultiplyShell tabs={TABS} />);

  it("exposes an ARIA tablist with three tabs", () => {
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-label="Multiply sections"');
    for (const key of ["readiness", "pipeline", "leaders"]) {
      expect(tabTag(html, key)).toContain('role="tab"');
      expect(tabTag(html, key)).toContain(
        `aria-controls="multiply-panel-${key}"`
      );
    }
  });

  it("uses roving tabIndex: only the active tab is in the Tab order", () => {
    // Default tab is "readiness": it is selected and the lone Tab stop
    // (tabindex 0); the rest are reached via the arrow keys (tabindex -1).
    const readiness = tabTag(html, "readiness");
    expect(readiness).toContain('aria-selected="true"');
    expect(readiness).toContain('tabindex="0"');

    for (const key of ["pipeline", "leaders"]) {
      const tag = tabTag(html, key);
      expect(tag).toContain('aria-selected="false"');
      expect(tag).toContain('tabindex="-1"');
    }
  });
});
