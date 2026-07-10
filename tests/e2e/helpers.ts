import { test as base, type Page } from "@playwright/test";
import { createActionTracker } from "./action-telemetry";

// Seeded-auth helpers for the E2E lane (#812). Deliberately self-contained —
// no imports from tests/a11y/harness.ts — so the two Playwright lanes stay
// decoupled (the a11y lane runs against the harness build; this lane runs
// against the real app).

// Server-action stall telemetry (#839): passive per-request logging of
// server-action POSTs — headers received, body complete, failed, or still
// pending when the page closes — so an intermittent >30s stall is diagnosable
// from the CI job log alone. The listeners never assert; budgets and retries
// are untouched. The extended `test` below wires the default `page` fixture;
// call this directly for pages created outside the fixture (e.g. a second
// browser context) so their writes are covered too.
export function instrumentPage(page: Page, specLabel: string): () => void {
  const tracker = createActionTracker(specLabel);
  const emit = (message: string | undefined) => {
    if (message) console.log(message);
  };
  page.on("request", (request) => {
    tracker.onRequest(
      request,
      request.method(),
      request.headers(),
      request.postData(),
      request.url(),
      Date.now()
    );
  });
  page.on("response", (response) => {
    emit(tracker.onResponse(response.request(), response.status(), Date.now()));
  });
  page.on("requestfinished", (request) => {
    emit(tracker.onFinished(request, Date.now()));
  });
  page.on("requestfailed", (request) => {
    emit(
      tracker.onFailed(
        request,
        request.failure()?.errorText ?? null,
        Date.now()
      )
    );
  });
  // Idempotent: the fixture flushes after the test body, the close event
  // covers manually created pages — whichever fires first reports.
  let flushed = false;
  const flush = () => {
    if (flushed) return;
    flushed = true;
    for (const pending of tracker.pendingReport(Date.now())) {
      console.log(pending);
    }
  };
  page.on("close", flush);
  return flush;
}

// Every spec imports `test`/`expect` from here (not @playwright/test) so the
// default page is instrumented without per-spec wiring.
export const test = base.extend({
  // Playwright calls this fixture param `use`; named `provide` here so the
  // react-hooks lint rule doesn't mistake it for a React hook call.
  page: async ({ page }, provide, testInfo) => {
    const flush = instrumentPage(page, testInfo.titlePath.join(" › "));
    await provide(page);
    flush();
  },
});

export { expect } from "@playwright/test";

export type E2ECred = {
  email?: string;
  password?: string;
  present: boolean;
};

// Seeded per-tier creds, exported by scripts/e2e.sh from the same TEST_*
// values `npm run seed:test-auth` provisions. Specs skip cleanly when absent
// (mirroring the a11y lane's seeded specs), so a bare `npx playwright test
// --config playwright.e2e.config.ts` without the runner never fails on
// missing users.
export function e2eCreds(): {
  admin: E2ECred;
  overShepherd: E2ECred;
  leader: E2ECred;
  superAdmin: E2ECred;
} {
  const admin = {
    email: process.env.E2E_ADMIN_EMAIL,
    password: process.env.E2E_ADMIN_PASSWORD,
  };
  const overShepherd = {
    email: process.env.E2E_OVER_SHEPHERD_EMAIL,
    password: process.env.E2E_OVER_SHEPHERD_PASSWORD,
  };
  const leader = {
    email: process.env.E2E_LEADER_EMAIL,
    password: process.env.E2E_LEADER_PASSWORD,
  };
  // No super_admin is seeded (the seed tooling refuses to create one); these
  // are the credentials tests/e2e/db.ts ensureSuperAdmin() provisions-or-reuses
  // against the local stack.
  const superAdmin = {
    email: process.env.E2E_SUPER_ADMIN_EMAIL,
    password: process.env.E2E_SUPER_ADMIN_PASSWORD,
  };
  return {
    admin: { ...admin, present: Boolean(admin.email && admin.password) },
    overShepherd: {
      ...overShepherd,
      present: Boolean(overShepherd.email && overShepherd.password),
    },
    leader: { ...leader, present: Boolean(leader.email && leader.password) },
    superAdmin: {
      ...superAdmin,
      present: Boolean(superAdmin.email && superAdmin.password),
    },
  };
}

// Sign in as a seeded user: load /login, fill Email/Password by label, click
// "Sign in", and wait until the URL leaves /login. Selectors match the login
// form (same flow the a11y lane's signIn drives).
export async function signIn(
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

// Unique per call so the specs stay green when re-run against a persistent
// local stack — the lane never deletes what it writes (no hard deletes,
// anywhere), so every run must assert on a body only it wrote.
export function uniqueBody(prefix: string): string {
  const stamp = Date.now().toString(36);
  const nonce = Math.random().toString(36).slice(2, 8);
  return `${prefix} ${stamp}-${nonce}`;
}
