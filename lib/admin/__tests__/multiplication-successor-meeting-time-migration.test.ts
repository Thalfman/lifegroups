import { beforeAll, describe, expect, it } from "vitest";

import {
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// Julian #143: static boundary assertions over the migration that adds the
// successor/leader-designate and meeting-time fields to multiplication
// candidates. The repo has no DB-backed test runner and CI has no Postgres
// (RLS is verified manually per supabase/dev/README.md), so these assertions
// are the CI-runnable regression guard that the new fields stay additive,
// nullable, and on the existing audited SECURITY DEFINER write path. The
// security-critical invariants compose the shared migration-safety vocabulary
// (see ./migration-safety.ts).

const RPCS = [
  "admin_create_multiplication_candidate",
  "admin_update_multiplication_candidate",
] as const;

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration(
    "20260530060000_julian_p4c_multiplication_successor_meeting_time.sql"
  );
});

describe("multiplication successor/meeting-time migration — additive, nullable columns", () => {
  it("defines the meeting-time enum with exactly the two Doc values", () => {
    expect(sql.lower).toContain(
      "create type public.multiplication_meeting_time as enum"
    );
    const block = sql.lower.slice(
      sql.lower.indexOf("multiplication_meeting_time as enum")
    );
    expect(block).toContain("'during_the_day'");
    expect(block).toContain("'evening'");
  });

  it("adds both columns with `add column if not exists` (no breaking reshape)", () => {
    expect(sql.lower).toContain(
      "add column if not exists successor_designate text"
    );
    expect(sql.lower).toContain(
      "add column if not exists meeting_time public.multiplication_meeting_time"
    );
  });

  it("bounds the successor text length without forcing existing rows", () => {
    // A guarded length constraint, allowing null so existing rows stay valid.
    expect(sql.lower).toMatch(
      /successor_designate is null or char_length\(successor_designate\) <= 120/
    );
  });

  it("never makes either column NOT NULL", () => {
    expect(sql.lower).not.toContain("successor_designate text not null");
    expect(sql.lower).not.toContain(
      "meeting_time public.multiplication_meeting_time not null"
    );
  });
});

describe("multiplication successor/meeting-time migration — audited write path", () => {
  it("re-creates both RPCs as SECURITY DEFINER with a pinned search_path", () => {
    for (const fn of RPCS) {
      assertSecurityDefiner(sql, fn);
    }
  });

  it("keeps the admin guard and server-side actor resolution on both RPCs", () => {
    for (const fn of RPCS) {
      const body = functionBody(sql, fn);
      expect(body).toContain("if not public.auth_is_admin() then");
      expect(body).toContain("v_actor := public.auth_profile_id();");
    }
  });

  it("threads both new params through and persists them on the candidate", () => {
    for (const fn of RPCS) {
      const body = functionBody(sql, fn);
      expect(body).toContain("p_successor_designate");
      expect(body).toContain("p_meeting_time");
      expect(body).toContain("successor_designate");
      expect(body).toContain("meeting_time");
    }
  });

  it("validates the successor length server-side", () => {
    for (const fn of RPCS) {
      expect(functionBody(sql, fn)).toMatch(/char_length\(v_successor\) > 120/);
    }
  });

  it("records the new fields in the paired audit_events metadata", () => {
    for (const fn of RPCS) {
      assertPairedAuditInsert(sql, fn);
      const body = functionBody(sql, fn);
      expect(body).toContain("'has_successor'");
      expect(body).toContain("'meeting_time'");
    }
  });

  it("does not service-role write or hard-delete", () => {
    expect(sql.lower).not.toContain("service_role");
    expect(sql.lower).not.toMatch(
      /delete\s+from\s+public\.multiplication_candidates/
    );
  });
});
