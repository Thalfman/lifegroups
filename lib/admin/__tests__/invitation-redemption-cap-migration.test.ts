import { beforeAll, describe, expect, it } from "vitest";

import {
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// Static boundary assertions over the Phase IL.3 per-invitation redemption cap.
// CI has no Postgres, so these guard the cap's invariants as string assertions.

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration("20260604140000_phase_il3_invitation_redemption_cap.sql");
});

describe("IL.3 migration — redeem_invitation per-invitation cap", () => {
  it("keeps the service-role-only SECURITY DEFINER boundary", () => {
    assertSecurityDefiner(sql, "redeem_invitation");
    const body = functionBody(sql, "redeem_invitation");
    expect(body).toContain("'service_role'");
    expect(body).toContain("edge_function_only");
  });

  it("enforces an hourly per-invitation redemption cap under the row lock", () => {
    const body = functionBody(sql, "redeem_invitation");
    // The invitation row is locked before the cap check.
    expect(body).toContain("for update");
    // Cap counts this invitation's recent redemptions from the audit trail.
    expect(body).toContain("'self_signup.redeem_invite'");
    expect(body).toContain("interval '1 hour'");
    // functionBody() lowercases the SQL, so match the lowercased literal.
    expect(body).toContain("metadata ->> 'invitationid'");
    expect(body).toContain("v_redeem_cap_per_hour");
    expect(body).toContain("rate_limited");
    // Cap is evaluated before the new profile is created.
    expect(body.indexOf("rate_limited")).toBeLessThan(
      body.indexOf("insert into public.profiles")
    );
  });

  it("still keeps EXECUTE locked to service_role only", () => {
    expect(sql.lower).toContain(
      "grant  execute on function public.redeem_invitation(text, uuid, text, text) to service_role"
    );
  });

  // The redeem RPC is service-role-only (not the authenticated lockdown shape),
  // so assert the revokes explicitly.
  it("revokes EXECUTE from public/anon/authenticated", () => {
    expect(sql.lower).toContain(
      "revoke all     on function public.redeem_invitation(text, uuid, text, text) from public"
    );
    expect(sql.lower).toContain("from anon");
    expect(sql.lower).toContain("from authenticated");
  });
});
