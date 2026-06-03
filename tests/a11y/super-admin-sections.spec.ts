import { expect, test } from "@playwright/test";
import { gotoHarness } from "./harness";

// Super Admin Console collapsible sections (#261, Admin Interaction Model
// req 9). The operational sections are native <details> collapsed by default
// with working anchors: following a section link must expand the target
// section and move focus to its <summary> heading, so keyboard and
// screen-reader users land inside the section they asked for. axe coverage for
// this surface rides along with the global gate in accessible-names.spec.ts.

test.describe("super admin console sections", () => {
  test.beforeEach(async ({ page }) => {
    await gotoHarness(page);
  });

  test("operational sections are collapsed by default", async ({ page }) => {
    const surface = page.locator('[data-a11y-surface="super-admin-sections"]');
    await expect(surface.locator("#harness-access")).not.toHaveAttribute(
      "open",
      /.*/
    );
    await expect(surface.locator("#harness-danger-zone")).not.toHaveAttribute(
      "open",
      /.*/
    );
  });

  test("following a section anchor expands it and focuses its heading", async ({
    page,
  }) => {
    const surface = page.locator('[data-a11y-surface="super-admin-sections"]');

    await surface.getByRole("link", { name: "Danger Zone" }).click();

    const section = surface.locator("#harness-danger-zone");
    await expect(section).toHaveAttribute("open", /.*/);

    // Focus lands on the section's summary heading, not the collapsed region.
    const summaryFocused = await section
      .locator("summary")
      .evaluate((el) => el === document.activeElement);
    expect(summaryFocused).toBe(true);
  });
});
