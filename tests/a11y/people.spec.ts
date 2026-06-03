import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator } from "@playwright/test";
import { expectNoBlockingAxeViolations, gotoHarness } from "./harness";

// Issue 270 — Admin Interaction Model req 3: split People into distinct
// Directory / Add person / Assignments views, and move group assignment into a
// detail surface rather than repeating an inline assign form under every group.
// This suite gates:
//
//   1. People defaults to the Directory view; Add person and Assignments are
//      secondary views reached by explicit actions.
//   2. A no-results directory search does not leave a large unrelated section
//      (Assignments) visible — it is not in the DOM until chosen.
//   3. Group assignment happens in the EditingSurface drawer, opened per group;
//      the Assignments list renders no inline assign forms, and each group's
//      "Edit assignments" control carries the group name as record context.
//   4. The drawer passes the focus & keyboard checklist (focus in, Escape +
//      explicit Close, focus returns).
//   5. axe finds no critical/serious violations with the drawer open.

const SURFACE = '[data-a11y-surface="people"]';

async function accessibleNames(controls: Locator): Promise<string[]> {
  return controls.evaluateAll((els) =>
    els.map((el) =>
      (el.getAttribute("aria-label") ?? el.textContent ?? "").trim()
    )
  );
}

test.describe("admin People split views", () => {
  test.beforeEach(async ({ page }) => {
    await gotoHarness(page);
  });

  test("defaults to the Directory view; Add person and Assignments are hidden", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);

    // Directory is the default: its search is present.
    await expect(surface.getByLabel("Search people")).toBeVisible();

    // The add-person forms and the assignment list are not rendered until their
    // view is chosen.
    expect(await surface.getByText("Add leader profile").count()).toBe(0);
    expect(
      await surface
        .getByRole("button", { name: /^Edit assignments for / })
        .count()
    ).toBe(0);

    // The view switcher exposes all three as explicit controls.
    for (const name of ["Directory", "Add person", "Assignments"]) {
      await expect(surface.getByRole("button", { name })).toBeVisible();
    }
  });

  test("a no-results directory search leaves no large unrelated section visible", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);
    await surface.getByLabel("Search people").fill("zzz-no-such-person-zzz");

    // The directory reports no matches…
    await expect(surface.getByText(/No login profiles match/)).toBeVisible();
    // …and the Assignments workflow is still not on the page.
    expect(
      await surface
        .getByRole("button", { name: /^Edit assignments for / })
        .count()
    ).toBe(0);
  });

  test("Add person view reveals the add forms", async ({ page }) => {
    const surface = page.locator(SURFACE);
    await surface.getByRole("button", { name: "Add person" }).click();

    await expect(surface.getByText("Add leader profile")).toBeVisible();
    // The member form rendered (its submit control is unambiguous, unlike the
    // "Add member" card title text).
    await expect(
      surface.getByRole("button", { name: "Add member" })
    ).toBeVisible();
    // The directory search is no longer mounted in this view.
    expect(await surface.getByLabel("Search people").count()).toBe(0);
  });

  test("Assignments view lists groups with no inline assign forms, only per-group edit controls", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);
    await surface.getByRole("button", { name: "Assignments" }).click();

    // No assignment form renders inline in the list…
    expect(
      await surface.getByRole("button", { name: "Assign leader" }).count()
    ).toBe(0);

    // …only per-group edit controls, each naming its group.
    const editControls = surface.getByRole("button", {
      name: /^Edit assignments for /,
    });
    expect(await editControls.count()).toBeGreaterThan(1);
    const names = await accessibleNames(editControls);
    expect(
      new Set(names).size,
      `unique edit controls, got: ${names.join(" | ")}`
    ).toBe(names.length);
  });

  test("opening a group's assignments uses the drawer and passes the focus checklist", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);
    await surface.getByRole("button", { name: "Assignments" }).click();

    const opener = surface
      .getByRole("button", { name: /^Edit assignments for / })
      .first();
    await opener.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // The assign forms live inside the drawer now.
    await expect(
      dialog.getByRole("button", { name: "Assign leader" })
    ).toBeVisible();

    // Opening moved focus into the drawer.
    const focusInside = await dialog.evaluate((node) =>
      node.contains(document.activeElement)
    );
    expect(focusInside).toBe(true);

    // Escape closes and returns focus to the triggering control.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test("the explicit Close control closes the assignments drawer", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);
    await surface.getByRole("button", { name: "Assignments" }).click();
    await surface
      .getByRole("button", { name: /^Edit assignments for / })
      .first()
      .click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog
      .getByRole("button", { name: /^Close assignments for / })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("axe finds no critical or serious violations with the assignments drawer open", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);
    await surface.getByRole("button", { name: "Assignments" }).click();
    await surface
      .getByRole("button", { name: /^Edit assignments for / })
      .first()
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    expectNoBlockingAxeViolations(results);
  });
});
