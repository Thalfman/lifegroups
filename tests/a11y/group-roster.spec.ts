import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { expectNoBlockingAxeViolations, gotoHarness } from "./harness";

// The group detail People tab's roster editor (GroupRosterManager): assign /
// remove controls live on the group itself instead of bouncing to
// /admin/people. This suite gates the repeated-control naming (every Remove
// names its person AND group) and the labelled inline assign rows.

const SURFACE = '[data-a11y-surface="group-roster"]';
const GROUP = "Riverside Young Adults";

test.describe("group roster manager", () => {
  test.beforeEach(async ({ page }) => {
    await gotoHarness(page);
  });

  test("Remove controls carry person + group context", async ({ page }) => {
    const surface = page.locator(SURFACE);

    for (const person of [
      "Avery Leader",
      "Blair Co",
      "Casey Member",
      "Drew Member",
    ]) {
      await expect(
        surface.getByRole("button", { name: `Remove ${person} from ${GROUP}` })
      ).toBeVisible();
    }
  });

  test("the inline assign rows expose labelled selects and named buttons", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);

    const leaderSelect = surface.getByRole("combobox", {
      name: "Leader",
      exact: true,
    });
    await expect(leaderSelect).toBeVisible();
    await expect(
      surface.getByRole("combobox", { name: "Role", exact: true })
    ).toBeVisible();
    await expect(
      surface.getByRole("combobox", { name: "Member", exact: true })
    ).toBeVisible();

    await expect(
      surface.getByRole("button", { name: `Assign a leader to ${GROUP}` })
    ).toBeVisible();
    await expect(
      surface.getByRole("button", { name: `Assign a member to ${GROUP}` })
    ).toBeVisible();
  });

  test("the Interest Funnel card lists matched prospects and links to Plan", async ({
    page,
  }) => {
    const surface = page.locator(SURFACE);

    await expect(surface.getByText("Morgan Prospect")).toBeVisible();
    await expect(
      surface.getByText(
        "2 people joined this group through the Interest Funnel."
      )
    ).toBeVisible();
    await expect(
      surface.getByRole("link", { name: "Open the Interest Funnel →" })
    ).toBeVisible();
  });

  test("axe finds no critical or serious violations", async ({ page }) => {
    const results = await new AxeBuilder({ page }).include(SURFACE).analyze();
    expectNoBlockingAxeViolations(results);
  });
});
