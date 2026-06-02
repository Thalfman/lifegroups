import { beforeAll, describe, expect, it } from "vitest";

import {
  assertExecuteLockdown,
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// Capacity & Multiplication #183: static boundary assertions over the migration
// that adds the Leader Pipeline (apprentices) table + RPCs. The repo has no
// DB-backed test runner and CI has no Postgres (RLS verified manually per
// supabase/dev/README.md), so these assertions are the CI-runnable regression
// guard that the new spine stays admin-only, on the audited SECURITY DEFINER
// write path, and soft-delete only. The security-critical invariants compose
// the shared migration-safety vocabulary (see ./migration-safety.ts).

const RPCS = [
  "admin_create_apprentice",
  "admin_update_apprentice",
  "admin_advance_apprentice_stage",
  "admin_archive_apprentice",
] as const;

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration("20260531100000_julian_cap1_leader_pipeline.sql");
});

describe("leader pipeline migration — table + stage enum", () => {
  it("defines the readiness-stage enum with exactly the four PRD stages", () => {
    expect(sql.lower).toContain(
      "create type public.leader_readiness_stage as enum"
    );
    const block = sql.lower.slice(
      sql.lower.indexOf("leader_readiness_stage as enum")
    );
    for (const v of [
      "'identified'",
      "'in_training'",
      "'ready_to_lead'",
      "'launched'",
    ]) {
      expect(block).toContain(v);
    }
  });

  it("creates the leader_pipeline table with display_name required and member_id nullable", () => {
    expect(sql.lower).toContain(
      "create table if not exists public.leader_pipeline"
    );
    // Required name (provisional person shape) + nullable members FK.
    expect(sql.lower).toContain("display_name      text not null");
    expect(sql.lower).toContain(
      "member_id         uuid references public.members(id) on delete set null"
    );
    // Optional expected-ready date drives by-the-season staffing supply.
    expect(sql.lower).toContain("expected_ready_on date");
  });

  it("carries audit + archival columns (no hard deletes)", () => {
    for (const col of ["archived_at", "created_by", "updated_by"]) {
      expect(sql.lower).toContain(col);
    }
  });

  it("enables admin-only RLS read and revokes blanket grants", () => {
    expect(sql.lower).toContain(
      "alter table public.leader_pipeline enable row level security"
    );
    expect(sql.lower).toContain(
      "for select to authenticated using (public.auth_is_admin())"
    );
    expect(sql.lower).toContain(
      "grant  select on public.leader_pipeline to authenticated"
    );
  });
});

describe("leader pipeline migration — audited write path", () => {
  it("declares all four RPCs as SECURITY DEFINER with a pinned search_path", () => {
    for (const fn of RPCS) {
      assertSecurityDefiner(sql, fn);
    }
  });

  it("keeps the admin guard + server-side actor resolution on every RPC", () => {
    for (const fn of RPCS) {
      const body = functionBody(sql, fn);
      expect(body).toContain("if not public.auth_is_admin() then");
      expect(body).toContain("v_actor := public.auth_profile_id();");
    }
  });

  it("pairs each write with an audit_events row", () => {
    for (const fn of RPCS) {
      assertPairedAuditInsert(sql, fn);
    }
  });

  it("archive is a soft-delete (sets archived_at), never a hard delete", () => {
    expect(functionBody(sql, "admin_archive_apprentice")).toContain(
      "set archived_at = now()"
    );
    expect(sql.lower).not.toContain("service_role");
    expect(sql.lower).not.toMatch(/delete\s+from\s+public\.leader_pipeline/);
  });

  it("archive clears any linked candidate so the planner can't resolve an archived apprentice", () => {
    const body = functionBody(sql, "admin_archive_apprentice");
    // Clears multiplication_candidates.leader_pipeline_id pointing at it...
    expect(body).toContain("set leader_pipeline_id = null");
    expect(body).toContain("where leader_pipeline_id = p_apprentice_id");
    // ...and audits each cleared link.
    expect(body).toContain("'cleared_apprentice_link'");
  });

  it("locks EXECUTE on every RPC down to authenticated only", () => {
    for (const fn of RPCS) {
      assertExecuteLockdown(sql, fn);
    }
  });
});
