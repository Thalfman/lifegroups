import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator } from "@playwright/test";
import { expectNoBlockingAxeViolations, gotoHarness } from "./harness";

// Issue 257 — Admin Interaction Model req 4: repeated/interactive controls
// must carry record or section context in their accessible names, and we
// prove it with more than axe alone. Axe catches MISSING names; it does not
// catch PRESENT-but-ambiguous names such as a list of identical "Edit"
// buttons. This suite adds that second gate against the real admin surfaces
// rendered in the gated a11y harness.
//
// Reused by every later surface-migration slice: add the surface to the
// harness, and these invariants cover it automatically.

// Bare, context-free accessible names that are NOT allowed on any interactive
// control inside a repeated admin surface. A control reading only "Edit" or
// "Calendar" is indistinguishable from its siblings to a screen-reader user.
const FORBIDDEN_GENERIC_NAMES = [
  "edit",
  "open",
  "view",
  "save",
  "delete",
  "remove",
  "calendar",
  "open group calendar",
  "start",
  "mark done",
  "snooze",
  "reopen",
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Accessible names of a set of controls, approximated by aria-label (every
// control under test sets one) falling back to trimmed text content.
async function accessibleNames(controls: Locator): Promise<string[]> {
  return controls.evaluateAll((els) =>
    els.map((el) =>
      (el.getAttribute("aria-label") ?? el.textContent ?? "").trim()
    )
  );
}

function expectAllUnique(names: string[], label: string): void {
  expect(
    names.length,
    `${label}: expected at least 2 controls`
  ).toBeGreaterThan(1);
  expect(
    new Set(names).size,
    `${label} must be unique, got: ${names.join(" | ")}`
  ).toBe(names.length);
}

test.describe("admin accessible names carry record context", () => {
  test.beforeEach(async ({ page }) => {
    await gotoHarness(page);
  });

  test("no interactive control has a bare, context-free accessible name", async ({
    page,
  }) => {
    for (const name of FORBIDDEN_GENERIC_NAMES) {
      const whole = new RegExp(`^${escapeRegExp(name)}$`, "i");
      const buttons = await page.getByRole("button", { name: whole }).count();
      const links = await page.getByRole("link", { name: whole }).count();
      expect(buttons, `bare button named "${name}"`).toBe(0);
      expect(links, `bare link named "${name}"`).toBe(0);
    }
  });

  test("groups directory repeated actions name their group", async ({
    page,
  }) => {
    const surface = page.locator('[data-a11y-surface="groups-directory"]');
    // Edit + Calendar are the two repeated controls per group row (PRD req 1).
    await expect(
      surface.getByRole("button", { name: /^Edit .+/ }).first()
    ).toBeVisible();
    await expect(
      surface.getByRole("link", { name: /^Open .+ calendar/i }).first()
    ).toBeVisible();
  });

  // The hard cases the data model allows: a weekly group recurring on several
  // dates, two groups sharing a name, two follow-ups sharing a title+status.
  // A bare record name is not enough — each repeated action must stay unique.
  test("repeated actions stay unique even when records collide", async ({
    page,
  }) => {
    // Two active groups both named "Young Adults" — Edit + Calendar must differ.
    const collisions = page.locator(
      '[data-a11y-surface="groups-directory-collisions"]'
    );
    expectAllUnique(
      await accessibleNames(collisions.getByRole("button", { name: /^Edit / })),
      "same-name group Edit buttons"
    );
    expectAllUnique(
      await accessibleNames(
        collisions.getByRole("link", { name: /^Open .+ calendar/i })
      ),
      "same-name group Calendar links"
    );

    // A weekly group recurs on multiple dates — its calendar links must differ.
    const calendar = page.locator('[data-a11y-surface="master-calendar-list"]');
    expectAllUnique(
      await accessibleNames(
        calendar.getByRole("link", { name: /^Open .+ calendar/i })
      ),
      "weekly group calendar links"
    );

    // Same-title/status follow-ups — action buttons disambiguated by due date.
    for (const id of ["follow-up-status", "care-follow-ups"]) {
      const surface = page.locator(`[data-a11y-surface="${id}"]`);
      expectAllUnique(
        await accessibleNames(
          surface.getByRole("button", { name: /follow-up: /i })
        ),
        `${id} action buttons`
      );
    }
  });

  // Issue #322: every calendar/event trigger must carry an explicit, meaningful
  // accessible name summarizing the occurrence (date + type + clock + status)
  // instead of inheriting the concatenated child text — and stay unique when
  // occurrences collide (a weekly group recurring on several dates; two groups
  // sharing a date).
  test("calendar/event triggers name their occurrence and stay unique", async ({
    page,
  }) => {
    // Per-group month grid: each editable cell's edit button reads "Edit <date>
    // — …", and empty editable dates read "Add event on <date>". Both shapes
    // must be unique across the grid (date disambiguates the recurring group).
    const grid = page.locator('[data-a11y-surface="calendar-month-grid"]');
    await expect(
      grid.getByRole("button", { name: /^Edit .+ — .+/ }).first()
    ).toBeVisible();
    await expect(
      grid.getByRole("button", { name: /^Add event on .+/ }).first()
    ).toBeVisible();
    expectAllUnique(
      await accessibleNames(grid.getByRole("button", { name: /^Edit .+/ })),
      "calendar grid edit triggers"
    );
    expectAllUnique(
      await accessibleNames(
        grid.getByRole("button", { name: /^Add event on /i })
      ),
      "calendar grid add-event triggers"
    );

    // Master calendar month grid: the per-day occurrence pills read "View
    // <group> on <date> — …". Two groups share a date, so these must be unique.
    const masterGrid = page.locator(
      '[data-a11y-surface="master-calendar-grid"]'
    );
    await expect(
      masterGrid.getByRole("button", { name: /^View .+ on .+ — .+/ }).first()
    ).toBeVisible();
    expectAllUnique(
      await accessibleNames(
        masterGrid.getByRole("button", { name: /^View .+ on / })
      ),
      "master calendar grid occurrence pills"
    );

    // Master calendar list: each occurrence card button names its occurrence;
    // the recurring group across dates must keep them unique.
    const list = page.locator('[data-a11y-surface="master-calendar-list"]');
    expectAllUnique(
      await accessibleNames(list.getByRole("button", { name: /^View .+ on / })),
      "master calendar list occurrence cards"
    );
  });

  test("follow-up status actions name their follow-up", async ({ page }) => {
    for (const id of ["follow-up-status", "care-follow-ups"]) {
      const surface = page.locator(`[data-a11y-surface="${id}"]`);
      await expect(
        surface.getByRole("button", { name: /follow-up: .+/i }).first()
      ).toBeVisible();
    }
  });

  // The axe gate (and its color-contrast palette carve-out, a PRD Non-Goal)
  // lives in ./harness so this suite and the Settings suite stay in lockstep.
  test("axe finds no critical or serious violations", async ({ page }) => {
    const results = await new AxeBuilder({ page }).analyze();
    expectNoBlockingAxeViolations(results);
  });
});
