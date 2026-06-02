import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Issue 258 — Admin Interaction Model req 5: Settings semantics, grouping &
// progressive disclosure. This suite proves the acceptance criteria against the
// real Settings component tree rendered in the gated a11y harness:
//
//   - no empty headings on Settings;
//   - every input has a visible label AND a programmatic label association;
//   - Advanced thresholds (and the per-group overrides block) are collapsed by
//     default, not shown — i.e. progressively disclosed;
//   - axe reports no critical/serious violations on Settings.
//
// The label/heading assertions go beyond axe deliberately: axe flags a MISSING
// label, but "visible label" (a <label> with text the eye can read, tied to the
// control) is what req 5 asks for, so we assert the association explicitly.

const HARNESS = "/a11y-harness";
const SETTINGS = '[data-a11y-surface="settings"]';

// Palette contrast is a Non-Goal of this PRD (cream/terra trips axe at ~4.25:1
// on muted meta text and the terra button); the sibling accessible-names suite
// documents the same carve-out. Every other critical/serious rule gates.
const NON_BLOCKING_RULES = new Set(["color-contrast"]);

async function gotoHarness(page: Page): Promise<void> {
  const response = await page.goto(HARNESS, { waitUntil: "networkidle" });
  expect(response?.status(), "harness route must be enabled").toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "accessible-name harness"
  );
}

// A control is properly labelled when an associated <label> carries visible
// text — either a `label[for=id]` or a wrapping <label> (checkboxes use the
// latter). aria-label would satisfy programmatic naming but NOT the "visible
// label" half of the criterion, so we require real label text.
type ControlLabel = {
  name: string | null;
  type: string;
  labelText: string;
  via: "for" | "wrap" | "none";
};

async function labelledControls(page: Page): Promise<ControlLabel[]> {
  return page
    .locator(
      `${SETTINGS} input:not([type="hidden"]), ${SETTINGS} select, ${SETTINGS} textarea`
    )
    .evaluateAll((els) =>
      els.map((el) => {
        const control = el as
          | HTMLInputElement
          | HTMLSelectElement
          | HTMLTextAreaElement;
        let labelText = "";
        let via: "for" | "wrap" | "none" = "none";
        if (control.id) {
          const forLabel = document.querySelector(`label[for="${control.id}"]`);
          const text = forLabel?.textContent?.trim() ?? "";
          if (text) {
            labelText = text;
            via = "for";
          }
        }
        if (!labelText) {
          const wrap = control.closest("label");
          const text = wrap?.textContent?.trim() ?? "";
          if (text) {
            labelText = text;
            via = "wrap";
          }
        }
        return {
          name: control.getAttribute("name"),
          type:
            control.tagName.toLowerCase() === "input"
              ? (control as HTMLInputElement).type
              : control.tagName.toLowerCase(),
          labelText,
          via,
        };
      })
    );
}

test.describe("settings semantics, grouping & disclosure (issue 258)", () => {
  test.beforeEach(async ({ page }) => {
    await gotoHarness(page);
    await expect(page.locator(SETTINGS)).toBeVisible();
  });

  test("has no empty headings", async ({ page }) => {
    const headings = page.locator(
      `${SETTINGS} h1, ${SETTINGS} h2, ${SETTINGS} h3, ${SETTINGS} h4, ${SETTINGS} h5, ${SETTINGS} h6`
    );
    const count = await headings.count();
    expect(count, "settings should render section headings").toBeGreaterThan(0);
    const texts = await headings.allTextContents();
    for (const text of texts) {
      expect(text.trim(), "no heading may be empty").not.toBe("");
    }
  });

  test("advanced thresholds and per-group overrides are collapsed by default", async ({
    page,
  }) => {
    // Progressive disclosure: the rarely-touched thresholds and the per-group
    // overrides block must NOT be expanded on load.
    const advancedClosed = await page
      .locator(SETTINGS)
      .locator("summary", { hasText: "Advanced thresholds" })
      .evaluate((el) => !el.closest("details")?.open);
    expect(advancedClosed, "Advanced thresholds open on load").toBe(true);

    const overridesClosed = await page
      .locator(SETTINGS)
      .locator("summary", { hasText: "Per-group overrides" })
      .evaluate((el) => !el.closest("details")?.open);
    expect(overridesClosed, "Per-group overrides open on load").toBe(true);
  });

  test("every visible input carries a visible, associated label", async ({
    page,
  }) => {
    // Reveal every control: open both disclosures and pick a group so the
    // per-group override form mounts, then assert each one is labelled.
    await page
      .locator(SETTINGS)
      .locator("summary", { hasText: "Advanced thresholds" })
      .click();
    await page
      .locator(SETTINGS)
      .locator("summary", { hasText: "Per-group overrides" })
      .click();
    await page.locator(`${SETTINGS} #group_picker`).selectOption({ index: 1 });
    // The override form key-remounts on selection; wait for one of its fields.
    await expect(page.locator(`${SETTINGS} #capacity_override`)).toBeVisible();

    const controls = await labelledControls(page);
    expect(
      controls.length,
      "expected several settings controls"
    ).toBeGreaterThan(5);
    const unlabelled = controls.filter((c) => c.via === "none");
    expect(
      unlabelled,
      `unlabelled controls: ${unlabelled.map((c) => c.name ?? c.type).join(", ")}`
    ).toEqual([]);
  });

  test("axe finds no critical or serious violations on settings", async ({
    page,
  }) => {
    // Expand the disclosures and mount the override form so axe scans the full
    // control tree, not just the primary-path defaults.
    await page
      .locator(SETTINGS)
      .locator("summary", { hasText: "Advanced thresholds" })
      .click();
    await page
      .locator(SETTINGS)
      .locator("summary", { hasText: "Per-group overrides" })
      .click();
    await page.locator(`${SETTINGS} #group_picker`).selectOption({ index: 1 });
    await expect(page.locator(`${SETTINGS} #capacity_override`)).toBeVisible();

    const results = await new AxeBuilder({ page }).include(SETTINGS).analyze();
    const seriousOrWorse = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious"
    );
    for (const v of seriousOrWorse.filter((v) =>
      NON_BLOCKING_RULES.has(v.id)
    )) {
      console.warn(
        `[a11y][known palette issue] ${v.id} (${v.impact}): ${v.nodes.length} node(s) — palette is a PRD Non-Goal`
      );
    }
    const blocking = seriousOrWorse.filter(
      (v) => !NON_BLOCKING_RULES.has(v.id)
    );
    const summary = blocking.map(
      (v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s)`
    );
    expect(summary, summary.join("\n")).toEqual([]);
  });
});
