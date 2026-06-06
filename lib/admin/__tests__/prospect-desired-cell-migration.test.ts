import { beforeAll, describe, expect, it } from "vitest";

import {
  assertExecuteLockdown,
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// Static boundary assertions over the #399 desired-cell migration. CI has no
// Postgres (RLS verified manually), so these substring/regex checks are the
// CI-runnable regression guard: the two new nullable columns + their domain
// CHECK + FK, the per-cell index, and the extended admin_create_prospect RPC
// (SECURITY DEFINER, pinned search_path, admin gate, paired audit, EXECUTE
// lockdown on the NEW 5-arg signature, old 3-arg overload dropped).

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration("20260612000000_phase_groups2_prospect_desired_cell.sql");
});

describe("prospect desired-cell migration — columns", () => {
  it("adds desired_audience_category + desired_category_id, both nullable", () => {
    expect(sql.lower).toContain("alter table public.prospects");
    expect(sql.lower).toContain(
      "add column if not exists desired_audience_category text"
    );
    expect(sql.lower).toContain(
      "add column if not exists desired_category_id uuid"
    );
  });

  it("FKs desired_category_id to the catalog with on delete set null", () => {
    expect(sql.lower).toContain(
      "references public.group_categories(id) on delete set null"
    );
  });

  it("guards the audience_category domain (men/women/mixed or null)", () => {
    expect(sql.lower).toContain("prospects_desired_audience_valid");
    expect(sql.lower).toMatch(
      /desired_audience_category is null\s*\n?\s*or desired_audience_category in \('men','women','mixed'\)/
    );
  });

  it("indexes the desired cell for the interested, non-archived tally", () => {
    expect(sql.lower).toContain("prospects_desired_cell_idx");
    expect(sql.lower).toContain(
      "(desired_audience_category, desired_category_id)"
    );
    expect(sql.lower).toContain(
      "where archived = false and state = 'interested'"
    );
  });
});

describe("prospect desired-cell migration — extended create RPC", () => {
  it("re-defines admin_create_prospect as SECURITY DEFINER with a pinned search_path", () => {
    assertSecurityDefiner(sql, "admin_create_prospect");
  });

  it("accepts the two new desired-cell params", () => {
    const body = functionBody(sql, "admin_create_prospect");
    expect(body).toContain("p_desired_audience_category");
    expect(body).toContain("p_desired_category_id");
  });

  it("guards on auth_is_admin() and resolves the actor server-side", () => {
    const body = functionBody(sql, "admin_create_prospect");
    expect(body).toContain("if not public.auth_is_admin() then");
    expect(body).toContain("v_actor := public.auth_profile_id();");
  });

  it("re-validates the desired audience_category domain in SQL", () => {
    const body = functionBody(sql, "admin_create_prospect");
    expect(body).toContain("not in ('men','women','mixed')");
    expect(body).toContain("raise exception 'invalid_input'");
  });

  it("rejects a half-set desired cell (both-or-neither)", () => {
    const body = functionBody(sql, "admin_create_prospect");
    // Exactly one coordinate present is not a real cell — rejected before insert.
    expect(body).toContain("(v_audience is null) <> (v_category is null)");
    expect(body).toContain("raise exception 'invalid_input'");
  });

  it("rejects a desired cell that isn't an active cell for the top type", () => {
    const body = functionBody(sql, "admin_create_prospect");
    // A named cell must be an active (audience × category) cell joined to the
    // live catalog, so hidden/inactive/archived cells stay out of the tally.
    expect(body).toContain("public.category_type_targets ctt");
    expect(body).toContain("ctt.audience_category = v_audience");
    expect(body).toContain("ctt.active");
    expect(body).toContain("archived_at is null");
    expect(body).toContain("raise exception 'inactive_cell'");
  });

  it("stores the desired cell on the inserted prospect", () => {
    const body = functionBody(sql, "admin_create_prospect");
    expect(body).toContain("desired_audience_category");
    expect(body).toContain("desired_category_id");
  });

  it("writes a paired audit_events row recording desired-cell presence (no PII)", () => {
    assertPairedAuditInsert(
      sql,
      "admin_create_prospect",
      "'admin.create_prospect'"
    );
    const body = functionBody(sql, "admin_create_prospect");
    expect(body).toContain("'prospects'");
    expect(body).toContain("has_desired_cell");
  });

  it("locks the NEW 5-arg overload's EXECUTE down to authenticated only", () => {
    assertExecuteLockdown(
      sql,
      "admin_create_prospect",
      "text, text, text, text, uuid"
    );
  });

  it("drops the old 3-arg overload so only the extended create path remains", () => {
    expect(sql.lower).toContain(
      "drop function if exists public.admin_create_prospect(text, text, text)"
    );
  });
});
