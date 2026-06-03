import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { expectNoBlockingAxeViolations, gotoHarness } from "./harness";

// Admin Interaction Model req 13 (#264) — full responsive audit. The P0 work
// already added the mobile helper classes (.lg-m-grid-stack, .lg-m-filterbar,
// .lg-shell-grid-*, the editing-surface full-screen sheet, …) surface by
// surface. This suite is the audit's regression net: it renders every harness
// surface at a real phone viewport and proves two things the desktop a11y run
// can't catch —
//
//   1. No surface forces horizontal page scroll. A surface section is a normal
//      block, so if any descendant is wider than the viewport the section's
//      scrollWidth exceeds its clientWidth — UNLESS the wide content sits in its
//      own `overflow-x: auto` scroll region (the standard fix for wide data
//      tables), which clips at the wrapper and is therefore allowed.
//   2. axe finds no critical/serious violations at the mobile viewport, so the
//      collapsed-to-one-column layouts stay accessible (palette contrast stays
//      the one documented non-blocking carve-out).
//
// Coverage of a new harness surface is split: the axe pass scans the whole
// harness, so a new surface joins it automatically; the per-surface overflow
// check iterates the explicit SURFACE_IDS list below, so a new surface must be
// added there to be checked for horizontal overflow.

// A narrow phone. 375px is the iPhone SE / mini class width and sits under the
// repo's 767px mobile breakpoint, so the .lg-m-* rules are active.
const PHONE = { width: 375, height: 812 };

// Every surface mounted in the harness, listed explicitly so the per-surface
// overflow loop covers each one (add a new harness surface here too). An id
// with no matching surface fails fast on the visibility assertion rather than
// silently skipping.
const SURFACE_IDS = [
  "groups-directory",
  "groups-directory-collisions",
  "master-calendar-list",
  "master-calendar-filters",
  "follow-up-status",
  "people",
  "follow-ups",
  "follow-ups-empty",
  "care-follow-ups",
  "care-follow-ups-empty",
  "care-actions",
  "group-health",
  "settings",
  "super-admin-sections",
] as const;

test.describe("admin surfaces are usable on a phone viewport", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(PHONE);
    await gotoHarness(page);
  });

  for (const id of SURFACE_IDS) {
    test(`${id}: no horizontal page overflow at 375px`, async ({ page }) => {
      const surface = page.locator(`[data-a11y-surface="${id}"]`);
      await expect(surface).toBeVisible();

      // scrollWidth > clientWidth means a descendant overflowed the section's
      // content box. A 1px slack absorbs sub-pixel rounding. Content that is
      // legitimately wide (a 7-column data table) lives inside an
      // `overflow-x: auto` wrapper, which clips here and does not widen the
      // section — so this stays green while the table scrolls inside its own
      // region.
      const overflow = await surface.evaluate((el) => {
        const target = el as HTMLElement;
        return target.scrollWidth - target.clientWidth;
      });
      expect(
        overflow,
        `surface "${id}" overflows its content box by ${overflow}px at 375px ` +
          `(content wider than the viewport forces horizontal page scroll — ` +
          `give the wide element its own overflow-x:auto wrapper or a mobile ` +
          `collapse helper)`
      ).toBeLessThanOrEqual(1);
    });
  }

  test("axe finds no critical or serious violations at 375px", async ({
    page,
  }) => {
    // One pass over the whole harness at the phone viewport: the mobile layout
    // must stay as accessible as the desktop run already proves it is.
    const results = await new AxeBuilder({ page }).analyze();
    expectNoBlockingAxeViolations(results);
  });
});
