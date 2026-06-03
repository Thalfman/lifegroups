import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { expectNoBlockingAxeViolations, gotoHarness } from "./harness";

// Issue 259 — Admin Interaction Model req 2: Group health is a triage workflow,
// and req 1's Editing Pattern is proven here on the reference surface. This
// suite gates the two things the issue calls out:
//
//   1. The list is a review table — no per-row save buttons, no inline edit
//      form — and its repeated Open control carries the group as record context.
//   2. The shared EditingSurface drawer passes the focus & keyboard checklist:
//      opening moves focus in, the explicit Close and Escape both close, focus
//      returns to the triggering control, and filter state survives the round
//      trip. (A keyboard-only user can complete the flow.)

const SURFACE = '[data-a11y-surface="group-health"]';

test.describe("group health triage + editing surface", () => {
  test.beforeEach(async ({ page }) => {
    await gotoHarness(page);
  });

  test("the list is a triage table with no per-row save/edit form", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);

    // The triage columns the issue specifies.
    for (const header of [
      "Group",
      "Last check-in",
      "Attendance (8-wk avg)",
      "Grade",
      "Missing ratings",
      "Last saved",
    ]) {
      await expect(
        surface.getByRole("columnheader", { name: header })
      ).toBeVisible();
    }

    // No per-row save button and no rating inputs are rendered into the list
    // itself — editing only exists inside the drawer, which is closed on load.
    expect(await surface.getByRole("button", { name: /save/i }).count()).toBe(
      0
    );
    expect(await surface.getByRole("spinbutton").count()).toBe(0);
  });

  test("repeated Open controls name their group and stay unique", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);
    const openButtons = surface.getByRole("button", {
      name: /^Open .+ health editor$/,
    });
    const names = await openButtons.evaluateAll((els) =>
      els.map((el) => el.getAttribute("aria-label") ?? "")
    );
    expect(names.length).toBeGreaterThan(1);
    expect(new Set(names).size).toBe(names.length);
  });

  test("opening a group reveals its ratings in the drawer and moves focus in", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);
    await surface
      .getByRole("button", { name: "Open Anderson health editor" })
      .click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // The drawer is titled by the group and exposes its rating fields.
    await expect(
      dialog.getByRole("heading", { name: "Anderson" })
    ).toBeVisible();
    await expect(dialog.getByRole("spinbutton")).toHaveCount(2);
    // The save control carries the group as record context (not a bare "Save").
    await expect(
      dialog.getByRole("button", { name: "Save Anderson health rating" })
    ).toBeVisible();

    // Opening moved focus into the surface.
    const focusInside = await dialog.evaluate((node) =>
      node.contains(document.activeElement)
    );
    expect(focusInside).toBe(true);
  });

  test("Escape closes the drawer and returns focus to the Open control", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);
    const opener = surface.getByRole("button", {
      name: "Open Bryant health editor",
    });
    await opener.click();
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Focus is back on the control that opened it.
    await expect(opener).toBeFocused();
  });

  test("the explicit Close control closes the drawer", async ({ page }) => {
    const surface = page.locator(SURFACE);
    await surface
      .getByRole("button", { name: "Open Carter health editor" })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog
      .getByRole("button", { name: "Close Carter health editor" })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("closing returns to the prior filter state", async ({ page }) => {
    const surface = page.locator(SURFACE);

    // Apply a filter, then open and close a drawer.
    await surface.getByRole("button", { name: "Not assessed" }).click();
    // Only the unassessed group (Carter) remains; Anderson is filtered out.
    await expect(
      surface.getByRole("button", { name: "Open Carter health editor" })
    ).toBeVisible();
    await expect(
      surface.getByRole("button", { name: "Open Anderson health editor" })
    ).toHaveCount(0);

    await surface
      .getByRole("button", { name: "Open Carter health editor" })
      .click();
    await page.keyboard.press("Escape");

    // The filter is still applied after the drawer round trip.
    await expect(
      surface.getByRole("button", { name: "Open Anderson health editor" })
    ).toHaveCount(0);
    await expect(
      surface.getByRole("button", { name: "Not assessed" })
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("axe finds no critical or serious violations with the drawer open", async ({
    page,
  }) => {
    await page
      .locator(SURFACE)
      .getByRole("button", { name: "Open Anderson health editor" })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    expectNoBlockingAxeViolations(results);
  });
});
