import { beforeAll, describe, expect, it } from "vitest";

import {
  assertExecuteLockdown,
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";
import {
  HISTORY_RESET_CATEGORIES,
  HISTORY_RESET_CATEGORY_KEYS,
} from "@/lib/admin/history-reset";

// Static boundary assertions over the per-category history-reset migration
// (PRD-SAC6 follow-up). CI has no Postgres, so these string assertions guard the
// security-critical invariants of the two RPCs + the history_reset_snapshots RLS.

const RESET_FN = "super_admin_reset_history_category";
const REVERT_FN = "super_admin_reset_history_category_revert";

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration("20260604080000_phase_sac6_history_reset_category.sql");
});

describe("history-reset migration — history_reset_snapshots table", () => {
  it("enables RLS with a single super-admin SELECT policy and no write policy", () => {
    expect(sql.lower).toContain(
      "alter table public.history_reset_snapshots enable row level security"
    );
    expect(sql.lower).toContain(
      "for select to authenticated using (public.auth_role() = 'super_admin')"
    );
    expect(sql.lower).not.toMatch(/create policy[^;]*for\s+insert/);
    expect(sql.lower).not.toMatch(/create policy[^;]*for\s+update/);
    expect(sql.lower).not.toMatch(/create policy[^;]*for\s+delete/);
  });

  it("grants only SELECT on the table to authenticated", () => {
    expect(sql.lower).toContain(
      "grant  select on public.history_reset_snapshots to authenticated"
    );
  });
});

describe(`history-reset migration — ${RESET_FN}`, () => {
  it("defines the RPC as SECURITY DEFINER with a pinned search_path", () => {
    assertSecurityDefiner(sql, RESET_FN);
  });

  it("gates on auth_role() <> 'super_admin'", () => {
    expect(functionBody(sql, RESET_FN)).toContain(
      "auth_role() <> 'super_admin'"
    );
  });

  it("rejects an unknown category", () => {
    expect(functionBody(sql, RESET_FN)).toContain(
      "raise exception 'invalid_category'"
    );
  });

  it("allow-lists exactly the registry's categories", () => {
    const body = functionBody(sql, RESET_FN);
    for (const category of HISTORY_RESET_CATEGORY_KEYS) {
      expect(body, `${category} should be in the SQL allow-list`).toContain(
        `'${category}'`
      );
    }
  });

  it("serializes on the shared clean_slate advisory lock", () => {
    expect(functionBody(sql, RESET_FN)).toContain(
      "pg_advisory_xact_lock(hashtext('clean_slate'))"
    );
  });

  it("raises nothing_to_wipe when the category is empty", () => {
    expect(functionBody(sql, RESET_FN)).toContain(
      "raise exception 'nothing_to_wipe'"
    );
  });

  it("captures the snapshot BEFORE deleting any history", () => {
    const body = functionBody(sql, RESET_FN);
    const snapshotInsert = body.indexOf(
      "insert into public.history_reset_snapshots"
    );
    const firstHistoryDelete = body.indexOf(
      "delete from public.attendance_records"
    );
    expect(snapshotInsert).toBeGreaterThan(-1);
    expect(firstHistoryDelete).toBeGreaterThan(-1);
    expect(snapshotInsert).toBeLessThan(firstHistoryDelete);
  });

  it("deletes attendance_records before attendance_sessions (FK order)", () => {
    const body = functionBody(sql, RESET_FN);
    const records = body.indexOf("delete from public.attendance_records");
    const sessions = body.indexOf("delete from public.attendance_sessions");
    expect(records).toBeGreaterThan(-1);
    expect(sessions).toBeGreaterThan(-1);
    expect(records).toBeLessThan(sessions);
  });

  it("records schema_version and category in the snapshot payload", () => {
    const body = functionBody(sql, RESET_FN);
    expect(body).toContain("'schema_version', 1");
    expect(body).toContain("'category', p_category");
  });

  it("writes one paired audit_events row for the reset", () => {
    assertPairedAuditInsert(
      sql,
      RESET_FN,
      "'super_admin.reset_history_category'"
    );
  });

  it("locks function EXECUTE down to authenticated only", () => {
    assertExecuteLockdown(sql, RESET_FN, "text");
  });
});

describe(`history-reset migration — ${REVERT_FN}`, () => {
  it("defines the RPC as SECURITY DEFINER with a pinned search_path", () => {
    assertSecurityDefiner(sql, REVERT_FN);
  });

  it("gates on auth_role() <> 'super_admin'", () => {
    expect(functionBody(sql, REVERT_FN)).toContain(
      "auth_role() <> 'super_admin'"
    );
  });

  it("serializes on the shared clean_slate advisory lock", () => {
    expect(functionBody(sql, REVERT_FN)).toContain(
      "pg_advisory_xact_lock(hashtext('clean_slate'))"
    );
  });

  it("raises missing_snapshot when there is nothing to restore", () => {
    expect(functionBody(sql, REVERT_FN)).toContain(
      "raise exception 'missing_snapshot'"
    );
  });

  it("guards target_not_empty before restoring", () => {
    expect(functionBody(sql, REVERT_FN)).toContain(
      "raise exception 'target_not_empty'"
    );
  });

  it("is idempotent on an already-restored snapshot", () => {
    expect(functionBody(sql, REVERT_FN)).toContain("restored_at is not null");
  });

  it("writes one paired audit_events row for the revert", () => {
    assertPairedAuditInsert(
      sql,
      REVERT_FN,
      "'super_admin.reset_history_category_revert'"
    );
  });

  it("locks function EXECUTE down to authenticated only", () => {
    assertExecuteLockdown(sql, REVERT_FN, "uuid");
  });
});

describe("history-reset migration — category coverage", () => {
  it("references every registry table in the migration SQL", () => {
    for (const tables of Object.values(HISTORY_RESET_CATEGORIES)) {
      for (const table of tables) {
        expect(sql.lower, `${table} should be referenced`).toContain(
          `delete from public.${table}`
        );
      }
    }
  });
});
