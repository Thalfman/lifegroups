import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { expectNoBlockingAxeViolations, gotoHarness } from "./harness";

// Issue 258 — Admin Interaction Model req 5: Settings semantics, grouping &
// progressive disclosure. This suite proves the acceptance criteria against the
// real Settings component tree rendered in the gated a11y harness:
//
//   - no empty headings on Settings;
//   - every input has a visible label AND a programmatic label association;
//   - related threshold fields stay grouped in a shared container;
//   - Advanced thresholds (and the per-group overrides block) are collapsed by
//     default, not shown — i.e. progressively disclosed;
//   - axe reports no critical/serious violations on Settings.
//
// The label/heading assertions go beyond axe deliberately: axe flags a MISSING
// label, but "visible label" (a <label> with text the eye can read, tied to the
// control) is what req 5 asks for, so we assert the association explicitly.

const SETTINGS = '[data-a11y-surface="settings"]';

// A control is properly labelled when an associated <label> carries visible
// text — either a `label[for=id]` or a wrapping <label> (checkboxes use the
// latter). aria-label would satisfy programmatic naming but NOT the "visible
// label" half of the criterion, so we require real label text AND that the
// label is actually rendered: a `display:none` / `hidden` / `visibility:hidden`
// label still returns text content but fails req 5's "visible label" gate.
type ControlLabel = {
  name: string | null;
  type: string;
  labelText: string;
  via: "for" | "wrap" | "none";
  labelVisible: boolean;
};

async function labelledControls(page: Page): Promise<ControlLabel[]> {
  return page
    .locator(
      `${SETTINGS} input:not([type="hidden"]), ${SETTINGS} select, ${SETTINGS} textarea`
    )
    .evaluateAll((els) => {
      // Rendered = occupies a box (catches display:none / hidden, which yield no
      // client rects) and is not visibility:hidden/collapse.
      const isRendered = (node: Element | null): boolean => {
        if (!node) return false;
        if ((node as HTMLElement).getClientRects().length === 0) return false;
        const style = window.getComputedStyle(node as HTMLElement);
        return style.visibility !== "hidden" && style.visibility !== "collapse";
      };
      return els.map((el) => {
        const control = el as
          | HTMLInputElement
          | HTMLSelectElement
          | HTMLTextAreaElement;
        let labelText = "";
        let via: "for" | "wrap" | "none" = "none";
        let labelVisible = false;
        if (control.id) {
          const forLabel = document.querySelector(`label[for="${control.id}"]`);
          const text = forLabel?.textContent?.trim() ?? "";
          if (text) {
            labelText = text;
            via = "for";
            labelVisible = isRendered(forLabel);
          }
        }
        if (!labelText) {
          const wrap = control.closest("label");
          const text = wrap?.textContent?.trim() ?? "";
          if (text) {
            labelText = text;
            via = "wrap";
            labelVisible = isRendered(wrap);
          }
        }
        return {
          name: control.getAttribute("name"),
          type:
            control.tagName.toLowerCase() === "input"
              ? (control as HTMLInputElement).type
              : control.tagName.toLowerCase(),
          labelText,
          via,
          labelVisible,
        };
      });
    });
}

// Whether a set of fields (by id) all resolve to the SAME `.lg-m-grid-stack`
// grouping container — the structural marker the Settings forms use to keep
// related threshold fields together (req 5's grouping criterion).
async function sharedGridGroup(
  page: Page,
  ids: string[]
): Promise<{ allFound: boolean; sameGroup: boolean; insideDetails: boolean }> {
  return page.evaluate((fieldIds) => {
    const surface = document.querySelector('[data-a11y-surface="settings"]');
    if (!surface) {
      return { allFound: false, sameGroup: false, insideDetails: false };
    }
    const groups = fieldIds.map((id) => {
      const el = surface.querySelector(`#${CSS.escape(id)}`);
      return el ? el.closest(".lg-m-grid-stack") : null;
    });
    const allFound = groups.every((g) => g !== null);
    const sameGroup = allFound && groups.every((g) => g === groups[0]);
    const insideDetails = sameGroup && !!groups[0]?.closest("details");
    return { allFound, sameGroup, insideDetails };
  }, ids);
}

// Post-pivot (ADR 0016) the metric defaults + per-group overrides live on the
// Thresholds tab, while Care is the default landing tab. Tests that inspect
// those threshold controls open the Thresholds tab first (only the active panel
// is mounted, by design).
async function openThresholdsTab(page: Page): Promise<void> {
  await page
    .locator(`${SETTINGS} [role="tab"]`, { hasText: "Thresholds" })
    .click();
  // Wait for a defaults field to mount so subsequent inspection is stable.
  await expect(
    page.locator(`${SETTINGS} #default_group_capacity`)
  ).toBeVisible();
}

test.describe("settings semantics, grouping & disclosure (issue 258)", () => {
  test.beforeEach(async ({ page }) => {
    await gotoHarness(page);
    await expect(page.locator(SETTINGS)).toBeVisible();
  });

  test("has no empty headings", async ({ page }) => {
    const headings = page.locator(
      `${SETTINGS} h1, ${SETTINGS} h2, ${SETTINGS} h3, ${SETTINGS} h4, ${SETTINGS} h5, ${SETTINGS} h6`
    );
    const count = await headings.count();
    expect(count, "settings should render section headings").toBeGreaterThan(0);
    const texts = await headings.allTextContents();
    for (const text of texts) {
      expect(text.trim(), "no heading may be empty").not.toBe("");
    }
  });

  test("advanced thresholds and per-group overrides are collapsed by default", async ({
    page,
  }) => {
    // The metric defaults + overrides now live on the Thresholds tab (Care is the
    // default landing tab post-pivot), so open it before inspecting its
    // disclosures.
    await openThresholdsTab(page);
    // Progressive disclosure: the rarely-touched thresholds and the per-group
    // overrides block must NOT be expanded on load.
    const advancedClosed = await page
      .locator(SETTINGS)
      .locator("summary", { hasText: "Advanced thresholds" })
      .evaluate((el) => !el.closest("details")?.open);
    expect(advancedClosed, "Advanced thresholds open on load").toBe(true);

    const overridesClosed = await page
      .locator(SETTINGS)
      .locator("summary", { hasText: "Per-group overrides" })
      .evaluate((el) => !el.closest("details")?.open);
    expect(overridesClosed, "Per-group overrides open on load").toBe(true);
  });

  test("every visible input carries a visible, associated label", async ({
    page,
  }) => {
    // Reveal every control: open the Thresholds tab, open both disclosures and
    // pick a group so the per-group override form mounts, then assert each one
    // is labelled.
    await openThresholdsTab(page);
    await page
      .locator(SETTINGS)
      .locator("summary", { hasText: "Advanced thresholds" })
      .click();
    await page
      .locator(SETTINGS)
      .locator("summary", { hasText: "Per-group overrides" })
      .click();
    await page.locator(`${SETTINGS} #group_picker`).selectOption({ index: 1 });
    // The override form key-remounts on selection; wait for one of its fields.
    await expect(page.locator(`${SETTINGS} #capacity_override`)).toBeVisible();

    const controls = await labelledControls(page);
    expect(
      controls.length,
      "expected several settings controls"
    ).toBeGreaterThan(5);
    const unlabelled = controls.filter((c) => c.via === "none");
    expect(
      unlabelled,
      `unlabelled controls: ${unlabelled.map((c) => c.name ?? c.type).join(", ")}`
    ).toEqual([]);
    // The label must be a VISIBLE label, not merely present in the DOM.
    const hiddenLabel = controls.filter(
      (c) => c.via !== "none" && !c.labelVisible
    );
    expect(
      hiddenLabel,
      `controls whose label is not visibly rendered: ${hiddenLabel
        .map((c) => c.name ?? c.type)
        .join(", ")}`
    ).toEqual([]);
  });

  test("related threshold fields stay grouped", async ({ page }) => {
    // The metric defaults live on the Thresholds tab post-pivot; open it first.
    await openThresholdsTab(page);
    // req 5 grouping: the primary defaults (capacity + the two care-cadence
    // windows) share one grouping container on the always-visible path.
    const primary = await sharedGridGroup(page, [
      "default_group_capacity",
      "shepherd_care_stale_days_direct",
      "shepherd_care_stale_days_delegated",
    ]);
    expect(primary.allFound, "primary default fields render").toBe(true);
    expect(primary.sameGroup, "primary default fields share one group").toBe(
      true
    );
    expect(
      primary.insideDetails,
      "primary defaults are not hidden behind a disclosure"
    ).toBe(false);

    // The capacity / attendance % thresholds share their own grouping container,
    // and that group lives inside the Advanced thresholds disclosure. (The
    // inputs stay mounted while collapsed, so no expand is needed to inspect
    // the structure.)
    const advanced = await sharedGridGroup(page, [
      "capacity_warning_threshold_pct",
      "capacity_full_threshold_pct",
      "default_healthy_attendance_pct",
    ]);
    expect(advanced.allFound, "advanced threshold fields render").toBe(true);
    expect(
      advanced.sameGroup,
      "advanced threshold fields share one group"
    ).toBe(true);
    expect(
      advanced.insideDetails,
      "advanced thresholds live inside the disclosure"
    ).toBe(true);

    // Admin IM 05 (#265): the two Group-health triage thresholds share their own
    // grouping container, also inside the Advanced thresholds disclosure.
    const groupHealth = await sharedGridGroup(page, [
      "group_health_watch_grade",
      "group_health_attendance_decline_margin_pct",
    ]);
    expect(groupHealth.allFound, "group-health threshold fields render").toBe(
      true
    );
    expect(
      groupHealth.sameGroup,
      "group-health threshold fields share one group"
    ).toBe(true);
    expect(
      groupHealth.insideDetails,
      "group-health thresholds live inside the disclosure"
    ).toBe(true);
  });

  test("presents the Care / Groups / Multiply / Thresholds / System tabs (pivot, ADR 0016)", async ({
    page,
  }) => {
    const tabs = page.locator(`${SETTINGS} [role="tab"]`);
    await expect(tabs).toHaveText([
      "Care",
      "Groups",
      "Multiply",
      "Thresholds",
      "System",
    ]);
    // Care is the default selected tab — the rubrics it carries are the heart of
    // what Settings configures now, so the surface lands on them rather than on
    // the older threshold knobs.
    await expect(
      page.locator(`${SETTINGS} [role="tab"]`, { hasText: "Care" })
    ).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(`${SETTINGS} [role="tabpanel"]`)).toContainText(
      "How a group is graded"
    );
  });

  test("System tab is a deep-link only — no bulk-import write controls (pivot, ADR 0016)", async ({
    page,
  }) => {
    await page
      .locator(`${SETTINGS} [role="tab"]`, { hasText: "System" })
      .click();
    const panel = page.locator(`${SETTINGS} [role="tabpanel"]`);
    // The tab surfaces the bulk-import capability and links into the Super Admin
    // Console; it does NOT render a file/upload control or any import write form.
    await expect(
      panel.locator('a[href^="/admin/super-admin"]').first()
    ).toBeVisible();
    expect(await panel.locator('input[type="file"]').count()).toBe(0);
    expect(await panel.locator("form").count()).toBe(0);
  });

  test("tabs are keyboard navigable with arrow keys (issue 304)", async ({
    page,
  }) => {
    const care = page.locator(`${SETTINGS} [role="tab"]`, {
      hasText: "Care",
    });
    await care.focus();
    await page.keyboard.press("ArrowRight");
    // Arrow-right moves selection to the next tab (Groups) and focuses it.
    const groups = page.locator(`${SETTINGS} [role="tab"]`, {
      hasText: "Groups",
    });
    await expect(groups).toHaveAttribute("aria-selected", "true");
    await expect(groups).toBeFocused();
  });

  test("axe finds no critical or serious violations on settings", async ({
    page,
  }) => {
    // Open the Thresholds tab, then expand the disclosures and mount the override
    // form so axe scans the full control tree, not just the primary-path
    // defaults.
    await openThresholdsTab(page);
    await page
      .locator(SETTINGS)
      .locator("summary", { hasText: "Advanced thresholds" })
      .click();
    await page
      .locator(SETTINGS)
      .locator("summary", { hasText: "Per-group overrides" })
      .click();
    await page.locator(`${SETTINGS} #group_picker`).selectOption({ index: 1 });
    await expect(page.locator(`${SETTINGS} #capacity_override`)).toBeVisible();

    const results = await new AxeBuilder({ page }).include(SETTINGS).analyze();
    expectNoBlockingAxeViolations(results);
  });
});

// Issue #469: a failed Settings read renders a calm "couldn't load" notice —
// never the "not set up yet" placeholder (which an operator with a saved
// Health Rubric reads as data loss), and never an editor whose save could
// overwrite configuration that failed to load. Each section names its OWN
// failing read, so a single failed group-types read no longer blanks the
// Groups and Multiply tabs with identical copy. The harness toggle swaps the
// one Settings instance to the read-error payload.
test.describe("settings read-error vs not-set-up split (issue 469)", () => {
  const COULD_NOT_LOAD =
    "couldn't be loaded right now. Your saved configuration is unchanged — refresh to try again.";
  const NOT_CONFIGURED = "isn't configured in this environment yet";

  test.beforeEach(async ({ page }) => {
    await gotoHarness(page);
    await page.getByTestId("settings-read-errors-toggle").click();
    await expect(page.locator(SETTINGS)).toBeVisible();
  });

  test("a failed rubric read shows the couldn't-load notice with no editor", async ({
    page,
  }) => {
    // Care is the default tab; both rubric reads failed in this payload.
    const panel = page.locator(`${SETTINGS} [role="tabpanel"]`);
    await expect(panel).toContainText(
      `The Group Health Rubric ${COULD_NOT_LOAD}`
    );
    await expect(panel).toContainText(
      `The Leader Health Rubric ${COULD_NOT_LOAD}`
    );
    // Never the "not configured" copy, and no editor over a failed read.
    await expect(panel).not.toContainText(NOT_CONFIGURED);
    expect(
      await panel.getByRole("button", { name: "Save rubric" }).count()
    ).toBe(0);
  });

  test("Groups and Multiply name their own failing reads", async ({ page }) => {
    const panel = page.locator(`${SETTINGS} [role="tabpanel"]`);

    await page
      .locator(`${SETTINGS} [role="tab"]`, { hasText: "Groups" })
      .click();
    await expect(panel).toContainText(`Your group types ${COULD_NOT_LOAD}`);
    await expect(panel).not.toContainText(NOT_CONFIGURED);
    expect(
      await panel.getByRole("button", { name: "+ Add a group type" }).count()
    ).toBe(0);

    await page
      .locator(`${SETTINGS} [role="tab"]`, { hasText: "Multiply" })
      .click();
    // Both the trigger read and the group-types read failed; the trigger's own
    // failure wins the naming, and no trigger editor mounts.
    await expect(panel).toContainText(
      `The multiplication trigger ${COULD_NOT_LOAD}`
    );
    await expect(panel).not.toContainText(NOT_CONFIGURED);
    expect(await panel.locator("#multiply-trigger-level").count()).toBe(0);
  });

  test("axe finds no critical or serious violations on the error rendering", async ({
    page,
  }) => {
    // Only the active panel is mounted (by design), so scan each tab that
    // renders a couldn't-load notice: Care (default), Groups, then Multiply.
    const panel = page.locator(`${SETTINGS} [role="tabpanel"]`);
    for (const tab of ["Care", "Groups", "Multiply"]) {
      await page.locator(`${SETTINGS} [role="tab"]`, { hasText: tab }).click();
      await expect(panel).toContainText(COULD_NOT_LOAD);
      const results = await new AxeBuilder({ page })
        .include(SETTINGS)
        .analyze();
      expectNoBlockingAxeViolations(results);
    }
  });
});
