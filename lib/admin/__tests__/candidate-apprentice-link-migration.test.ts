import { beforeAll, describe, expect, it } from "vitest";

import {
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// Capacity & Multiplication #184: static boundary assertions over the migration
// that links a multiplication candidate to a leader_pipeline apprentice, seeds
// apprentices from existing successor_designate values, and enforces the
// same-group rule. CI has no Postgres, so this static guard stands in for the
// cross-group rejection test (the rule lives in the trigger + RPC SQL). The
// security-critical invariants compose the shared migration-safety vocabulary
// (see ./migration-safety.ts).

const RPCS = [
  "admin_create_multiplication_candidate",
  "admin_update_multiplication_candidate",
] as const;

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration(
    "20260531110000_julian_cap2_candidate_apprentice_link.sql"
  );
});

describe("candidate ⇄ apprentice link migration — additive FK", () => {
  it("adds a nullable leader_pipeline_id FK with `add column if not exists`", () => {
    expect(sql.lower).toContain(
      "add column if not exists leader_pipeline_id uuid"
    );
    expect(sql.lower).toContain(
      "references public.leader_pipeline(id) on delete set null"
    );
  });

  it("never drops or NOT-NULLs the retained successor_designate", () => {
    expect(sql.lower).not.toMatch(
      /drop\s+column\s+(if\s+exists\s+)?successor_designate/
    );
    expect(sql.lower).not.toContain("successor_designate set not null");
  });
});

describe("candidate ⇄ apprentice link migration — same-group enforcement", () => {
  it("defines a DB-level BEFORE trigger that rejects a cross-group link", () => {
    expect(sql.lower).toContain(
      "create trigger multiplication_candidates_apprentice_same_group"
    );
    expect(sql.lower).toContain(
      "before insert or update on public.multiplication_candidates"
    );
    expect(
      functionBody(sql, "multiplication_candidate_apprentice_same_group")
    ).toContain("apprentice_group_mismatch");
  });

  it("also guards same-group inside both create and update RPCs", () => {
    for (const name of RPCS) {
      const body = functionBody(sql, name);
      expect(body).toContain("apprentice_group_mismatch");
      expect(body).toContain("missing_apprentice");
      // Both RPCs accept + persist the link param.
      expect(body).toContain("p_leader_pipeline_id");
    }
  });

  it("re-creates both RPCs as SECURITY DEFINER with the link param and audited writes", () => {
    for (const name of RPCS) {
      assertSecurityDefiner(sql, name);
      assertPairedAuditInsert(sql, name);
      expect(functionBody(sql, name)).toContain("'has_apprentice_link'");
    }
  });
});

describe("candidate ⇄ apprentice link migration — successor seed", () => {
  it("seeds an apprentice from each candidate's successor_designate and links it", () => {
    // Insert into leader_pipeline from successor_designate, then link the
    // candidate via a CTE keyed by group_id (one active candidate per group).
    expect(sql.lower).toContain("insert into public.leader_pipeline");
    expect(sql.lower).toContain("btrim(c.successor_designate)");
    expect(sql.lower).toMatch(/set leader_pipeline_id = s\.id/);
    // Idempotent: only candidates with a successor name and no link yet.
    expect(sql.lower).toContain("c.leader_pipeline_id is null");
    expect(sql.lower).toContain("c.successor_designate is not null");
  });

  it("audits the seeded apprentice creation and the candidate link in the same transaction", () => {
    // The seed CTE ends in an audit_events insert covering both entities.
    expect(sql.lower).toContain("insert into public.audit_events");
    expect(sql.lower).toContain("'seeded_from_successor'");
    expect(sql.lower).toContain("'seeded_apprentice_link'");
  });

  it("does not service-role write or hard-delete", () => {
    expect(sql.lower).not.toContain("service_role");
    expect(sql.lower).not.toMatch(
      /delete\s+from\s+public\.multiplication_candidates/
    );
  });
});
