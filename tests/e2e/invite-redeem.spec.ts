import { test, expect, e2eCreds, instrumentPage, signIn } from "./helpers";
import { e2eDbEnv, ensureSuperAdmin, fetchAuditEvents } from "./db";

// Happy-path shareable-invite-link redemption, end to end (#871; flow from the
// Phase IL invite-links work / ADR 0032). Nothing here is stubbed: a real
// super_admin generates a Leader invite link through the real
// InviteWorkflowForm (superAdminCreateInviteLink → `super_admin_create_invitation`
// SECURITY DEFINER RPC), a fresh browser context redeems it at /invite/<token>
// through the real InviteSignupForm (redeemInviteAction → the `redeem-invite`
// Edge Function → `redeem_invitation` RPC), and the new Leader signs in and
// reaches the real /leader surface under real RLS. It pins:
//
//   1. link mint → self-signup → login, the whole shareable-link path,
//   2. single-use enforcement (the spent link shows the used notice, no form),
//   3. audit pairing on both writes (create_invite_link + redeem_invite),
//      asserted via the service-role helper in ./db.ts.
//
// TOKEN EXTRACTION IS FROM THE UI RESULT — the read-only "Invite link" input
// the form renders after "Generate link". That is deliberate and the only
// possible source: the raw token is NEVER stored (the invitations row keeps
// only its sha256 hash), and the local stack has no mail capture, so the URL
// the super admin would copy is the one artifact carrying the token. The flow
// under test is the shareable-link path ("Generate shareable link" delivery),
// not the named-email invite.
//
// Fixtures: no super_admin is seeded and scripts/seed-test-auth-users.ts
// refuses to create one, so the spec provisions/reuses its own via
// ensureSuperAdmin() (service client, local stack only). The redeemed email is
// unique per run, so re-runs against a persistent stack stay green (the lane
// never hard-deletes anything).

const creds = e2eCreds();
const USED_NOTICE = /This invite link has already been used\./;

test.describe("Invite link redemption pipeline", () => {
  test("Super Admin mints a Leader link; a new Leader redeems it, signs in, and the spent link + audit trail hold", async ({
    page,
    browser,
  }, testInfo) => {
    test.skip(
      e2eDbEnv() === null || !creds.superAdmin.present,
      "E2E service-role env not configured (run via scripts/e2e.sh)"
    );

    // A small clock-skew cushion for the created_at floor on audit reads.
    const testStart = new Date(Date.now() - 30_000).toISOString();
    const superAdmin = await ensureSuperAdmin();

    // --- Mint the link through the real Super-Admin console -----------------
    await signIn(page, superAdmin.email, superAdmin.password);
    await page.goto("/admin/super-admin");
    const main = page.getByRole("main");

    // The console workspaces are client-side tabs; a pre-hydration click is
    // swallowed, so retry until the Access panel's invite card is mounted.
    const deliveryGroup = main.getByRole("radiogroup", {
      name: "Invite delivery",
    });
    await expect(async () => {
      await main.getByRole("tab", { name: "Access" }).click();
      await expect(deliveryGroup).toBeVisible({ timeout: 2_000 });
    }).toPass();

    // Switch the delivery choice to the shareable link; the link path's
    // "Generate link" submit appearing proves React processed the selection.
    const generateButton = main.getByRole("button", { name: "Generate link" });
    await expect(async () => {
      await deliveryGroup
        .getByRole("radio", { name: "Generate shareable link" })
        .click();
      await expect(generateButton).toBeVisible({ timeout: 2_000 });
    }).toPass();

    // Role: Leader (the select's default, pinned explicitly; the value is the
    // code identity `leader` — the visible label says Shepherd, ADR 0025).
    // Expiry keeps its 7-day default.
    const roleSelect = main.locator("#invite-workflow-role");
    await roleSelect.selectOption("leader");
    await expect(roleSelect).toHaveValue("leader");

    await generateButton.click();
    // The minted URL lands in client state only (the raw token exists nowhere
    // else), so unlike the other specs' #839 pattern there is no
    // reload-and-recover fallback — a reload would discard the token. Lean on
    // a long budget instead: the action is one RPC round-trip.
    const linkInput = main.getByLabel("Invite link");
    await expect(linkInput).toBeVisible({ timeout: 60_000 });
    const inviteUrl = await linkInput.inputValue();
    const invitePath = new URL(inviteUrl).pathname;
    expect(invitePath).toMatch(/^\/invite\/.+/);

    // --- Redeem it from a fresh, signed-out browser context -----------------
    // A manually created context does not inherit the fixture context's
    // baseURL — pass it through so relative gotos resolve.
    const inviteeContext = await browser.newContext({
      baseURL: testInfo.project.use.baseURL,
    });
    try {
      const inviteePage = await inviteeContext.newPage();
      // Fixture pages are instrumented by the extended `test`; this manually
      // created page drives the redeem write, so cover it too (#839).
      instrumentPage(inviteePage, `${testInfo.title} [invitee context]`);

      await inviteePage.goto(invitePath);
      const inviteeMain = inviteePage.getByRole("main");
      await expect(
        inviteeMain.getByRole("heading", { name: "Set up your login" })
      ).toBeVisible();

      const stamp = `${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      const email = `invite-e2e-${stamp}@lifegroups.local`;
      const password = `E2E-invite-pw-${stamp}`;
      await inviteePage.locator("#full_name").fill("E2E Invited Leader");
      await inviteePage.locator("#email").fill(email);
      await inviteePage.locator("#password").fill(password);
      await inviteePage.locator("#confirm").fill(password);
      await inviteePage.getByRole("button", { name: "Create account" }).click();

      // Success = redirect("/login?invited=1"). The redeem action calls the
      // timing-floor-padded `redeem-invite` Edge Function, so the budget is
      // generous; tolerate the #839 stall class on top — the RPC commits
      // before the response stream stalls, so on the stall path the reloaded
      // invite page must already show the spent-link notice.
      const redirected = await inviteePage
        .waitForURL(/\/login\?invited=1/, { timeout: 60_000 })
        .then(() => true)
        .catch(() => false);
      if (!redirected) {
        console.log(
          "[e2e] invite redeem: no redirect in 60s, probing the spent link"
        );
        await inviteePage.goto(invitePath);
        await expect(inviteePage.getByText(USED_NOTICE)).toBeVisible();
      }

      // --- The new Leader signs in and reaches the Leader surface -----------
      // Leader surface is default-on (ADR 0024). The invitation carried no
      // group_id, so the empty state is expected — the surface itself is the
      // assertion (heading = "Your care" + the italic "space" suffix).
      await signIn(inviteePage, email, password);
      await inviteePage.goto("/leader");
      await expect(
        inviteePage
          .getByRole("main")
          .getByRole("heading", { name: /Your care/ })
      ).toBeVisible();

      // --- Single-use: the spent link shows the notice and no form ----------
      await inviteePage.goto(invitePath);
      await expect(inviteePage.getByText(USED_NOTICE)).toBeVisible();
      await expect(inviteePage.locator("#full_name")).toHaveCount(0);

      // --- Audit pairing, from the DB (service-role, test process only) -----
      // Mint: actor = the super admin, entity = the invitations row.
      const mintRows = await fetchAuditEvents({
        action: "super_admin.create_invite_link",
        actorProfileId: superAdmin.profileId,
        since: testStart,
      });
      const mintRow = mintRows.find(
        (r) => r.entity_type === "invitations" && r.metadata.role === "leader"
      );
      expect(
        mintRow,
        "expected a super_admin.create_invite_link audit row"
      ).toBeTruthy();
      expect(mintRow!.entity_id).toBeTruthy();

      // Redeem: entity = the NEW profile; the actor is the inviting super
      // admin (the redeemer has no profile until this row creates it), and
      // the metadata carries the redeemed email — this run's unique handle.
      const redeemRows = await fetchAuditEvents({
        action: "self_signup.redeem_invite",
        since: testStart,
      });
      const redeemRow = redeemRows.find((r) => r.metadata.email === email);
      expect(
        redeemRow,
        "expected a self_signup.redeem_invite audit row"
      ).toBeTruthy();
      expect(redeemRow!.entity_type).toBe("profiles");
      expect(redeemRow!.entity_id).toBeTruthy();
      expect(redeemRow!.actor_profile_id).toBe(superAdmin.profileId);
    } finally {
      await inviteeContext.close();
    }
  });
});
