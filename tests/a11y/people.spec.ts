import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { expectNoBlockingAxeViolations, gotoHarness } from "./harness";

// Issue 302 — People folds the former Leader Pipeline in as "Apprentices" and
// presents five tabs: Directory (everyone), Leaders, Members, Apprentices, and
// Add Person (reduction plan §6). Group placement moved off a standalone
// Assignments view onto each person's detail page (Group tab), so the People
// shell no longer renders the per-group assignment drawer. This suite gates:
//
//   1. People defaults to the Directory view; all five tabs are explicit
//      controls; the add forms and pipeline forms are not in the DOM until
//      their tab is chosen.
//   2. A no-results directory search leaves no large unrelated section visible.
//   3. The Leaders / Members / Apprentices / Add Person tabs each reveal their
//      own content.
//   4. Each directory row carries a "View person" link.
//   5. axe finds no critical/serious violations across the tabs.

const SURFACE = '[data-a11y-surface="people"]';

test.describe("admin People tabs", () => {
  test.beforeEach(async ({ page }) => {
    await gotoHarness(page);
  });

  test("defaults to the Directory view; all five tabs are explicit controls", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);

    // Directory is the default: its search is present.
    await expect(surface.getByLabel("Search people").first()).toBeVisible();

    // The add-person forms are not rendered until their tab is chosen.
    expect(await surface.getByText("Add leader profile").count()).toBe(0);

    // The view switcher exposes all five tabs as explicit controls.
    for (const name of [
      "Directory",
      "Leaders",
      "Members",
      "Apprentices",
      "Add Person",
    ]) {
      await expect(surface.getByRole("button", { name })).toBeVisible();
    }
  });

  test("directory rows carry a View person link", async ({ page }) => {
    const surface = page.locator(SURFACE);
    expect(
      await surface.getByRole("link", { name: /View person/ }).count()
    ).toBeGreaterThan(0);
  });

  test("destructive row actions keep record-context accessible names", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);

    // Deactivate is destructive: its accessible name must still carry the
    // person's name, not collapse to a wall of identical "Deactivate" buttons.
    const deactivate = surface.getByRole("button", {
      name: /^Deactivate .+/,
    });
    expect(await deactivate.count()).toBeGreaterThan(0);
    await expect(deactivate.first()).toBeVisible();

    // Role change is a destructive direction (downgrade) candidate: its trigger
    // must name the person too.
    const changeRole = surface.getByRole("button", {
      name: /^Change role for .+/,
    });
    expect(await changeRole.count()).toBeGreaterThan(0);
    await expect(changeRole.first()).toBeVisible();

    // The View person navigation link also carries the person's name.
    const viewPerson = surface.getByRole("link", { name: /^View person .+/ });
    expect(await viewPerson.count()).toBeGreaterThan(0);
  });

  test("the role-change form exposes a keyboard-operable, named select", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);

    // Open the first row's role editor and confirm its controls are reachable
    // and clearly named for screen-reader / keyboard users.
    await surface
      .getByRole("button", { name: /^Change role for .+/ })
      .first()
      .click();

    const roleSelect = surface.getByLabel("New role").first();
    await expect(roleSelect).toBeVisible();
    await roleSelect.focus();
    await expect(roleSelect).toBeFocused();

    // Cancel returns the editor without leaving an orphaned form.
    await surface.getByRole("button", { name: "Cancel" }).first().click();
    await expect(surface.getByLabel("New role")).toHaveCount(0);
  });

  test("a no-results directory search leaves no large unrelated section visible", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);
    await surface
      .getByLabel("Search people")
      .first()
      .fill("zzz-no-such-person-zzz");

    // The directory reports no matches.
    await expect(surface.getByText(/No login profiles match/)).toBeVisible();
    // The add forms are still not on the page.
    expect(await surface.getByText("Add leader profile").count()).toBe(0);
  });

  test("the Leaders tab filters to a Leaders and co-leaders section", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);
    await surface.getByRole("button", { name: "Leaders" }).click();

    await expect(
      surface.getByRole("heading", { name: "Leaders and co-leaders" })
    ).toBeVisible();
    // The members section is not mounted in the leaders scope.
    expect(await surface.getByText("Participants (non-login)").count()).toBe(0);
  });

  test("the Members tab shows only the participants section", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);
    await surface.getByRole("button", { name: "Members" }).click();

    await expect(surface.getByText("Participants (non-login)")).toBeVisible();
  });

  test("the Apprentices tab reveals the leader pipeline", async ({ page }) => {
    const surface = page.locator(SURFACE);
    await surface.getByRole("button", { name: "Apprentices" }).click();

    await expect(
      surface.getByRole("heading", { name: "Leader pipeline" })
    ).toBeVisible();
    // The directory search is no longer mounted in this tab.
    expect(await surface.getByLabel("Search people").count()).toBe(0);
  });

  test("the Add Person tab reveals the add forms", async ({ page }) => {
    const surface = page.locator(SURFACE);
    await surface.getByRole("button", { name: "Add Person" }).click();

    await expect(surface.getByText("Add leader profile")).toBeVisible();
    await expect(
      surface.getByRole("button", { name: "Add member" })
    ).toBeVisible();
    // The directory search is no longer mounted in this tab.
    expect(await surface.getByLabel("Search people").count()).toBe(0);
  });

  test("axe finds no critical or serious violations across the People tabs", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);

    // Scan each tab while it is mounted — a single scan after the loop would
    // only cover whichever tab was last clicked, letting regressions in the
    // earlier tabs (e.g. the Add Person forms) slip through. Directory is last
    // so the row-level destructive affordances (Deactivate / Change role) and
    // the View person links are also in the DOM when scanned.
    for (const name of [
      "Leaders",
      "Members",
      "Apprentices",
      "Add Person",
      "Directory",
    ]) {
      await surface.getByRole("button", { name }).click();
      const results = await new AxeBuilder({ page }).analyze();
      expectNoBlockingAxeViolations(results);
    }
  });
});
