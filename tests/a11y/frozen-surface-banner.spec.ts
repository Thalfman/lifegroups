import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { expectNoBlockingAxeViolations, gotoHarness } from "./harness";

// "Preserved, not actively maintained" banner (#596). The off-nav frozen
// pre-pivot surfaces render this shared strip so a viewer knows the surface
// isn't maintained. Verify it's reachable, carries its message, and stays
// accessible (the axe policy now blocks color-contrast, so the strip must clear
// WCAG AA on its own surface).

const SURFACE = '[data-a11y-surface="frozen-surface-banner"]';

test.describe("frozen surface banner (#596)", () => {
  test.beforeEach(async ({ page }) => {
    await gotoHarness(page);
    await expect(page.locator(SURFACE)).toBeVisible();
  });

  test("renders the preserved-not-maintained message", async ({ page }) => {
    const surface = page.locator(SURFACE);
    await expect(
      surface.getByText(/preserved, not actively maintained/i)
    ).toBeVisible();
    await expect(surface.getByRole("note")).toBeVisible();
  });

  test("axe finds no critical or serious violations", async ({ page }) => {
    const results = await new AxeBuilder({ page }).include(SURFACE).analyze();
    expectNoBlockingAxeViolations(results);
  });
});
