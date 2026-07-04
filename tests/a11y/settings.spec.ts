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
//   - the hidden-surface-only thresholds (and the per-group overrides block)
//     are collapsed by default, not shown — i.e. progressively disclosed;
//   - axe reports no critical/serious violations on Settings.
//
// Issue #478 (P1.7 + P2.2) layers the consumer-labelling + vocabulary pass on
// top: every Thresholds field is grouped by what it DRIVES ("Drives Care &
// Home today" vs the "Drives hidden surfaces" disclosure), the care pair reads
// as Care cadence (CONTEXT.md), the Groups tab's target counts say they are
// tracking only, the Multiply trigger uses searchable Audience/group-type
// scopes and labels Interest as a people-count, and the per-group override
// summary echoes the canonical health-status labels.
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
  // Wait for an always-visible defaults field to mount so subsequent
  // inspection is stable. (The capacity fields live inside the collapsed
  // "Drives hidden surfaces" disclosure post-#478, so wait on the Care
  // cadence field instead.)
  await expect(
    page.locator(`${SETTINGS} #shepherd_care_stale_days_direct`)
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

  test("hidden-surface thresholds and per-group overrides are collapsed by default", async ({
    page,
  }) => {
    // The metric defaults + overrides now live on the Thresholds tab (Care is the
    // default landing tab post-pivot), so open it before inspecting its
    // disclosures.
    await openThresholdsTab(page);
    // Progressive disclosure: the hidden-surface-only thresholds and the
    // per-group overrides block must NOT be expanded on load.
    const advancedClosed = await page
      .locator(SETTINGS)
      .locator("summary", { hasText: "Drives hidden surfaces" })
      .evaluate((el) => !el.closest("details")?.open);
    expect(advancedClosed, "Drives hidden surfaces open on load").toBe(true);

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
      .locator("summary", { hasText: "Drives hidden surfaces" })
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

  test("related threshold fields stay grouped by their live consumer (issue 478)", async ({
    page,
  }) => {
    // The metric defaults live on the Thresholds tab post-pivot; open it first.
    await openThresholdsTab(page);
    // req 5 grouping + #478: the live-driving Care cadence pair shares one
    // grouping container on the always-visible path.
    const cadence = await sharedGridGroup(page, [
      "shepherd_care_stale_days_direct",
      "shepherd_care_stale_days_delegated",
    ]);
    expect(cadence.allFound, "care cadence fields render").toBe(true);
    expect(cadence.sameGroup, "care cadence fields share one group").toBe(true);
    expect(
      cadence.insideDetails,
      "care cadence fields are not hidden behind a disclosure"
    ).toBe(false);

    // Admin IM 05 (#265) / #478: the three Group-health thresholds — the two
    // triage thresholds plus the healthy-attendance cut line that
    // fetchGroupHealthRubric overlays into the live A–F rubric — drive the
    // Watch filter + Home health distribution, so they share their own
    // grouping container on the always-visible live path too.
    const groupHealth = await sharedGridGroup(page, [
      "group_health_watch_grade",
      "group_health_attendance_decline_margin_pct",
      "default_healthy_attendance_pct",
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
      "group-health thresholds are not hidden behind a disclosure"
    ).toBe(false);

    // #478: the hidden-surface-only capacity thresholds share one grouping
    // container inside the "Drives hidden surfaces" disclosure. (The inputs
    // stay mounted while collapsed, so no expand is needed to inspect the
    // structure.)
    const hidden = await sharedGridGroup(page, [
      "default_group_capacity",
      "capacity_warning_threshold_pct",
      "capacity_full_threshold_pct",
    ]);
    expect(hidden.allFound, "hidden-surface threshold fields render").toBe(
      true
    );
    expect(
      hidden.sameGroup,
      "hidden-surface threshold fields share one group"
    ).toBe(true);
    expect(
      hidden.insideDetails,
      "hidden-surface thresholds live inside the disclosure"
    ).toBe(true);
  });

  test("every Thresholds field is labelled by its live consumer (issue 478)", async ({
    page,
  }) => {
    await openThresholdsTab(page);
    const surface = page.locator(SETTINGS);

    // The two consumer groups name themselves: the live group as a visible
    // fieldset legend, the hidden-surface-only group as its disclosure summary.
    await expect(
      surface.locator("legend", { hasText: "Drives Care & Home today" })
    ).toBeVisible();
    await expect(
      surface.locator("summary", { hasText: "Drives hidden surfaces" })
    ).toBeVisible();

    // CONTEXT.md vocabulary: the stale-contact pair reads as Care cadence.
    await expect(
      surface.locator('label[for="shepherd_care_stale_days_direct"]')
    ).toHaveText("Care cadence: directly overseen (days)");
    await expect(
      surface.locator('label[for="shepherd_care_stale_days_delegated"]')
    ).toHaveText("Care cadence: delegated (days)");

    // The two group-health thresholds say they feed the Home health
    // distribution (their live consumer).
    await expect(
      surface.getByText("feed the Home health distribution").first()
    ).toBeVisible();

    // Expanding the disclosure reveals the short hidden-surface note.
    await surface
      .locator("summary", { hasText: "Drives hidden surfaces" })
      .click();
    await expect(
      surface.getByText(
        "Nothing on Care, Plan, Multiply, or Home reads them today."
      )
    ).toBeVisible();
  });

  test("the Groups tab hosts the free-text group-type list (issue 478)", async ({
    page,
  }) => {
    await page
      .locator(`${SETTINGS} [role="tab"]`, { hasText: "Groups" })
      .click();
    const panel = page.locator(`${SETTINGS} [role="tabpanel"]`);

    // The retired Audience × Category cell board is gone: the Groups tab is now a
    // single free-text type list. The textarea is labelled and the save action
    // carries the surface in its name. Per-type targets live in Multiply.
    const list = panel.getByLabel("Group types", { exact: true });
    await expect(list).toBeVisible();
    await expect(list).toHaveJSProperty("tagName", "TEXTAREA");
    await expect(
      panel.getByRole("button", { name: "Save group types" })
    ).toBeVisible();
  });

  test("the Multiply tab edits the single global 7-pillar readiness rule (issue 478)", async ({
    page,
  }) => {
    await page
      .locator(`${SETTINGS} [role="tab"]`, { hasText: "Multiply" })
      .click();
    const panel = page.locator(`${SETTINGS} [role="tabpanel"]`);

    // The free-text model retired the Audience/cell scope cascade: there is no
    // scope picker — Settings edits only the one global rule (per-type overrides
    // live on the Multiply surface).
    await expect(panel.locator("#multiply-trigger-level")).toHaveCount(0);
    await expect(
      panel.getByRole("button", { name: "Save readiness rule" })
    ).toBeVisible();

    // Interest is a people-count, never a letter: its threshold is a number input.
    const interestMin = panel.getByLabel("Minimum interested people", {
      exact: true,
    });
    await expect(interestMin).toBeVisible();
    await expect(interestMin).toHaveAttribute("type", "number");

    // All seven pillars are editable, including main's three multiplication
    // pillars and the Shepherd-health rename.
    await expect(
      panel.getByLabel("Minimum Shepherd health letter", { exact: true })
    ).toBeVisible();
    await expect(
      panel.getByLabel("Minimum members", { exact: true })
    ).toBeVisible();
    await expect(
      panel.getByLabel("Minimum years as a group", { exact: true })
    ).toBeVisible();
    await expect(
      panel.getByLabel("Minimum Co-Shepherd years", { exact: true })
    ).toBeVisible();
  });

  test("axe finds no critical or serious violations on Multiply settings", async ({
    page,
  }) => {
    await page
      .locator(`${SETTINGS} [role="tab"]`, { hasText: "Multiply" })
      .click();
    await expect(
      page.getByRole("button", { name: "Save readiness rule" })
    ).toBeVisible();

    const results = await new AxeBuilder({ page }).include(SETTINGS).analyze();
    expectNoBlockingAxeViolations(results);
  });

  test("the per-group override summary echoes canonical health-status labels (issue 478)", async ({
    page,
  }) => {
    await openThresholdsTab(page);
    await page
      .locator(SETTINGS)
      .locator("summary", { hasText: "Per-group overrides" })
      .click();
    const surface = page.locator(SETTINGS);

    // The harness seeds one manual health-status override (needs_follow_up);
    // its summary chip must carry the canonical label, never de-underscored
    // enum text.
    await expect(surface.getByText("Health: Needs follow-up")).toBeVisible();
    await expect(surface.getByText("Health: needs follow up")).toHaveCount(0);
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

  test("System tab hosts the admin people importer — upload + template, no Super-Admin hop", async ({
    page,
  }) => {
    await page
      .locator(`${SETTINGS} [role="tab"]`, { hasText: "System" })
      .click();
    const panel = page.locator(`${SETTINGS} [role="tabpanel"]`);
    // Bulk people import is now an ordinary admin capability rendered here (it
    // posts to the admin-gated admin_bulk_import_people RPC), so the tab carries
    // the importer's file-upload control, its write form, and an admin-scoped
    // CSV template link — and no longer deep-links into the Super Admin Console.
    await expect(panel.locator('input[type="file"]').first()).toBeVisible();
    expect(await panel.locator("form").count()).toBeGreaterThan(0);
    await expect(
      panel.locator('a[href="/admin/settings/people-import-template"]').first()
    ).toBeVisible();
    expect(await panel.locator('a[href^="/admin/super-admin"]').count()).toBe(
      0
    );
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
      .locator("summary", { hasText: "Drives hidden surfaces" })
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
    "couldn't be loaded right now. Your saved configuration is unchanged. Refresh to try again.";
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
      `The Shepherd Health Rubric ${COULD_NOT_LOAD}`
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
