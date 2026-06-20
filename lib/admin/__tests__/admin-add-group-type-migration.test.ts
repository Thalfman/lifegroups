import { beforeAll, describe, expect, it } from "vitest";

import {
  assertAuditContentFree,
  assertExecuteLockdown,
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// Static boundary assertions over the #747 inline "Add new type…" migration. CI
// has no Postgres (RLS verified manually), so these substring/regex checks are
// the runnable regression guard: the new write path (admin_add_group_type) must
// be an audited SECURITY DEFINER fn with the EXECUTE lockdown, idempotent
// (case-insensitive no-op + order-preserving append), and race-safe (advisory
// lock keyed on the lowercased name).

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration("20260711000000_admin_add_group_type.sql");
});

describe("admin_add_group_type migration", () => {
  it("defines an audited SECURITY DEFINER fn with the EXECUTE lockdown", () => {
    expect(sql.lower).toContain(
      "create function public.admin_add_group_type(p_group_type text)"
    );
    assertSecurityDefiner(sql, "admin_add_group_type");
    assertPairedAuditInsert(
      sql,
      "admin_add_group_type",
      "'admin.add_group_type'"
    );
    assertExecuteLockdown(sql, "admin_add_group_type", "text");
  });

  it("gates on auth_is_admin() and a present actor", () => {
    const body = functionBody(sql, "admin_add_group_type");
    expect(body).toContain("auth_is_admin()");
    expect(body).toContain("insufficient_privilege");
  });

  it("validates the name: trimmed, non-blank, ≤80 chars", () => {
    const body = functionBody(sql, "admin_add_group_type");
    expect(body).toContain("btrim(coalesce(p_group_type, '')");
    expect(body).toContain("char_length(v_type) > 80");
    expect(body).toContain("invalid_input");
  });

  it("is race-safe via a per-name advisory lock (lowercased identity)", () => {
    const body = functionBody(sql, "admin_add_group_type");
    expect(body).toContain("pg_advisory_xact_lock");
    expect(body).toContain("hashtext(lower(v_type))");
  });

  it("appends idempotently: case-insensitive existence check, order preserved", () => {
    const body = functionBody(sql, "admin_add_group_type");
    // Existence check is case-insensitive over the stored names.
    expect(body).toContain("jsonb_array_elements_text");
    expect(body).toContain("lower(existing.name) = lower(v_type)");
    // The append only runs when the name is absent — existing entries/order are
    // untouched (no full-list rewrite, just `|| to_jsonb`).
    expect(body).toContain("if not v_exists then");
    expect(body).toContain("v_types || to_jsonb(v_type)");
  });

  it("records the type name (a catalog label) but no PII in the audit row", () => {
    assertAuditContentFree(sql, {
      forbidden: ["p_full_name", "email", "phone"],
      required: ["added"],
    });
  });
});
