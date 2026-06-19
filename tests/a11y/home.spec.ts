import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import {
  expectNoBlockingAxeViolations,
  gotoHarness,
  gotoSetupHome,
} from "./harness";

// Issue #480 (P2.4, HOME_CARE_SETTINGS_FINISH_LINE_PLAN) — Home a11y spec.
// Mirrors the Settings suite: the real DashboardClient tree rendered in the
// gated a11y harness with the typed demo seeds, under the DEFAULT nav flags
// (Groups / People / Planning hidden, ADR 0016). The suite proves:
//
//   - the four Home sections render in priority order as labelled regions,
//     and no heading is empty;
//   - the vital-signs band carries the FINAL post-pivot card set (#476): the
//     six Care/Plan/Multiply signals, no retired launch-planning metric;
//   - the overview cards are the pivot set (Care · Health pulse · Interest
//     Funnel · Multiplication readiness) with outcome-naming drill-in links,
//     and no card or link for a retired/frozen tab;
//   - the ranked next-actions queue and the activity period slicer carry
//     proper accessible names;
//   - axe reports no critical/serious violations.
//
// A second describe flips the harness's all-quiet payload (every read
// succeeded, every count a TRUE zero) and proves the #480 empty-state tone
// pass on the real rendered surface: one calm, pastoral voice, CONTEXT.md
// vocabulary (Prospects in the Interest Funnel — never guests/leads/pipeline),
// and an axe-clean empty rendering.

const HOME = '[data-a11y-surface="home"]';

const PIVOT_VITAL_SIGNS = [
  "Active groups",
  "Active shepherds",
  "Shepherds needing care",
  "Prospects in funnel",
  "Cells ready to multiply",
  "Follow-ups due this week",
];

const LAUNCH_VITAL_SIGNS = [
  "% of church in groups",
  "People in groups",
  "Capacity used",
  "Launch outlook",
];

test.describe("home landing structure & accessible names (issue 480)", () => {
  test.beforeEach(async ({ page }) => {
    await gotoHarness(page);
    await expect(page.locator(HOME)).toBeVisible();
  });

  test("has no empty headings", async ({ page }) => {
    const headings = page.locator(
      `${HOME} h1, ${HOME} h2, ${HOME} h3, ${HOME} h4, ${HOME} h5, ${HOME} h6`
    );
    const count = await headings.count();
    expect(count, "home should render headings").toBeGreaterThan(0);
    const texts = await headings.allTextContents();
    for (const text of texts) {
      expect(text.trim(), "no heading may be empty").not.toBe("");
    }
  });

  test("presents the four sections in priority order as labelled regions", async ({
    page,
  }) => {
    // The triage order (#299/#326): urgent work leads, wider horizons follow.
    // The vital-signs band nests its own labelled section inside the snapshot.
    const labelledBy = await page
      .locator(`${HOME} section[aria-labelledby]`)
      .evaluateAll((els) =>
        els.map((el) => el.getAttribute("aria-labelledby") ?? "")
      );
    expect(labelledBy).toEqual([
      "home-needs-attention",
      "home-this-week",
      "home-snapshot",
      "exec-vital-signs",
      "home-recent-activity",
    ]);

    // Every aria-labelledby must resolve to a real, non-empty label.
    for (const id of labelledBy) {
      const label = page.locator(`${HOME} #${id}`);
      await expect(label, `label #${id} must exist`).toHaveCount(1);
      expect(
        (await label.textContent())?.trim(),
        `label #${id} must not be empty`
      ).not.toBe("");
    }
  });

  test("vital signs carry the six pivot metrics and no retired launch metric (#476)", async ({
    page,
  }) => {
    const band = page.locator(
      `${HOME} section[aria-labelledby="exec-vital-signs"]`
    );
    for (const title of PIVOT_VITAL_SIGNS) {
      await expect(
        band.getByText(title, { exact: true }),
        `vital sign "${title}" renders`
      ).toBeVisible();
    }
    // The retired launch-planning metrics ride the hidden Planning nav flag —
    // absent from the whole surface under the default flags.
    for (const title of LAUNCH_VITAL_SIGNS) {
      await expect(page.locator(HOME).getByText(title)).toHaveCount(0);
    }
  });

  test("overview cards are the pivot set with outcome-naming drill-ins", async ({
    page,
  }) => {
    const home = page.locator(HOME);

    // The four pivot-owned overview cards (#470), each with a specific,
    // outcome-naming action link — never a bare "Open".
    await expect(home.getByText("Care triage")).toBeVisible();
    await expect(
      home.getByRole("link", { name: /Contact shepherds/ })
    ).toBeVisible();
    await expect(home.getByText("Health pulse")).toBeVisible();
    await expect(
      home.getByRole("link", { name: /Review group health/ })
    ).toBeVisible();
    await expect(home.getByText("Interest Funnel")).toBeVisible();
    const funnelLink = home.getByRole("link", { name: /Work the funnel/ });
    await expect(funnelLink).toBeVisible();
    await expect(funnelLink).toHaveAttribute("href", "/admin/plan");
    await expect(home.getByText("Multiplication readiness")).toBeVisible();
    const readinessLink = home.getByRole("link", {
      name: /Review readiness/,
    });
    await expect(readinessLink).toBeVisible();
    await expect(readinessLink).toHaveAttribute("href", "/admin/multiply");

    // No card for a retired/frozen tab under the default flags: no launch
    // planning, no leader pipeline, no legacy guests funnel — and no link into
    // a hidden surface.
    await expect(home.getByText("Launch planning")).toHaveCount(0);
    await expect(home.getByText("Shepherd pipeline")).toHaveCount(0);
    await expect(home.getByText("Pipeline funnel")).toHaveCount(0);
    for (const href of [
      "/admin/planning",
      "/admin/guests",
      "/admin/groups",
      "/admin/people",
      "/admin/launch-planning",
      "/admin/leader-pipeline",
      "/admin/super-admin#people-import",
    ]) {
      await expect(home.locator(`a[href^="${href}"]`)).toHaveCount(0);
    }
  });

  test("default hidden nav suppresses setup recovery CTAs", async ({
    page,
  }) => {
    const home = page.locator(HOME);
    await expect(
      home.locator('section[aria-labelledby="setup-recovery-checklist"]')
    ).toHaveCount(0);
    await expect(home.getByText("Setup checklist")).toHaveCount(0);
    await expect(home.locator('a[href^="/admin/groups"]')).toHaveCount(0);
    await expect(home.locator('a[href^="/admin/people"]')).toHaveCount(0);
    await expect(
      home.locator('a[href^="/admin/super-admin#people-import"]')
    ).toHaveCount(0);
  });

  test("setup checklist exposes guided recovery CTAs", async ({ page }) => {
    await gotoSetupHome(page);

    const checklist = page.locator(
      `${HOME} section[aria-labelledby="setup-recovery-checklist"]`
    );
    await expect(checklist).toBeVisible();
    await expect(checklist.getByText("Setup checklist")).toBeVisible();
    // ADR 0027: setup deep-links carry the from=setup return marker.
    await expect(
      checklist.getByRole("link", { name: /Import people/ })
    ).toHaveAttribute(
      "href",
      "/admin/settings?tab=system&from=setup#people-import"
    );
    await expect(
      checklist.getByRole("link", { name: /Assign shepherds/ })
    ).toHaveAttribute("href", "/admin/groups?tab=needs_setup&from=setup");
    await expect(
      checklist.getByRole("link", { name: /Assess health/ })
    ).toHaveAttribute(
      "href",
      "/admin/groups?tab=needs_health_check&from=setup"
    );
  });

  test("ranked next-actions queue rows carry contextual accessible names", async ({
    page,
  }) => {
    const queue = page.locator(`${HOME} ol[aria-label="Top next actions"]`);
    await expect(queue).toBeVisible();
    const labels = await queue
      .locator("a")
      .evaluateAll((els) =>
        els.map((el) => el.getAttribute("aria-label") ?? "")
      );
    expect(labels.length, "demo queue should rank actions").toBeGreaterThan(0);
    for (const label of labels) {
      // Each row's name folds in the imperative action AND its why ("Reach out
      // to 3 leaders needing care. Leaders carry more… Review.") — repeated
      // "review →" affordances are never bare.
      expect(label, "queue rows must carry an explicit name").toBeTruthy();
      expect(label).toMatch(/\. .+ Review\.$/);
    }
    expect(new Set(labels).size, "queue row names stay unique").toBe(
      labels.length
    );
  });

  test("activity period slicer is a labelled group with one current period", async ({
    page,
  }) => {
    const slicer = page.locator(
      `${HOME} [role="group"][aria-label="Activity period"]`
    );
    await expect(slicer).toBeVisible();
    expect(await slicer.locator("a").count()).toBeGreaterThan(1);
    // Exactly one grain reads as the current selection.
    await expect(slicer.locator('a[aria-current="true"]')).toHaveCount(1);
  });

  test("axe finds no critical or serious violations on home", async ({
    page,
  }) => {
    const results = await new AxeBuilder({ page }).include(HOME).analyze();
    expectNoBlockingAxeViolations(results);
  });
});

// #480 tone pass: with the all-quiet payload every card renders its empty
// state, and they all speak in the calm pastoral voice anchored by "Nothing
// needs your attention right now." — never the mechanical "No X in the
// pipeline yet" phrasing, and never guest/lead/pipeline vocabulary (CONTEXT.md:
// Prospects move through the Interest Funnel).
test.describe("home empty-state voice (issue 480)", () => {
  test.beforeEach(async ({ page }) => {
    await gotoHarness(page);
    await page.getByTestId("home-quiet-toggle").click();
    await expect(page.locator(HOME)).toBeVisible();
  });

  test("an all-quiet Home speaks in one calm pastoral voice", async ({
    page,
  }) => {
    const home = page.locator(HOME);
    for (const line of [
      "Nothing needs your attention right now.",
      "The week ahead is clear — no follow-ups are due.",
      "Care queue is clear.",
      "No groups are meeting yet — the health pulse will gather here as groups begin.",
      "No Prospects in the Interest Funnel yet — new interest will gather here.",
      "No active cells yet — readiness will gather here once group types are set up in Settings.",
    ]) {
      await expect(
        home.getByText(line),
        `calm line renders: ${line}`
      ).toBeVisible();
    }
  });

  test("keeps guest/pipeline vocabulary off the quiet Home", async ({
    page,
  }) => {
    const text = (await page.locator(HOME).innerText()).toLowerCase();
    expect(text).not.toContain("guest");
    expect(text).not.toContain("pipeline");
  });

  test("axe finds no critical or serious violations on the quiet Home", async ({
    page,
  }) => {
    const results = await new AxeBuilder({ page }).include(HOME).analyze();
    expectNoBlockingAxeViolations(results);
  });
});
