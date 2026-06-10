import { describe, expect, it } from "vitest";

import { loadMigration, type MigrationSql } from "./migration-safety";

// Launch-readiness hygiene migration: codifies the production-only
// rls_auto_enable safety net (schema drift found by comparing the live
// database against this directory), pins the one remaining role-mutable
// search_path (set_updated_at), and gives audit_events_archive a primary key.
// These static checks pin the shape; like every migration suite, real
// enforcement is verified against a live database (CI has no Postgres).

const sql: MigrationSql = loadMigration(
  "20260630000000_db_hygiene_capture_rls_auto_enable.sql"
);

describe("db hygiene — capture rls_auto_enable + advisor fixes", () => {
  it("captures the rls_auto_enable event-trigger function as SECURITY DEFINER with a pinned search_path", () => {
    expect(sql.lower).toContain(
      "create or replace function public.rls_auto_enable()"
    );
    expect(sql.lower).toContain("returns event_trigger");
    expect(sql.lower).toContain("security definer");
    expect(sql.lower).toContain("set search_path to 'pg_catalog'");
  });

  it("only auto-enables RLS on tables created in public", () => {
    expect(sql.lower).toContain("cmd.schema_name in ('public')");
    expect(sql.lower).toContain(
      "alter table if exists %s enable row level security"
    );
  });

  it("revokes the pointless default EXECUTE grant", () => {
    expect(sql.lower).toContain(
      "revoke execute on function public.rls_auto_enable() from public, anon, authenticated"
    );
  });

  it("creates the ensure_rls event trigger only when absent (production already has it)", () => {
    expect(sql.lower).toContain(
      "select 1 from pg_event_trigger where evtname = 'ensure_rls'"
    );
    expect(sql.lower).toContain("create event trigger ensure_rls");
    expect(sql.lower).toContain("on ddl_command_end");
  });

  it("pins set_updated_at's search_path (advisor 0011)", () => {
    expect(sql.lower).toContain(
      "alter function public.set_updated_at() set search_path = public, pg_temp"
    );
  });

  it("adds the audit_events_archive primary key only when absent (advisor 0004)", () => {
    expect(sql.lower).toContain(
      "conrelid = 'public.audit_events_archive'::regclass and contype = 'p'"
    );
    expect(sql.lower).toContain(
      "alter table public.audit_events_archive add primary key (id)"
    );
  });
});
