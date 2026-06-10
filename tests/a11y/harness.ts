import type AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

// Shared helpers for the gated a11y harness specs (issues 257 + 258). Both the
// accessible-names suite and the Settings suite boot the same /a11y-harness
// route and gate on the same axe policy, so the route guard and the axe
// carve-out live here once rather than drifting across two files.

export const HARNESS = "/a11y-harness";

// No carve-outs: the 2026-06 design-system upgrade deepened the ink/clay/
// sage/rose/blue ramps to clear WCAG AA (docs/design-direction.md §1), so
// color-contrast now gates like every other critical/serious rule.
export const NON_BLOCKING_RULES = new Set<string>([]);

export async function gotoHarness(page: Page): Promise<void> {
  const response = await page.goto(HARNESS, { waitUntil: "networkidle" });
  // Guard against the env gate being off — otherwise a spec would silently
  // pass against a 404 with no controls to check.
  expect(response?.status(), "harness route must be enabled").toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "accessible-name harness"
  );
}

type AxeResults = Awaited<ReturnType<AxeBuilder["analyze"]>>;

// Assert axe found no critical/serious violations beyond the documented
// non-blocking palette rules (logged as warnings so they stay visible without
// gating). Callers build the AxeBuilder — including any `.include(...)` scope —
// and pass the analyzed results in.
export function expectNoBlockingAxeViolations(results: AxeResults): void {
  const seriousOrWorse = results.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious"
  );
  for (const v of seriousOrWorse.filter((v) => NON_BLOCKING_RULES.has(v.id))) {
    console.warn(
      `[a11y][known palette issue] ${v.id} (${v.impact}): ${v.nodes.length} node(s) — palette is a PRD Non-Goal`
    );
  }
  const blocking = seriousOrWorse.filter((v) => !NON_BLOCKING_RULES.has(v.id));
  const summary = blocking.map(
    (v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s)`
  );
  expect(summary, summary.join("\n")).toEqual([]);
}
