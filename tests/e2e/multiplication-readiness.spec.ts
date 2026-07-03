import { test, expect } from "@playwright/test";
import { e2eCreds, signIn } from "./helpers";

// Happy-path Multiplication-readiness assessment, end to end (#827; model from
// ADR 0019/0021/0029/0030). Nothing here is stubbed: the spec signs in as the
// seeded Ministry Admin and records a readiness assessment on the VISIBLE
// /admin/multiply surface (ADR 0022 — not the off-nav Planning host), on the
// Pipeline tab where the assessment lives: the "Lock in" flow's five-criterion
// checklist + status + target year, written through
// adminCreateMultiplicationCandidate → the audited SECURITY DEFINER RPC
// `admin_create_multiplication_candidate` under real RLS. It pins:
//
//   1. form → server action → RPC wiring for the lock-in submit,
//   2. post-write revalidation (`revalidatePath("/admin/multiply")` refreshes
//      the RSC payload, re-partitioning the group from Potential candidates to
//      Locked-in candidates WITHOUT any reload, with the recorded assessment —
//      status chip, target-year chip, met-count, per-criterion checkboxes),
//   3. persistence: a full reload re-runs the force-dynamic server reads and
//      the assessment is still there (no stale initial data).
//
// Fixtures: the E2E stack (phase2_seed.sql) seeds NO group types, NO pipelined
// types, and NO multiplication_candidates — so the spec establishes its own
// preconditions through the same real audited UI an admin would use:
//   A. give the seeded active group "Downtown Professionals" the group type
//      "E2E Multiply" (Groups editor drawer; first run adds the type to the
//      canonical list via the picker's ＋ Add new type… → admin_add_group_type,
//      which is an idempotent, case-insensitive no-op after that),
//   B. put the type in the pipeline (admin_set_group_type_in_pipeline upsert),
//   C. if a previous run left the group locked in, Remove it first (a soft,
//      audited archive — admin_archive_multiplication_candidate) so lock-in
//      can't hit candidate_exists; the lane never hard-deletes anything.
// Every conditional above makes re-runs against a persistent local stack land
// in the same known state, mirroring the care-note spec's grant reset.

const creds = e2eCreds();
const TYPE = "E2E Multiply";
const GROUP = "Downtown Professionals";
// The Groups directory's accessible labels carry the location context:
// groupAccessibleLabel = "name (location_area)", and Downtown Professionals is
// seeded with location_area "Downtown".
const GROUP_LABEL = "Downtown Professionals (Downtown)";
// segmentAnchorId(TYPE): the stable per-type section anchor in the Pipeline
// tab. Everything is scoped to it — tab panels stay mounted (hidden) once
// opened, so unscoped text lookups can hit duplicates in other panels.
const SECTION_ID = "#seg-e2e-multiply";
// Three of the five ADR 0029 criteria are recorded; two are left unmet so the
// assertions prove the exact assessment round-tripped, not just "something
// saved".
const CHECKED = ["12+ members", "Shepherd willing", "Need for similar group"];
const UNCHECKED = ["3+ years", "Co-Shepherd 1+ yr"];

test.describe("Multiplication-readiness assessment pipeline", () => {
  test("Ministry Admin locks in a candidate with a readiness assessment: the Pipeline reflects it without a reload and it survives one", async ({
    page,
  }) => {
    test.skip(
      !creds.admin.present,
      "Seeded E2E creds not configured (run via scripts/e2e.sh)"
    );

    await signIn(page, creds.admin.email!, creds.admin.password!);

    // ---- Precondition A: the target group carries the run's group type. ----
    await page.goto("/admin/groups");
    const main = page.getByRole("main");
    // The directory renders BOTH the desktop table and the (CSS-hidden) mobile
    // card list, each with a "More actions for …" trigger — scope to the table
    // to stay out of strict-mode trouble. The popover is the page's first
    // React interaction, so retry until hydration accepts the click.
    const moreButton = main
      .locator("table")
      .getByRole("button", { name: `More actions for ${GROUP_LABEL}` });
    const editButton = page.getByRole("button", {
      name: `Edit ${GROUP_LABEL}`,
    });
    await expect(async () => {
      await moreButton.click();
      await expect(editButton).toBeVisible({ timeout: 2_000 });
    }).toPass();
    await editButton.click();

    const drawer = page.getByRole("dialog");
    // exact: true keeps this off the create form's "Group type (optional)".
    const typeSelect = drawer.getByLabel("Group type", { exact: true });
    await expect(typeSelect).toBeVisible();
    if ((await typeSelect.inputValue()) === TYPE) {
      // Re-run: already assigned. An untouched form isn't dirty, so the close
      // control dismisses without the discard prompt.
      await drawer
        .getByRole("button", { name: `Close ${GROUP} editor` })
        .click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
    } else {
      if ((await typeSelect.locator(`option[value="${TYPE}"]`).count()) > 0) {
        await typeSelect.selectOption(TYPE);
      } else {
        // First run on a fresh stack: add the type in place through the
        // picker's creatable flow (idempotent admin_add_group_type RPC), which
        // appends AND selects it on success.
        await typeSelect.selectOption({ label: "＋ Add new type…" });
        await drawer.getByLabel("New group type").fill(TYPE);
        await drawer.getByRole("button", { name: "Add", exact: true }).click();
        await expect(typeSelect).toHaveValue(TYPE);
      }
      await drawer.getByRole("button", { name: "Save changes" }).click();
      // The directory closes the drawer via onSaved when the write lands —
      // that close IS the success signal ("Group updated." may never paint).
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }

    // ---- Precondition B: the type is in the pipeline. ----
    // Deep-link straight to the Pipeline tab — the active tab is URL-driven
    // (?tab=), which also keeps the tab across the later reload.
    await page.goto("/admin/multiply?tab=pipeline");
    await expect(page.getByRole("tab", { name: "Pipeline" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    // Wait for the Pipeline panel's content before probing the section — a
    // premature count() would misread "still streaming" as "not pipelined".
    await expect(
      page.getByRole("heading", { name: "Pipelined types" })
    ).toBeVisible();
    const section = page.locator(SECTION_ID);
    if ((await section.count()) === 0) {
      const addTypeSection = main
        .locator("section")
        .filter({ has: page.locator("#pipeline-add-type") });
      const addButton = addTypeSection.getByRole("button", {
        name: "Add",
        exact: true,
      });
      // The add select is controlled and Add stays disabled until React sees
      // the selection — the enabled check doubles as the hydration guard.
      await expect(async () => {
        await page.getByLabel("Add a type to the pipeline").selectOption(TYPE);
        await expect(addButton).toBeEnabled({ timeout: 2_000 });
      }).toPass();
      await addButton.click();
      // Revalidation renders the new type section without a reload.
      await expect(section).toBeVisible();
    }
    await expect(section.getByText("Potential candidates")).toBeVisible();

    // ---- Precondition C: reset a leftover locked-in candidate (re-runs). ----
    const removeButton = section.getByRole("button", {
      name: `Remove ${GROUP} from the plan`,
    });
    const lockInButton = section.getByRole("button", {
      name: `Lock in ${GROUP}`,
    });
    if (await removeButton.isVisible()) {
      // Soft archive through the real audited control; the server re-partitions
      // the group back to Potential candidates. Retried because this can be the
      // page's first React interaction (a pre-hydration click is swallowed).
      await expect(async () => {
        if (await removeButton.isVisible()) await removeButton.click();
        await expect(lockInButton).toBeVisible({ timeout: 5_000 });
      }).toPass();
    }

    // ---- The assessment (#827's acceptance): lock in with the checklist. ----
    const statusSelect = section.getByLabel("Status");
    await expect(async () => {
      // Idempotent open: only click while the form is closed (the button
      // toggles — its accessible name flips to "Cancel lock-in for …" once
      // open), so a slow render can't make the retry close what it opened.
      if (await lockInButton.isVisible()) await lockInButton.click();
      await expect(statusSelect).toBeVisible({ timeout: 2_000 });
    }).toPass();
    await statusSelect.selectOption("planned");
    await section.getByLabel("Target year").fill("2027");
    for (const label of CHECKED) {
      await section.getByRole("checkbox", { name: label }).check();
    }
    await section.getByRole("button", { name: "Save", exact: true }).click();

    // Re-partition WITHOUT a reload: revalidatePath("/admin/multiply") lands
    // the group in Locked-in candidates carrying the exact assessment. The
    // lock-in form collapsed, so the five checkboxes below are the locked-in
    // row's inline (optimistic) criterion toggles.
    const assertAssessment = async () => {
      await expect(removeButton).toBeVisible();
      await expect(lockInButton).toHaveCount(0);
      await expect(section.getByText("Planned", { exact: true })).toBeVisible();
      await expect(section.getByText("2027", { exact: true })).toBeVisible();
      await expect(section.getByText("3/5 ready")).toBeVisible();
      for (const label of CHECKED) {
        await expect(
          section.getByRole("checkbox", { name: label })
        ).toBeChecked();
      }
      for (const label of UNCHECKED) {
        await expect(
          section.getByRole("checkbox", { name: label })
        ).not.toBeChecked();
      }
    };
    await assertAssessment();

    // Persistence: a full reload re-runs the force-dynamic server reads (the
    // URL still carries ?tab=pipeline, so the Pipeline panel mounts active).
    // The same assessment renders from persisted rows — no stale initial data.
    await page.reload();
    await expect(page.getByRole("tab", { name: "Pipeline" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    await assertAssessment();
  });
});
