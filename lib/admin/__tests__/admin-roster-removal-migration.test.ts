import { beforeAll, describe, expect, it } from "vitest";

import {
  assertExecuteLockdown,
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// Static boundary assertions over the roster-removal migration (Groups/People
// overhaul): two new narrow removal RPCs plus the revive-on-conflict amendment
// to the two phase 5A.1 assign RPCs. CI has no Postgres, so these substring
// checks are the runnable regression guard for the security-critical
// invariants: admin-only SECURITY DEFINER writes with a pinned search_path,
// paired audit rows, soft flags only (no deletes), and the EXECUTE lockdown.

let sql: MigrationSql;

const UNASSIGN = "admin_unassign_leader_from_group";
const END_MEMBERSHIP = "admin_end_group_membership";
const ASSIGN_LEADER = "admin_assign_leader_to_group";
const ASSIGN_MEMBER = "admin_assign_member_to_group";

beforeAll(() => {
  sql = loadMigration("20260702000000_admin_roster_removal.sql");
});

describe("roster-removal migration — the two new removal RPCs", () => {
  for (const fn of [UNASSIGN, END_MEMBERSHIP]) {
    it(`${fn} is SECURITY DEFINER with a pinned search_path`, () => {
      assertSecurityDefiner(sql, fn);
    });

    it(`${fn} gates on auth_is_admin() and a non-null actor`, () => {
      const body = functionBody(sql, fn);
      expect(body).toContain("not public.auth_is_admin()");
      expect(body).toContain("raise exception 'insufficient_privilege'");
      expect(body).toContain("public.auth_profile_id()");
    });

    it(`${fn} locks down EXECUTE (deny by default, allow authenticated)`, () => {
      assertExecuteLockdown(sql, fn, "uuid, uuid");
    });

    it(`${fn} never deletes — soft flags only`, () => {
      const body = functionBody(sql, fn);
      expect(body).not.toMatch(/delete\s+from/i);
    });

    it(`${fn} raises missing_assignment when nothing is active`, () => {
      const body = functionBody(sql, fn);
      expect(body).toContain("raise exception 'missing_assignment'");
    });
  }

  it(`${UNASSIGN} writes a paired audit_events row and only flips active`, () => {
    assertPairedAuditInsert(
      sql,
      UNASSIGN,
      "'admin.unassign_leader_from_group'"
    );
    const body = functionBody(sql, UNASSIGN);
    expect(body).toContain("set active = false");
    // The person's own status is untouched — this is a roster move, not a
    // deactivation.
    expect(body).not.toContain("update public.profiles");
  });

  it(`${UNASSIGN} keeps the assign RPC's self guard`, () => {
    const body = functionBody(sql, UNASSIGN);
    expect(body).toContain("raise exception 'self_target_not_allowed'");
  });

  it(`${END_MEMBERSHIP} writes a paired audit_events row and ends, not deletes`, () => {
    assertPairedAuditInsert(
      sql,
      END_MEMBERSHIP,
      "'admin.end_group_membership'"
    );
    const body = functionBody(sql, END_MEMBERSHIP);
    expect(body).toContain("ended_at = current_date");
    expect(body).not.toContain("update public.members");
  });
});

describe("roster-removal migration — assign RPCs revive on conflict", () => {
  it(`${ASSIGN_LEADER} revives the inactive row the unique constraint blocks`, () => {
    const body = functionBody(sql, ASSIGN_LEADER);
    expect(body).toContain("when unique_violation then");
    expect(body).toContain("set active = true");
    expect(body).toContain("and active = false");
    // An ACTIVE conflicting row is still a real duplicate.
    expect(body).toContain("raise exception 'duplicate_assignment'");
    // The revive is visible in the audit metadata.
    expect(body).toContain("'revived', v_revived");
  });

  it(`${ASSIGN_MEMBER} revives the inactive row the unique constraint blocks`, () => {
    const body = functionBody(sql, ASSIGN_MEMBER);
    expect(body).toContain("when unique_violation then");
    expect(body).toContain("ended_at = null");
    expect(body).toContain("raise exception 'duplicate_assignment'");
    expect(body).toContain("'revived', v_revived");
  });

  it("amends the assign RPCs without re-granting (ACLs preserved)", () => {
    // create-or-replace keeps the phase 5A.1 grants; only the two NEW
    // functions get the revoke-then-grant block.
    const grantLines = sql.raw
      .split("\n")
      .filter((line) => /^grant\s/i.test(line.trim()));
    expect(grantLines).toHaveLength(2);
    expect(grantLines.join("\n")).toContain(UNASSIGN);
    expect(grantLines.join("\n")).toContain(END_MEMBERSHIP);
  });
});
