import {
  test,
  expect,
  e2eCreds,
  instrumentPage,
  signIn,
  uniqueBody,
} from "./helpers";
import { e2eDbEnv, fetchAuditEvents } from "./db";

// Happy-path group management, end to end (#872). Nothing here is stubbed:
// the spec signs in as the seeded Ministry Admin and drives the real Groups
// surfaces — create a group (with a brand-new Group type minted in place
// through the creatable picker), add a brand-new member onto its roster, and
// assign the seeded "Test Leader One" as its Shepherd. Every write runs
// validate → guard → SECURITY DEFINER RPC (`admin_create_group`,
// `admin_add_group_type`, `admin_add_person_to_group`,
// `admin_assign_leader_to_group`) with its paired audit_events row, under real
// RLS. It pins:
//
//   1. the Groups list → create drawer → group detail click-through (the UI
//      never exposes the new group id; the list link is the only way in),
//   2. roster writes on the People tab surviving a full reload (fresh
//      force-dynamic reads prove revalidation, not client state),
//   3. rendered domain vocabulary — the "Shepherd" badge, never the `leader`
//      enum — plus the audit trail for all three writes (service-role helper
//      in ./db.ts),
//   4. the ladder handshake: the assigned Shepherd's own /leader surface
//      lists the new group.
//
// Fixtures: group_type_configs is unseeded on the E2E stack, so the spec ADDS
// a unique new type label rather than selecting one. All names are unique per
// run, so re-runs against a persistent local stack stay green (the lane never
// hard-deletes anything).

const creds = e2eCreds();
const LEADER_NAME = "Test Leader One";

test.describe("Group management pipeline", () => {
  test("Ministry Admin creates a group with a new type, staffs its roster, and the Shepherd sees it on /leader", async ({
    page,
    browser,
  }, testInfo) => {
    test.skip(
      !creds.admin.present || !creds.leader.present || e2eDbEnv() === null,
      "Seeded E2E creds / service-role env not configured (run via scripts/e2e.sh)"
    );

    // A small clock-skew cushion for the created_at floor on audit reads.
    const testStart = new Date(Date.now() - 30_000).toISOString();
    const groupName = uniqueBody("E2E Group");
    const typeLabel = uniqueBody("E2E Type");
    const personName = uniqueBody("E2E Person");

    await signIn(page, creds.admin.email!, creds.admin.password!);
    await page.goto("/admin/groups");
    // Scope to <main>: the streamed shell can leave a hidden duplicate of the
    // page body outside it after a reload, which trips strict mode.
    const main = page.getByRole("main");

    // --- Create the group through the list's drawer -------------------------
    // "New group" opens the create drawer client-side; a pre-hydration click
    // is swallowed, so retry until the dialog appears.
    const drawer = page.getByRole("dialog");
    await expect(async () => {
      await main.getByRole("button", { name: "New group" }).click();
      await expect(drawer).toBeVisible({ timeout: 2_000 });
    }).toPass();

    // The name input is CONTROLLED and "Create group" stays disabled until
    // React state sees text — retry the fill-then-enabled pair.
    const createButton = drawer.getByRole("button", { name: "Create group" });
    await expect(async () => {
      await drawer.locator("#group-name").fill(groupName);
      await expect(createButton).toBeEnabled({ timeout: 2_000 });
    }).toPass();

    // The Group type picker lives under the collapsed "More details" section.
    const typeSelect = drawer.locator("#group-group_type");
    await expect(async () => {
      await drawer.getByRole("button", { name: "More details" }).click();
      await expect(typeSelect).toBeVisible({ timeout: 2_000 });
    }).toPass();

    // Mint a brand-new type in place (#776 OPP-3): choosing the "＋ Add new
    // type…" sentinel reveals the labelled box; "Add" runs the audited
    // adminAddGroupType action and selects the value.
    const newTypeInput = drawer.locator("#group-group_type-new");
    await expect(async () => {
      await typeSelect.selectOption("__creatable_add_new__");
      await expect(newTypeInput).toBeVisible({ timeout: 2_000 });
    }).toPass();
    await newTypeInput.fill(typeLabel);
    await drawer.getByRole("button", { name: "Add", exact: true }).click();
    // The picker selecting the new value proves the add-type RPC round-trip
    // landed and the form will submit it.
    await expect(typeSelect).toHaveValue(typeLabel);

    await createButton.click();
    // Success surfaces as the "Group created." flash or — since onSaved
    // closes the drawer and refreshes the list — as the new card. The create
    // is SETUP for the roster writes under test, so it tolerates the CI
    // stack's intermittent >30s server-action stalls (#839): the RPC commits
    // before the response stream stalls, so on the stall path the reload
    // renders the group from the fresh read.
    const liveCreate = await page
      .getByText("Group created.")
      .or(main.getByText(groupName))
      .first()
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (!liveCreate) {
      console.log("[e2e] group create: no live signal in 15s, reloading");
      await page.reload();
    }
    await expect(main.getByText(groupName)).toBeVisible();

    // --- Into the detail page (the list link is the only way in) ------------
    // No location/day was set, so the card's accessible label is exactly
    // "View <name>" (groupAccessibleLabel adds a context suffix otherwise).
    await main.getByRole("link", { name: `View ${groupName}` }).click();
    await page.waitForURL(/\/admin\/groups\/[0-9a-f-]{36}/);
    const groupId = new URL(page.url()).pathname.split("/").pop()!;

    // People tab (URL-driven server-rendered tabs — the tab is a real link).
    await main.getByRole("tab", { name: "People" }).click();
    await page.waitForURL(/tab=people/);

    // --- Add a brand-new member onto the roster (#643 create-and-assign) ----
    await expect(async () => {
      await main
        .getByRole("button", { name: "Add a new member to this group" })
        .click();
      await expect(drawer).toBeVisible({ timeout: 2_000 });
    }).toPass();
    const addMemberButton = drawer.getByRole("button", {
      name: "Add member to group",
    });
    await expect(async () => {
      await drawer.locator("#member-full_name").fill(personName);
      await expect(addMemberButton).toBeEnabled({ timeout: 2_000 });
    }).toPass();
    await addMemberButton.click();
    // onSaved closes the drawer and refreshes the tab; tolerate the #839
    // stall class — the RPC commits first, so the reload must render the
    // member from the fresh read.
    const liveAdd = await page
      .getByText(`Member added to ${groupName}.`)
      .or(main.getByText(personName))
      .first()
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (!liveAdd) {
      console.log("[e2e] member add: no live signal in 15s, reloading");
      await page.reload();
    }
    await expect(main.getByText(personName)).toBeVisible();

    // --- Assign the seeded Shepherd -----------------------------------------
    // Native select (uncontrolled), so the selection sticks pre- or
    // post-hydration; the role select's default is already Shepherd/leader.
    await main
      .locator(`#roster-assign-leader-${groupId}`)
      .selectOption({ label: LEADER_NAME });
    await main
      .getByRole("button", { name: `Assign a shepherd to ${groupName}` })
      .click();
    // The Shepherds list re-rendering with the name is the durable signal
    // (the "Assigned to …" flash can be dropped by the refresh remount).
    const shepherdRow = main.locator("li").filter({ hasText: LEADER_NAME });
    const liveAssign = await page
      .getByText(`Assigned to ${groupName}.`)
      .or(shepherdRow)
      .first()
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (!liveAssign) {
      console.log("[e2e] leader assign: no live signal in 15s, reloading");
      await page.reload();
    }
    await expect(shepherdRow).toBeVisible();

    // --- Round-trip: a fresh render proves revalidation/persistence ---------
    await page.reload();
    await expect(main.getByRole("heading", { name: groupName })).toBeVisible();
    await expect(main.getByText(personName)).toBeVisible();
    await expect(shepherdRow).toBeVisible();
    // Rendered domain vocabulary (ADR 0025): the badge says "Shepherd" —
    // never the `leader` enum value.
    await expect(
      shepherdRow.getByText("Shepherd", { exact: true })
    ).toBeVisible();

    // --- The persisted Group type, as rendered ------------------------------
    // The detail surface renders no plain-text type label; the group's stored
    // type surfaces in the header's Edit drawer, preselected in the picker —
    // assert it there (a fresh post-reload render, so it proves persistence).
    const editDrawer = page.getByRole("dialog");
    await expect(async () => {
      await main
        .getByRole("button", { name: `More actions for ${groupName}` })
        .click();
      await expect(
        page.getByRole("button", { name: `Edit ${groupName}` })
      ).toBeVisible({ timeout: 2_000 });
    }).toPass();
    await page.getByRole("button", { name: `Edit ${groupName}` }).click();
    await expect(editDrawer).toBeVisible();
    await expect(editDrawer.locator(`#edit-group_type-${groupId}`)).toHaveValue(
      typeLabel
    );
    await editDrawer
      .getByRole("button", { name: `Close ${groupName} editor` })
      .click();
    await expect(editDrawer).toHaveCount(0);

    // --- Audit pairing, from the DB (service-role, test process only) -------
    const createRows = await fetchAuditEvents({
      action: "admin.create_group",
      entityId: groupId,
      since: testStart,
    });
    expect(createRows.length).toBeGreaterThan(0);
    expect(createRows[0].entity_type).toBe("groups");

    const addRows = await fetchAuditEvents({
      action: "admin.add_person_to_group",
      since: testStart,
    });
    const addRow = addRows.find(
      (r) => r.metadata.group_id === groupId && r.metadata.kind === "member"
    );
    expect(
      addRow,
      "expected an admin.add_person_to_group audit row"
    ).toBeTruthy();

    const assignRows = await fetchAuditEvents({
      action: "admin.assign_leader_to_group",
      since: testStart,
    });
    const assignRow = assignRows.find((r) => r.metadata.group_id === groupId);
    expect(
      assignRow,
      "expected an admin.assign_leader_to_group audit row"
    ).toBeTruthy();

    // --- The ladder handshake: the Shepherd sees the group on /leader -------
    // A manually created context does not inherit the fixture context's
    // baseURL — pass it through so signIn's relative goto("/login") resolves.
    const leaderContext = await browser.newContext({
      baseURL: testInfo.project.use.baseURL,
    });
    try {
      const leaderPage = await leaderContext.newPage();
      instrumentPage(leaderPage, `${testInfo.title} [leader context]`);
      await signIn(leaderPage, creds.leader.email!, creds.leader.password!);
      await leaderPage.goto("/leader");
      await expect(
        leaderPage.getByRole("main").getByRole("heading", { name: groupName })
      ).toBeVisible();
    } finally {
      await leaderContext.close();
    }
  });
});
