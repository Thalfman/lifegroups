import { beforeAll, describe, expect, it } from "vitest";

import {
  assertExecuteLockdown,
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// ADR 0029: static boundary assertions over the migration that adds the three
// manually-ticked readiness flags (enough_members, established_long_enough,
// co_shepherd_tenured) to multiplication candidates and re-creates the candidate
// write RPCs to thread them. CI has no Postgres (RLS is verified manually per
// supabase/dev/README.md), so these assertions are the CI-runnable regression
// guard that the new flags stay additive, on the existing audited SECURITY
// DEFINER write path, and that the prior 10-arg RPC signatures are dropped in
// favour of the 13-arg shape.

const RPCS = [
  "admin_create_multiplication_candidate",
  "admin_update_multiplication_candidate",
] as const;

const FLAGS = [
  "enough_members",
  "established_long_enough",
  "co_shepherd_tenured",
] as const;

// The new 13-arg signature (…, uuid, integer, boolean, boolean, boolean) the app
// now calls.
const ARGS_13 =
  "uuid, integer, public.multiplication_candidate_status, boolean, boolean, " +
  "text, text, public.multiplication_meeting_time, uuid, integer, boolean, " +
  "boolean, boolean";

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration("20260709000000_multiply_manual_readiness_flags.sql");
});

describe("manual readiness flags migration — additive boolean columns", () => {
  it("adds each flag with `add column if not exists`, NOT NULL DEFAULT false", () => {
    for (const flag of FLAGS) {
      expect(sql.lower).toContain(
        `add column if not exists ${flag} boolean not null default false`
      );
    }
  });

  it("does not backfill — existing rows take the false default (ADR 0029 §2)", () => {
    // No UPDATE that would seed the new flags from prior computed values.
    for (const flag of FLAGS) {
      expect(sql.lower).not.toMatch(
        new RegExp(`update public\\.multiplication_candidates\\s+set ${flag}`)
      );
    }
  });
});

describe("manual readiness flags migration — audited write path", () => {
  it("re-creates both RPCs as SECURITY DEFINER with a pinned search_path", () => {
    for (const fn of RPCS) assertSecurityDefiner(sql, fn);
  });

  it("keeps the admin guard and server-side actor resolution on both RPCs", () => {
    for (const fn of RPCS) {
      const body = functionBody(sql, fn);
      expect(body).toContain("if not public.auth_is_admin() then");
      expect(body).toContain("v_actor := public.auth_profile_id();");
    }
  });

  it("threads each new param through and persists it", () => {
    for (const fn of RPCS) {
      const body = functionBody(sql, fn);
      for (const flag of FLAGS) {
        // The param declarations are whitespace-aligned in the SQL.
        expect(body).toMatch(new RegExp(`p_${flag}\\s+boolean`));
        // Stored coalesced to false (never null) like the existing manual flags.
        expect(body).toContain(`coalesce(p_${flag}, false)`);
      }
    }
  });

  it("records the three new flags in the paired audit_events metadata", () => {
    for (const fn of RPCS) {
      assertPairedAuditInsert(sql, fn);
      const body = functionBody(sql, fn);
      for (const flag of FLAGS) expect(body).toContain(`'${flag}'`);
    }
  });

  it("drops the prior 10-arg signatures so callers must use the 13-arg shape", () => {
    for (const fn of RPCS) {
      expect(sql.lower).toMatch(
        new RegExp(
          `drop function if exists public\\.${fn}\\(\\s*uuid, integer, public\\.multiplication_candidate_status, boolean, boolean, text,\\s*text, public\\.multiplication_meeting_time, uuid, integer\\s*\\)`
        )
      );
    }
  });

  it("locks EXECUTE on the new 13-arg RPCs down to authenticated only", () => {
    for (const fn of RPCS) assertExecuteLockdown(sql, fn, ARGS_13);
  });

  it("does not service-role write or hard-delete", () => {
    expect(sql.lower).not.toContain("service_role");
    expect(sql.lower).not.toMatch(
      /delete\s+from\s+public\.multiplication_candidates/
    );
  });
});
