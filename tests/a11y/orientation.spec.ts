import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { expectNoBlockingAxeViolations, gotoHarness } from "./harness";

// #906 — the concept orientation for Shepherds and Over-Shepherds. The harness
// mounts both persistent states: the expanded first-run panel (Shepherd
// variant, with the persisting "Got it") and the collapsed already-seen state
// (Over-Shepherd variant, behind the "View orientation" reopen affordance).
// The suite pins the landmark/heading structure, drives the reopen → Close
// round-trip, and gates both states with axe (structure + contrast on the
// sage-tinted panel).

const FIRST_RUN = '[data-a11y-surface="orientation-first-run"]';
const SEEN = '[data-a11y-surface="orientation-seen"]';

test.describe("concept orientation panel", () => {
  test.beforeEach(async ({ page }) => {
    await gotoHarness(page);
  });

  test("first-run panel exposes the concept sections and the dismissal control", async ({
    page,
  }) => {
    const surface = page.locator(FIRST_RUN);

    // A labelled region with an h2 title and one h3 per concept — screen-
    // reader users can walk the concepts from the headings tree alone.
    await expect(
      surface.getByRole("heading", { name: "Welcome to your care space" })
    ).toBeVisible();
    for (const concept of [
      "Care Notes & Prayer Requests",
      "Who can read what you write",
      "“Needs follow-up”",
      "Where your group lives",
    ]) {
      await expect(
        surface.getByRole("heading", { name: concept })
      ).toBeVisible();
    }
    await expect(surface.getByRole("button", { name: "Got it" })).toBeVisible();
  });

  test("already-seen state reopens and closes without losing the affordance", async ({
    page,
  }) => {
    const surface = page.locator(SEEN);

    // Collapsed by default: only the reopen affordance renders.
    const reopen = surface.getByRole("button", { name: "View orientation" });
    await expect(reopen).toBeVisible();
    await expect(
      surface.getByRole("heading", { name: "Welcome to your care space" })
    ).toHaveCount(0);

    // Reopen → the full panel, with the Over-Shepherd coverage copy and a
    // plain Close (a reopened panel never re-fires the persistence action).
    await reopen.click();
    await expect(
      surface.getByRole("heading", { name: "Welcome to your care space" })
    ).toBeVisible();
    await expect(
      surface.getByRole("heading", { name: "Your coverage" })
    ).toBeVisible();

    const close = surface.getByRole("button", { name: "Close" });
    await expect(close).toBeVisible();
    await close.click();
    await expect(
      surface.getByRole("button", { name: "View orientation" })
    ).toBeVisible();
  });

  test("axe passes on the expanded first-run panel", async ({ page }) => {
    const results = await new AxeBuilder({ page }).include(FIRST_RUN).analyze();
    expectNoBlockingAxeViolations(results);
  });

  test("axe passes on the reopened panel", async ({ page }) => {
    await page
      .locator(SEEN)
      .getByRole("button", { name: "View orientation" })
      .click();
    await expect(
      page.locator(SEEN).getByRole("heading", { name: "Your coverage" })
    ).toBeVisible();
    const results = await new AxeBuilder({ page }).include(SEEN).analyze();
    expectNoBlockingAxeViolations(results);
  });
});
