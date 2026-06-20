import { beforeAll, describe, expect, it } from "vitest";

import { validateCreateProspectPayload } from "@/lib/admin/validation/prospects";
import {
  assertExecuteLockdown,
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// PRD #745 / slice #746 — static boundary assertions over the migration that adds
// the optional free-text `desired_group_type` to prospects and re-creates
// admin_create_prospect to thread it. CI has no Postgres (RLS verified manually
// per supabase/dev/README.md), so these substring/regex checks are the
// CI-runnable regression guard that the new field stays additive, nullable,
// length-bounded, on the existing audited SECURITY DEFINER write path, and that
// the prior 3-arg RPC signature is dropped in favour of the 4-arg shape.

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration("20260710000000_prospect_desired_group_type.sql");
});

describe("desired_group_type migration — additive, nullable column", () => {
  it("adds the column with `add column if not exists` (no breaking reshape)", () => {
    expect(sql.lower).toContain(
      "add column if not exists desired_group_type text"
    );
  });

  it("bounds the value to <= 80 chars while allowing null (mirrors groups.group_type)", () => {
    expect(sql.lower).toMatch(
      /desired_group_type is null or char_length\(desired_group_type\) <= 80/
    );
  });

  it("never makes the column NOT NULL and is not FK-constrained to the catalog", () => {
    expect(sql.lower).not.toContain("desired_group_type text not null");
    expect(sql.lower).not.toContain("desired_group_type text references");
  });
});

describe("desired_group_type migration — audited write path", () => {
  it("re-creates admin_create_prospect as SECURITY DEFINER with a pinned search_path", () => {
    assertSecurityDefiner(sql, "admin_create_prospect");
  });

  it("keeps the admin guard and server-side actor resolution", () => {
    const body = functionBody(sql, "admin_create_prospect");
    expect(body).toContain("if not public.auth_is_admin() then");
    expect(body).toContain("v_actor := public.auth_profile_id();");
  });

  it("threads + normalizes the new param (trim, empty -> null, <= 80) and persists it", () => {
    const body = functionBody(sql, "admin_create_prospect");
    expect(body).toContain("p_desired_group_type text");
    expect(body).toContain(
      "nullif(btrim(coalesce(p_desired_group_type, '')), '')"
    );
    expect(body).toContain("char_length(v_desired_type) > 80");
    expect(body).toContain("desired_group_type");
  });

  it("records the desired type in the paired audit_events metadata (shared vocab, not PII)", () => {
    assertPairedAuditInsert(
      sql,
      "admin_create_prospect",
      "'admin.create_prospect'"
    );
    expect(functionBody(sql, "admin_create_prospect")).toContain(
      "'desired_group_type'"
    );
  });

  it("drops the prior 3-arg signature so callers must use the 4-arg shape", () => {
    expect(sql.lower).toContain(
      "drop function if exists public.admin_create_prospect(text, text, text)"
    );
  });

  it("locks EXECUTE on the new 4-arg RPC down to authenticated only", () => {
    assertExecuteLockdown(
      sql,
      "admin_create_prospect",
      "text, text, text, text"
    );
  });

  it("does not re-create admin_update_prospect (out of this slice) or hard-delete", () => {
    // The update RPC stays as-is; this slice only re-creates the create RPC.
    expect(sql.lower).not.toMatch(
      /create\s+(?:or\s+replace\s+)?function\s+public\.admin_update_prospect/
    );
    expect(sql.lower).not.toContain("service_role");
    expect(sql.lower).not.toMatch(/delete\s+from\s+public\.prospects/);
  });
});

describe("validateCreateProspectPayload — desired group type", () => {
  const NAME = { full_name: "Pat Prospect" };

  it("trims a chosen type and round-trips it", () => {
    const r = validateCreateProspectPayload({
      ...NAME,
      desired_group_type: "  Men's  ",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.desired_group_type).toBe("Men's");
  });

  it("treats an absent or blank type as not set (null)", () => {
    const absent = validateCreateProspectPayload({ ...NAME });
    expect(absent.ok).toBe(true);
    if (absent.ok) expect(absent.value.desired_group_type).toBeNull();

    const blank = validateCreateProspectPayload({
      ...NAME,
      desired_group_type: "   ",
    });
    expect(blank.ok).toBe(true);
    if (blank.ok) expect(blank.value.desired_group_type).toBeNull();
  });

  it("rejects a type longer than 80 characters", () => {
    const r = validateCreateProspectPayload({
      ...NAME,
      desired_group_type: "x".repeat(81),
    });
    expect(r.ok).toBe(false);
  });
});
