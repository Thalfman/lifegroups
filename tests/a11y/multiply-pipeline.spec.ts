import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator } from "@playwright/test";
import { expectNoBlockingAxeViolations, gotoHarness, surface } from "./harness";

// Issue #815 (audit finding TEST-4): the Multiply tabs that churned since the
// prior audit — the type-first Pipeline (ADR 0030) with its locked-in
// candidates panel, and the Shepherds tab's leader pipeline — never reached
// axe. These specs pin the repeated per-type / per-candidate / per-apprentice
// controls to record-contextual accessible names and gate both surfaces with
// scoped axe scans, including with their inline editors open. The components
// import real server actions; the specs open forms but NEVER submit.

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

test.describe("Multiply pipeline tab (type-first)", () => {
  test.beforeEach(async ({ page }) => {
    await gotoHarness(page);
  });

  test("repeated pipeline controls carry their type / group / candidate", async ({
    page,
  }) => {
    const pipeline = surface(page, "multiply-pipeline");

    // Per-type Remove (two pipelined types).
    expectAllUnique(
      await accessibleNames(
        pipeline.getByRole("button", { name: /^Remove .+ from the pipeline$/ })
      ),
      "remove-type buttons"
    );

    // Per-potential-candidate Lock in (three active groups).
    expectAllUnique(
      await accessibleNames(
        pipeline.getByRole("button", { name: /^Lock in .+/ })
      ),
      "lock-in buttons"
    );

    // Per-locked-in-candidate Remove — covers the locked-in panel plus the
    // unpipelined fallback (same row component).
    expectAllUnique(
      await accessibleNames(
        pipeline.getByRole("button", { name: /^Remove .+ from the plan$/ })
      ),
      "remove-candidate buttons"
    );

    // The matched-shepherds supply side renders under the pipelined type.
    await expect(pipeline.getByText("Miguel Torres").first()).toBeVisible();
  });

  test("axe passes with a lock-in checklist open", async ({ page }) => {
    const pipeline = surface(page, "multiply-pipeline");

    await pipeline
      .getByRole("button", { name: "Lock in Riverside Men" })
      .click();
    // The toggle flips to its Cancel label and the checklist form appears.
    await expect(
      pipeline.getByRole("button", { name: "Cancel lock-in for Riverside Men" })
    ).toBeVisible();
    await expect(
      pipeline.getByRole("button", { name: "Save", exact: true })
    ).toBeVisible();

    const results = await new AxeBuilder({ page })
      .include('[data-a11y-surface="multiply-pipeline"]')
      .analyze();
    expectNoBlockingAxeViolations(results);
  });
});

test.describe("Multiply shepherds tab (leader pipeline)", () => {
  test.beforeEach(async ({ page }) => {
    await gotoHarness(page);
  });

  test("repeated apprentice controls carry the apprentice's name", async ({
    page,
  }) => {
    const shepherds = surface(page, "multiply-shepherds");

    // Two apprentices at the SAME stage: their Advance buttons only stay
    // distinct through the record context in the accessible name. The name
    // keeps the visible "Advance to <stage>" phrase intact (WCAG 2.5.3
    // label-in-name) and appends the apprentice for uniqueness.
    expectAllUnique(
      await accessibleNames(
        shepherds.getByRole("button", { name: /^Advance to .+ for .+/ })
      ),
      "advance-stage buttons"
    );
    expectAllUnique(
      await accessibleNames(
        shepherds.getByRole("button", { name: /^Edit .+/ })
      ),
      "edit-apprentice buttons"
    );

    // The add form's fields are labeled (id-namespaced via idPrefix, so the
    // People surface's embedded instance can't steal the associations).
    await expect(shepherds.getByLabel("Group", { exact: true })).toBeVisible();
    await expect(
      shepherds.getByLabel("Group member", { exact: true })
    ).toBeVisible();
  });

  test("axe passes with an apprentice editor open", async ({ page }) => {
    const shepherds = surface(page, "multiply-shepherds");

    await shepherds.getByRole("button", { name: "Edit Miguel Torres" }).click();
    await expect(
      shepherds.getByRole("button", { name: "Close editor for Miguel Torres" })
    ).toBeVisible();
    await expect(
      shepherds.getByLabel("Apprentice name", { exact: true })
    ).toBeVisible();

    const results = await new AxeBuilder({ page })
      .include('[data-a11y-surface="multiply-shepherds"]')
      .analyze();
    expectNoBlockingAxeViolations(results);
  });
});
