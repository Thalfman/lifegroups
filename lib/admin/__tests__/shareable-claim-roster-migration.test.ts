import { beforeAll, describe, expect, it } from "vitest";

import {
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// Static boundary assertions over the Phase IL.4 roster-claim change to
// redeem_invitation. CI has no Postgres, so these guard the claim path's
// invariants (and that it preserves the IL.3 cap) as string assertions.

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration("20260626000000_phase_il4_shareable_claim_roster.sql");
});

describe("IL.4 migration — redeem_invitation roster claim", () => {
  it("keeps the service-role-only SECURITY DEFINER boundary", () => {
    assertSecurityDefiner(sql, "redeem_invitation");
    const body = functionBody(sql, "redeem_invitation");
    expect(body).toContain("'service_role'");
    expect(body).toContain("edge_function_only");
  });

  it("preserves the IL.3 hourly per-invitation cap under the row lock", () => {
    const body = functionBody(sql, "redeem_invitation");
    expect(body).toContain("for update");
    expect(body).toContain("'self_signup.redeem_invite'");
    expect(body).toContain("interval '1 hour'");
    expect(body).toContain("metadata ->> 'invitationid'");
    expect(body).toContain("v_redeem_cap_per_hour");
    expect(body).toContain("rate_limited");
  });

  it("claims a no-login roster profile but rejects real logins and super_admins", () => {
    const body = functionBody(sql, "redeem_invitation");
    // A profile already linked to a login is rejected with the generic token
    // (the edge fn maps email_taken -> email_unavailable).
    expect(body).toContain("v_existing_auth is not null");
    expect(body).toContain("email_taken");
    // A super_admin roster row is never claimable via a shared link.
    expect(body).toContain("'super_admin'::public.user_role");
    expect(body).toContain("forbidden_target");
    // The claim relinks the existing row + activates it; auth_user_id is UNIQUE
    // so a collision surfaces a stable conflict token.
    expect(body).toContain("auth_user_id = p_auth_user_id");
    expect(body).toContain("v_relinked");
    expect(body).toContain("profile_write_conflict");
    // The existing-login rejection precedes the brand-new insert.
    expect(body.indexOf("v_existing_auth is not null")).toBeLessThan(
      body.indexOf("insert into public.profiles")
    );
  });

  it("never changes role/group on a claim (group assignment gated on a fresh insert)", () => {
    const body = functionBody(sql, "redeem_invitation");
    // Group assignment runs only for a brand-new profile, never on a claim:
    // the `not v_relinked` gate precedes the group_leaders write.
    expect(body).toContain("not v_relinked");
    expect(body.indexOf("not v_relinked")).toBeLessThan(
      body.indexOf("insert into public.group_leaders")
    );
  });

  it("keeps EXECUTE locked to service_role only", () => {
    expect(sql.lower).toContain(
      "grant  execute on function public.redeem_invitation(text, uuid, text, text) to service_role"
    );
  });

  it("revokes EXECUTE from public/anon/authenticated", () => {
    expect(sql.lower).toContain(
      "revoke all     on function public.redeem_invitation(text, uuid, text, text) from public"
    );
    expect(sql.lower).toContain("from anon");
    expect(sql.lower).toContain("from authenticated");
  });
});
