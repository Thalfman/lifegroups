import { test, expect, e2eCreds, signIn, uniqueBody } from "./helpers";
import { createGroupThroughUi } from "./group-fixture";
import { ensureSuperAdmin } from "./db";
import {
  authenticatedE2eDbEnv,
  fetchAuditEventsAs,
  signInE2eUser,
} from "./authenticated-db";

// End-to-end proof of the group Archive invariant (#873): the seeded Ministry
// Admin creates and archives a throwaway group through the real UI, the group
// leaves the default list, and a Super-Admin-authenticated DB read proves the
// row and its same-transaction audit event remain under real RLS.
//
// Groups predate the repo-wide `archived_at` convention. Their authoritative
// soft-archive representation is `lifecycle_status = 'closed'` plus a non-null
// `closed_at`; the UI deliberately names that lifecycle move "Archive".

const creds = e2eCreds();

test.describe("Group archive pipeline", () => {
  test("Ministry Admin archives a group while its row and paired audit event persist", async ({
    page,
  }) => {
    test.skip(
      !creds.admin.present || authenticatedE2eDbEnv() === null,
      "Seeded E2E creds / local DB env not configured (run via scripts/e2e.sh)"
    );

    const testStart = new Date(Date.now() - 30_000).toISOString();
    const groupName = uniqueBody("E2E Archive Group");

    await signIn(page, creds.admin.email!, creds.admin.password!);
    const groupId = await createGroupThroughUi(page, { groupName });
    const main = page.getByRole("main");

    // Archive from the same list surface an operator uses: More -> Edit ->
    // Archive group -> the non-blocking confirmation dialog.
    await expect(async () => {
      await main
        .getByRole("button", { name: `More actions for ${groupName}` })
        .click();
      await expect(
        page.getByRole("button", { name: `Edit ${groupName}` })
      ).toBeVisible({ timeout: 2_000 });
    }).toPass();
    await page.getByRole("button", { name: `Edit ${groupName}` }).click();

    const drawer = page.locator('[role="dialog"]').filter({
      has: page.locator(`#edit-group_type-${groupId}`),
    });
    await expect(drawer).toBeVisible();
    await drawer.getByRole("button", { name: `Archive ${groupName}` }).click();

    const confirm = page.getByRole("alertdialog", { name: "Archive group" });
    await expect(confirm).toBeVisible();
    await confirm
      .getByRole("button", { name: "Archive group", exact: true })
      .click();

    // The editor drawer closes only from the action's success callback, making
    // its DOM removal a reliable live signal even while Radix hides background
    // roles during the confirmation flow. Tolerate the local/CI server-action
    // stall class (#839): the RPC commits before a response stream can stall,
    // so a fresh render is the durable fallback.
    const activeGroupLink = main.getByRole("link", {
      name: `View ${groupName}`,
    });
    const liveArchive = await drawer
      .waitFor({ state: "detached", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (!liveArchive) {
      console.log("[e2e] group archive: no live signal in 15s, reloading");
      await page.reload();
    }

    await expect(main.getByRole("tab", { name: /All groups/ })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    await expect(activeGroupLink).toHaveCount(0);

    // The archived bucket is the user-facing proof that the row moved rather
    // than disappeared. It also proves the list refresh loaded the closed row.
    await main.getByRole("tab", { name: /Archived/ }).click();
    await expect(
      main.getByRole("link", { name: `View ${groupName}` })
    ).toBeVisible();

    // Provision/reuse the local-only Super Admin fixture, then authenticate
    // through the publishable key. Both reads below are RLS-subject: groups is
    // admin-readable, while audit_events is Super-Admin-only.
    const superAdmin = await ensureSuperAdmin();
    const db = await signInE2eUser(superAdmin.email, superAdmin.password);

    const { data: archivedGroup, error: groupError } = await db
      .from("groups")
      .select("id, name, lifecycle_status, closed_at")
      .eq("id", groupId)
      .single();
    expect(groupError, "Super Admin should read the archived group").toBeNull();
    expect(archivedGroup).toMatchObject({
      id: groupId,
      name: groupName,
      lifecycle_status: "closed",
    });
    expect(archivedGroup?.closed_at).toEqual(expect.any(String));

    const archiveRows = await fetchAuditEventsAs(db, {
      action: "admin.close_group",
      entityId: groupId,
      since: testStart,
    });
    expect(archiveRows).toHaveLength(1);
    expect(archiveRows[0]).toMatchObject({
      entity_type: "groups",
      entity_id: groupId,
      metadata: {
        before: { lifecycle_status: "active", closed_at: null },
        after: { lifecycle_status: "closed" },
      },
    });
  });
});
