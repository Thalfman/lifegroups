import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  expectNoBlockingAxeViolations,
  expectNoHorizontalOverflow,
  gotoHarness,
  PHONE,
  seededCreds,
  signIn,
  surface,
} from "./harness";

// Mobile-viewport cross-surface smoke (#557). Runs on the mobile-iphone and
// mobile-android projects (iPhone-sized + Android-sized viewports) defined in
// playwright.config.ts. It establishes the mobile harness the other Phase 2
// slices verify against: the core role surfaces load, their headings / nav /
// primary controls render, and axe finds no critical/serious violations.
//
// Two tiers:
//   1. Always-run — public routes (login, support, account-deletion) and the
//      demo-data /a11y-harness surfaces. No Supabase needed, so this is the part
//      CI exercises.
//   2. Seeded-auth — the live Home / Care / Plan / Multiply and Leader routes,
//      which need a real session. Like leader-routes.spec, these SKIP when the
//      creds are absent (the default in CI) so the suite stays green, and they
//      never broaden auth — they sign in as ordinary seeded users.

const { admin: ADMIN, leader: LEADER } = seededCreds();

const HARNESS_CORE_SURFACES = [
  "home",
  "care-actions",
  "care-notes-feed",
  "groups-directory",
  "people",
  "group-health",
] as const;

// The data-dense directory/grid surfaces #567 reshaped into stacked cards at
// phone width (table/matrix restored at md+). Each renders a mobile card list
// (`md:hidden`) plus a desktop table/grid (`hidden md:block`); at a phone
// viewport only the card list should be visible.
const STACKED_SURFACES = [
  // surface id, an element the mobile card stack renders, an element the
  // desktop table/grid renders (hidden at phone width).
  {
    id: "groups-directory",
    cardSelector: "article",
    tableSelector: "table",
  },
  {
    id: "people",
    cardSelector: "li",
    tableSelector: "table",
  },
  {
    id: "care-directory",
    cardSelector: "li",
    tableSelector: "table",
  },
  {
    id: "multiply-readiness-grid",
    cardSelector: "li",
    tableSelector: "table",
  },
] as const;

test.describe("mobile smoke — public + harness (#557)", () => {
  test("login renders its heading, form, and support link", async ({
    page,
  }) => {
    await page.goto("/login");
    await expect(
      page.getByRole("heading", { level: 1, name: /welcome back/i })
    ).toBeVisible();
    await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /contact support/i })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /privacy policy/i })
    ).toBeVisible();
  });

  test("public support, account-deletion, and privacy pages render their headings", async ({
    page,
  }) => {
    await page.goto("/support");
    await expect(
      page.getByRole("heading", { level: 1, name: "Support" })
    ).toBeVisible();

    await page.goto("/account-deletion");
    await expect(
      page.getByRole("heading", { level: 1, name: "Account deletion" })
    ).toBeVisible();

    await page.goto("/privacy");
    await expect(
      page.getByRole("heading", { level: 1, name: "Privacy policy" })
    ).toBeVisible();
  });

  test("core admin surfaces and the nav spine render in the harness", async ({
    page,
  }) => {
    await gotoHarness(page);

    for (const id of HARNESS_CORE_SURFACES) {
      await expect(
        surface(page, id),
        `harness surface "${id}" should render`
      ).toBeVisible();
    }

    // The Care · Plan · Multiply nav spine renders (rendered by the sidebar
    // surface). The desktop sidebar is display:none below the md breakpoint, so
    // at a phone width its links sit in the DOM but outside the accessibility
    // tree — include hidden so the role query still resolves them, and assert
    // attachment (not paint, since the spine collapses behind a drawer here).
    const sidebar = surface(page, "sidebar-active-state");
    for (const label of ["Care", "Plan", "Multiply"] as const) {
      await expect(
        sidebar
          .getByRole("link", { name: label, exact: true, includeHidden: true })
          .first()
      ).toBeAttached();
    }
  });

  test("axe finds no critical or serious violations across the harness", async ({
    page,
  }) => {
    await gotoHarness(page);
    const results = await new AxeBuilder({ page }).analyze();
    expectNoBlockingAxeViolations(results);
  });
});

// Responsive directories + the Multiply readiness grid (#567). At phone width
// the Care / People / Groups directories and the Multiply grid must render as
// readable stacked cards — never a horizontal-scroll table — and the harness
// page must not itself widen past the viewport. These run on the mobile-iphone
// and mobile-android projects, plus an explicit 375px pin (the narrowest
// supported phone, called out in the issue) so the floor is covered regardless
// of the project viewports.
test.describe("mobile smoke — responsive directories + grid (#567)", () => {
  test("the stacked surfaces show their mobile cards, not the desktop table", async ({
    page,
  }) => {
    await gotoHarness(page);
    for (const { id, cardSelector, tableSelector } of STACKED_SURFACES) {
      const element = surface(page, id);
      await expect(element, `surface "${id}" should render`).toBeVisible();
      // The mobile card stack paints…
      await expect(
        element.locator(cardSelector).first(),
        `surface "${id}" should show its stacked cards at phone width`
      ).toBeVisible();
      // …while the desktop table/grid stays hidden (display:none) behind md+.
      const table = element.locator(tableSelector).first();
      if ((await table.count()) > 0) {
        await expect(
          table,
          `surface "${id}" should hide its desktop table at phone width`
        ).toBeHidden();
      }
    }
  });

  // Measure each reshaped surface's OWN box rather than the whole harness page:
  // the harness mounts every surface, including intentionally-wide ones (e.g.
  // the master-calendar month grid) that live in their own overflow-x:auto
  // region and are excluded from the per-surface audit. A page-level scrollWidth
  // check would be hostage to those; the contract #567 actually adds is that
  // these four stacked surfaces never overflow their own content box at phone
  // width. A 1px slack absorbs sub-pixel rounding (matches responsive-mobile).
  async function expectStackedSurfacesDoNotOverflow(page: Page): Promise<void> {
    for (const { id } of STACKED_SURFACES) {
      await expectNoHorizontalOverflow(
        surface(page, id),
        `surface "${id}" overflows its content box by {overflow}px (forces ` +
          `horizontal scroll at phone width)`
      );
    }
  }

  test("the stacked surfaces never overflow their box at phone width", async ({
    page,
  }) => {
    await gotoHarness(page);
    await expectStackedSurfacesDoNotOverflow(page);
  });

  test("the stacked surfaces never overflow their box at the 375px floor", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await gotoHarness(page);
    await expectStackedSurfacesDoNotOverflow(page);
  });
});

test.describe("mobile smoke — live admin surfaces (seeded auth)", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      !ADMIN.present,
      "Set A11Y_ADMIN_EMAIL + A11Y_ADMIN_PASSWORD (npm run seed:test-auth) and serve against live Supabase."
    );
    await signIn(page, ADMIN.email!, ADMIN.password!);
  });

  for (const path of [
    "/admin",
    "/admin/care",
    "/admin/plan",
    "/admin/multiply",
  ] as const) {
    test(`${path} renders its heading and passes axe`, async ({ page }) => {
      await page.goto(path, { waitUntil: "networkidle" });
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const results = await new AxeBuilder({ page }).analyze();
      expectNoBlockingAxeViolations(results);
    });
  }
});

test.describe("mobile smoke — live Leader surface (seeded auth)", () => {
  test("the /leader dashboard renders its header and passes axe", async ({
    page,
  }) => {
    test.skip(
      !LEADER.present,
      "Set A11Y_LEADER_EMAIL + A11Y_LEADER_PASSWORD (npm run seed:test-auth) and serve against live Supabase."
    );
    await signIn(page, LEADER.email!, LEADER.password!);
    await page.goto("/leader", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Your care"
    );
    const results = await new AxeBuilder({ page }).analyze();
    expectNoBlockingAxeViolations(results);
  });
});
