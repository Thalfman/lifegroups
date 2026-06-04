import { beforeAll, describe, expect, it } from "vitest";

import {
  assertExecuteLockdown,
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// ADR 0014 (#313): static boundary assertions over the Groups slice — the
// block + report dependency rule, the preflight RPC, and the opaque confidential
// hook. CI has no Postgres, so these guard the security-critical invariants.

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration(
    "20260604020000_phase_sad2_permanent_deletion_groups.sql"
  );
});

describe("SAD2 — Groups registration", () => {
  it("registers the group target in the allowlist", () => {
    const body = functionBody(sql, "super_admin_deletable_table");
    expect(body).toContain("'group'");
    expect(body).toContain("'groups'");
  });
});

describe("SAD2 — confidential block hook", () => {
  it("introduces the opaque confidential-block resolver (internal helper)", () => {
    const body = functionBody(sql, "super_admin_confidential_block");
    expect(body).toContain("return false");
    expect(sql.lower).not.toMatch(
      /grant\s+execute\s+on\s+function\s+public\.super_admin_confidential_block/
    );
  });
});

describe("SAD2 — super_admin_permanent_delete refuses blockers", () => {
  it("is SECURITY DEFINER with a pinned search_path", () => {
    assertSecurityDefiner(sql, "super_admin_permanent_delete");
  });

  it("refuses cascade/restrict/no-action blockers with has_blocking_dependents", () => {
    const body = functionBody(sql, "super_admin_permanent_delete");
    expect(body).toContain("super_admin_collect_dependents");
    expect(body).toContain("v_deps->'blockers'");
    expect(body).toContain("jsonb_array_length(v_blockers) > 0");
    expect(body).toContain("raise exception 'has_blocking_dependents'");
  });

  it("refuses confidential records opaquely (has_confidential_records)", () => {
    const body = functionBody(sql, "super_admin_permanent_delete");
    expect(body).toContain("super_admin_confidential_block");
    expect(body).toContain("raise exception 'has_confidential_records'");
  });

  it("refuses BEFORE deleting (blocker check precedes the delete + tombstone)", () => {
    const body = functionBody(sql, "super_admin_permanent_delete");
    expect(
      body.indexOf("raise exception 'has_blocking_dependents'")
    ).toBeLessThan(body.indexOf("delete from public."));
    expect(
      body.indexOf("raise exception 'has_blocking_dependents'")
    ).toBeLessThan(body.indexOf("insert into public.tombstones"));
  });

  it("captures set-null dependents (not blockers) into the tombstone", () => {
    const body = functionBody(sql, "super_admin_permanent_delete");
    expect(body).toContain("v_deps->'set_null'");
  });

  it("writes one paired audit_events row", () => {
    assertPairedAuditInsert(
      sql,
      "super_admin_permanent_delete",
      "'super_admin.permanent_delete'"
    );
  });

  it("locks EXECUTE down to authenticated only", () => {
    assertExecuteLockdown(sql, "super_admin_permanent_delete", "text, uuid");
  });
});

describe("SAD2 — preflight reports blockers", () => {
  it("is SECURITY DEFINER with a pinned search_path", () => {
    assertSecurityDefiner(sql, "super_admin_permanent_delete_preflight");
  });

  it("gates on super_admin", () => {
    expect(
      functionBody(sql, "super_admin_permanent_delete_preflight")
    ).toContain("auth_role() <> 'super_admin'");
  });

  it("names blockers + set-null counts and surfaces the opaque confidential flag", () => {
    const body = functionBody(sql, "super_admin_permanent_delete_preflight");
    expect(body).toContain("super_admin_collect_dependents");
    expect(body).toContain("'blockers'");
    expect(body).toContain("'confidential', true");
    expect(body).toContain("'deletable'");
  });

  it("does not leak ids in the set-null preview (counts only)", () => {
    const body = functionBody(sql, "super_admin_permanent_delete_preflight");
    // The preview rebuilds objects with table/column/count, dropping ids.
    expect(body).toContain("'count', r->'count'");
    expect(body).not.toContain("'ids'");
  });

  it("locks EXECUTE down to authenticated only", () => {
    assertExecuteLockdown(
      sql,
      "super_admin_permanent_delete_preflight",
      "text, uuid"
    );
  });
});
