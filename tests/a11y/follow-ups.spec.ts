import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { expectNoBlockingAxeViolations, gotoHarness } from "./harness";

// Issue 267 — Admin Interaction Model req 1: propagate the validated Editing
// Pattern (proven on Group health in #259, Groups in #266) to Follow-up
// creation. This suite gates what the issue calls out:
//
//   1. Follow-up creation opens the shared EditingSurface drawer — the list
//      renders no full inline create form, only an "Add follow-up" trigger.
//   2. The drawer passes the focus & keyboard checklist: opening moves focus
//      in, the explicit Close and Escape both close, and focus returns to the
//      triggering control.
//   3. The queue's filter state survives the open/close round trip.
//   4. The "No follow-ups yet" empty state is replaced while creation is
//      active.
//   5. axe finds no critical/serious violations with the drawer open.

const SURFACE = '[data-a11y-surface="follow-ups"]';
const EMPTY_SURFACE = '[data-a11y-surface="follow-ups-empty"]';

test.describe("admin follow-ups editing surface", () => {
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
    expect(await surface.getByLabel("Type", { exact: true }).count()).toBe(0);

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

    await dialog
      .getByRole("button", { name: "Close new follow-up form" })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("closing returns to the prior filter state", async ({ page }) => {
    const surface = page.locator(SURFACE);

    // Reveal the filters and narrow the queue to High priority.
    await surface.getByRole("button", { name: "Filter" }).click();
    const priorityFilter = surface.getByLabel("Priority");
    await priorityFilter.selectOption("high");

    // Open and close the create drawer; the filter must survive the round trip.
    await surface.getByRole("button", { name: "Add follow-up" }).click();
    await page.keyboard.press("Escape");

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(surface.getByLabel("Priority")).toHaveValue("high");
  });

  test('the "No follow-ups yet" empty state is replaced while creating', async ({
    page,
  }) => {
    const surface = page.locator(EMPTY_SURFACE);
    await expect(surface.getByText("No follow-ups yet")).toBeVisible();

    await surface.getByRole("button", { name: "Add follow-up" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // The first-run prompt is gone, replaced by the in-progress note.
    await expect(surface.getByText("No follow-ups yet")).toHaveCount(0);
    await expect(
      surface.getByText("Creating your first follow-up…")
    ).toBeVisible();
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
