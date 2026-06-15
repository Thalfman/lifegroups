import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { expectNoBlockingAxeViolations, gotoHarness } from "./harness";

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

const ADMIN_EMAIL = process.env.A11Y_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.A11Y_ADMIN_PASSWORD;
const ADMIN_CREDS = Boolean(ADMIN_EMAIL && ADMIN_PASSWORD);

const LEADER_EMAIL = process.env.A11Y_LEADER_EMAIL;
const LEADER_PASSWORD = process.env.A11Y_LEADER_PASSWORD;
const LEADER_CREDS = Boolean(LEADER_EMAIL && LEADER_PASSWORD);

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

async function signIn(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

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
  });

  test("public support and account-deletion pages render their headings", async ({
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
  });

  test("core admin surfaces and the nav spine render in the harness", async ({
    page,
  }) => {
    await gotoHarness(page);

    for (const id of HARNESS_CORE_SURFACES) {
      await expect(
        page.locator(`[data-a11y-surface="${id}"]`),
        `harness surface "${id}" should render`
      ).toBeVisible();
    }

    // The Care · Plan · Multiply nav spine renders (rendered by the sidebar
    // surface). The desktop sidebar is display:none below the md breakpoint, so
    // at a phone width its links sit in the DOM but outside the accessibility
    // tree — include hidden so the role query still resolves them, and assert
    // attachment (not paint, since the spine collapses behind a drawer here).
    const sidebar = page.locator('[data-a11y-surface="sidebar-active-state"]');
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
      const surface = page.locator(`[data-a11y-surface="${id}"]`);
      await expect(surface, `surface "${id}" should render`).toBeVisible();
      // The mobile card stack paints…
      await expect(
        surface.locator(cardSelector).first(),
        `surface "${id}" should show its stacked cards at phone width`
      ).toBeVisible();
      // …while the desktop table/grid stays hidden (display:none) behind md+.
      const table = surface.locator(tableSelector).first();
      if ((await table.count()) > 0) {
        await expect(
          table,
          `surface "${id}" should hide its desktop table at phone width`
        ).toBeHidden();
      }
    }
  });

  test("the harness never forces horizontal page scroll", async ({ page }) => {
    await gotoHarness(page);
    const overflowing = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(
      overflowing,
      "no surface should widen the page past the viewport"
    ).toBe(false);
  });

  test("no horizontal page scroll at the 375px floor", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await gotoHarness(page);
    const overflowing = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(
      overflowing,
      "the directories + grid must not force horizontal scroll at 375px"
    ).toBe(false);
  });
});

test.describe("mobile smoke — live admin surfaces (seeded auth)", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      !ADMIN_CREDS,
      "Set A11Y_ADMIN_EMAIL + A11Y_ADMIN_PASSWORD (npm run seed:test-auth) and serve against live Supabase."
    );
    await signIn(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
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
      !LEADER_CREDS,
      "Set A11Y_LEADER_EMAIL + A11Y_LEADER_PASSWORD (npm run seed:test-auth) and serve against live Supabase."
    );
    await signIn(page, LEADER_EMAIL!, LEADER_PASSWORD!);
    await page.goto("/leader", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Your care"
    );
    const results = await new AxeBuilder({ page }).analyze();
    expectNoBlockingAxeViolations(results);
  });
});
