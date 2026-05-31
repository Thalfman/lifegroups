import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATION = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260531140000_phase_rr1_remove_staff_viewer_role.sql"
  ),
  "utf8"
);

describe("phase RR.1 remove staff_viewer role migration", () => {
  it("vacates staff_viewer rows to an inactive leader", () => {
    expect(MIGRATION).toMatch(/update public\.profiles/);
    expect(MIGRATION).toMatch(/where role = 'staff_viewer'/);
    expect(MIGRATION).toMatch(/set\s+role = 'leader'/);
    expect(MIGRATION).toMatch(/status = 'inactive'/);
  });

  it("recreates the user_role enum without staff_viewer", () => {
    expect(MIGRATION).toContain(
      "alter type public.user_role rename to user_role_old"
    );
    expect(MIGRATION).toMatch(
      /create type public\.user_role as enum \(\s*'super_admin','ministry_admin','over_shepherd','leader','co_leader'\s*\)/
    );
    // The new enum literal must not list staff_viewer.
    const enumDecl = MIGRATION.slice(
      MIGRATION.indexOf("create type public.user_role as enum")
    );
    const enumLiteral = enumDecl.slice(0, enumDecl.indexOf(");"));
    expect(enumLiteral).not.toContain("staff_viewer");
  });

  it("swaps the profiles.role column onto the new type and restores its default", () => {
    expect(MIGRATION).toContain("alter column role drop default");
    expect(MIGRATION).toMatch(
      /alter column role type public\.user_role\s+using role::text::public\.user_role/
    );
    expect(MIGRATION).toContain("alter column role set default 'leader'");
    expect(MIGRATION).toContain("drop type public.user_role_old");
  });

  it("removes the unused auth_is_staff_viewer helper", () => {
    expect(MIGRATION).toContain(
      "drop function if exists public.auth_is_staff_viewer()"
    );
    expect(MIGRATION).not.toContain(
      "create or replace function public.auth_is_staff_viewer"
    );
  });

  it("recreates the role-write RPCs without a staff_viewer guard", () => {
    expect(MIGRATION).toContain(
      "create or replace function public.change_user_role"
    );
    expect(MIGRATION).toContain(
      "create or replace function public.set_profile_role"
    );
    // set_profile_role keeps its super_admin guard ...
    expect(MIGRATION).toMatch(/super_admin is not assignable/);
    // ... but no staff_viewer guard survives anywhere.
    expect(MIGRATION).not.toMatch(/staff_viewer is not assignable/);
  });

  it("restores execute grants for the recreated functions", () => {
    expect(MIGRATION).toMatch(
      /grant execute on function\s+public\.change_user_role\(uuid, uuid, public\.user_role, text\) to authenticated/
    );
    expect(MIGRATION).toMatch(
      /grant execute on function\s+public\.set_profile_role\(uuid, uuid, public\.user_role, text\) to authenticated/
    );
    expect(MIGRATION).toMatch(
      /grant execute on function public\.auth_role\(\) to authenticated/
    );
  });

  it("is wrapped in a transaction", () => {
    expect(MIGRATION).toMatch(/^begin;/m);
    expect(MIGRATION.trim().endsWith("commit;")).toBe(true);
  });
});
