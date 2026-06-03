import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { expectNoBlockingAxeViolations, gotoHarness } from "./harness";

// Issue 266 — Admin Interaction Model req 1: propagate the validated Editing
// Pattern (proven on Group health in #259) to the Groups list. This suite gates
// what the issue calls out:
//
//   1. The Groups list no longer expands inline to edit — the list itself
//      renders no edit form, and editing/creating opens the shared
//      EditingSurface drawer instead (portaled out of the list, so the list
//      never reflows).
//   2. The drawer passes the focus & keyboard checklist for both flows (edit a
//      group, create a group): opening moves focus in, the explicit Close and
//      Escape both close, focus returns to the triggering control, and filter
//      state survives the round trip.
//   3. Repeated Edit / Calendar controls (and the in-drawer Archive) carry the
//      group as record context.

const SURFACE = '[data-a11y-surface="groups-directory"]';

// A demo group with a unique meeting day (Thursday), so it is easy to target
// and to isolate with the meeting-day filter. Its row Edit control names the
// group plus the meeting-day discriminator (location_area is unset here).
const EDIT_DOWNTOWN = "Edit Downtown Professionals (Thursday)";
const EDIT_EASTSIDE = "Edit Eastside Community (Tuesday)";

test.describe("groups directory editing surface", () => {
  test.beforeEach(async ({ page }) => {
    await gotoHarness(page);
  });

  test("the list renders no inline edit/create form or per-row save button", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);

    // Editing moved into the drawer (portaled out of the surface), so the list
    // itself exposes neither an edit form's fields nor a save control.
    expect(await surface.getByLabel("Group name").count()).toBe(0);
    expect(await surface.getByRole("button", { name: /save/i }).count()).toBe(
      0
    );
    // The create trigger is a single, unambiguous control on the list — not a
    // full inline create form.
    await expect(
      surface.getByRole("button", { name: "New group" })
    ).toBeVisible();
  });

  test("repeated Edit controls name their group and stay unique", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);
    const editButtons = surface.getByRole("button", { name: /^Edit .+/ });
    const names = await editButtons.evaluateAll((els) =>
      els.map((el) => el.getAttribute("aria-label") ?? "")
    );
    expect(names.length).toBeGreaterThan(1);
    expect(new Set(names).size).toBe(names.length);
  });

  test("opening a group reveals its details in the drawer and moves focus in", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);
    await surface.getByRole("button", { name: EDIT_DOWNTOWN }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // Titled by the group, with its editable fields populated.
    await expect(
      dialog.getByRole("heading", { name: "Downtown Professionals" })
    ).toBeVisible();
    await expect(dialog.getByLabel("Group name")).toHaveValue(
      "Downtown Professionals"
    );
    // The in-drawer Archive control carries the group as record context.
    await expect(
      dialog.getByRole("button", { name: "Archive Downtown Professionals" })
    ).toBeVisible();

    // Opening moved focus into the surface.
    const focusInside = await dialog.evaluate((node) =>
      node.contains(document.activeElement)
    );
    expect(focusInside).toBe(true);
  });

  test("Escape closes the drawer and returns focus to the Edit control", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);
    const opener = surface.getByRole("button", { name: EDIT_DOWNTOWN });
    await opener.click();
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test("the explicit Close control closes the drawer", async ({ page }) => {
    const surface = page.locator(SURFACE);
    await surface.getByRole("button", { name: EDIT_DOWNTOWN }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog
      .getByRole("button", { name: "Close Downtown Professionals editor" })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("closing returns to the prior filter state", async ({ page }) => {
    const surface = page.locator(SURFACE);
    const dayFilter = surface.getByLabel("Meeting day filter");

    // Filter to Thursday: only Downtown Professionals remains.
    await dayFilter.selectOption("Thursday");
    await expect(
      surface.getByRole("button", { name: EDIT_DOWNTOWN })
    ).toBeVisible();
    await expect(
      surface.getByRole("button", { name: EDIT_EASTSIDE })
    ).toHaveCount(0);

    // Open and close the drawer; the filter must survive the round trip.
    await surface.getByRole("button", { name: EDIT_DOWNTOWN }).click();
    await page.keyboard.press("Escape");

    await expect(dayFilter).toHaveValue("Thursday");
    await expect(
      surface.getByRole("button", { name: EDIT_EASTSIDE })
    ).toHaveCount(0);
  });

  test("New group opens the create drawer and returns focus on close", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);
    const opener = surface.getByRole("button", { name: "New group" });
    await opener.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: "Start a Life Group" })
    ).toBeVisible();
    await expect(dialog.getByLabel("Group name")).toBeVisible();

    const focusInside = await dialog.evaluate((node) =>
      node.contains(document.activeElement)
    );
    expect(focusInside).toBe(true);

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test("axe finds no critical or serious violations with the edit drawer open", async ({
    page,
  }) => {
    await page
      .locator(SURFACE)
      .getByRole("button", { name: EDIT_DOWNTOWN })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    expectNoBlockingAxeViolations(results);
  });

  test("axe finds no critical or serious violations with the create drawer open", async ({
    page,
  }) => {
    await page
      .locator(SURFACE)
      .getByRole("button", { name: "New group" })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    expectNoBlockingAxeViolations(results);
  });
});
