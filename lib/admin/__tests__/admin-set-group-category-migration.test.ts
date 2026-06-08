import { beforeAll, describe, expect, it } from "vitest";

import {
  assertExecuteLockdown,
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// Static boundary assertions over the focused "tag an existing group into a
// cell" write migration (Settings › Groups "+ Add existing group"). CI has no
// Postgres (RLS verified manually per supabase/dev/README.md), so these
// substring/regex checks are the runnable regression guard for the
// security-critical invariants: an admin-only SECURITY DEFINER write with a
// pinned search_path, a paired audit row, the row lock + closed-group guard +
// active-cell gate, the narrow (cell-only) update, and the EXECUTE lockdown.

let sql: MigrationSql;

const FN = "admin_set_group_category";
const ARGS = "uuid, public.group_audience_category, uuid";

beforeAll(() => {
  sql = loadMigration("20260626000000_admin_set_group_category.sql");
});

describe("admin_set_group_category migration — audited write RPC", () => {
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
    assertPairedAuditInsert(sql, FN, "'admin.set_group_category'");
  });

  it(`${FN} records the before/after cell in the audit metadata`, () => {
    const body = functionBody(sql, FN);
    expect(body).toContain("'before', v_before");
    expect(body).toContain("'audience_category', p_audience_category");
    expect(body).toContain("'category_id', p_category_id");
  });

  it(`${FN} locks down EXECUTE (deny by default, allow authenticated)`, () => {
    assertExecuteLockdown(sql, FN, ARGS);
  });
});

describe("admin_set_group_category migration — correctness guards", () => {
  it("locks the group row before mutating it", () => {
    const body = functionBody(sql, FN);
    expect(body).toContain("for update");
  });

  it("refuses a closed group", () => {
    const body = functionBody(sql, FN);
    expect(body).toContain("closed_at");
    expect(body).toContain("raise exception 'group_closed'");
  });

  it("refuses a missing group", () => {
    const body = functionBody(sql, FN);
    expect(body).toContain("raise exception 'missing_group'");
  });

  it("requires a concrete (non-null) category", () => {
    const body = functionBody(sql, FN);
    expect(body).toContain("p_category_id is null");
    expect(body).toContain("raise exception 'invalid_input'");
  });

  it("gates on an active, non-archived (audience × category) cell", () => {
    const body = functionBody(sql, FN);
    expect(body).toContain("public.category_type_targets");
    expect(body).toContain("ctt.active");
    expect(body).toContain("archived_at is null");
    expect(body).toContain("raise exception 'inactive_cell'");
  });

  it("updates ONLY the cell — never the group's other columns", () => {
    const body = functionBody(sql, FN);
    expect(body).toContain("set audience_category = p_audience_category");
    expect(body).toContain("category_id       = p_category_id");
    // The RPC takes no other writable columns, so a concurrent edit to
    // name/schedule/capacity can't be replayed and clobbered here.
    expect(body).not.toContain("p_name");
    expect(body).not.toContain("p_meeting_time");
    expect(body).not.toContain("p_capacity");
    expect(body).not.toContain("p_launched_on");
  });
});
