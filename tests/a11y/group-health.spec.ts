import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import {
  expectModalDialogSemantics,
  expectNoBlockingAxeViolations,
  gotoHarness,
} from "./harness";

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
    await expectModalDialogSemantics(page, dialog);
    // The drawer is titled by the group and exposes its rating fields.
    await expect(
      dialog.getByRole("heading", { name: "Anderson" })
    ).toBeVisible();
    await expect(dialog.getByRole("spinbutton")).toHaveCount(2);
    // The save control carries the group as record context (not a bare "Save").
    await expect(
      dialog.getByRole("button", { name: "Save Anderson health ratings" })
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

  test("editing the ratings disables 'Save current grade to record' so edits can't be silently discarded", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);
    await surface
      .getByRole("button", { name: "Open Anderson health editor" })
      .click();
    const dialog = page.getByRole("dialog");
    const recompute = dialog.getByRole("button", {
      name: "Save Anderson current grade to record",
    });
    // Enabled until there are unsaved rating edits.
    await expect(recompute).toBeEnabled();
    await dialog.getByLabel(/Spiritual growth/i).fill("5");
    // Now dirty: recomputing would grade against the last saved ratings and
    // throw away the typed edit, so it is disabled.
    await expect(recompute).toBeDisabled();
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

  test("the Watch filter shows groups at/below the threshold or declining", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);
    await surface.getByRole("button", { name: "Watch" }).click();

    // Dawson (grade C, at the threshold) and Bryant (declining attendance) are
    // on Watch; Anderson (grade B, not declining) is not.
    await expect(
      surface.getByRole("button", { name: "Open Dawson health editor" })
    ).toBeVisible();
    await expect(
      surface.getByRole("button", { name: "Open Bryant health editor" })
    ).toBeVisible();
    await expect(
      surface.getByRole("button", { name: "Open Anderson health editor" })
    ).toHaveCount(0);
    await expect(
      surface.getByRole("button", { name: "Watch" })
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("the Needs follow-up filter shows only flagged groups", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);
    await surface.getByRole("button", { name: "Needs follow-up" }).click();

    // Only Dawson carries the open follow-up flag.
    await expect(
      surface.getByRole("button", { name: "Open Dawson health editor" })
    ).toBeVisible();
    await expect(
      surface.getByRole("button", { name: "Open Anderson health editor" })
    ).toHaveCount(0);
    await expect(
      surface.getByRole("button", { name: "Open Bryant health editor" })
    ).toHaveCount(0);
  });

  test("the drawer's follow-up checkbox names its group as record context", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);
    await surface
      .getByRole("button", { name: "Open Anderson health editor" })
      .click();
    const dialog = page.getByRole("dialog");

    // Named with the group (not a bare "Needs follow-up"), and unchecked for a
    // group with no open flag.
    const checkbox = dialog.getByRole("checkbox", {
      name: "Flag Anderson as needing follow-up",
    });
    await expect(checkbox).toBeVisible();
    await expect(checkbox).not.toBeChecked();
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

  // Issues 665/669 — dismissing a drawer with unsaved rating edits no longer
  // calls a blocking window.confirm; it raises the shared non-blocking dialog.
  // The prompt portals above the drawer, so these cases also guard EditingSurface
  // against treating a click on the prompt as an outside-dismiss of the drawer
  // (which would re-raise the prompt and make Cancel appear to do nothing).
  test("a dirty close raises the discard prompt; Cancel keeps the drawer open", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);
    await surface
      .getByRole("button", { name: "Open Anderson health editor" })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Make an unsaved edit, then dismiss with Escape.
    await dialog.getByLabel(/Spiritual growth/i).fill("2");
    await page.keyboard.press("Escape");

    // The non-blocking prompt appears with the rating-specific copy; the drawer
    // stays open behind it (Escape did not discard). While the modal prompt is
    // up Radix marks the drawer aria-hidden, so it drops out of the ARIA-role
    // tree — assert it is still mounted and visible via its element, not its
    // role, here.
    const prompt = page.getByRole("alertdialog");
    await expect(prompt).toBeVisible();
    await expect(
      prompt.getByText("Discard unsaved changes to this group's ratings?")
    ).toBeVisible();
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    // Cancel must dismiss only the prompt and leave the editor open to keep
    // editing — the #669 regression: clicking Cancel left the prompt stuck. Once
    // the prompt is gone the drawer is back in the ARIA tree as a dialog.
    await prompt.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(dialog).toBeVisible();
  });

  test("confirming Discard on a dirty close closes the drawer", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);
    const opener = surface.getByRole("button", {
      name: "Open Anderson health editor",
    });
    await opener.click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/Spiritual growth/i).fill("2");

    // Dismiss via the explicit Close control this time — also a dirty close.
    await dialog
      .getByRole("button", { name: "Close Anderson health editor" })
      .click();
    const prompt = page.getByRole("alertdialog");
    await expect(prompt).toBeVisible();

    await prompt.getByRole("button", { name: "Discard" }).click();
    // Both the prompt and the drawer are gone, and focus returns to the opener.
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test("a clean close (no edits) goes straight through with no prompt", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);
    await surface
      .getByRole("button", { name: "Open Anderson health editor" })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // No edits → Escape closes immediately, no discard prompt is raised.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});
