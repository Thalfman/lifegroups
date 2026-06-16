import { beforeAll, describe, expect, it } from "vitest";

import {
  assertExecuteLockdown,
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// Static boundary assertions over the group roster create-and-assign migration
// (#643). CI has no Postgres, so these substring checks are the runnable
// regression guard for the security-critical invariants: an admin-only
// SECURITY DEFINER write with a pinned search_path, ONE paired audit row for
// the whole create+assign, no deletes, and the EXECUTE lockdown.

let sql: MigrationSql;

const FN = "admin_add_person_to_group";
const SIGNATURE = "uuid, text, text, text, text, public.role_in_group";

beforeAll(() => {
  sql = loadMigration("20260706000000_admin_add_person_to_group.sql");
});

describe("admin_add_person_to_group migration (#643)", () => {
  it("is SECURITY DEFINER with a pinned search_path", () => {
    assertSecurityDefiner(sql, FN);
  });

  it("gates on auth_is_admin() and a non-null actor", () => {
    const body = functionBody(sql, FN);
    expect(body).toContain("not public.auth_is_admin()");
    expect(body).toContain("raise exception 'insufficient_privilege'");
    expect(body).toContain("public.auth_profile_id()");
  });

  it("locks down EXECUTE (deny by default, allow authenticated)", () => {
    assertExecuteLockdown(sql, FN, SIGNATURE);
  });

  it("writes exactly one paired audit_events row for the create+assign", () => {
    assertPairedAuditInsert(sql, FN, "'admin.add_person_to_group'");
    const body = functionBody(sql, FN);
    // One action covers both branches, so the action token appears once per
    // branch (leader, member) — but never more than that.
    const occurrences = body.split("'admin.add_person_to_group'").length - 1;
    expect(occurrences).toBe(2);
  });

  it("never deletes — create + assign only", () => {
    const body = functionBody(sql, FN);
    expect(body).not.toMatch(/delete\s+from/i);
  });

  it("creates a leader (profiles + group_leaders) and a member (members + group_memberships)", () => {
    const body = functionBody(sql, FN);
    expect(body).toContain("insert into public.profiles");
    expect(body).toContain("insert into public.group_leaders");
    expect(body).toContain("insert into public.members");
    expect(body).toContain("insert into public.group_memberships");
  });

  it("validates inputs and reuses the existing mapped error tokens", () => {
    const body = functionBody(sql, FN);
    expect(body).toContain("raise exception 'invalid_input'");
    expect(body).toContain("raise exception 'missing_group'");
    expect(body).toContain("raise exception 'duplicate_email'");
    expect(body).toContain("raise exception 'invalid_role'");
  });

  it("grants execute only to the new function", () => {
    const grantLines = sql.raw
      .split("\n")
      .filter((line) => /^grant\s/i.test(line.trim()));
    expect(grantLines).toHaveLength(1);
    expect(grantLines[0]).toContain(FN);
  });
});
