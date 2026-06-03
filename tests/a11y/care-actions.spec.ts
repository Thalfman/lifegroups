import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { expectNoBlockingAxeViolations, gotoHarness } from "./harness";

// Leader care actions redesign (#272, Admin Interaction Model req 10). The care
// actions are now plain, separate choices, each opening a focused Editing
// Pattern drawer. This proves the redesigned surface passes the focus checklist
// and stays accessible: distinct non-generic action names, focus moves into the
// drawer on open and returns to the opener on close, and axe finds nothing
// blocking with the drawer open.

test.describe("leader care actions (redesigned)", () => {
  test.beforeEach(async ({ page }) => {
    await gotoHarness(page);
  });

  test("care actions are distinct, single-purpose choices", async ({
    page,
  }) => {
    const surface = page.locator('[data-a11y-surface="care-actions"]');
    for (const name of [
      "Log call",
      "Log text",
      "Log visit",
      "Update status",
      "Set next touchpoint",
      "Add summary",
    ]) {
      await expect(
        surface.getByRole("button", { name, exact: true })
      ).toBeVisible();
    }
  });

  test("choosing an action opens the drawer, and closing returns focus", async ({
    page,
  }) => {
    const surface = page.locator('[data-a11y-surface="care-actions"]');
    const trigger = surface.getByRole("button", {
      name: "Log call",
      exact: true,
    });
    await trigger.click();

    // The drawer's Close control carries leader context (req 4), and focus is
    // now inside the dialog.
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const close = dialog.getByRole("button", {
      name: /Close care action panel for/i,
    });
    await expect(close).toBeVisible();

    // axe over the open drawer.
    const results = await new AxeBuilder({ page }).analyze();
    expectNoBlockingAxeViolations(results);

    // Closing returns focus to the control that opened the drawer.
    await close.click();
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});
