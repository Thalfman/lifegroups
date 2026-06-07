import { beforeAll, describe, expect, it } from "vitest";

import {
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// Static boundary assertions over the audit-`before` advisory-lock migration
// (#415 / ADR 0022). CI has no Postgres, so these substring/regex checks are the
// runnable regression guard for Decision 2 of ADR 0022: the FOUR "bare"
// pre-read+upsert admin RPCs — those that lock only their own conflict row and so
// have nothing else to serialise on — take a per-key `pg_advisory_xact_lock`
// BEFORE the snapshot, so the audited `before` can never be `null` on a
// first-insert race. The migration recreates each function verbatim plus the
// lock; these tests also pin that the security-critical envelope (SECURITY
// DEFINER + pinned search_path, the top-level jsonb_typeof re-guard, the paired
// audit row) survived the recreation.

const MIGRATION =
  "20260617000000_phase_groups7_audit_before_advisory_locks.sql";

// The bare pre-read+upsert RPCs this migration locks, with the table the lock key
// is namespaced to. The exemplar `admin_set_audience_readiness_rule` (#414) lives
// in its own migration and is asserted there. `reguardsJsonb` is false for the
// church-attendance snapshot — it takes scalar args (date/int/text), so it has no
// jsonb payload to re-guard with jsonb_typeof.
const LOCKED: ReadonlyArray<{
  fn: string;
  table: string;
  reguardsJsonb: boolean;
}> = [
  {
    fn: "admin_set_readiness_rule",
    table: "multiplication_readiness_rule",
    reguardsJsonb: true,
  },
  {
    fn: "admin_set_multiplication_config",
    table: "multiplication_config",
    reguardsJsonb: true,
  },
  {
    fn: "admin_set_health_rubric",
    table: "health_rubrics",
    reguardsJsonb: true,
  },
  {
    fn: "admin_record_church_attendance_snapshot",
    table: "church_attendance_snapshots",
    reguardsJsonb: false,
  },
];

// The siblings ADR 0022 records as already serialised by a parent-row FOR UPDATE
// or an ON CONFLICT DO NOTHING pre-create. They must NOT be touched here — adding
// a redundant lock is exactly what the targeted rollout avoids.
const UNTOUCHED = [
  "admin_set_cell_trigger_overrides",
  "admin_set_category_type_cell",
  "admin_set_category_type_target_count",
  "admin_set_group_health_ratings",
  "admin_upsert_group_health_assessment",
  "admin_set_group_rubric_grade",
  "admin_set_leader_rubric_grade",
  "admin_upsert_group_metric_settings",
  "admin_upsert_shepherd_care_profile",
];

// Strip SQL line comments so substring/position checks see only executable SQL.
// The lock's own explanatory comment mentions "FOR UPDATE" and "ON CONFLICT", so
// an un-stripped ordering check would find those words in the comment, not the
// statements, and mis-order the lock against them.
const stripComments = (body: string): string => body.replace(/--[^\n]*/g, "");

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration(MIGRATION);
});

describe("audit-before advisory locks — references the issue and ADR", () => {
  it("cites #415 and ADR 0022 in the documentary header", () => {
    expect(sql.raw).toContain("#415");
    expect(sql.lower).toContain("adr 0022");
  });

  it("recreates exactly the four bare pre-read+upsert RPCs — no scope creep", () => {
    const defs = sql.lower.match(/create\s+or\s+replace\s+function/g) ?? [];
    expect(defs.length).toBe(LOCKED.length);
  });

  it("leaves the already-serialised siblings untouched", () => {
    for (const fn of UNTOUCHED) {
      expect(
        sql.lower,
        `${fn} is already serialised (ADR 0022) and must not be redefined here`
      ).not.toContain(`function public.${fn}(`);
    }
  });
});

describe.each(LOCKED)(
  "audit-before advisory lock — $fn",
  ({ fn, table, reguardsJsonb }) => {
    it("takes a per-key pg_advisory_xact_lock namespaced to its table", () => {
      const body = functionBody(sql, fn);
      expect(body, `${fn} should take an advisory xact lock`).toContain(
        "pg_advisory_xact_lock"
      );
      expect(
        body,
        `${fn} lock should be namespaced to hashtext('${table}')`
      ).toContain(`hashtext('${table}')`);
    });

    it("takes the lock BEFORE the snapshot pre-read and the upsert", () => {
      const body = stripComments(functionBody(sql, fn));
      const lock = body.indexOf("pg_advisory_xact_lock");
      const snapshot = body.indexOf("for update");
      const upsert = body.indexOf("on conflict");
      expect(lock, `${fn} should take an advisory lock`).toBeGreaterThan(-1);
      expect(snapshot, `${fn} should snapshot with FOR UPDATE`).toBeGreaterThan(
        -1
      );
      expect(upsert, `${fn} should upsert with ON CONFLICT`).toBeGreaterThan(
        -1
      );
      expect(
        lock,
        `${fn} should lock before its FOR UPDATE snapshot`
      ).toBeLessThan(snapshot);
      expect(
        lock,
        `${fn} should lock before its ON CONFLICT upsert`
      ).toBeLessThan(upsert);
    });

    it("keeps the SECURITY DEFINER + pinned search_path envelope", () => {
      assertSecurityDefiner(sql, fn);
    });

    it.runIf(reguardsJsonb)(
      "keeps re-guarding the top-level jsonb shape (the DB trust boundary)",
      () => {
        expect(
          functionBody(sql, fn),
          `${fn} should still re-guard the payload shape with jsonb_typeof`
        ).toContain("jsonb_typeof");
      }
    );

    it("still writes its paired audit_events row", () => {
      assertPairedAuditInsert(sql, fn);
    });
  }
);
