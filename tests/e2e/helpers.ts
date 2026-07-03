import type { Page } from "@playwright/test";

// Seeded-auth helpers for the E2E lane (#812). Deliberately self-contained —
// no imports from tests/a11y/harness.ts — so the two Playwright lanes stay
// decoupled (the a11y lane runs against the harness build; this lane runs
// against the real app).

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
} {
  const admin = {
    email: process.env.E2E_ADMIN_EMAIL,
    password: process.env.E2E_ADMIN_PASSWORD,
  };
  const overShepherd = {
    email: process.env.E2E_OVER_SHEPHERD_EMAIL,
    password: process.env.E2E_OVER_SHEPHERD_PASSWORD,
  };
  return {
    admin: { ...admin, present: Boolean(admin.email && admin.password) },
    overShepherd: {
      ...overShepherd,
      present: Boolean(overShepherd.email && overShepherd.password),
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
