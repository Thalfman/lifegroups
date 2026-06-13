import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The shell reads the active tab from the URL; with no `?tab=` it resolves to
// the default "plan" tab. Mock next/navigation so the client hooks resolve in
// the node test environment (there's no router provider here).
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
  { key: "plan" as const, label: "Plan", count: 3, panel: <p>plan</p> },
  { key: "readiness" as const, label: "Readiness", panel: <p>readiness</p> },
  {
    key: "leaders" as const,
    label: "Leaders",
    count: 0,
    panel: <p>leaders</p>,
  },
];

describe("MultiplyShell tab accessibility", () => {
  const html = renderToStaticMarkup(<MultiplyShell tabs={TABS} />);

  it("exposes an ARIA tablist with three tabs", () => {
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-label="Multiply sections"');
    for (const key of ["plan", "readiness", "leaders"]) {
      expect(tabTag(html, key)).toContain('role="tab"');
      expect(tabTag(html, key)).toContain(
        `aria-controls="multiply-panel-${key}"`
      );
    }
  });

  it("uses roving tabIndex: only the active tab is in the Tab order", () => {
    // Default tab is "plan": it is selected and the lone Tab stop (tabindex 0);
    // the rest are reached via the arrow keys (tabindex -1).
    const plan = tabTag(html, "plan");
    expect(plan).toContain('aria-selected="true"');
    expect(plan).toContain('tabindex="0"');

    for (const key of ["readiness", "leaders"]) {
      const tag = tabTag(html, key);
      expect(tag).toContain('aria-selected="false"');
      expect(tag).toContain('tabindex="-1"');
    }
  });
});
