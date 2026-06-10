import { beforeAll, describe, expect, it } from "vitest";

import {
  assertExecuteLockdown,
  assertPairedAuditInsert,
  assertSecurityDefiner,
  auditEventInserts,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// Static boundary assertions over the invitee-chooses-own-name migration
// (ADR 0025). CI has no Postgres, so these string assertions guard the
// security-critical invariants of the reworked invite RPC and the new
// self-service set_own_full_name RPC.

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration("20260703000000_invitee_chooses_own_name.sql");
});

describe("ADR 0025 migration — profiles.full_name_pending", () => {
  it("adds the pending flag with a non-pending backfill default", () => {
    expect(sql.lower).toContain(
      "add column full_name_pending boolean not null default false"
    );
  });
});

describe("ADR 0025 migration — super_admin_complete_invite", () => {
  it("is SECURITY DEFINER with a pinned search_path", () => {
    assertSecurityDefiner(sql, "super_admin_complete_invite");
  });

  it("keeps the service-role-only gate and the actor recheck", () => {
    const body = functionBody(sql, "super_admin_complete_invite");
    expect(body).toContain("'service_role'");
    expect(body).toContain("edge_function_only");
    expect(body).toContain("invalid_actor");
  });

  it("keeps p_full_name in the signature but optional and ignored", () => {
    const body = functionBody(sql, "super_admin_complete_invite");
    expect(body).toContain("p_full_name text default null");
    // The inviter can never set the name: the old v_full_name plumbing
    // (validation + writes) must be gone entirely.
    expect(body).not.toContain("v_full_name");
  });

  it("inserts fresh profiles with the email placeholder and pending flag", () => {
    const body = functionBody(sql, "super_admin_complete_invite");
    // Column list pairs full_name with the canonical email value, and the
    // pending flag is set in the same insert.
    expect(body).toContain("p_auth_user_id, v_email, v_email, v_phone, p_role");
    expect(body).toContain("full_name_pending");
  });

  it("relinks without overwriting the existing name, marking it pending", () => {
    const body = functionBody(sql, "super_admin_complete_invite");
    // The relink UPDATE no longer touches full_name itself…
    expect(body).not.toMatch(/set[^;]*\bfull_name\s*=/);
    // …but does flip the pending flag so the invitee confirms/edits it.
    expect(body).toContain("full_name_pending = true");
  });

  it("writes a paired invite_user audit row with the summary keys intact", () => {
    assertPairedAuditInsert(
      sql,
      "super_admin_complete_invite",
      "'super_admin.invite_user'"
    );
    const body = functionBody(sql, "super_admin_complete_invite");
    // lib/admin/audit-summary.ts renders these keys; keep them stable.
    for (const key of [
      "'email'",
      "'role'",
      "'groupassignmentstate'",
      "'groupid'",
      "'before'",
      "'after'",
    ]) {
      expect(body).toContain(key);
    }
  });
});

describe("ADR 0025 migration — set_own_full_name", () => {
  it("is SECURITY DEFINER with a pinned search_path", () => {
    assertSecurityDefiner(sql, "set_own_full_name");
  });

  it("gates on the caller's own active profile", () => {
    const body = functionBody(sql, "set_own_full_name");
    expect(body).toContain("auth_user_id = auth.uid()");
    expect(body).toContain("status = 'active'");
    expect(body).toContain("for update");
    expect(body).toContain("insufficient_privilege");
  });

  it("validates the name and only writes while pending", () => {
    const body = functionBody(sql, "set_own_full_name");
    expect(body).toContain("invalid_input");
    expect(body).toContain("char_length(v_name) > 200");
    expect(body).toContain("name_not_pending");
    expect(body).toContain("full_name_pending = false");
  });

  it("writes a paired, content-free audit row", () => {
    assertPairedAuditInsert(
      sql,
      "set_own_full_name",
      "'account.set_own_full_name'"
    );
    const block = auditEventInserts(sql).find((b) =>
      b.includes("account.set_own_full_name")
    );
    expect(block, "audit insert for set_own_full_name").toBeDefined();
    // Presence only: the chosen name itself is never recorded.
    expect(block).not.toContain("v_name");
  });

  it("locks EXECUTE down to authenticated only", () => {
    assertExecuteLockdown(sql, "set_own_full_name", "text");
  });
});
