import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { expectNoBlockingAxeViolations, gotoHarness, PHONE } from "./harness";

// Branded offline / network-error state (#559). Verifies the reusable app-like
// error state and the offline banner render in the app's visual language with a
// clear retry path, and stay accessible — at a phone viewport, since the state
// is most likely to be hit on mobile / an installed PWA.

const SURFACE = '[data-a11y-surface="offline-error"]';

test.describe("offline / error state (#559)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(PHONE);
    await gotoHarness(page);
    await expect(page.locator(SURFACE)).toBeVisible();
  });

  test("renders a branded error state with a clear retry path", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);
    await expect(
      surface.getByRole("heading", { name: /didn't load/i })
    ).toBeVisible();
    await expect(
      surface.getByRole("button", { name: /try again/i })
    ).toBeVisible();
    await expect(
      surface.getByRole("link", { name: /go to home/i })
    ).toBeVisible();
  });

  test("shows an offline status message", async ({ page }) => {
    const surface = page.locator(SURFACE);
    // The banner copy uses a typographic apostrophe (You’re), so match either.
    await expect(surface.getByText(/you[’']re offline/i)).toBeVisible();
  });

  test("axe finds no critical or serious violations", async ({ page }) => {
    const results = await new AxeBuilder({ page }).include(SURFACE).analyze();
    expectNoBlockingAxeViolations(results);
  });
});
