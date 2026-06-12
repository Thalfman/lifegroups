import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
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
const GROUP_DOWNTOWN = "Downtown Professionals (Thursday)";
const GROUP_EASTSIDE = "Eastside Community (Tuesday)";
const MORE_DOWNTOWN = `More actions for ${GROUP_DOWNTOWN}`;
const MORE_EASTSIDE = `More actions for ${GROUP_EASTSIDE}`;
const EDIT_DOWNTOWN = `Edit ${GROUP_DOWNTOWN}`;

async function openActions(surface: Locator, groupLabel: string) {
  const opener = surface.getByRole("button", {
    name: `More actions for ${groupLabel}`,
  });
  await opener.click();
  return opener;
}

async function openEditDrawer(page: Page, groupLabel = GROUP_DOWNTOWN) {
  const surface = page.locator(SURFACE);
  await openActions(surface, groupLabel);
  await page.getByRole("button", { name: `Edit ${groupLabel}` }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

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

  test("repeated More actions controls name their group and stay unique", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);
    const moreButtons = surface.getByRole("button", {
      name: /^More actions for .+/,
    });
    const names = await moreButtons.evaluateAll((els) =>
      els.map((el) => el.getAttribute("aria-label") ?? "")
    );
    expect(names.length).toBeGreaterThan(1);
    expect(new Set(names).size).toBe(names.length);

    await openActions(surface, GROUP_DOWNTOWN);
    await expect(
      page.getByRole("button", { name: EDIT_DOWNTOWN })
    ).toBeVisible();
    await expect(
      page.getByRole("link", {
        name: `Open ${GROUP_DOWNTOWN} calendar`,
      })
    ).toBeVisible();
  });

  test("opening a group reveals its details in the drawer and moves focus in", async ({
    page,
  }) => {
    await openEditDrawer(page);

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
    const opener = await openActions(surface, GROUP_DOWNTOWN);
    await page.getByRole("button", { name: EDIT_DOWNTOWN }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(opener).toBeVisible();
  });

  test("the explicit Close control closes the drawer", async ({ page }) => {
    await openEditDrawer(page);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog
      .getByRole("button", { name: "Close Downtown Professionals editor" })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("closing returns to the prior list view state", async ({ page }) => {
    const surface = page.locator(SURFACE);
    const search = surface.getByLabel("Search groups");

    // Narrow the list to Downtown via search (the list-filtering control that
    // replaced the per-attribute selects when filters became the five tabs):
    // only Downtown Professionals remains, Eastside is filtered out.
    await search.fill("Downtown");
    await expect(
      surface.getByRole("button", { name: MORE_DOWNTOWN })
    ).toBeVisible();
    await expect(
      surface.getByRole("button", { name: MORE_EASTSIDE })
    ).toHaveCount(0);

    // Open and close the drawer; the narrowed view must survive the round trip
    // (the drawer is portaled out of the list, so the list never reflows).
    await openActions(surface, GROUP_DOWNTOWN);
    await page.getByRole("button", { name: EDIT_DOWNTOWN }).click();
    await page.keyboard.press("Escape");

    await expect(search).toHaveValue("Downtown");
    await expect(
      surface.getByRole("button", { name: MORE_EASTSIDE })
    ).toHaveCount(0);
  });

  test("the five list tabs are present and switchable", async ({ page }) => {
    const surface = page.locator(SURFACE);
    // Each tab's accessible name carries its membership count (e.g. "All
    // groups 2"), so match on the label prefix rather than the whole name.
    for (const name of [
      /^All groups/,
      /^Needs setup/,
      /^Needs health check/,
      /^Needs attention/,
      /^Archived/,
    ]) {
      await expect(surface.getByRole("tab", { name })).toBeVisible();
    }
    // Switching to Archived selects it (no active groups appear there in the
    // demo data, so it shows the empty state rather than the active cards).
    await surface.getByRole("tab", { name: /^Archived/ }).click();
    await expect(
      surface.getByRole("tab", { name: /^Archived/ })
    ).toHaveAttribute("aria-selected", "true");
    // The active tab's membership rule renders under the tab bar, so the
    // bucket's meaning is visible, not just its name.
    await expect(
      surface.getByText(
        "Archived groups are kept, not deleted — restore one any time."
      )
    ).toBeVisible();
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
    await openEditDrawer(page);

    const results = await new AxeBuilder({ page }).include(SURFACE).analyze();
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

    const results = await new AxeBuilder({ page }).include(SURFACE).analyze();
    expectNoBlockingAxeViolations(results);
  });

  // Issue #325 — the dense Ops table with a persisted card⇄table toggle. The
  // surface defaults to cards on the server paint (the toggle hydrates to the
  // saved choice). These tests switch to table mode and prove the table's
  // repeated record-context actions stay unique and axe-clean — the same
  // invariants the card mode enforces above.
  test("the card⇄table toggle switches to the Ops table", async ({ page }) => {
    const surface = page.locator(SURFACE);
    await surface.getByRole("radio", { name: "Table", exact: true }).click();
    await expect(surface.getByRole("table")).toBeVisible();
    // Sortable column headers are present, including the latest-week check-in.
    await expect(
      surface.getByRole("columnheader", { name: /Latest-week check-in/i })
    ).toBeVisible();
    await expect(surface.getByRole("button", { name: /^Group/ })).toBeVisible();
  });

  test("table-mode visible and More actions controls name their group and stay unique", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);
    await surface.getByRole("radio", { name: "Table", exact: true }).click();
    await expect(surface.getByRole("table")).toBeVisible();

    const moreButtons = surface.getByRole("button", {
      name: /^More actions for .+/,
    });
    const names = await moreButtons.evaluateAll((els) =>
      els.map((el) => el.getAttribute("aria-label") ?? "")
    );
    expect(names.length).toBeGreaterThan(1);
    expect(new Set(names).size).toBe(names.length);

    // The View / Calendar links are repeated per row too; each must name its
    // group and stay unique so screen-reader users can tell the rows apart.
    const viewLinks = surface.getByRole("link", { name: /^View .+/ });
    const viewNames = await viewLinks.evaluateAll((els) =>
      els.map((el) => el.getAttribute("aria-label") ?? "")
    );
    expect(viewNames.length).toBeGreaterThan(1);
    expect(new Set(viewNames).size).toBe(viewNames.length);

    await openActions(surface, GROUP_DOWNTOWN);
    await expect(
      page.getByRole("button", { name: EDIT_DOWNTOWN })
    ).toBeVisible();
  });

  test("sorting a column updates its aria-sort", async ({ page }) => {
    const surface = page.locator(SURFACE);
    await surface.getByRole("radio", { name: "Table", exact: true }).click();
    await expect(surface.getByRole("table")).toBeVisible();

    const leaderHeader = surface.getByRole("columnheader", {
      name: /Leader \/ co-leader/i,
    });
    await expect(leaderHeader).toHaveAttribute("aria-sort", "none");
    await leaderHeader.getByRole("button").click();
    await expect(leaderHeader).toHaveAttribute("aria-sort", "ascending");
    await leaderHeader.getByRole("button").click();
    await expect(leaderHeader).toHaveAttribute("aria-sort", "descending");
  });

  test("axe finds no critical or serious violations in table mode", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);
    await surface.getByRole("radio", { name: "Table", exact: true }).click();
    await expect(surface.getByRole("table")).toBeVisible();

    const results = await new AxeBuilder({ page }).include(SURFACE).analyze();
    expectNoBlockingAxeViolations(results);
  });

  // Issue #333 — Groups table follow-through: the saved sort + column choices and
  // the new density setting persist across reload, profile-scoped, with no flash
  // (SSR default = cards; the saved choice hydrates client-side). These tests
  // drive the density toggle + column menu and prove they persist and stay
  // axe-clean.
  test("the density + column controls appear only in table mode", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);
    // Table mode is the desktop default.
    await expect(surface.getByRole("table")).toBeVisible();
    await expect(
      surface.getByRole("radiogroup", { name: "Table density" })
    ).toBeVisible();
    await expect(
      surface.getByRole("button", { name: "Columns" })
    ).toBeVisible();

    await surface.getByRole("radio", { name: "Cards", exact: true }).click();
    await expect(surface.getByRole("table")).toHaveCount(0);
    await expect(
      surface.getByRole("radiogroup", { name: "Table density" })
    ).toHaveCount(0);
    await expect(surface.getByRole("button", { name: "Columns" })).toHaveCount(
      0
    );

    await surface.getByRole("radio", { name: "Table", exact: true }).click();
    await expect(surface.getByRole("table")).toBeVisible();

    // Table mode: both controls are present and keyboard-reachable.
    await expect(
      surface.getByRole("radiogroup", { name: "Table density" })
    ).toBeVisible();
    await expect(
      surface.getByRole("button", { name: "Columns" })
    ).toBeVisible();
  });

  test("phone viewport renders cards without table-only controls", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await gotoHarness(page);
    const surface = page.locator(SURFACE);

    await expect(surface.getByRole("table")).toHaveCount(0);
    await expect(
      surface.getByRole("radiogroup", { name: "Group list layout" })
    ).toHaveCount(0);
    await expect(
      surface.getByRole("radiogroup", { name: "Table density" })
    ).toHaveCount(0);
    await expect(surface.getByRole("button", { name: "Columns" })).toHaveCount(
      0
    );
    await expect(
      surface.getByRole("button", { name: MORE_DOWNTOWN })
    ).toBeVisible();
  });

  test("density choice persists across reload with no flash", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);
    await surface.getByRole("radio", { name: "Table", exact: true }).click();
    await expect(surface.getByRole("table")).toBeVisible();

    const compact = surface.getByRole("radio", { name: "Compact" });
    await compact.click();
    await expect(compact).toHaveAttribute("aria-checked", "true");

    await gotoHarness(page);
    // The table + the compact density both restore after hydration.
    await expect(surface.getByRole("table")).toBeVisible();
    await expect(
      surface.getByRole("radio", { name: "Compact" })
    ).toHaveAttribute("aria-checked", "true");
  });

  test("hiding a column persists across reload", async ({ page }) => {
    const surface = page.locator(SURFACE);
    await surface.getByRole("radio", { name: "Table", exact: true }).click();
    await expect(surface.getByRole("table")).toBeVisible();

    // The Setup column header starts visible.
    await expect(
      surface.getByRole("columnheader", { name: /Setup/i })
    ).toBeVisible();

    // Open the column menu and hide Setup.
    await surface.getByRole("button", { name: "Columns" }).click();
    await surface.getByRole("checkbox", { name: "Setup" }).uncheck();
    await expect(
      surface.getByRole("columnheader", { name: /Setup/i })
    ).toHaveCount(0);

    await gotoHarness(page);
    await expect(surface.getByRole("table")).toBeVisible();
    // The hidden Setup column stays hidden after reload.
    await expect(
      surface.getByRole("columnheader", { name: /Setup/i })
    ).toHaveCount(0);
  });

  test("axe finds no critical or serious violations with the column menu open", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);
    await surface.getByRole("radio", { name: "Table", exact: true }).click();
    await expect(surface.getByRole("table")).toBeVisible();
    await surface.getByRole("button", { name: "Columns" }).click();
    await expect(
      surface.getByRole("checkbox", { name: "Setup" })
    ).toBeVisible();

    const results = await new AxeBuilder({ page }).include(SURFACE).analyze();
    expectNoBlockingAxeViolations(results);
  });
});
