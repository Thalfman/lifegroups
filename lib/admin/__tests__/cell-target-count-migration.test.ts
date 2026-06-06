import { beforeAll, describe, expect, it } from "vitest";

import {
  assertExecuteLockdown,
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// Static boundary assertions over the per-cell target_count write migration
// (#400 / PRD §2.3). CI has no Postgres (RLS verified manually per
// supabase/dev/README.md), so these substring/regex checks are the runnable
// regression guard for the security-critical invariants on the new RPC: an
// admin-only SECURITY DEFINER write with a pinned search_path, a paired audit
// row recording before/after target_count, the per-(type, category) upsert key,
// the live-category guard, and the EXECUTE lockdown.

let sql: MigrationSql;

const FN = "admin_set_category_type_target_count";
const ARGS = "uuid, text, integer";

beforeAll(() => {
  sql = loadMigration("20260613000000_phase_groups3_cell_target_count.sql");
});

describe("cell-target-count migration — does not re-alter the column", () => {
  it("never ALTERs the existing target_count column (it already exists)", () => {
    expect(sql.lower).not.toContain("alter table public.category_type_targets");
    expect(sql.lower).not.toContain("add column");
  });
});

describe("cell-target-count migration — audited write RPC", () => {
  it(`${FN} is SECURITY DEFINER with a pinned search_path`, () => {
    assertSecurityDefiner(sql, FN);
  });

  it(`${FN} gates on auth_is_admin() and a non-null actor`, () => {
    const body = functionBody(sql, FN);
    expect(body).toContain("not public.auth_is_admin()");
    expect(body).toContain("raise exception 'insufficient_privilege'");
    expect(body).toContain("public.auth_profile_id()");
  });

  it(`${FN} writes a paired audit_events row recording the action`, () => {
    assertPairedAuditInsert(sql, FN, "'admin.set_category_type_target_count'");
  });

  it(`${FN} records before/after target_count in the audit metadata`, () => {
    const body = functionBody(sql, FN);
    expect(body).toContain("before_target_count");
    expect(body).toContain("after_target_count");
  });

  it(`${FN} locks down EXECUTE (deny by default, allow authenticated)`, () => {
    assertExecuteLockdown(sql, FN, ARGS);
  });

  it("upserts target_count on the per-(type, category) conflict target", () => {
    const body = functionBody(sql, FN);
    expect(body).toContain(
      "on conflict (audience_category, category_id) do update"
    );
    expect(body).toContain("set target_count = excluded.target_count");
  });

  it("validates a non-negative count and a valid top type", () => {
    const body = functionBody(sql, FN);
    expect(body).toContain("p_count < 0");
    expect(body).toContain("raise exception 'invalid_input'");
    expect(body).toContain(
      "p_audience_category not in ('men','women','mixed')"
    );
  });

  it("refuses to target an archived category", () => {
    const body = functionBody(sql, FN);
    expect(body).toContain("archived_at is null");
    expect(body).toContain("raise exception 'missing_category'");
  });

  it("does not feed any trigger/readiness logic (tracking only)", () => {
    // A target write must not touch the multiplication config or trigger rubric —
    // it only upserts the cell's target_count + writes the audit pair.
    const body = functionBody(sql, FN);
    expect(body).not.toContain("multiplication_config");
    expect(body).not.toContain("trigger_rubric");
  });
});
