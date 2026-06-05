import { beforeAll, describe, expect, it } from "vitest";

import {
  assertExecuteLockdown,
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// Danger-Zone consolidation: super_admin_reset_all must compose the existing
// audited RPCs (launch prep + both global attention resets) in one transaction,
// with a fixed advisory-lock order and a paired audit row. Static assertions
// over the CREATE migration so the composition + lock-order guarantees can't
// silently regress (CI has no Postgres; see migration-safety.ts).

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration("20260606120000_phase_sac6_reset_all.sql");
});

describe("Danger-Zone reset all — super_admin_reset_all", () => {
  it("is SECURITY DEFINER with a pinned search_path", () => {
    assertSecurityDefiner(sql, "super_admin_reset_all");
  });

  it("gates on super_admin and a resolvable actor", () => {
    const body = functionBody(sql, "super_admin_reset_all");
    expect(body).toContain("public.auth_role() <> 'super_admin'");
    expect(body).toContain("raise exception 'insufficient_privilege'");
    expect(body).toContain("public.auth_profile_id()");
  });

  it("takes both advisory locks, clean_slate BEFORE attention_reset", () => {
    const body = functionBody(sql, "super_admin_reset_all");
    const cleanSlateLock = body.indexOf(
      "pg_advisory_xact_lock(hashtext('clean_slate'))"
    );
    const attentionLock = body.indexOf(
      "pg_advisory_xact_lock(hashtext('attention_reset'))"
    );
    expect(cleanSlateLock).toBeGreaterThan(-1);
    expect(attentionLock).toBeGreaterThan(-1);
    // Fixed order rules out a lock-ordering deadlock against a concurrent reset.
    expect(cleanSlateLock).toBeLessThan(attentionLock);
  });

  it("composes launch prep + both global attention resets, after the locks", () => {
    const body = functionBody(sql, "super_admin_reset_all");
    const attentionLock = body.indexOf(
      "pg_advisory_xact_lock(hashtext('attention_reset'))"
    );
    const launchPrep = body.indexOf("public.super_admin_launch_prep()");
    const care = body.indexOf(
      "public.super_admin_reset_care_attention('global', null)"
    );
    const health = body.indexOf(
      "public.super_admin_reset_health_attention('global', null)"
    );
    expect(launchPrep).toBeGreaterThan(attentionLock);
    expect(care).toBeGreaterThan(launchPrep);
    expect(health).toBeGreaterThan(care);
  });

  it("does NOT re-implement the wipe — it has no own nothing_to_wipe handling", () => {
    const body = functionBody(sql, "super_admin_reset_all");
    // Idempotency comes from the composed RPCs (launch_prep swallows it; the
    // attention resets never raise it), so reset_all must not add its own.
    expect(body).not.toContain("nothing_to_wipe");
    expect(body).not.toContain("delete from public.");
  });

  it("writes a paired super_admin.reset_all audit row", () => {
    assertPairedAuditInsert(
      sql,
      "super_admin_reset_all",
      "'super_admin.reset_all'"
    );
  });

  it("locks down EXECUTE to authenticated only", () => {
    assertExecuteLockdown(sql, "super_admin_reset_all");
  });
});
