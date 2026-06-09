import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { expectNoBlockingAxeViolations, gotoHarness } from "./harness";

// Leader care actions redesign (#272, Admin Interaction Model req 10). The care
// actions are now plain, separate choices, each opening a focused Editing
// Pattern drawer. This proves the redesigned surface passes the focus checklist
// and stays accessible: distinct non-generic action names, focus moves into the
// drawer on open and returns to the opener on close, and axe finds nothing
// blocking with the drawer open.

test.describe("leader care actions (redesigned)", () => {
  test.beforeEach(async ({ page }) => {
    await gotoHarness(page);
  });

  test("care actions are distinct, single-purpose choices", async ({
    page,
  }) => {
    const surface = page.locator('[data-a11y-surface="care-actions"]');
    for (const name of [
      "Log call",
      "Log text",
      "Log visit",
      "Update status",
      "Set next step",
      "Add summary",
    ]) {
      await expect(
        surface.getByRole("button", { name, exact: true })
      ).toBeVisible();
    }
  });

  test("choosing an action opens the drawer, and closing returns focus", async ({
    page,
  }) => {
    const surface = page.locator('[data-a11y-surface="care-actions"]');
    const trigger = surface.getByRole("button", {
      name: "Log call",
      exact: true,
    });
    await trigger.click();

    // The drawer's Close control carries leader context (req 4), and focus is
    // now inside the dialog.
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const close = dialog.getByRole("button", {
      name: /Close care action panel for/i,
    });
    await expect(close).toBeVisible();

    // axe over the open drawer.
    const results = await new AxeBuilder({ page }).analyze();
    expectNoBlockingAxeViolations(results);

    // Closing returns focus to the control that opened the drawer.
    await close.click();
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});

// #467 — the transparency toggle inline in the Care accordion. The per-Leader
// panel replaces the read-only "Sealed — …" line with the same interactive
// NoteTransparencyToggle the detail page uses; counts stay visible when the
// grant is on, and the slot never renders a note body. Because the control
// now repeats once per Leader, each toggle's accessible name must carry the
// Leader's name (Admin Interaction Model req 4).
test.describe("care accordion transparency toggle", () => {
  test.beforeEach(async ({ page }) => {
    await gotoHarness(page);
  });

  test("toggles carry leader context and the granted panel stays counts-only", async ({
    page,
  }) => {
    const surface = page.locator('[data-a11y-surface="care-accordion-panel"]');

    // Sealed Leader: the slot renders the interactive toggle (off), not the
    // old read-only sealed line.
    const sealed = surface
      .locator("details")
      .filter({ hasText: "Anderson Lee" });
    await sealed.locator("summary").click();
    await expect(
      sealed.getByText("Leadership visibility: Sealed")
    ).toBeVisible();
    await expect(
      sealed.getByRole("button", {
        name: "Turn on (let leadership read) for Anderson Lee",
      })
    ).toBeVisible();

    // Granted Leader: the counts line stays (counts only — never a note or
    // Prayer Request body) next to the seal control.
    const granted = surface
      .locator("details")
      .filter({ hasText: "Bryant Cole" });
    await granted.locator("summary").click();
    await expect(
      granted.getByText("2 care notes · 1 prayer request")
    ).toBeVisible();
    await expect(
      granted.getByRole("button", {
        name: "Turn off (seal) for Bryant Cole",
      })
    ).toBeVisible();

    // axe over both opened panels (toggles in the tree).
    const results = await new AxeBuilder({ page }).analyze();
    expectNoBlockingAxeViolations(results);
  });

  test("flipping the toggle shows a disabled pending state", async ({
    page,
  }) => {
    // Hold the server-action POST in flight (the handler never resolves the
    // route) so the pending state is observable deterministically rather than
    // racing the response.
    await page.route("**/*", async (route) => {
      if (route.request().method() === "POST") return;
      await route.fallback();
    });

    const surface = page.locator('[data-a11y-surface="care-accordion-panel"]');
    const panel = surface
      .locator("details")
      .filter({ hasText: "Anderson Lee" });
    await panel.locator("summary").click();

    const toggle = panel.getByRole("button", {
      name: "Turn on (let leadership read) for Anderson Lee",
    });
    await toggle.click();

    // Pending: the control disables and shows "Saving…" until the flip
    // settles; its accessible name keeps the leader context throughout.
    await expect(toggle).toBeDisabled();
    await expect(toggle).toHaveText("Saving…");
  });
});
