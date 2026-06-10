import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { expectNoBlockingAxeViolations, gotoHarness } from "./harness";

// All Notes feed (ADR 0023). The Care area's Notes tab aggregates every note
// the viewer may read plus a presence-only sealed summary. This proves the
// feed's controls are accessible: the three filters are labelled selects, the
// repeated per-leader transparency toggles in the sealed block carry leader
// context (Admin Interaction Model req 4), and axe finds nothing blocking.

test.describe("care notes feed (All Notes)", () => {
  test.beforeEach(async ({ page }) => {
    await gotoHarness(page);
  });

  test("filters are labelled selects with an all-option default", async ({
    page,
  }) => {
    const surface = page.locator('[data-a11y-surface="care-notes-feed"]');
    for (const [label, allOption] of [
      ["Leader", "All leaders"],
      ["Group", "All groups"],
      ["Type", "All types"],
    ] as const) {
      const select = surface.getByLabel(label, { exact: true });
      await expect(select).toBeVisible();
      await expect(select).toHaveValue("all");
      await expect(
        select.locator(`option:text-is("${allOption}")`)
      ).toHaveCount(1);
    }
  });

  test("repeated sealed-note toggles carry leader context", async ({
    page,
  }) => {
    const surface = page.locator('[data-a11y-surface="care-notes-feed"]');
    // Two sealed leaders render two toggles; each accessible name must start
    // with the visible label (axe label-in-name) and end with the leader.
    for (const name of [
      "Turn on (let leadership read) for Anderson Lee",
      "Turn on (let leadership read) for Bryant Cole",
    ]) {
      await expect(
        surface.getByRole("button", { name, exact: true })
      ).toBeVisible();
    }
    // Presence only: the sealed block shows counts, never note bodies.
    await expect(
      surface.getByText("2 care notes · 1 prayer request sealed")
    ).toBeVisible();
  });

  test("feed items expose kind and context without bare fragments", async ({
    page,
  }) => {
    const surface = page.locator('[data-a11y-surface="care-notes-feed"]');
    // Scope to the feed's list items: the Type filter's <option>s carry the
    // same labels, so an unscoped text query would be ambiguous.
    for (const label of ["Care note", "Prayer request", "Broad note"]) {
      await expect(
        surface.locator("li").getByText(label, { exact: true })
      ).toBeVisible();
    }
    // The viewer's own note is attributed.
    await expect(surface.getByText(/by Julian Admin \(you\)/)).toBeVisible();
  });

  test("filtering narrows the list and the empty state explains itself", async ({
    page,
  }) => {
    const surface = page.locator('[data-a11y-surface="care-notes-feed"]');
    await surface.getByLabel("Type", { exact: true }).selectOption("care_note");
    await expect(
      surface.getByText("Checked in after the move — settling in well.")
    ).toBeVisible();
    await expect(
      surface.getByText("Pray for the group's new families.")
    ).toBeHidden();
    // Care note + group filter never intersect → the filtered empty state.
    await surface
      .getByLabel("Group", { exact: true })
      .selectOption("grp-bryant");
    await expect(
      surface.getByText("No notes match these filters.")
    ).toBeVisible();
  });

  test("axe finds nothing blocking on the feed", async ({ page }) => {
    const results = await new AxeBuilder({ page })
      .include('[data-a11y-surface="care-notes-feed"]')
      .analyze();
    expectNoBlockingAxeViolations(results);
  });
});
