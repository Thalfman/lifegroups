import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { expectNoBlockingAxeViolations } from "./harness";

// #548 — real-route a11y for the LIVE Leader surface. Every other a11y spec
// boots the /a11y-harness route and exercises harness-mounted components
// against typed demo data (no Supabase). The Leader surface is live by default
// (ADR 0024), so it needs axe coverage on the ACTUAL routes a leader sees, not
// just the harness.
//
// Real Leader routes are behind `requireLeader` (a Supabase session + the
// `leader_surface` gate), so this suite needs a real sign-in against a live
// Supabase instance with a seeded Leader assigned to a group:
//
//   1. Seed test auth (Leader + a group):   npm run seed:test-auth
//   2. Run the app against that Supabase, with the harness enabled and reused:
//        NEXT_PUBLIC_A11Y_HARNESS=1 npm run dev        # or build && start
//   3. Point this suite at it and provide the Leader's creds, e.g.:
//        A11Y_WEBSERVER="true" A11Y_LEADER_EMAIL=test.leader1@lifegroups.local \
//        A11Y_LEADER_PASSWORD=… npx playwright test tests/a11y/leader-routes.spec.ts
//
// When those creds are absent — the default in CI, which has no Supabase — the
// suite SKIPS rather than failing, so `npm run test:a11y` stays green. It must
// never broaden Leader visibility or imply check-in availability: it signs in
// as an ordinary seeded Leader and asserts that weekly check-ins stay frozen
// behind their own separate `check_ins` gate.

const EMAIL = process.env.A11Y_LEADER_EMAIL;
const PASSWORD = process.env.A11Y_LEADER_PASSWORD;
const CREDS_PRESENT = Boolean(EMAIL && PASSWORD);
const SKIP_REASON =
  "Set A11Y_LEADER_EMAIL + A11Y_LEADER_PASSWORD (npm run seed:test-auth) and " +
  "serve the app against live Supabase to exercise the real Leader routes.";

// A care-notes entry on the dashboard, whose href is `/leader/{groupId}/care`.
const CARE_LINK = /^Care notes for /;
const CALENDAR_LINK = /^Calendar for /;

async function signInAsLeader(page: Page): Promise<void> {
  await page.goto("/login", { waitUntil: "networkidle" });
  // exact: true, matching harness.ts's signIn — a bare "Password" label match
  // also catches the "Show password" toggle button (strict-mode violation).
  await page.getByLabel("Email", { exact: true }).fill(EMAIL!);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
  // Leave the login route on success; then land on the dashboard explicitly so
  // we don't depend on the post-login redirect target.
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  await page.goto("/leader", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Your care"
  );
}

test.describe("live Leader surface — real routes", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!CREDS_PRESENT, SKIP_REASON);
    await signInAsLeader(page);
  });

  test("the /leader dashboard renders its header and group entry points, then passes axe", async ({
    page,
  }) => {
    // Route-level structure before axe: the header and the per-group primary
    // controls (Care notes + Calendar) a seeded leader relies on.
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Your care"
    );
    await expect(
      page.getByRole("link", { name: CARE_LINK }).first()
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: CALENDAR_LINK }).first()
    ).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    expectNoBlockingAxeViolations(results);
  });

  test("a group-scoped Care route renders its sections, then passes axe", async ({
    page,
  }) => {
    await page.getByRole("link", { name: CARE_LINK }).first().click();
    await page.waitForURL("**/leader/*/care");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Care notes" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Prayer requests" })
    ).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    expectNoBlockingAxeViolations(results);
  });

  test("a group-scoped Calendar route renders, then passes axe", async ({
    page,
  }) => {
    await page.getByRole("link", { name: CALENDAR_LINK }).first().click();
    await page.waitForURL("**/leader/*/calendar");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    expectNoBlockingAxeViolations(results);
  });

  test("weekly check-ins stay frozen — leader_surface must not imply check-ins", async ({
    page,
  }) => {
    // Derive a real group id from a dashboard Care link, then hit the check-in
    // route directly. The /leader tree is live, but check-ins carry their own
    // separate `check_ins` gate (ADR 0002 / 0009): leader_surface being live
    // must NOT open them — the route renders the explicit frozen notice.
    const careHref = await page
      .getByRole("link", { name: CARE_LINK })
      .first()
      .getAttribute("href");
    const groupId = careHref?.split("/")[2];
    expect(groupId, "expected a /leader/{groupId}/care link").toBeTruthy();

    await page.goto(`/leader/${groupId}/checkin`, { waitUntil: "networkidle" });
    await expect(
      page.getByRole("heading", { name: "Weekly check-ins is frozen" })
    ).toBeVisible();
    // The live check-in editor must not be present behind the notice.
    await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);
  });
});
