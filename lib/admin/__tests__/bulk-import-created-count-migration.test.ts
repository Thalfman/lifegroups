import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

// Static assertions over the bulk-import created_count fix (#165 follow-up).
// CI has no Postgres, so these guard the correctness invariant (count rows
// actually written, not input rows) and confirm the security gate is intact.

const MIGRATION_PATH = fileURLToPath(
  new URL(
    "../../../supabase/migrations/20260602000000_fix_bulk_import_created_count.sql",
    import.meta.url
  )
);

let sql = "";
const lower = () => sql.toLowerCase();

beforeAll(() => {
  sql = readFileSync(MIGRATION_PATH, "utf8");
});

describe("bulk-import created_count fix migration", () => {
  it("re-defines the RPC as SECURITY DEFINER with a pinned search_path and super_admin gate", () => {
    expect(lower()).toContain(
      "create or replace function public.super_admin_bulk_import_people"
    );
    const fn = lower().slice(lower().indexOf("super_admin_bulk_import_people"));
    expect(fn).toContain("security definer");
    expect(fn).toContain("set search_path = public, pg_temp");
    expect(lower()).toContain("auth_role() <> 'super_admin'");
  });

  it("counts rows actually written via GET DIAGNOSTICS ROW_COUNT", () => {
    expect(lower()).toContain("get diagnostics v_inserted = row_count");
    expect(lower()).toContain("v_created := v_created + v_inserted");
  });

  it("keeps the leader insert idempotent on the UNIQUE(email) constraint", () => {
    expect(lower()).toContain("insert into public.profiles");
    expect(lower()).toContain("on conflict do nothing");
  });

  it("leaves member dedup to the app layer (no DB unique constraint / no ON CONFLICT on members)", () => {
    const membersInsert = lower().slice(
      lower().indexOf("insert into public.members")
    );
    // The members insert must NOT carry an on-conflict clause — member dedup is
    // deliberately app-layer; a silent DB ON CONFLICT could drop distinct people.
    const untilSemicolon = membersInsert.slice(
      0,
      membersInsert.indexOf(";") + 1
    );
    expect(untilSemicolon).not.toContain("on conflict");
  });

  it("still writes exactly one paired audit_events row recording created_count", () => {
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
