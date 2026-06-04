import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { expectNoBlockingAxeViolations, gotoHarness } from "./harness";

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
      surface.getByRole("button", { name: /^Remove .+ filter: / })
    ).toHaveCount(0);

    // Select every meeting day → one chip per weekday (7).
    await surface
      .getByRole("button", { name: "Select all Meeting day" })
      .click();
    const chips = surface.getByRole("button", { name: /^Remove .+ filter: / });
    await expect(chips).toHaveCount(7);

    // Removing one chip drops exactly that one selection. The chip name carries
    // its filter category ("Day") so values that share a label across fields
    // (e.g. type vs status "Cancelled") stay distinguishable.
    await surface
      .getByRole("button", { name: "Remove Day filter: Sun" })
      .click();
    await expect(chips).toHaveCount(6);
    await expect(
      surface.getByRole("button", { name: "Remove Day filter: Sun" })
    ).toHaveCount(0);
  });

  test("chips from different fields stay distinguishable when labels collide", async ({
    page,
  }) => {
    const surface = page.locator(
      '[data-a11y-surface="master-calendar-filters"]'
    );
    // "Cancelled" is exposed in BOTH the gathering-type and status filters.
    await surface
      .getByRole("button", { name: "Select all Gathering type" })
      .click();
    await surface.getByRole("button", { name: "Select all Status" }).click();

    // Two "Cancelled" chips exist, but their accessible names differ by field,
    // so each resolves to exactly one control (no strict-mode ambiguity).
    await expect(
      surface.getByRole("button", { name: "Remove Type filter: Cancelled" })
    ).toHaveCount(1);
    await expect(
      surface.getByRole("button", { name: "Remove Status filter: Cancelled" })
    ).toHaveCount(1);
  });

  test("Clear all empties a field's chips", async ({ page }) => {
    const surface = page.locator(
      '[data-a11y-surface="master-calendar-filters"]'
    );
    await surface.getByRole("button", { name: "Select all Status" }).click();
    await expect(
      surface.getByRole("button", { name: /^Remove .+ filter: / })
    ).not.toHaveCount(0);

    await surface.getByRole("button", { name: "Clear all Status" }).click();
    await expect(
      surface.getByRole("button", { name: /^Remove .+ filter: / })
    ).toHaveCount(0);
  });
});

// Issue #324 — a11y hardening sweep, dialogs thread. The occurrence detail
// drawer (components/admin/admin-master-calendar-drawer.tsx) is a Radix Dialog
// opened programmatically by selecting an occurrence row (no DialogTrigger), so
// Radix has no trigger to auto-restore focus to. This pins that the drawer
// passes the focus checklist: it has an accessible name, opening moves focus in,
// and Escape closes it returning focus to the row that opened it.
test.describe("master calendar occurrence drawer (#324)", () => {
  const SURFACE = '[data-a11y-surface="master-calendar-filters"]';

  test.beforeEach(async ({ page }) => {
    await gotoHarness(page);
    // The occurrence rows (and the drawer) live in the list view.
    await page
      .locator(SURFACE)
      .getByRole("tab", { name: "List", exact: true })
      .click();
  });

  test("opening an occurrence names the drawer and moves focus in", async ({
    page,
  }) => {
    const opener = page
      .locator(SURFACE)
      .getByRole("button", { name: /Bryant/ })
      .first();
    await opener.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // The drawer carries an accessible name (its DialogTitle), so it is not an
    // anonymous "dialog" to assistive tech.
    await expect(dialog).toHaveAttribute("aria-labelledby", /.+/);
    const focusInside = await dialog.evaluate((node) =>
      node.contains(document.activeElement)
    );
    expect(focusInside).toBe(true);
  });

  test("Escape closes the drawer and returns focus to the opening row", async ({
    page,
  }) => {
    const opener = page
      .locator(SURFACE)
      .getByRole("button", { name: /Bryant/ })
      .first();
    await opener.click();
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test("axe finds no critical or serious violations with the drawer open", async ({
    page,
  }) => {
    await page
      .locator(SURFACE)
      .getByRole("button", { name: /Bryant/ })
      .first()
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    expectNoBlockingAxeViolations(results);
  });
});
