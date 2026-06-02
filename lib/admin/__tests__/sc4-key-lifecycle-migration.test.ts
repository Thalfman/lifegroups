import { beforeAll, describe, expect, it } from "vitest";

import {
  assertAuditContentFree,
  assertExcludesSuperAdmin,
  assertExecuteLockdown,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// Static boundary assertions over the SC.4 key-lifecycle migration (#113):
// add a passkey slot, rotate the recovery code, remove a slot. Same posture as
// the #112 migration: ministry_admin-only SECURITY DEFINER RPCs, actor-derived,
// content-free audit, EXECUTE lockdown. CI has no Postgres, so these guard the
// security-critical invariants — now via the shared migration-safety vocabulary
// (see ./migration-safety.ts) rather than re-spelled substring matches.

const FNS = [
  "admin_add_private_note_key_slot",
  "admin_rotate_private_note_recovery",
  "admin_remove_private_note_key_slot",
];

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration("20260529009000_phase_sc4_key_lifecycle.sql");
});

describe("SC.4 key-lifecycle — RPCs are SECURITY DEFINER and ministry_admin-only", () => {
  it("defines all three lifecycle RPCs with a pinned search_path and the role gate", () => {
    for (const fn of FNS) {
      assertSecurityDefiner(sql, fn);
      expect(functionBody(sql, fn)).toContain("auth_role() = 'ministry_admin'");
    }
  });

  it("never uses auth_is_admin() and never accepts created_by from the client", () => {
    assertExcludesSuperAdmin(sql);
    expect(sql.lower).not.toContain("p_created_by");
    expect(sql.lower).toContain("public.auth_profile_id()");
  });

  it("adds no RLS policies or write grants (writes flow only through these RPCs)", () => {
    expect(sql.lower).not.toMatch(/create policy/);
    expect(sql.lower).not.toMatch(/for\s+insert/);
    expect(sql.lower).not.toMatch(/grant\s+(insert|update|delete|select)/);
  });
});

describe("SC.4 key-lifecycle — slot rules", () => {
  it("add-slot only accepts passkey slots (recovery is rotated, not added)", () => {
    const body = functionBody(sql, "admin_add_private_note_key_slot");
    expect(body).toContain("passkey");
    // It must reject a recovery slot_type through this RPC.
    expect(body).toMatch(
      /slot_type[\s\S]*recovery|recovery[\s\S]*invalid_input/
    );
    expect(body).toContain("octet_length"); // byte-length validation
  });

  it("rotate deletes the existing recovery slot and inserts the replacement", () => {
    const body = functionBody(sql, "admin_rotate_private_note_recovery");
    expect(body).toMatch(/delete from public\.shepherd_care_note_key_slots/);
    expect(body).toContain("'recovery'");
    expect(body).toContain("octet_length");
  });

  it("remove refuses to delete the last remaining slot", () => {
    const body = functionBody(sql, "admin_remove_private_note_key_slot");
    expect(body).toContain("cannot_remove_last_slot");
  });
});

describe("SC.4 key-lifecycle — audit is content-free", () => {
  it("records presence/labels only, never key material", () => {
    assertAuditContentFree(sql, {
      forbidden: [
        "wrapped_dek",
        "prf_salt",
        "hkdf_salt",
        "wrap_iv",
        "recovery_code",
        "p_wrapped_dek",
        "p_prf_salt",
      ],
    });
  });
});

describe("SC.4 key-lifecycle — EXECUTE lockdown", () => {
  it("revokes then grants execute to authenticated for each RPC", () => {
    for (const fn of FNS) {
      assertExecuteLockdown(sql, fn);
    }
  });
});
