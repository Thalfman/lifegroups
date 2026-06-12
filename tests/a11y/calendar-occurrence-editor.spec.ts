import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import {
  expectModalDialogSemantics,
  expectNoBlockingAxeViolations,
  gotoHarness,
} from "./harness";

// Issue #324 — a11y hardening sweep, dialogs/destructive-actions thread. The
// Groups calendar occurrence editor (components/calendar/calendar-occurrence-
// editor.tsx) is a Radix Dialog distinct from the EditingSurface drawer: it is
// opened from a programmatic button (not a DialogTrigger), and it carries the
// destructive "Clear override" action. This suite pins the checklist the sweep
// verifies on every modal: the dialog has an accessible name, focus moves in on
// open and is trapped, Escape and the explicit Cancel both close it returning
// focus to the trigger, the destructive Clear override action is named and
// keyboard-operable, and axe finds nothing blocking with the modal open.

const SURFACE = '[data-a11y-surface="calendar-occurrence-editor"]';

test.describe("calendar occurrence editor dialog", () => {
  test.beforeEach(async ({ page }) => {
    await gotoHarness(page);
  });

  test("opening the editor names the dialog and moves focus in", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);
    await surface
      .getByRole("button", { name: "Edit Anderson occurrence on May 19" })
      .click();

    // Radix labels the dialog from its DialogTitle, so it is reachable by an
    // accessible name rather than an anonymous "dialog".
    const dialog = page.getByRole("dialog", {
      name: /Edit meeting occurrence/i,
    });
    await expect(dialog).toBeVisible();
    await expectModalDialogSemantics(page, dialog);

    // Opening moved focus into the surface (focus trap precondition).
    const focusInside = await dialog.evaluate((node) =>
      node.contains(document.activeElement)
    );
    expect(focusInside).toBe(true);
  });

  test("Escape closes the editor and returns focus to the trigger", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);
    const opener = surface.getByRole("button", {
      name: "Edit Anderson occurrence on May 19",
    });
    await opener.click();
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    // The dialog opens from a programmatic button (no DialogTrigger), so focus
    // restoration is the behaviour most likely to regress — pin it.
    await expect(opener).toBeFocused();
  });

  test("the explicit Cancel control closes the editor and restores focus", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);
    const opener = surface.getByRole("button", {
      name: "Edit Anderson occurrence on May 19",
    });
    await opener.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test("the destructive Clear override action is named and keyboard-operable", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);
    await surface
      .getByRole("button", { name: "Edit Anderson occurrence on May 19" })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // The destructive action carries a clear, non-generic name and is a real
    // button reachable by the keyboard (it can be focused and is enabled).
    const clear = dialog.getByRole("button", { name: "Clear override" });
    await expect(clear).toBeVisible();
    await clear.focus();
    await expect(clear).toBeFocused();
    await expect(clear).toBeEnabled();
  });

  test("axe finds no critical or serious violations with the editor open", async ({
    page,
  }) => {
    await page
      .locator(SURFACE)
      .getByRole("button", { name: "Edit Anderson occurrence on May 19" })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    expectNoBlockingAxeViolations(results);
  });
});
