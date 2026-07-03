import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import {
  expectModalDialogSemantics,
  expectNoBlockingAxeViolations,
  gotoHarness,
  surface,
} from "./harness";

// Issue #815 (audit finding TEST-4): the contextual entity-action menu
// (#776/#781) — the app's newest menu/popover chrome — was unit-tested but
// never harness-mounted, so its accessible names, menu semantics, and the
// shared drawer's modal semantics shipped unchecked by the gating a11y lane.
// The harness mounts two CareLeaderActionsMenu instances inside their own
// ContextualActionProvider with the real Care drawer bodies; selecting an
// action opens the shared EditingSurface drawer (a Radix Dialog). The bodies
// post through real server actions on submit — these specs open and close but
// NEVER submit.

test.describe("contextual entity-action menu + shared drawer", () => {
  test.beforeEach(async ({ page }) => {
    await gotoHarness(page);
  });

  test("repeated triggers carry each shepherd's name", async ({ page }) => {
    const region = surface(page, "care-contextual-actions");
    await expect(
      region.getByRole("button", { name: "Care actions for Anderson Lee" })
    ).toBeVisible();
    await expect(
      region.getByRole("button", { name: "Care actions for Priya Nair" })
    ).toBeVisible();
  });

  test("the menu opens with menu semantics and passes axe", async ({
    page,
  }) => {
    const region = surface(page, "care-contextual-actions");
    await region
      .getByRole("button", { name: "Care actions for Anderson Lee" })
      .click();

    // Radix portals the dropdown content to the body — resolve it by role.
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    const items = menu.getByRole("menuitem");
    expect(await items.count()).toBeGreaterThan(3);
    await expect(
      menu.getByRole("menuitem", { name: "Add care note" })
    ).toBeVisible();

    // Scope to the portaled menu: Radix's modal dropdown aria-hides the rest
    // of the page while it is open (axe would report aria-hidden-focus on the
    // backgrounded harness surfaces, which is Radix's managed state, not a
    // defect in the menu under test).
    const results = await new AxeBuilder({ page })
      .include('[role="menu"]')
      .analyze();
    expectNoBlockingAxeViolations(results);
  });

  test("Escape closes the menu and returns focus to its trigger", async ({
    page,
  }) => {
    const region = surface(page, "care-contextual-actions");
    const trigger = region.getByRole("button", {
      name: "Care actions for Priya Nair",
    });
    await trigger.click();
    await expect(page.getByRole("menu")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("selecting an action opens the shared drawer with modal semantics", async ({
    page,
  }) => {
    const region = surface(page, "care-contextual-actions");
    await region
      .getByRole("button", { name: "Care actions for Anderson Lee" })
      .click();
    await page.getByRole("menuitem", { name: "Add care note" }).click();

    // The EditingSurface drawer portals to the body; its title is the action
    // label and its close control carries that label too.
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Add care note");
    await expect(
      dialog.getByRole("button", { name: "Close Add care note" })
    ).toBeVisible();
    await expectModalDialogSemantics(page, dialog);

    const results = await new AxeBuilder({ page }).analyze();
    expectNoBlockingAxeViolations(results);

    // Pristine form (nothing typed): Escape closes the drawer directly, with
    // no discard-confirmation dialog in the way.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  });
});
