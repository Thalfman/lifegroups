import { beforeAll, describe, expect, it } from "vitest";

import {
  assertExecuteLockdown,
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// PRD #745 / slice #747 — static boundary assertions over the migration that
// adds the idempotent single-type append RPC admin_add_group_type. CI has no
// Postgres (RLS verified manually per supabase/dev/README.md), so these
// substring/regex checks are the CI-runnable regression guard that the new write
// path stays an audited SECURITY DEFINER write with the EXECUTE lockdown, appends
// idempotently (case-insensitive no-op), preserves order, and never hard-deletes.

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration("20260711000000_admin_add_group_type.sql");
});

describe("admin_add_group_type migration — audited SECURITY DEFINER write", () => {
  it("defines the 1-arg RPC", () => {
    expect(sql.lower).toContain(
      "create function public.admin_add_group_type(p_group_type text)"
    );
  });

  it("is SECURITY DEFINER with a pinned search_path and the admin guard", () => {
    assertSecurityDefiner(sql, "admin_add_group_type");
    const body = functionBody(sql, "admin_add_group_type");
    expect(body).toContain("if not public.auth_is_admin() then");
    expect(body).toContain("v_actor := public.auth_profile_id();");
  });

  it("validates the name like the list RPC: trim, non-blank, <= 80", () => {
    const body = functionBody(sql, "admin_add_group_type");
    expect(body).toContain("nullif(btrim(coalesce(p_group_type, '')), '')");
    expect(body).toContain("char_length(v_name) > 80");
  });

  it("serializes concurrent appends with a per-key advisory xact lock", () => {
    const body = functionBody(sql, "admin_add_group_type");
    expect(body).toContain("pg_advisory_xact_lock");
    expect(body).toContain("hashtext('group_types')");
  });

  it("appends idempotently (case-insensitive existence check) and preserves order", () => {
    const body = functionBody(sql, "admin_add_group_type");
    // The existence check is case-insensitive over the stored array.
    expect(body).toContain("jsonb_array_elements_text");
    expect(body).toContain("lower(btrim(name)) = lower(v_name)");
    // Append preserves the existing entries (concat the existing list + new name).
    expect(body).toContain("|| to_jsonb(v_name)");
  });

  it("writes a paired audit_events row recording the added name", () => {
    assertPairedAuditInsert(
      sql,
      "admin_add_group_type",
      "'admin.add_group_type'"
    );
    expect(functionBody(sql, "admin_add_group_type")).toContain("'added'");
  });

  it("locks EXECUTE down to authenticated only", () => {
    assertExecuteLockdown(sql, "admin_add_group_type", "text");
  });

  it("never hard-deletes and never uses the service role", () => {
    expect(sql.lower).not.toContain("service_role");
    expect(sql.lower).not.toMatch(/delete\s+from\s+public\./);
  });
});
