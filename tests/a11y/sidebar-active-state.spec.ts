import { expect, test } from "@playwright/test";
import { gotoHarness } from "./harness";

// Issue #321 — the sidebar exposed visual active styling but NO aria-current,
// and its active predicate only matched literal nav hrefs, so frozen alias URLs
// (shepherd-care, follow-ups, …) highlighted nothing. This suite proves the fix
// against the real <Sidebar> rendered in the harness: every nav reports exactly
// one aria-current="page", and on a frozen alias URL it falls on the canonical
// area that OWNS the alias.
//
// The harness can't navigate the sidebar to an alias route (usePathname is
// pinned to /a11y-harness), so each sidebar instance is rendered with an
// explicit activePath. The pure resolver itself is unit-tested in
// lib/nav/__tests__/active-nav.test.ts; this is the rendered-aria-current gate.

// path under test → the area LABEL that must carry aria-current="page".
const EXPECTED_ACTIVE_LABEL: Record<string, string> = {
  // Canonical area roots light their own area.
  "/admin": "Home",
  "/admin/groups": "Groups",
  "/admin/care": "Care",
  "/admin/people": "People",
  "/admin/planning": "Planning",
  "/admin/settings": "Settings",
  // Frozen aliases light their owning canonical area.
  "/admin/shepherd-care": "Care",
  "/admin/follow-ups": "Care",
  "/admin/launch-planning": "Planning",
  "/admin/calendar": "Planning",
  "/admin/leader-pipeline": "People",
  "/admin/group-health": "Groups",
  "/admin/check-ins": "Groups",
};

test.describe("sidebar exposes exactly one aria-current per nav", () => {
  test.beforeEach(async ({ page }) => {
    await gotoHarness(page);
  });

  for (const [activePath, expectedLabel] of Object.entries(
    EXPECTED_ACTIVE_LABEL
  )) {
    test(`${activePath} marks "${expectedLabel}" as the current page`, async ({
      page,
    }) => {
      const block = page.locator(`[data-sidebar-active-path="${activePath}"]`);
      await expect(block).toBeVisible();

      const current = block.locator('[aria-current="page"]');

      // Exactly one link claims aria-current="page" — no more (ambiguous), no
      // fewer (a frozen alias would otherwise highlight nothing).
      await expect(current).toHaveCount(1);
      await expect(current).toHaveText(new RegExp(expectedLabel));
    });
  }
});
