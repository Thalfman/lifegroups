import { expect, type Page } from "@playwright/test";

// Shared UI fixture from the #872 group-management flow. It creates a unique
// group through the operator-facing drawer, optionally creating a type when a
// caller needs one, and returns the id exposed only by the rendered View link.
// Callers own sign-in so each spec stays explicit about its actor.
export async function createGroupThroughUi(
  page: Page,
  input: { groupName: string; typeLabel?: string }
): Promise<string> {
  await page.goto("/admin/groups");
  const main = page.getByRole("main");
  const drawer = page.getByRole("dialog");

  // A pre-hydration click can be swallowed, so retry until the drawer paints.
  await expect(async () => {
    await main.getByRole("button", { name: "New group" }).click();
    await expect(drawer).toBeVisible({ timeout: 2_000 });
  }).toPass();

  // The controlled name input must update React state before submit enables.
  const createButton = drawer.getByRole("button", { name: "Create group" });
  await expect(async () => {
    await drawer.locator("#group-name").fill(input.groupName);
    await expect(createButton).toBeEnabled({ timeout: 2_000 });
  }).toPass();

  const typeLabel = input.typeLabel;
  if (typeLabel) {
    const typeSelect = drawer.locator("#group-group_type");
    await expect(async () => {
      await drawer.getByRole("button", { name: "More details" }).click();
      await expect(typeSelect).toBeVisible({ timeout: 2_000 });
    }).toPass();

    const newTypeInput = drawer.locator("#group-group_type-new");
    await expect(async () => {
      await typeSelect.selectOption("__creatable_add_new__");
      await expect(newTypeInput).toBeVisible({ timeout: 2_000 });
    }).toPass();
    await newTypeInput.fill(typeLabel);
    await drawer.getByRole("button", { name: "Add", exact: true }).click();
    await expect(typeSelect).toHaveValue(typeLabel);
  }

  await createButton.click();
  const groupText = main.getByText(input.groupName).first();
  const liveCreate = await page
    .getByText("Group created.")
    .or(groupText)
    .first()
    .waitFor({ state: "visible", timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  if (!liveCreate) {
    console.log("[e2e] group create: no live signal in 15s, reloading");
    await page.reload();
  }
  await expect(groupText).toBeVisible();

  const viewLink = main.getByRole("link", {
    name: `View ${input.groupName}`,
  });
  await expect(viewLink).toBeVisible();
  const href = await viewLink.getAttribute("href");
  const idMatch = href?.match(
    /^\/admin\/groups\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\?|$)/i
  );
  if (!idMatch) {
    throw new Error(
      `Created group '${input.groupName}' has no parseable detail href: ${href}`
    );
  }
  return idMatch[1];
}
