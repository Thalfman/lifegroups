import { test, expect } from "@playwright/test";
import { e2eCreds, signIn, uniqueBody } from "./helpers";

// Happy-path Interest Funnel advance, end to end (#826; funnel from PRD #371 /
// ADR 0016). Nothing here is stubbed: the spec signs in as the seeded Ministry
// Admin, creates a Prospect through the real ProspectCreateForm, and advances
// it a stage through the real card form, so both writes run validate → guard →
// SECURITY DEFINER RPC (`admin_create_prospect`, `admin_transition_prospect`)
// with their paired audit_events rows, under real RLS. It pins:
//
//   1. form → server action → RPC wiring for the stage transition (the "Move
//      to" select + group picker + Apply submit),
//   2. post-write revalidation (`revalidatePath("/admin/plan")` refreshes the
//      page's RSC payload, so the card re-partitions into the Matched column
//      WITHOUT any reload — the board renders server-loaded data only),
//   3. the oversight ladder: /admin/plan is requireAdmin-gated, so the seeded
//      Over-Shepherd is redirected to /unauthorized.
//
// Fixtures: no `prospects` rows are seeded anywhere (the E2E stack applies only
// phase2_seed.sql), so the spec creates its own Prospect — through the same
// live pipeline — with a uniqueBody name. Idempotency on a persistent local
// stack: the name is unique per run AND the spec archives the Prospect at the
// end through the real audited ConfirmActionButton (soft archive — the lane
// never hard-deletes anything), so re-runs can't trip strict mode on leftovers.
// "Eastside Community" is a phase2-seeded active group, so it is always
// offered by the Matched group picker.

const creds = e2eCreds();
const MATCH_GROUP = "Eastside Community";

test.describe("Interest Funnel advance pipeline", () => {
  test("Ministry Admin advances a Prospect Interested → Matched: the board reflects it without a reload and it survives one", async ({
    page,
  }) => {
    test.skip(
      !creds.admin.present,
      "Seeded E2E creds not configured (run via scripts/e2e.sh)"
    );

    await signIn(page, creds.admin.email!, creds.admin.password!);
    await page.goto("/admin/plan");
    // Scope to <main>: the streamed shell can leave a hidden duplicate of the
    // page body outside it after a reload, which trips strict mode.
    const main = page.getByRole("main");

    // Create the run's Prospect through the real form. The Full name input is
    // CONTROLLED and "Add prospect" stays disabled until React state sees text,
    // so a pre-hydration fill gets wiped when hydration lands — retry the
    // fill-then-enabled pair until the hydrated form accepts it. (The id
    // selector avoids the "Full name" labels repeated inside every card's
    // collapsed Edit-details editor.)
    const name = uniqueBody("E2E Prospect");
    const addButton = main.getByRole("button", { name: "Add prospect" });
    await expect(async () => {
      await main.locator("#prospect-full_name").fill(name);
      await expect(addButton).toBeEnabled({ timeout: 2_000 });
    }).toPass();
    await addButton.click();
    // Success surfaces as the (auto-dismissing, 5s) "Prospect added." flash or
    // as the new card once revalidation lands — accept either, .first()
    // because both can be visible at once.
    await expect(
      page.getByText("Prospect added.").or(main.getByText(name)).first()
    ).toBeVisible();

    // The card is the innermost <div> containing both the unique name and a
    // "Move to" control (the name-only <div> has no select; ancestor wrappers
    // match hasText too, so .last() = deepest match in document order).
    const card = main
      .locator("div")
      .filter({ hasText: name })
      .filter({ has: page.getByLabel("Move to") })
      .last();

    // Advance Interested → Matched through the real card form. Matched
    // requires a group: picking it reveals the (unlabelled) group_id select,
    // which doubles as the proof React processed the selection.
    await card.getByLabel("Move to").selectOption("matched");
    const groupSelect = card.locator('select[name="group_id"]');
    await expect(groupSelect).toBeVisible();
    await groupSelect.selectOption({ label: MATCH_GROUP });
    await card.getByRole("button", { name: "Apply" }).click();

    // The #826 acceptance assertion: revalidatePath("/admin/plan") refreshes
    // the RSC payload in the action round-trip, re-partitioning the card into
    // the Matched column WITHOUT any reload. Filter columns by their <header>
    // (only funnel columns have one), which dodges "Matched" appearing in
    // every card's Move-to options and in the "Moved to Matched." status. The
    // status line itself is deliberately NOT the primary signal — the card
    // remounts under the new column when the payload lands, which can drop
    // that client state.
    const matchedColumn = main
      .locator("section")
      .filter({ has: page.locator("header", { hasText: "Matched" }) });
    await expect(matchedColumn.getByText(name)).toBeVisible();

    // Round-trip: a full reload re-runs the page's server reads
    // (force-dynamic), so the card below only renders from persisted state.
    await page.reload();
    await expect(matchedColumn.getByText(name)).toBeVisible();

    // Cleanup through the real audited UI: soft-archive the run's Prospect
    // (paired audit row; the record stays in history) so the board doesn't
    // accrue one card per run on a persistent stack. The confirm gate is a
    // Radix alert dialog, and a pre-hydration click on its trigger is
    // swallowed — retry until the dialog appears.
    const archiveButton = main.getByRole("button", {
      name: `Archive prospect ${name}`,
    });
    await expect(async () => {
      await archiveButton.click();
      await expect(page.getByRole("alertdialog")).toBeVisible({
        timeout: 2_000,
      });
    }).toPass();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Archive", exact: true })
      .click();
    await expect(main.getByText(name)).toHaveCount(0);
  });

  test("Over-Shepherd is denied /admin/plan (oversight ladder)", async ({
    page,
  }) => {
    test.skip(
      !creds.overShepherd.present,
      "Seeded E2E creds not configured (run via scripts/e2e.sh)"
    );

    // The funnel is a Ministry-Admin surface: requireAdmin redirects every
    // lower tier to /unauthorized (lib/auth/session.ts), asserted here against
    // the real session rather than the unit-tested guard.
    await signIn(page, creds.overShepherd.email!, creds.overShepherd.password!);
    await page.goto("/admin/plan");
    await page.waitForURL(/\/unauthorized/);
    await expect(page.locator("#prospect-full_name")).toHaveCount(0);
  });
});
