import { describe, expect, it } from "vitest";

import {
  assertAuditContentFree,
  assertExcludesSuperAdmin,
  assertExecuteLockdown,
  assertPairedAuditInsert,
  assertRoleGate,
  assertSecurityDefiner,
  auditEventInserts,
  functionBody,
  loadMigration,
  migrationFromSql,
} from "./migration-safety";

// Direct coverage for the migration-safety assertion vocabulary itself: each
// named assertion passes on SQL that upholds the invariant and throws on SQL
// that breaks it. The assertions call vitest `expect` internally, so a broken
// invariant surfaces as a thrown assertion error.

// A self-contained, minimal migration that upholds every named invariant, with
// the whitespace quirks the real GRANT blocks use (aligned padding, multi-line
// arg lists) so the regex-based assertions are exercised against them.
const SAFE_SQL = `
create or replace function public.admin_do_thing(
  p_target uuid,
  p_label text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not (public.auth_role() = 'ministry_admin'::public.user_role) then
    raise exception 'forbidden';
  end if;
  insert into public.audit_events (actor_profile_id, action, metadata)
  values (public.auth_profile_id(), 'admin.do_thing', jsonb_build_object('has_body', true));
  return;
end;
$$;

revoke all     on function public.admin_do_thing(uuid, text) from public;
revoke all     on function public.admin_do_thing(uuid, text) from anon;
revoke all     on function public.admin_do_thing(uuid, text) from authenticated;
grant  execute on function public.admin_do_thing(uuid, text) to authenticated;
`;

const safe = migrationFromSql(SAFE_SQL, "safe.sql");

describe("migration-safety — loaders", () => {
  it("migrationFromSql lowercases and records the file name", () => {
    const sql = migrationFromSql("SELECT 1;", "Mixed.sql");
    expect(sql.raw).toBe("SELECT 1;");
    expect(sql.lower).toBe("select 1;");
    expect(sql.fileName).toBe("Mixed.sql");
  });

  it("loadMigration reads a real migration off disk", () => {
    const sql = loadMigration(
      "20260531020000_phase_sac3_account_management.sql"
    );
    expect(sql.fileName).toBe(
      "20260531020000_phase_sac3_account_management.sql"
    );
    expect(sql.lower).toContain("super_admin_set_profile_status");
    expect(sql.lower).toBe(sql.raw.toLowerCase());
  });

  it("loadMigration throws for a missing migration", () => {
    expect(() => loadMigration("does-not-exist.sql")).toThrow();
  });
});

describe("migration-safety — functionBody", () => {
  it("slices the body from the header to the closing $$;", () => {
    const body = functionBody(safe, "admin_do_thing");
    expect(body).toContain("security definer");
    expect(body).toContain("'admin.do_thing'");
    expect(body).not.toContain("revoke all"); // stops at $$;
  });

  it("fails when the function is not defined", () => {
    expect(() => functionBody(safe, "admin_missing")).toThrow();
  });

  it("anchors on the '(' so a name that is a prefix of another does not collide", () => {
    const sql = migrationFromSql(`
create or replace function public.admin_foo_extended(p uuid) returns void
language plpgsql security definer as $$ begin perform 'extended_marker'; end; $$;
create or replace function public.admin_foo(p uuid) returns void
language plpgsql security definer as $$ begin perform 'foo_marker'; end; $$;
`);
    const body = functionBody(sql, "admin_foo");
    expect(body).toContain("foo_marker");
    expect(body).not.toContain("extended_marker"); // grabbed the right function
  });

  it("anchors on CREATE so a preceding DROP of the same name is not the target", () => {
    const sql = migrationFromSql(`
drop function if exists public.admin_thing(uuid);
create or replace function public.admin_thing(p uuid) returns void
language plpgsql security definer as $$ begin perform 'real_body'; end; $$;
`);
    const body = functionBody(sql, "admin_thing");
    expect(body).toContain("real_body");
    expect(body).not.toContain("drop function");
  });
});

describe("migration-safety — assertSecurityDefiner", () => {
  it("passes for a SECURITY DEFINER fn with a pinned search_path", () => {
    expect(() => assertSecurityDefiner(safe, "admin_do_thing")).not.toThrow();
  });

  it("fails when SECURITY DEFINER is missing", () => {
    const sql = migrationFromSql(
      "create or replace function public.x() returns void language plpgsql\n" +
        "set search_path = public, pg_temp as $$ begin end; $$;"
    );
    expect(() => assertSecurityDefiner(sql, "x")).toThrow();
  });

  it("fails when search_path is not pinned", () => {
    const sql = migrationFromSql(
      "create or replace function public.x() returns void language plpgsql\n" +
        "security definer as $$ begin end; $$;"
    );
    expect(() => assertSecurityDefiner(sql, "x")).toThrow();
  });

  it("accepts a non-default search_path pin via options (e.g. public only)", () => {
    const sql = migrationFromSql(
      "create or replace function public.x() returns void language plpgsql\n" +
        "security definer set search_path = public as $$ begin end; $$;"
    );
    // The default pin (public, pg_temp) is not satisfied...
    expect(() => assertSecurityDefiner(sql, "x")).toThrow();
    // ...but the explicit single-schema pin is.
    expect(() =>
      assertSecurityDefiner(sql, "x", { searchPath: "public" })
    ).not.toThrow();
  });

  it("does not let a `public` expectation prefix-match a broader pin", () => {
    const sql = migrationFromSql(
      "create or replace function public.x() returns void language plpgsql\n" +
        "security definer set search_path = public, pg_temp as $$ begin end; $$;"
    );
    // A function pinning the broader `public, pg_temp` must NOT satisfy a
    // `public`-only expectation, or an unintended extra schema slips through.
    expect(() =>
      assertSecurityDefiner(sql, "x", { searchPath: "public" })
    ).toThrow();
  });

  it("tolerates a missing space after the comma in the search_path pin", () => {
    const sql = migrationFromSql(
      "create or replace function public.x() returns void language plpgsql\n" +
        "security definer set search_path = public,pg_temp as $$ begin end; $$;"
    );
    expect(() => assertSecurityDefiner(sql, "x")).not.toThrow();
  });
});

describe("migration-safety — assertRoleGate", () => {
  it("passes when the body gates on auth_role() = '<role>'", () => {
    expect(() =>
      assertRoleGate(safe, "admin_do_thing", "ministry_admin")
    ).not.toThrow();
  });

  it("fails when the body gates on a different role", () => {
    expect(() =>
      assertRoleGate(safe, "admin_do_thing", "super_admin")
    ).toThrow();
  });
});

describe("migration-safety — assertPairedAuditInsert", () => {
  it("passes and matches the recorded action label", () => {
    expect(() =>
      assertPairedAuditInsert(safe, "admin_do_thing", "'admin.do_thing'")
    ).not.toThrow();
  });

  it("fails when the body writes no audit_events row", () => {
    const sql = migrationFromSql(
      "create or replace function public.x() returns void language plpgsql security definer\n" +
        "as $$ begin return; end; $$;"
    );
    expect(() => assertPairedAuditInsert(sql, "x")).toThrow();
  });

  it("fails when the action label is absent from the body", () => {
    expect(() =>
      assertPairedAuditInsert(safe, "admin_do_thing", "'admin.other'")
    ).toThrow();
  });
});

describe("migration-safety — assertExecuteLockdown", () => {
  it("passes for revoke-from-all + grant-to-authenticated, whitespace and all", () => {
    expect(() => assertExecuteLockdown(safe, "admin_do_thing")).not.toThrow();
  });

  it("handles a multi-line argument list in the GRANT block", () => {
    const sql = migrationFromSql(`
revoke all on function public.f(
  a uuid,
  b text
) from public;
revoke all on function public.f(a uuid, b text) from anon;
revoke all on function public.f(a uuid, b text) from authenticated;
grant execute on function public.f(
  a uuid,
  b text
) to authenticated;
`);
    expect(() => assertExecuteLockdown(sql, "f")).not.toThrow();
  });

  it("fails when a revoke is missing", () => {
    const sql = migrationFromSql(
      "revoke all on function public.f() from public;\n" +
        "revoke all on function public.f() from authenticated;\n" +
        "grant execute on function public.f() to authenticated;"
    );
    expect(() => assertExecuteLockdown(sql, "f")).toThrow(); // no revoke from anon
  });

  it("accepts a combined revoke (from public, anon, authenticated)", () => {
    const sql = migrationFromSql(
      "revoke all on function public.f(\n  a uuid\n) from public, anon, authenticated;\n" +
        "grant execute on function public.f(a uuid) to authenticated;"
    );
    expect(() => assertExecuteLockdown(sql, "f")).not.toThrow();
  });

  it("fails when a combined revoke omits a role (from public, anon only)", () => {
    const sql = migrationFromSql(
      "revoke all on function public.f() from public, anon;\n" +
        "grant execute on function public.f() to authenticated;"
    );
    expect(() => assertExecuteLockdown(sql, "f")).toThrow(); // authenticated never revoked
  });

  it("fails when EXECUTE is granted to a broader role than authenticated", () => {
    const sql = migrationFromSql(
      "revoke all on function public.f() from public;\n" +
        "revoke all on function public.f() from anon;\n" +
        "revoke all on function public.f() from authenticated;\n" +
        "grant execute on function public.f() to public;"
    );
    expect(() => assertExecuteLockdown(sql, "f")).toThrow();
  });

  it("rejects a stray broader grant even when the authenticated grant is present", () => {
    const sql = migrationFromSql(
      "revoke all on function public.f() from public;\n" +
        "revoke all on function public.f() from anon;\n" +
        "revoke all on function public.f() from authenticated;\n" +
        "grant execute on function public.f() to authenticated;\n" +
        "grant execute on function public.f() to public;"
    );
    expect(() => assertExecuteLockdown(sql, "f")).toThrow();
  });

  it("rejects a comma-listed broad grantee (to authenticated, public)", () => {
    const sql = migrationFromSql(
      "revoke all on function public.f() from public;\n" +
        "revoke all on function public.f() from anon;\n" +
        "revoke all on function public.f() from authenticated;\n" +
        "grant execute on function public.f() to authenticated, public;"
    );
    expect(() => assertExecuteLockdown(sql, "f")).toThrow();
  });

  it("fails when the grant precedes the revoke from authenticated", () => {
    const sql = migrationFromSql(
      "grant execute on function public.f() to authenticated;\n" +
        "revoke all on function public.f() from public;\n" +
        "revoke all on function public.f() from anon;\n" +
        "revoke all on function public.f() from authenticated;"
    );
    expect(() => assertExecuteLockdown(sql, "f")).toThrow();
  });

  it("rejects an extra grantee alongside authenticated (to authenticated, service_role)", () => {
    const sql = migrationFromSql(
      "revoke all on function public.f() from public;\n" +
        "revoke all on function public.f() from anon;\n" +
        "revoke all on function public.f() from authenticated;\n" +
        "grant execute on function public.f() to authenticated, service_role;"
    );
    expect(() => assertExecuteLockdown(sql, "f")).toThrow();
  });

  it("rejects a separate grant to another role even with the authenticated grant present", () => {
    const sql = migrationFromSql(
      "revoke all on function public.f() from public;\n" +
        "revoke all on function public.f() from anon;\n" +
        "revoke all on function public.f() from authenticated;\n" +
        "grant execute on function public.f() to authenticated;\n" +
        "grant execute on function public.f() to service_role;"
    );
    expect(() => assertExecuteLockdown(sql, "f")).toThrow();
  });
});

describe("migration-safety — assertExcludesSuperAdmin", () => {
  it("passes when auth_is_admin() is never used", () => {
    expect(() => assertExcludesSuperAdmin(safe)).not.toThrow();
  });

  it("fails when auth_is_admin() appears (it admits super_admin)", () => {
    const sql = migrationFromSql(
      "create policy p on public.t using (public.auth_is_admin());"
    );
    expect(() => assertExcludesSuperAdmin(sql)).toThrow();
  });
});

describe("migration-safety — assertAuditContentFree", () => {
  it("auditEventInserts returns one block per audit insert", () => {
    expect(auditEventInserts(safe)).toHaveLength(1);
    expect(auditEventInserts(migrationFromSql("select 1;"))).toHaveLength(0);
  });

  it("passes when required tokens are present and forbidden ones absent", () => {
    expect(() =>
      assertAuditContentFree(safe, {
        forbidden: ["ciphertext", "wrapped_dek"],
        required: ["has_body"],
      })
    ).not.toThrow();
  });

  it("fails when a forbidden token leaks into the audit row", () => {
    expect(() =>
      assertAuditContentFree(safe, { forbidden: ["has_body"] })
    ).toThrow();
  });

  it("fails when a required token is missing", () => {
    expect(() =>
      assertAuditContentFree(safe, {
        forbidden: [],
        required: ["recovery_code"],
      })
    ).toThrow();
  });

  it("fails when there is no audit row at all", () => {
    const sql = migrationFromSql("select 1;");
    expect(() => assertAuditContentFree(sql, { forbidden: ["x"] })).toThrow();
  });
});
