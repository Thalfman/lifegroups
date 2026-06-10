import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { expectNoBlockingAxeViolations, gotoHarness } from "./harness";

// The person detail shell: a real role=tablist (Overview / Group / Care /
// Activity / Access for an active leader) driven by the URL's ?tab= param.
// The harness mounts the leader variant — the fullest ladder; the member
// variant's hidden-tab fallback is unit-tested in person-tabs.test.ts.

const SURFACE = '[data-a11y-surface="person-detail"]';

test.describe("person detail tabs", () => {
  test.beforeEach(async ({ page }) => {
    await gotoHarness(page);
  });

  test("renders the full leader tab ladder with Overview selected", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);
    for (const name of ["Overview", "Group", "Care", "Activity", "Access"]) {
      await expect(surface.getByRole("tab", { name })).toBeVisible();
    }
    await expect(
      surface.getByRole("tab", { name: "Overview" })
    ).toHaveAttribute("aria-selected", "true");
  });

  test("selecting the Group tab updates the URL for deep-linking", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);
    await surface.getByRole("tab", { name: "Group" }).click();

    await expect(surface.getByRole("tab", { name: "Group" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    // The assign form is revealed with named, keyboard-reachable controls.
    await expect(
      surface.getByRole("heading", { name: "Assign to a group" })
    ).toBeVisible();
    await expect(
      surface.getByRole("combobox", { name: "Group", exact: true })
    ).toBeVisible();
    await expect(
      surface.getByRole("button", { name: "Assign to group" })
    ).toBeVisible();
    // The tab choice lands in the URL, so a refresh keeps your place and the
    // tab is shareable.
    expect(new URL(page.url()).searchParams.get("tab")).toBe("group");
  });

  test("axe finds no critical or serious violations across the tabs", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);
    for (const name of ["Group", "Care", "Activity", "Access", "Overview"]) {
      await surface.getByRole("tab", { name }).click();
      const results = await new AxeBuilder({ page }).include(SURFACE).analyze();
      expectNoBlockingAxeViolations(results);
    }
  });
});
