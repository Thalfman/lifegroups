import { expect, test } from "@playwright/test";
import { gotoHarness } from "./harness";

// Master calendar filter polish (Admin Interaction Model PRD req 11, #262).
// Proves the new affordances on the real FilterBar rendered in the harness:
//   - every multi-select field exposes named "Select all" / "Clear all"
//     controls, and
//   - selections surface as compact, individually-removable filter chips.
// The page-wide axe + bare-name gates in accessible-names.spec.ts already cover
// this surface; this suite pins the behaviour those gates cannot see.

test.describe("master calendar filter affordances (#262)", () => {
  test.beforeEach(async ({ page }) => {
    await gotoHarness(page);
  });

  test("each filter field offers named Select all / Clear all controls", async ({
    page,
  }) => {
    const surface = page.locator(
      '[data-a11y-surface="master-calendar-filters"]'
    );
    // The always-open fieldset filters expose the controls directly.
    for (const field of ["Gathering type", "Status", "Meeting day"]) {
      await expect(
        surface.getByRole("button", { name: `Select all ${field}` })
      ).toBeVisible();
      await expect(
        surface.getByRole("button", { name: `Clear all ${field}` })
      ).toBeVisible();
    }
    // The Group field is collapsed by default; its controls live inside the
    // disclosure and appear once expanded.
    await surface.locator("summary").filter({ hasText: "Group" }).click();
    await expect(
      surface.getByRole("button", { name: "Select all groups" })
    ).toBeVisible();
    await expect(
      surface.getByRole("button", { name: "Clear all groups" })
    ).toBeVisible();
  });

  test("Select all surfaces removable chips; removing a chip drops one filter", async ({
    page,
  }) => {
    const surface = page.locator(
      '[data-a11y-surface="master-calendar-filters"]'
    );

    // No active filters → no chips yet.
    await expect(
      surface.getByRole("button", { name: /^Remove filter: / })
    ).toHaveCount(0);

    // Select every meeting day → one chip per weekday (7).
    await surface
      .getByRole("button", { name: "Select all Meeting day" })
      .click();
    const chips = surface.getByRole("button", { name: /^Remove filter: / });
    await expect(chips).toHaveCount(7);

    // Removing one chip drops exactly that one selection.
    await surface.getByRole("button", { name: "Remove filter: Sun" }).click();
    await expect(chips).toHaveCount(6);
    await expect(
      surface.getByRole("button", { name: "Remove filter: Sun" })
    ).toHaveCount(0);
  });

  test("Clear all empties a field's chips", async ({ page }) => {
    const surface = page.locator(
      '[data-a11y-surface="master-calendar-filters"]'
    );
    await surface.getByRole("button", { name: "Select all Status" }).click();
    await expect(
      surface.getByRole("button", { name: /^Remove filter: / })
    ).not.toHaveCount(0);

    await surface.getByRole("button", { name: "Clear all Status" }).click();
    await expect(
      surface.getByRole("button", { name: /^Remove filter: / })
    ).toHaveCount(0);
  });
});
