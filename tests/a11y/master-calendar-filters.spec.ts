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

// Planning opinionated views (#331, #371). The same master-calendar shell with
// the Planning opt-in: a primary quick-filter group (All meetings / This week /
// Needs coverage / Cancelled-OFF / By leader) of mutually-exclusive toggle
// buttons that expose aria-pressed, the advanced filters moved into a
// collapsible disclosure, an active-filter summary + Clear filters control, and
// the repeated "Open group calendar" link de-noised to one entry point per group.
test.describe("planning opinionated views (#331)", () => {
  const SURFACE = '[data-a11y-surface="planning-opinionated-views"]';

  test.beforeEach(async ({ page }) => {
    await gotoHarness(page);
  });

  test("the quick filters are present as named primary affordances", async ({
    page,
  }) => {
    const switcher = page
      .locator(SURFACE)
      .getByRole("group", { name: "Quick filters" });
    await expect(switcher).toBeVisible();
    for (const view of [
      "This week",
      "Needs coverage",
      "Cancelled / OFF",
      "By leader",
    ]) {
      await expect(switcher.getByRole("button", { name: view })).toBeVisible();
    }
  });

  test("the active quick filter exposes aria-pressed, one at a time", async ({
    page,
  }) => {
    const switcher = page
      .locator(SURFACE)
      .getByRole("group", { name: "Quick filters" });
    // Default view is "All meetings" → exactly one button is pressed.
    await expect(
      switcher.getByRole("button", { name: "All meetings" })
    ).toHaveAttribute("aria-pressed", "true");
    await expect(switcher.locator('button[aria-pressed="true"]')).toHaveCount(
      1
    );

    // Switching the quick filter moves the pressed state with it.
    await switcher.getByRole("button", { name: "This week" }).click();
    await expect(
      switcher.getByRole("button", { name: "This week" })
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      switcher.getByRole("button", { name: "All meetings" })
    ).toHaveAttribute("aria-pressed", "false");
    await expect(switcher.locator('button[aria-pressed="true"]')).toHaveCount(
      1
    );
  });

  test("advanced filters live in a collapsible secondary disclosure", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);
    const disclosure = surface.getByText("Advanced filters", { exact: true });
    await expect(disclosure).toBeVisible();
    // Collapsed by default → the filter fields aren't visible until expanded.
    const statusField = surface.getByRole("button", {
      name: "Select all Status",
    });
    await expect(statusField).toBeHidden();
    await disclosure.click();
    await expect(statusField).toBeVisible();
  });

  test("advanced-filter checkboxes are labelled and toggle via their label", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);
    await surface.getByText("Advanced filters", { exact: true }).click();
    // The Status checkboxes are real, named form controls — getByRole resolves
    // them by their visible label, and clicking that label toggles the box.
    const scheduled = surface.getByRole("checkbox", { name: "Scheduled" });
    await expect(scheduled).toHaveAttribute("name", "status");
    await expect(scheduled).not.toBeChecked();
    await surface
      .locator("label")
      .filter({ hasText: "Scheduled" })
      .first()
      .click();
    await expect(scheduled).toBeChecked();
  });

  test("active-filter summary reflects the current selection", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);
    // Pristine view: every dimension reads "All …". The summary's leading
    // "Showing:" is an emphasised span, so target the whole live region.
    const summary = surface
      .locator('[aria-live="polite"]')
      .filter({ hasText: "Showing:" });
    await expect(summary).toContainText("All meetings");
    await expect(summary).toContainText("All groups");
    await expect(summary).toContainText("All statuses");

    // Narrowing the quick filter updates the summary.
    await surface.getByRole("button", { name: "This week" }).click();
    await expect(summary).toContainText("This week");
  });

  test("Clear filters is disabled when pristine and restores the default view", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);
    const clear = surface.getByRole("button", { name: "Clear filters" });
    await expect(clear).toBeDisabled();

    // Engage a quick filter → Clear filters becomes available.
    await surface.getByRole("button", { name: "Needs coverage" }).click();
    await expect(clear).toBeEnabled();

    // Clearing returns to the "All meetings" default.
    await clear.click();
    await expect(
      surface.getByRole("button", { name: "All meetings" })
    ).toHaveAttribute("aria-pressed", "true");
    await expect(clear).toBeDisabled();
  });

  test("By leader surfaces one calendar link per group, not per occurrence", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);
    await surface.getByRole("button", { name: "By leader" }).click();
    // Anderson recurs on two May dates; the flat list would render two identical
    // "Open group calendar" links. The de-noised By-leader view collapses that
    // to exactly one per group under each leader.
    await expect(
      surface.getByRole("link", { name: "Open Anderson calendar" })
    ).toHaveCount(1);
  });

  test("axe finds no blocking violations across the opinionated views", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);
    await surface.getByRole("button", { name: "By leader" }).click();
    const results = await new AxeBuilder({ page }).include(SURFACE).analyze();
    expectNoBlockingAxeViolations(results);
  });
});
