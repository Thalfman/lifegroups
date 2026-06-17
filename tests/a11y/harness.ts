import type AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page } from "@playwright/test";

// Shared helpers for the gated a11y harness specs (issues 257 + 258). Both the
// accessible-names suite and the Settings suite boot the same /a11y-harness
// route and gate on the same axe policy, so the route guard and the axe
// policy live here once rather than drifting across two files.

export const HARNESS = "/a11y-harness";

// A narrow phone. 375px is the iPhone SE / mini class width and sits under the
// repo's 767px mobile breakpoint, so the .lg-m-* rules are active. Shared by the
// mobile specs so the floor viewport is defined once.
export const PHONE = { width: 375, height: 812 };

// A harness surface mounts under `data-a11y-surface="<id>"`. This wraps the one
// selector string so every spec resolves a surface the same way without
// re-spelling the attribute selector ~51 times.
export function surface(page: Page, id: string): Locator {
  return page.locator(`[data-a11y-surface="${id}"]`);
}

// One seeded auth user per oversight tier, derived from the `A11Y_*` env vars.
// Seeded-auth specs SKIP cleanly when the creds are absent (the default in CI),
// so this centralizes the env derivation; each spec supplies its own skip-reason
// wording where it differs.
type SeededCred = { email?: string; password?: string; present: boolean };

export function seededCreds(): {
  admin: SeededCred;
  leader: SeededCred;
  overShepherd: SeededCred;
} {
  const admin = {
    email: process.env.A11Y_ADMIN_EMAIL,
    password: process.env.A11Y_ADMIN_PASSWORD,
  };
  const leader = {
    email: process.env.A11Y_LEADER_EMAIL,
    password: process.env.A11Y_LEADER_PASSWORD,
  };
  const overShepherd = {
    email: process.env.A11Y_OVER_SHEPHERD_EMAIL,
    password: process.env.A11Y_OVER_SHEPHERD_PASSWORD,
  };
  return {
    admin: { ...admin, present: Boolean(admin.email && admin.password) },
    leader: { ...leader, present: Boolean(leader.email && leader.password) },
    overShepherd: {
      ...overShepherd,
      present: Boolean(overShepherd.email && overShepherd.password),
    },
  };
}

// Sign in as a seeded user: load /login, fill Email/Password by label, click
// "Sign in", and wait until the URL leaves /login. Selectors stay byte-identical
// to the per-spec copies this replaces.
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

// scrollWidth > clientWidth means a descendant overflowed the element's content
// box (a 1px slack absorbs sub-pixel rounding). `label` keeps each call site's
// diagnostic message; any `{overflow}` token is substituted with the measured
// pixel count so the message reads identically to the inlined copies.
export async function expectNoHorizontalOverflow(
  locator: Locator,
  label: string
): Promise<void> {
  await expect(locator).toBeVisible();
  const overflow = await locator.evaluate((el) => {
    const target = el as HTMLElement;
    return target.scrollWidth - target.clientWidth;
  });
  expect(
    overflow,
    label.replace("{overflow}", String(overflow))
  ).toBeLessThanOrEqual(1);
}

// Boot the harness in the first-run "setup" Home variant and confirm the Home
// surface paints. Shared by the home + mobile-flows specs.
export async function gotoSetupHome(page: Page): Promise<void> {
  const response = await page.goto(`${HARNESS}?homeVariant=setup`, {
    waitUntil: "networkidle",
  });
  expect(response?.status(), "harness route must be enabled").toBe(200);
  await expect(surface(page, "home")).toBeVisible();
}

export async function gotoHarness(page: Page): Promise<void> {
  const response = await page.goto(HARNESS, { waitUntil: "networkidle" });
  // Guard against the env gate being off — otherwise a spec would silently
  // pass against a 404 with no controls to check.
  expect(response?.status(), "harness route must be enabled").toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "accessible-name harness"
  );
}

type AxeResults = Awaited<ReturnType<AxeBuilder["analyze"]>>;

// Assert axe found no critical/serious violations. Every rule blocks — the
// 2026-06 design-system upgrade deepened the ink/clay/sage/rose/blue ramps to
// clear WCAG AA, so the old color-contrast carve-out is gone; new carve-outs
// need a deliberate mechanism, not a rule list. Callers build the AxeBuilder —
// including any `.include(...)` scope — and pass the analyzed results in.
export function expectNoBlockingAxeViolations(results: AxeResults): void {
  const blocking = results.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious"
  );
  const summary = blocking.map(
    (v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s)`
  );
  expect(summary, summary.join("\n")).toEqual([]);
}

export async function expectModalDialogSemantics(
  page: Page,
  dialog: Locator
): Promise<void> {
  await expect(dialog).toHaveAttribute("aria-modal", "true");

  const semantics = await dialog.evaluate((node) => {
    const labelledBy = node.getAttribute("aria-labelledby");
    const labelText = labelledBy
      ? (document.getElementById(labelledBy)?.textContent?.trim() ?? "")
      : "";
    const describedBy = node.getAttribute("aria-describedby");
    const descriptionText = describedBy
      ? (document.getElementById(describedBy)?.textContent?.trim() ?? "")
      : null;
    return { labelledBy, labelText, describedBy, descriptionText };
  });

  expect(semantics.labelledBy ?? "").toMatch(/\S/);
  expect(semantics.labelText).not.toBe("");
  if (semantics.describedBy !== null) {
    expect(semantics.descriptionText).not.toBe("");
  }

  await page.keyboard.press("Tab");
  expect(
    await dialog.evaluate((node) => node.contains(document.activeElement))
  ).toBe(true);
}
