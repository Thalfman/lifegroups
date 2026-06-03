import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { expectNoBlockingAxeViolations, gotoHarness } from "./harness";

// Issue 268 — Admin Interaction Model req 1: propagate the validated Editing
// Pattern (proven on Group health #259, Groups #266, Follow-ups #267) to the
// Leader care list-style editing. P0 boundary only: the only list-style
// editing in the care detail is care follow-up creation, which moves into the
// shared EditingSurface drawer. The per-row status quick-actions stay on the
// list (the broader care-action redesign is P1, #272). This suite gates:
//
//   1. The care follow-up list renders no inline create form, only an "Add
//      follow-up" trigger.
//   2. The drawer passes the focus & keyboard checklist: opening moves focus
//      in, the explicit Close and Escape both close, and focus returns to the
//      triggering control.
//   3. The empty "No follow-ups yet" prompt is replaced while creating.
//   4. axe finds no critical/serious violations with the drawer open.

const SURFACE = '[data-a11y-surface="care-follow-ups"]';
const EMPTY_SURFACE = '[data-a11y-surface="care-follow-ups-empty"]';

test.describe("leader care follow-up editing surface", () => {
  test.beforeEach(async ({ page }) => {
    await gotoHarness(page);
  });

  test("the list renders no inline create form, only an Add follow-up trigger", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);

    // Creation moved into the drawer (portaled out of the surface), so the list
    // itself exposes none of the create form's fields.
    expect(await surface.getByLabel("Title").count()).toBe(0);

    // The create trigger is a single, unambiguous control on the list.
    await expect(
      surface.getByRole("button", { name: "Add follow-up" })
    ).toBeVisible();
  });

  test("Add follow-up opens the create drawer and moves focus in", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);
    await surface.getByRole("button", { name: "Add follow-up" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: "Add a follow-up" })
    ).toBeVisible();
    await expect(dialog.getByLabel("Title")).toBeVisible();

    const focusInside = await dialog.evaluate((node) =>
      node.contains(document.activeElement)
    );
    expect(focusInside).toBe(true);
  });

  test("Escape closes the drawer and returns focus to Add follow-up", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);
    const opener = surface.getByRole("button", { name: "Add follow-up" });
    await opener.click();
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test("the explicit Close control closes the drawer", async ({ page }) => {
    const surface = page.locator(SURFACE);
    await surface.getByRole("button", { name: "Add follow-up" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // The close control carries the leader's name as record context.
    await dialog
      .getByRole("button", { name: /^Close new follow-up form for / })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test('the "No follow-ups yet" empty state is replaced while creating', async ({
    page,
  }) => {
    const surface = page.locator(EMPTY_SURFACE);
    await expect(surface.getByText(/No follow-ups yet/)).toBeVisible();

    await surface.getByRole("button", { name: "Add follow-up" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // The first-run prompt is gone, replaced by the in-progress note.
    await expect(surface.getByText(/No follow-ups yet/)).toHaveCount(0);
    await expect(surface.getByText(/save to add the first one/)).toBeVisible();
  });

  test("axe finds no critical or serious violations with the create drawer open", async ({
    page,
  }) => {
    await page
      .locator(SURFACE)
      .getByRole("button", { name: "Add follow-up" })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    expectNoBlockingAxeViolations(results);
  });
});
