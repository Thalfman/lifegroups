import { beforeAll, describe, expect, it } from "vitest";

import {
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// ADR 0014 (#313 follow-up): the collect_dependents hardening so id-less
// dependent tables (group_metric_settings) don't trip a raw error.

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration(
    "20260604060000_phase_sad6_collect_dependents_idless_fix.sql"
  );
});

describe("SAD6 — collect_dependents id-less fix", () => {
  it("counts blocker children without reading their id", () => {
    const body = functionBody(sql, "super_admin_collect_dependents");
    // The count query selects count(*) only — no t.id.
    expect(body).toContain("select count(*) from public.%i t");
  });

  it("only reads child ids inside the set-null branch", () => {
    const body = functionBody(sql, "super_admin_collect_dependents");
    const setNullBranch = body.indexOf("if r.del_action = 'n' then");
    const idAgg = body.indexOf("jsonb_agg(t.id)");
    expect(setNullBranch).toBeGreaterThan(-1);
    expect(idAgg).toBeGreaterThan(setNullBranch);
    // There is exactly one id-read, and it lives in the set-null branch.
    expect(body.split("jsonb_agg(t.id)")).toHaveLength(2);
  });

  it("still buckets by FK action and returns blockers + set_null", () => {
    const body = functionBody(sql, "super_admin_collect_dependents");
    expect(body).toContain("confdeltype");
    expect(body).toContain("'blockers'");
    expect(body).toContain("'set_null'");
  });

  it("stays an internal helper (no EXECUTE grant)", () => {
    expect(sql.lower).not.toMatch(
      /grant\s+execute\s+on\s+function\s+public\.super_admin_collect_dependents/
    );
  });
});
