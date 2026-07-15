import {
  test,
  expect,
  e2eCreds,
  instrumentPage,
  signIn,
  uniqueBody,
} from "./helpers";
import { e2eDbEnv, fetchAuditEvents, findProfileIdByEmail } from "./db";

// Shepherd-AUTHORED write flows, end to end (#903; ADR 0020). The existing
// leader-surface E2E presence was route/visibility handshakes; before Shepherd
// invites widen beyond the core team, this spec makes a signed-in Shepherd
// actually WRITE: a group-scoped Care Note and a group-scoped Prayer Request
// through the real /leader/[groupId]/care forms → leader_write_group_care_note
// / leader_write_group_prayer_request (SECURITY DEFINER RPCs) with their
// paired audit_events rows, under real RLS. It then walks the oversight
// ladder: the Ministry Admin sees the note only after flipping this
// Shepherd's transparency toggle, and an unrelated Shepherd never sees it.
//
// Why a Prayer Request (not the group health update the issue floats) as the
// second write flow: the only health-update write path is the check-in RPC,
// and the whole check-in surface is FROZEN behind its own gate
// (checkInsFrozenGate; /leader/[groupId]/checkin renders FrozenSurfaceNotice),
// so it cannot be driven end-to-end on the seeded stack. The Prayer Request is
// the other real, audited, non-frozen Shepherd write on the same surface.
//
// Seeded fixtures (scripts/test-auth-shared.ts): "Test Leader One" is the
// authoring Shepherd; "Test Leader Two" leads a DIFFERENT group and is the
// unrelated-Shepherd negative control. The seed REUSES an existing demo-safe
// group when one is active (resolveTestGroup — e.g. "Northside Young Adults"
// from the operational seed) and only creates "TEST Life Group A" as a
// fallback, so the group NAME is not stable — the spec drives the FIRST care
// space on the Shepherd's dashboard and keys every later assertion off the
// group id, never the name. Bodies are unique per run and the transparency
// grant is restored to OFF afterward, so re-runs against a persistent local
// stack stay green.

const creds = e2eCreds();
const CARE_NOTE_LABEL = "Care note (max 4000 chars)";
const PRAYER_LABEL = "Prayer request (max 4000 chars)";

test.describe("Shepherd-authored group care writes", () => {
  test("a Shepherd authors a Care Note and Prayer Request; audits pair; the ladder governs who reads them", async ({
    page,
    browser,
  }, testInfo) => {
    test.skip(
      !creds.leader.present ||
        !creds.leader2.present ||
        !creds.admin.present ||
        e2eDbEnv() === null,
      "Seeded E2E creds / local service env not configured (run via scripts/e2e.sh)"
    );

    const since = new Date().toISOString();

    // ---- Author: the seeded Shepherd writes both note kinds for their group.
    // Any group they lead is a valid subject for group-scoped writes; take the
    // dashboard's first care space rather than assuming a group name.
    await signIn(page, creds.leader.email!, creds.leader.password!);
    await page.goto("/leader");
    await page
      .getByRole("link", { name: /^Care notes for / })
      .first()
      .click();
    await page.waitForURL(/\/leader\/[0-9a-f-]{36}\/care$/);
    const groupId = new URL(page.url()).pathname.split("/").at(-2)!;

    const careBody = uniqueBody("E2E leader care note");
    await page.getByLabel(CARE_NOTE_LABEL).fill(careBody);
    await page
      .getByRole("button", { name: "Add care note", exact: true })
      .click();
    // Success surfaces as the inline status (hydrated submit) or — if the
    // click lands before hydration — a native POST re-render that already
    // lists the note; both are real round-trips (same posture as
    // care-note-write.spec.ts).
    await expect(
      page
        .getByText("Care note saved.")
        .or(page.getByRole("main").getByText(careBody))
        .first()
    ).toBeVisible();

    const prayerBody = uniqueBody("E2E leader prayer request");
    await page.getByLabel(PRAYER_LABEL).fill(prayerBody);
    await page
      .getByRole("button", { name: "Add prayer request", exact: true })
      .click();
    await expect(
      page
        .getByText("Prayer request saved.")
        .or(page.getByRole("main").getByText(prayerBody))
        .first()
    ).toBeVisible();

    // Round-trip: a full reload re-runs the force-dynamic server reads, so
    // both bodies only reappear if the writes persisted AND the
    // author-reads-own-row RLS arm holds with the grant OFF.
    await page.reload();
    const authorView = page.getByRole("main");
    await expect(authorView.getByText(careBody)).toBeVisible();
    await expect(authorView.getByText(prayerBody)).toBeVisible();

    // ---- Audit pairing: each write RPC pairs an audit_events row in the same
    // transaction (metadata carries group_id, never the body).
    const careAudits = await fetchAuditEvents({
      action: "leader.care_note.write",
      since,
    });
    expect(
      careAudits.filter((row) => row.metadata?.group_id === groupId).length
    ).toBeGreaterThan(0);
    const prayerAudits = await fetchAuditEvents({
      action: "leader.prayer_request.write",
      since,
    });
    expect(
      prayerAudits.filter((row) => row.metadata?.group_id === groupId).length
    ).toBeGreaterThan(0);

    // ---- Ladder, admin arm: sealed by default; readable only after the
    // Ministry Admin flips THIS Shepherd's transparency toggle; re-sealed
    // afterward so the stack returns to the seeded default.
    const authorProfileId = await findProfileIdByEmail(creds.leader.email!);
    const adminContext = await browser.newContext({
      baseURL: testInfo.project.use.baseURL,
    });
    try {
      const adminPage = await adminContext.newPage();
      instrumentPage(adminPage, `${testInfo.title} [admin context]`);
      await signIn(adminPage, creds.admin.email!, creds.admin.password!);
      await adminPage.goto(`/admin/shepherd-care/${authorProfileId}`);
      await adminPage.getByRole("tab", { name: "Care notes & prayer" }).click();
      const adminView = adminPage.getByRole("main");
      await expect(
        adminView.getByText("Care notes & prayer requests")
      ).toBeVisible();

      // Reset a grant a previous run may have left ON, through the same
      // audited control an admin would use.
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
        await adminPage
          .getByRole("tab", { name: "Care notes & prayer" })
          .click();
      }

      // Grant OFF: the sealed notice shows and neither body leaks.
      await expect(adminView.getByText(/sealed to their author/)).toBeVisible();
      await expect(adminPage.getByText(careBody)).toHaveCount(0);
      await expect(adminPage.getByText(prayerBody)).toHaveCount(0);

      // Flip the grant ON: the group-scoped notes open to the ladder under
      // their "About their group" / "Prayer for their group" blocks.
      await adminPage
        .getByRole("button", { name: "Turn on (let leadership read)" })
        .click();
      await expect(
        adminPage.getByText("Leadership can now read.", { exact: true })
      ).toBeVisible();
      await adminPage.reload();
      await adminPage.getByRole("tab", { name: "Care notes & prayer" }).click();
      await expect(adminView.getByText("About their group")).toBeVisible();
      await expect(adminView.getByText(careBody)).toBeVisible();
      await expect(adminView.getByText(prayerBody)).toBeVisible();

      // Restore the seeded default (grant OFF) for later runs and specs.
      await adminPage
        .getByRole("button", { name: "Turn off (seal)", exact: true })
        .click();
      await expect(
        adminPage.getByText("Sealed.", { exact: true })
      ).toBeVisible();
    } finally {
      await adminContext.close();
    }

    // ---- Ladder, negative arm: an unrelated Shepherd (Test Leader Two, who
    // leads a different group) neither sees this group's care space on their
    // dashboard nor reaches it directly — the assigned-group guard bounces
    // them back to /leader, so nothing this Shepherd wrote can render for a
    // peer.
    const peerContext = await browser.newContext({
      baseURL: testInfo.project.use.baseURL,
    });
    try {
      const peerPage = await peerContext.newPage();
      instrumentPage(peerPage, `${testInfo.title} [unrelated shepherd]`);
      await signIn(peerPage, creds.leader2.email!, creds.leader2.password!);
      await peerPage.goto("/leader");
      await expect(
        peerPage.locator(`a[href="/leader/${groupId}/care"]`)
      ).toHaveCount(0);

      await peerPage.goto(`/leader/${groupId}/care`);
      await peerPage.waitForURL(
        (url) => url.pathname === "/leader" || url.pathname === "/unauthorized"
      );
      await expect(peerPage.getByText(careBody)).toHaveCount(0);
      await expect(peerPage.getByText(prayerBody)).toHaveCount(0);
    } finally {
      await peerContext.close();
    }
  });
});
