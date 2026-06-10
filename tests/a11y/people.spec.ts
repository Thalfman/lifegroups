import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { expectNoBlockingAxeViolations, gotoHarness } from "./harness";

// People is two destinations plus an action: a Directory tab (everyone, with
// an Everyone / Leaders / Members scope filter inside the list), an
// Apprentices tab (the leader pipeline), and an "Add person" header button
// that opens the standard editing drawer. The tabs are real role=tablist
// controls driven by the URL's ?tab= param. This suite gates:
//
//   1. People defaults to the Directory tab; both tabs are role=tab controls;
//      the add forms are not in the DOM until the drawer opens.
//   2. The scope filter narrows the directory to Leaders / Members sections.
//   3. A no-results directory search leaves no large unrelated section visible.
//   4. Each directory row carries a "View person" link; destructive row
//      actions keep record-context accessible names.
//   5. The Add person drawer traps focus, closes on Escape, and returns focus
//      to the trigger.
//   6. axe finds no critical/serious violations across the tabs and with the
//      drawer open.

const SURFACE = '[data-a11y-surface="people"]';

test.describe("admin People tabs", () => {
  test.beforeEach(async ({ page }) => {
    await gotoHarness(page);
  });

  test("defaults to the Directory tab; both tabs are real tab controls", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);

    // Directory is the default: its search is present.
    await expect(surface.getByLabel("Search people").first()).toBeVisible();

    // Each tab's accessible name carries its count, so match on the prefix.
    const directoryTab = surface.getByRole("tab", { name: /^Directory/ });
    const apprenticesTab = surface.getByRole("tab", { name: /^Apprentices/ });
    await expect(directoryTab).toBeVisible();
    await expect(apprenticesTab).toBeVisible();
    await expect(directoryTab).toHaveAttribute("aria-selected", "true");

    // The add-person forms live in the drawer, not the page.
    expect(
      await surface.getByRole("button", { name: "Add leader" }).count()
    ).toBe(0);
    expect(
      await surface.getByRole("button", { name: "Add member" }).count()
    ).toBe(0);
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
    await expect(
      surface.getByText(/No leaders or oversight roles match/)
    ).toBeVisible();
    // The add forms are still not on the page.
    expect(
      await surface.getByRole("button", { name: "Add leader" }).count()
    ).toBe(0);
  });

  test("the scope filter narrows to Leaders, then Members", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);
    const scope = surface.getByLabel("People type");

    await scope.selectOption("leaders");
    await expect(
      surface.getByRole("heading", { name: "Leaders and co-leaders" })
    ).toBeVisible();
    // The Members section is not mounted in the leaders scope.
    expect(
      await surface.getByRole("heading", { name: "Members" }).count()
    ).toBe(0);

    await scope.selectOption("members");
    await expect(
      surface.getByRole("heading", { name: "Members" })
    ).toBeVisible();
    expect(
      await surface
        .getByRole("heading", { name: "Leaders and co-leaders" })
        .count()
    ).toBe(0);
  });

  test("the Apprentices tab reveals the leader pipeline", async ({ page }) => {
    const surface = page.locator(SURFACE);
    await surface.getByRole("tab", { name: /^Apprentices/ }).click();

    await expect(
      surface.getByRole("heading", { name: "Leader pipeline" })
    ).toBeVisible();
    await expect(
      surface.getByRole("tab", { name: /^Apprentices/ })
    ).toHaveAttribute("aria-selected", "true");
    // The directory search is hidden in this tab.
    await expect(surface.getByLabel("Search people")).toBeHidden();
  });

  test("Add person opens the drawer and returns focus on close", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);
    const opener = surface.getByRole("button", { name: "Add person" });
    await opener.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: "Add a person" })
    ).toBeVisible();

    // Leader is the default kind; the kind toggle switches to the member form.
    await expect(
      dialog.getByRole("button", { name: "Add leader" })
    ).toBeVisible();
    await dialog.getByRole("radio", { name: "Member" }).click();
    await expect(
      dialog.getByRole("button", { name: "Add member" })
    ).toBeVisible();

    const focusInside = await dialog.evaluate((node) =>
      node.contains(document.activeElement)
    );
    expect(focusInside).toBe(true);

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test("axe finds no critical or serious violations across the People tabs", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);

    // Scan each tab while it is mounted. Directory is last so the row-level
    // destructive affordances (Deactivate / Change role) and the View person
    // links are in the DOM when scanned. Scans scope to the People surface
    // (the harness renders every admin surface on one page) to stay fast.
    for (const name of [/^Apprentices/, /^Directory/]) {
      await surface.getByRole("tab", { name }).click();
      const results = await new AxeBuilder({ page }).include(SURFACE).analyze();
      expectNoBlockingAxeViolations(results);
    }
  });

  test("axe finds no critical or serious violations with the Add person drawer open", async ({
    page,
  }) => {
    await page
      .locator(SURFACE)
      .getByRole("button", { name: "Add person" })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    expectNoBlockingAxeViolations(results);
  });
});
