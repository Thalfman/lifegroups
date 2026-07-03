import { test, expect } from "@playwright/test";
import { e2eCreds, signIn, uniqueBody } from "./helpers";

// Happy-path Care Note write, end to end (#812; pipeline from ADR 0017/0023).
// Unlike every other lane, nothing here is stubbed: the specs sign in as the
// seeded per-tier users, submit the real CareNoteWriteForm, and the write runs
// validate → guard → `admin_write_care_note` (SECURITY DEFINER RPC) with its
// paired audit_events row, under real RLS. They pin the three failure classes
// only manual QA caught before this lane existed:
//
//   1. form → server action → RPC wiring (the submit itself),
//   2. post-write RLS visibility (author reads own sealed row back; the
//      ministry_admin/grant-OFF arm of the lib/admin/care-note-visibility.ts
//      truth table holds after a real write),
//   3. post-write revalidation (`revalidatePath("/admin/care")` refreshes the
//      page's RSC payload, so the Notes feed shows the new note WITHOUT any
//      reload).
//
// Seeded fixtures (scripts/test-auth-shared.ts + scripts/seed-test-auth-users.ts):
// "Test Over-Shepherd" covers "Test Leader One" via shepherd_coverage_assignments;
// "Test Ministry Admin" is the ladder viewer/author. Bodies are unique per run,
// and the sealed check resets a left-on transparency grant through the real UI
// first, so re-runs against a persistent local stack stay green. Follow-up
// (out of scope here): the grant-ON ladder arm — flip the toggle, assert the
// admin can read, flip it back.

const creds = e2eCreds();
const SUBJECT_NAME = "Test Leader One";
const CARE_NOTE_LABEL = "Care note (max 4000 chars)";
const SAVED_TEXT = "Care note saved.";

test.describe("Care Note write pipeline", () => {
  test("Over-Shepherd authors a Care Note: it round-trips for the author and stays sealed from the Ministry Admin", async ({
    page,
    browser,
  }, testInfo) => {
    test.skip(
      !creds.overShepherd.present || !creds.admin.present,
      "Seeded E2E creds not configured (run via scripts/e2e.sh)"
    );

    // Author: sign in as the seeded Over-Shepherd and open the covered
    // Leader's care history from the My Shepherds roster.
    await signIn(page, creds.overShepherd.email!, creds.overShepherd.password!);
    await page.goto("/over-shepherd");
    await page.getByRole("link", { name: SUBJECT_NAME }).click();
    await page.waitForURL(/\/over-shepherd\/[0-9a-f-]{36}$/);
    const profileId = new URL(page.url()).pathname.split("/").pop()!;

    // Write through the real form → adminWriteCareNote → RPC pipeline.
    const body = uniqueBody("E2E care note (over-shepherd)");
    await page.getByLabel(CARE_NOTE_LABEL).fill(body);
    await page
      .getByRole("button", { name: "Add care note", exact: true })
      .click();
    // Success surfaces one of two ways: the inline "Care note saved." status
    // (hydrated client submit), or — when the click lands before hydration —
    // a NATIVE form POST that runs the same server action and re-renders the
    // force-dynamic page with the note already in "Your care notes". Both are
    // real round-trips through the pipeline; accept either.
    await expect(
      page.getByText(SAVED_TEXT).or(page.getByRole("main").getByText(body))
    ).toBeVisible();

    // Round-trip: a full reload re-runs the page's server reads
    // (force-dynamic), so the note below only appears if the write persisted
    // AND author-reads-own-row RLS holds with the grant OFF. (The action
    // revalidates only /admin/* paths, so the reload is what refreshes this
    // surface.)
    // Scope to <main>: the streamed shell can leave a hidden duplicate of the
    // page body outside it after a reload, which trips strict mode.
    await page.reload();
    const authorView = page.getByRole("main");
    await expect(authorView.getByText(/Your care notes \(\d+\)/)).toBeVisible();
    await expect(authorView.getByText(body)).toBeVisible();

    // Visibility ladder: the Ministry Admin, with this Leader's transparency
    // grant OFF (seed default), must see the sealed notice and NOT the body —
    // the ministry_admin/grant-OFF arm of the pinned truth table, asserted
    // against real RLS rather than the unit-tested resolver.
    // A manually created context does not inherit the fixture context's
    // baseURL — pass it through so signIn's relative goto("/login") resolves.
    const adminContext = await browser.newContext({
      baseURL: testInfo.project.use.baseURL,
    });
    try {
      const adminPage = await adminContext.newPage();
      await signIn(adminPage, creds.admin.email!, creds.admin.password!);
      await adminPage.goto(`/admin/shepherd-care/${profileId}`);
      const adminView = adminPage.getByRole("main");
      await expect(
        adminView.getByText("Care notes & prayer requests")
      ).toBeVisible();
      // The sealed assertion assumes the seeded default (grant OFF). Nothing
      // wipes note_transparency_grants between runs against a persistent
      // local stack, so a manual flip or an aborted grant-ON experiment could
      // leave it on — reset it through the same audited UI control an admin
      // would use before asserting.
      const sealButton = adminPage.getByRole("button", {
        name: "Turn off (seal)",
        exact: true,
      });
      if (await sealButton.isVisible()) {
        await sealButton.click();
        await expect(
          adminPage.getByText("Sealed.", { exact: true })
        ).toBeVisible();
        await adminPage.reload();
      }
      await expect(adminView.getByText(/sealed to their author/)).toBeVisible();
      await expect(adminPage.getByText(body)).toHaveCount(0);
    } finally {
      await adminContext.close();
    }
  });

  test("Ministry Admin authors a Care Note from the Care accordion: it appears in the Notes feed without a reload", async ({
    page,
  }) => {
    test.skip(
      !creds.admin.present,
      "Seeded E2E creds not configured (run via scripts/e2e.sh)"
    );

    await signIn(page, creds.admin.email!, creds.admin.password!);
    await page.goto("/admin/care");

    // The canonical Care view: Over-Shepherd pane → Leader panel → the
    // "Grades & notes" work area (three mount-on-open <details> levels). Scope
    // every locator to the current disclosure — the same names repeat in the
    // hidden All-shepherds tab panel and in nested panels.
    const overShepherdsPanel = page.locator("#care-panel-over-shepherds");
    const pane = overShepherdsPanel.locator("details").filter({
      has: page.locator("summary", { hasText: "Test Over-Shepherd" }),
    });
    await pane.getByText("Test Over-Shepherd", { exact: true }).click();

    const leaderPanel = pane
      .locator("details")
      .filter({ has: page.locator("summary", { hasText: SUBJECT_NAME }) });
    await leaderPanel.getByText(SUBJECT_NAME, { exact: true }).click();

    const gradesAndNotes = leaderPanel
      .locator("details")
      .filter({ has: page.locator("summary", { hasText: "Grades & notes" }) });
    await gradesAndNotes.getByText("Grades & notes").click();

    // Admin authorship (ADR 0023): the accordion's inline write form, whose
    // repeated submit carries the record context in its accessible name.
    const body = uniqueBody("E2E care note (admin)");
    await gradesAndNotes.getByLabel(CARE_NOTE_LABEL).fill(body);
    await gradesAndNotes
      .getByRole("button", { name: `Add care note for ${SUBJECT_NAME}` })
      .click();
    await expect(gradesAndNotes.getByText(SAVED_TEXT)).toBeVisible();

    // Revalidation: switch to the aggregate Notes tab WITHOUT reloading. The
    // feed's items were server-loaded with the page, so the new body is only
    // here if revalidatePath("/admin/care") refreshed the RSC payload in the
    // action round-trip. (The author always reads their own note, so no grant
    // is involved.)
    await page.getByRole("tab", { name: /^Notes/ }).click();
    await expect(page.getByText(body)).toBeVisible();
  });
});
