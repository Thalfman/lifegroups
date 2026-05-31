import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

// Static boundary assertions over the SAC.5 bulk people-import migration (#165).
// CI has no Postgres, so these string assertions are the CI-runnable regression
// guard for the security-critical invariants of super_admin_bulk_import_people.

const MIGRATION_PATH = fileURLToPath(
  new URL(
    "../../../supabase/migrations/20260531040000_phase_sac5_people_import.sql",
    import.meta.url
  )
);

let sql = "";
const lower = () => sql.toLowerCase();

beforeAll(() => {
  sql = readFileSync(MIGRATION_PATH, "utf8");
});

describe("SAC.5 migration — super_admin_bulk_import_people", () => {
  it("defines the RPC as SECURITY DEFINER with a pinned search_path", () => {
    expect(lower()).toContain(
      "create or replace function public.super_admin_bulk_import_people"
    );
    const fn = lower().slice(lower().indexOf("super_admin_bulk_import_people"));
    expect(fn).toContain("security definer");
    expect(fn).toContain("set search_path = public, pg_temp");
  });

  it("gates on auth_role() = 'super_admin'", () => {
    expect(lower()).toContain("auth_role() <> 'super_admin'");
  });

  it("rejects a non-array payload with invalid_input", () => {
    expect(lower()).toContain("jsonb_typeof(p_rows) <> 'array'");
    expect(lower()).toContain("raise exception 'invalid_input'");
  });

  it("inserts leaders into profiles and members into members", () => {
    expect(lower()).toContain("insert into public.profiles");
    expect(lower()).toContain("insert into public.members");
    expect(lower()).toContain("v_role = 'leader'");
  });

  it("writes one paired audit_events row recording the created count", () => {
    expect(lower()).toContain("insert into public.audit_events");
    expect(lower()).toContain("'super_admin.bulk_import_people'");
    expect(lower()).toContain("created_count");
  });

  it("locks function EXECUTE down to authenticated only", () => {
    expect(lower()).toContain(
      "grant  execute on function public.super_admin_bulk_import_people(jsonb) to authenticated"
    );
  });
});
