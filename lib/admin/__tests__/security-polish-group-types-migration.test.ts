import { beforeAll, describe, expect, it } from "vitest";

import {
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// Static boundary assertions over the security P3 polish migration (#819,
// audit findings SEC-3 + SEC-5). CI has no Postgres, so these substring/
// position checks are the runnable regression guard: admin_set_group_types now
// takes the list advisory lock BEFORE its snapshot pre-read (the 20260617
// lock-before-snapshot pattern), and admin_add_person_to_group's leader branch
// audits presence flags instead of a plaintext email — while both keep their
// SECURITY DEFINER + pinned search_path envelope and paired audit row.

const MIGRATION =
  "20260713000000_security_polish_group_types_lock_and_presence_flags.sql";

// Strip SQL line comments so substring/position checks see only executable SQL
// (the lock's explanatory comment mentions "FOR UPDATE", which would otherwise
// mis-order the check) — same guard as the 20260617 migration test.
const stripComments = (body: string): string => body.replace(/--[^\n]*/g, "");

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration(MIGRATION);
});

describe("security polish migration — scope", () => {
  it("recreates exactly the two RPCs — no scope creep", () => {
    const defs = sql.lower.match(/create\s+or\s+replace\s+function/g) ?? [];
    expect(defs.length).toBe(2);
  });

  it("changes no grants, policies, or schema", () => {
    const executable = stripComments(sql.lower);
    expect(executable).not.toMatch(/\b(grant|revoke)\s/);
    expect(executable).not.toContain("create policy");
    expect(executable).not.toMatch(/\b(create|alter|drop)\s+table\b/);
  });
});

describe("admin_set_group_types — lock before snapshot (SEC-3)", () => {
  const FN = "admin_set_group_types";

  it("takes the group_types advisory lock, keyed to serialize with admin_add_group_type", () => {
    const body = functionBody(sql, FN);
    expect(body).toContain("pg_advisory_xact_lock");
    // Same key pair as admin_add_group_type (20260711000000), so whole-list
    // replace and single-name append serialize against each other.
    expect(body).toContain("hashtext('group_types')");
    expect(body).toContain("hashtext('append')");
  });

  it("takes the lock BEFORE the snapshot pre-read and the insert-or-update", () => {
    const body = stripComments(functionBody(sql, FN));
    const lock = body.indexOf("pg_advisory_xact_lock");
    const snapshot = body.indexOf("for update");
    const write = body.indexOf("insert into public.app_settings");
    expect(lock).toBeGreaterThan(-1);
    expect(snapshot).toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(-1);
    expect(
      lock,
      `${FN} should lock before its FOR UPDATE snapshot`
    ).toBeLessThan(snapshot);
    expect(lock, `${FN} should lock before the first write`).toBeLessThan(
      write
    );
  });

  it("keeps the SECURITY DEFINER envelope, validation, and paired audit row", () => {
    assertSecurityDefiner(sql, FN);
    assertPairedAuditInsert(sql, FN, "'admin.set_group_types'");
    const body = functionBody(sql, FN);
    expect(body).toContain("jsonb_typeof(p_types) <> 'array'");
    expect(body).toContain("raise exception 'insufficient_privilege'");
  });
});

describe("admin_add_person_to_group — presence-flag audit metadata (SEC-5)", () => {
  const FN = "admin_add_person_to_group";

  it("audits contact presence flags on BOTH branches — no plaintext email", () => {
    const body = functionBody(sql, FN);
    const flags = body.match(/'email_present', v_email is not null/g) ?? [];
    expect(flags.length, "leader AND member branches").toBe(2);
    expect(body).not.toContain("'email', v_email");
  });

  it("keeps the SECURITY DEFINER envelope, guards, and paired audit rows", () => {
    assertSecurityDefiner(sql, FN);
    assertPairedAuditInsert(sql, FN, "'admin.add_person_to_group'");
    const body = functionBody(sql, FN);
    expect(body).toContain("v_kind is null or v_kind not in");
    expect(body).toContain("raise exception 'group_closed'");
    expect(body).not.toMatch(/delete\s+from/i);
  });
});
