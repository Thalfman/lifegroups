import { beforeAll, describe, expect, it } from "vitest";

import {
  assertExecuteLockdown,
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// ADR 0022: static boundary assertions over the migration that adds the
// Julian-fed `manual_member_count` to multiplication candidates and re-creates
// the candidate write RPCs to thread it. CI has no Postgres (RLS is verified
// manually per supabase/dev/README.md), so these assertions are the CI-runnable
// regression guard that the new field stays additive, nullable, and on the
// existing audited SECURITY DEFINER write path, and that the prior 9-arg RPC
// signatures are dropped in favour of the 10-arg shape.

const RPCS = [
  "admin_create_multiplication_candidate",
  "admin_update_multiplication_candidate",
] as const;

// The new 10-arg signature (…, uuid, integer) the app now calls.
const ARGS_10 =
  "uuid, integer, public.multiplication_candidate_status, boolean, boolean, " +
  "text, text, public.multiplication_meeting_time, uuid, integer";

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration("20260608120000_multiply_manual_member_count.sql");
});

describe("manual member count migration — additive, nullable column", () => {
  it("adds the column with `add column if not exists` (no breaking reshape)", () => {
    expect(sql.lower).toContain(
      "add column if not exists manual_member_count integer"
    );
  });

  it("bounds the count to [0, 1000] while allowing null", () => {
    expect(sql.lower).toMatch(
      /manual_member_count is null\s*or \(manual_member_count >= 0 and manual_member_count <= 1000\)/
    );
  });

  it("never makes the column NOT NULL", () => {
    expect(sql.lower).not.toContain("manual_member_count integer not null");
  });
});

describe("manual member count migration — audited write path", () => {
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

  it("threads the new param through, validates its bounds, and persists it", () => {
    for (const fn of RPCS) {
      const body = functionBody(sql, fn);
      expect(body).toContain("p_manual_member_count integer");
      expect(body).toMatch(
        /p_manual_member_count < 0 or p_manual_member_count > 1000/
      );
      expect(body).toContain("manual_member_count");
    }
  });

  it("records the new field in the paired audit_events metadata", () => {
    for (const fn of RPCS) {
      assertPairedAuditInsert(sql, fn);
      expect(functionBody(sql, fn)).toContain("'manual_member_count'");
    }
  });

  it("drops the prior 9-arg signatures so callers must use the 10-arg shape", () => {
    for (const fn of RPCS) {
      expect(sql.lower).toMatch(
        new RegExp(
          `drop function if exists public\\.${fn}\\(\\s*uuid, integer, public\\.multiplication_candidate_status, boolean, boolean, text,\\s*text, public\\.multiplication_meeting_time, uuid\\s*\\)`
        )
      );
    }
  });

  it("locks EXECUTE on the new 10-arg RPCs down to authenticated only", () => {
    for (const fn of RPCS) assertExecuteLockdown(sql, fn, ARGS_10);
  });

  it("does not service-role write or hard-delete", () => {
    expect(sql.lower).not.toContain("service_role");
    expect(sql.lower).not.toMatch(
      /delete\s+from\s+public\.multiplication_candidates/
    );
  });
});
