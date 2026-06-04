import { beforeAll, describe, expect, it } from "vitest";

import {
  assertExecuteLockdown,
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// Static boundary assertions over the Phase IL.1 shareable-invite-links
// migration. CI has no Postgres, so these string assertions guard the
// security-critical invariants of the three RPCs and the new table.

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration("20260604120000_phase_il1_shareable_invite_links.sql");
});

describe("IL.1 migration — invitations table", () => {
  it("creates the table storing only the token hash", () => {
    expect(sql.lower).toContain("create table public.invitations");
    expect(sql.lower).toContain("token_hash text not null unique");
  });

  it("constrains role and ties groups to leader/co_leader only", () => {
    expect(sql.lower).toContain(
      "check (role in ('ministry_admin','over_shepherd','leader','co_leader'))"
    );
    expect(sql.lower).toContain(
      "check (group_id is null or role in ('leader','co_leader'))"
    );
  });

  it("enables RLS with a super_admin SELECT-only policy", () => {
    expect(sql.lower).toContain(
      "alter table public.invitations enable row level security"
    );
    expect(sql.lower).toContain(
      "create policy invitations_super_admin_select on public.invitations"
    );
    expect(sql.lower).toContain("for select to authenticated");
    // No write policies — writes go through the SECURITY DEFINER RPCs.
    expect(sql.lower).not.toContain("for insert");
    expect(sql.lower).not.toContain("for update to");
  });
});

describe("IL.1 migration — super_admin_create_invitation", () => {
  it("is SECURITY DEFINER with a pinned search_path", () => {
    assertSecurityDefiner(sql, "super_admin_create_invitation");
  });

  it("gates on auth_role() = 'super_admin'", () => {
    expect(functionBody(sql, "super_admin_create_invitation")).toContain(
      "auth_role() <> 'super_admin'"
    );
  });

  it("writes a paired create_invite_link audit row", () => {
    assertPairedAuditInsert(
      sql,
      "super_admin_create_invitation",
      "'super_admin.create_invite_link'"
    );
  });

  it("locks EXECUTE down to authenticated only", () => {
    assertExecuteLockdown(
      sql,
      "super_admin_create_invitation",
      "text, public.user_role, uuid, boolean, timestamptz"
    );
  });

  it("rejects expiries outside the future-to-90-days window", () => {
    const body = functionBody(sql, "super_admin_create_invitation");
    expect(body).toContain("invalid_expiry");
    expect(body).toContain("interval '90 days'");
  });
});

describe("IL.1 migration — peek_invitation", () => {
  it("is SECURITY DEFINER and never mutates", () => {
    assertSecurityDefiner(sql, "peek_invitation");
    const body = functionBody(sql, "peek_invitation");
    expect(body).not.toContain("insert into");
    expect(body).not.toContain("update public.invitations");
  });

  it("is callable by anon for the public landing page", () => {
    expect(sql.lower).toContain(
      "grant  execute on function public.peek_invitation(text) to anon, authenticated"
    );
  });
});

describe("IL.1 migration — redeem_invitation", () => {
  it("is SECURITY DEFINER with a service-role-only gate", () => {
    assertSecurityDefiner(sql, "redeem_invitation");
    const body = functionBody(sql, "redeem_invitation");
    expect(body).toContain("'service_role'");
    expect(body).toContain("edge_function_only");
  });

  it("locks the invitation row and re-checks validity before consuming", () => {
    const body = functionBody(sql, "redeem_invitation");
    expect(body).toContain("for update");
    expect(body).toContain("invitation_expired");
    expect(body).toContain("used_count >= v_inv.max_uses");
    expect(body).toContain("used_count = used_count + 1");
  });

  it("never relinks an existing profile (no identity takeover); raises email_taken", () => {
    const body = functionBody(sql, "redeem_invitation");
    // Self-signup only ever inserts a brand-new profile.
    expect(body).toContain("email_taken");
    // The old relink-by-email update must be gone, so a shared link can't be
    // used to seize a pre-created profile/login.
    expect(body).not.toContain("set auth_user_id = p_auth_user_id");
  });

  it("writes a paired self_signup.redeem_invite audit row", () => {
    assertPairedAuditInsert(
      sql,
      "redeem_invitation",
      "'self_signup.redeem_invite'"
    );
  });

  it("grants EXECUTE only to service_role", () => {
    expect(sql.lower).toContain(
      "grant  execute on function public.redeem_invitation(text, uuid, text, text) to service_role"
    );
    expect(sql.lower).not.toContain(
      "grant  execute on function public.redeem_invitation(text, uuid, text, text) to authenticated"
    );
  });
});
