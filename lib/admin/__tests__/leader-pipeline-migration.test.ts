import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

// Capacity & Multiplication #183: static boundary assertions over the migration
// that adds the Leader Pipeline (apprentices) table + RPCs. The repo has no
// DB-backed test runner and CI has no Postgres (RLS verified manually per
// supabase/dev/README.md), so these assertions are the CI-runnable regression
// guard that the new spine stays admin-only, on the audited SECURITY DEFINER
// write path, and soft-delete only. Mirrors the multiplication-pipeline guards.

const MIGRATION_PATH = fileURLToPath(
  new URL(
    "../../../supabase/migrations/20260531100000_julian_cap1_leader_pipeline.sql",
    import.meta.url
  )
);

let sql = "";
const lower = () => sql.toLowerCase();

beforeAll(() => {
  sql = readFileSync(MIGRATION_PATH, "utf8");
});

describe("leader pipeline migration — table + stage enum", () => {
  it("defines the readiness-stage enum with exactly the four PRD stages", () => {
    expect(lower()).toContain(
      "create type public.leader_readiness_stage as enum"
    );
    const block = lower().slice(
      lower().indexOf("leader_readiness_stage as enum")
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
    expect(lower()).toContain(
      "create table if not exists public.leader_pipeline"
    );
    // Required name (provisional person shape) + nullable members FK.
    expect(lower()).toContain("display_name      text not null");
    expect(lower()).toContain(
      "member_id         uuid references public.members(id) on delete set null"
    );
    // Optional expected-ready date drives by-the-season staffing supply.
    expect(lower()).toContain("expected_ready_on date");
  });

  it("carries audit + archival columns (no hard deletes)", () => {
    for (const col of ["archived_at", "created_by", "updated_by"]) {
      expect(lower()).toContain(col);
    }
  });

  it("enables admin-only RLS read and revokes blanket grants", () => {
    expect(lower()).toContain(
      "alter table public.leader_pipeline enable row level security"
    );
    expect(lower()).toContain(
      "for select to authenticated using (public.auth_is_admin())"
    );
    expect(lower()).toContain(
      "grant  select on public.leader_pipeline to authenticated"
    );
  });
});

describe("leader pipeline migration — audited write path", () => {
  const fns = [
    "admin_create_apprentice",
    "admin_update_apprentice",
    "admin_advance_apprentice_stage",
    "admin_archive_apprentice",
  ];
  const slice = (name: string) => lower().slice(lower().indexOf(name));

  it("declares all four RPCs as SECURITY DEFINER with a pinned search_path", () => {
    for (const fn of fns) {
      expect(lower()).toContain(`create or replace function public.${fn}`);
      const body = slice(fn);
      expect(body).toContain("security definer");
      expect(body).toContain("set search_path = public, pg_temp");
    }
  });

  it("keeps the admin guard + server-side actor resolution on every RPC", () => {
    for (const fn of fns) {
      const body = slice(fn);
      expect(body).toContain("if not public.auth_is_admin() then");
      expect(body).toContain("v_actor := public.auth_profile_id();");
    }
  });

  it("pairs each write with an audit_events row", () => {
    for (const fn of fns) {
      expect(slice(fn)).toContain("insert into public.audit_events");
    }
  });

  it("archive is a soft-delete (sets archived_at), never a hard delete", () => {
    expect(slice("admin_archive_apprentice")).toContain(
      "set archived_at = now()"
    );
    expect(lower()).not.toContain("service_role");
    expect(lower()).not.toMatch(/delete\s+from\s+public\.leader_pipeline/);
  });

  it("archive clears any linked candidate so the planner can't resolve an archived apprentice", () => {
    const body = slice("admin_archive_apprentice");
    // Clears multiplication_candidates.leader_pipeline_id pointing at it...
    expect(body).toContain("set leader_pipeline_id = null");
    expect(body).toContain("where leader_pipeline_id = p_apprentice_id");
    // ...and audits each cleared link.
    expect(body).toContain("'cleared_apprentice_link'");
  });

  it("grants execute on every RPC to authenticated only", () => {
    for (const fn of fns) {
      expect(lower()).toContain(`grant execute on function public.${fn}`);
    }
  });
});
