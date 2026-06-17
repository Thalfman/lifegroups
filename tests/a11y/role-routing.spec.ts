import { expect, test } from "@playwright/test";
import { seededCreds, signIn } from "./harness";

// #597 — seeded-auth ROLE-ROUTING smoke. The leader-routes + mobile-smoke specs
// already render the LIVE admin and Leader surfaces under a real session; this
// spec adds the missing half: the oversight-ladder *boundaries*. It signs in as
// ordinary seeded users and asserts that each tier lands where it should and is
// turned away where it shouldn't — the role-routing regressions the issue calls
// out (a wrong gate would silently let the wrong tier through, and unit tests on
// the in-memory reads seam can't catch it).
//
// Like every seeded-auth spec, it SKIPS cleanly when creds are absent (the
// default in normal CI, which has no Supabase), so `npm run test:a11y` stays
// green. The opt-in `.github/workflows/seeded-auth-route-smoke.yml` workflow
// stands up a local seeded Supabase and supplies the creds. It never broadens
// auth: it only asserts the gates already in place.

const {
  admin: ADMIN,
  leader: LEADER,
  overShepherd: OVER_SHEPHERD,
} = seededCreds();

const ADMIN_SKIP =
  "Set A11Y_ADMIN_EMAIL + A11Y_ADMIN_PASSWORD (npm run seed:test-auth) and " +
  "serve the app against a local seeded Supabase to exercise admin routing.";
const LEADER_SKIP =
  "Set A11Y_LEADER_EMAIL + A11Y_LEADER_PASSWORD (npm run seed:test-auth) and " +
  "serve the app against a local seeded Supabase to exercise leader routing.";
const OVER_SHEPHERD_SKIP =
  "Set A11Y_OVER_SHEPHERD_EMAIL + A11Y_OVER_SHEPHERD_PASSWORD (npm run " +
  "seed:test-auth) and serve against a local seeded Supabase to exercise " +
  "over-shepherd routing.";

test.describe("seeded-auth route smoke — anonymous boundary", () => {
  // No creds needed: an unauthenticated visit to a protected route must land on
  // /login. This is the floor of the ladder and is always safe to assert.
  for (const path of [
    "/admin",
    "/admin/super-admin",
    "/over-shepherd",
    "/leader",
  ] as const) {
    test(`anonymous ${path} redirects to /login`, async ({ page }) => {
      await page.goto(path, { waitUntil: "networkidle" });
      await expect(page).toHaveURL(/\/login(\?|$)/);
      await expect(
        page.getByRole("heading", { level: 1, name: /welcome back/i })
      ).toBeVisible();
    });
  }
});

test.describe("seeded-auth route smoke — Ministry Admin routing", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!ADMIN.present, ADMIN_SKIP);
    await signIn(page, ADMIN.email!, ADMIN.password!);
  });

  for (const path of [
    "/admin",
    "/admin/care",
    "/admin/plan",
    "/admin/multiply",
  ] as const) {
    test(`${path} loads its heading for a Ministry Admin`, async ({ page }) => {
      const response = await page.goto(path, { waitUntil: "networkidle" });
      expect(response?.status(), `${path} should respond 200`).toBe(200);
      await expect(page).toHaveURL(new RegExp(`${path}(\\?|/|$)`));
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    });
  }

  test("a Ministry Admin is turned away from the Super Admin console", async ({
    page,
  }) => {
    // The console is super_admin only (top of the ladder); a Ministry Admin
    // must be redirected to /unauthorized, never rendered the surface.
    await page.goto("/admin/super-admin", { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/unauthorized(\?|$)/);
    await expect(
      page.getByRole("heading", { level: 1, name: /you don.t have access/i })
    ).toBeVisible();
  });
});

test.describe("seeded-auth route smoke — Over-Shepherd routing boundary", () => {
  // The Over-Shepherd sits between the Ministry Admin and the Leader. They land
  // on their own surface and, being below the admin tier, must be turned away
  // from the admin and Super Admin surfaces. Gated on over-shepherd creds, so it
  // skips cleanly until the seed tooling provisions an over-shepherd auth user.
  test.beforeEach(async ({ page }) => {
    test.skip(!OVER_SHEPHERD.present, OVER_SHEPHERD_SKIP);
    await signIn(page, OVER_SHEPHERD.email!, OVER_SHEPHERD.password!);
  });

  test("an Over-Shepherd lands on their own surface", async ({ page }) => {
    const response = await page.goto("/over-shepherd", {
      waitUntil: "networkidle",
    });
    expect(response?.status(), "/over-shepherd should respond 200").toBe(200);
    await expect(page).toHaveURL(/\/over-shepherd(\?|\/|$)/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  for (const path of ["/admin", "/admin/super-admin"] as const) {
    test(`an Over-Shepherd cannot reach ${path}`, async ({ page }) => {
      // Downward-visibility ladder: the admin surfaces are above the
      // Over-Shepherd, so the gate redirects to /unauthorized.
      await page.goto(path, { waitUntil: "networkidle" });
      await expect(page).toHaveURL(/\/unauthorized(\?|$)/);
    });
  }
});

test.describe("seeded-auth route smoke — Leader routing boundary", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!LEADER.present, LEADER_SKIP);
    await signIn(page, LEADER.email!, LEADER.password!);
  });

  test("a Leader lands on their own care surface", async ({ page }) => {
    const response = await page.goto("/leader", { waitUntil: "networkidle" });
    expect(response?.status(), "/leader should respond 200").toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Your care"
    );
  });

  for (const path of ["/admin", "/admin/super-admin"] as const) {
    test(`a Leader cannot reach ${path}`, async ({ page }) => {
      // Downward-visibility ladder: a Leader sits at the bottom and must never
      // reach an admin surface. The gate redirects to /unauthorized.
      await page.goto(path, { waitUntil: "networkidle" });
      await expect(page).toHaveURL(/\/unauthorized(\?|$)/);
    });
  }
});
