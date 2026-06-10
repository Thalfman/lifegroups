import { beforeAll, describe, expect, it } from "vitest";

import {
  assertAuditContentFree,
  assertExecuteLockdown,
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// Static boundary assertions over the ADR 0023 authorship migration. It
// CREATE OR REPLACEs the two #381 note writes so the Ministry Admin (and Super
// Admin, via auth_is_admin) joins the author set alongside the covering
// Over-Shepherd. CI has no Postgres, so these substring checks pin the
// security-critical invariants: the widened-but-bounded authorship gate, the
// untouched subject boundary (active leader/co_leader only), SECURITY DEFINER
// + paired content-free audit + EXECUTE lockdown, and — crucially — that the
// migration changes NO read policy: visibility stays sealed-by-default.

const WRITE_RPCS = [
  { name: "admin_write_care_note", args: "uuid, text" },
  { name: "admin_write_prayer_request", args: "uuid, text" },
] as const;

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration("20260701000000_admin_care_note_authorship.sql");
});

describe("ADR 0023 authorship migration — widened, bounded author gate", () => {
  for (const { name } of WRITE_RPCS) {
    it(`${name} admits an admin OR a covering over-shepherd, nothing broader`, () => {
      const body = functionBody(sql, name);
      // The gate is a single disjunction, refused with the original token.
      expect(body).toContain("public.auth_is_admin()");
      expect(body).toContain(
        "public.auth_over_shepherd_covers(p_subject_profile_id)"
      );
      expect(body).toContain("raise exception 'not_covered'");
      // The author is still derived server-side, never a client argument.
      expect(body).toContain("v_actor := public.auth_profile_id()");
    });

    it(`${name} keeps the subject boundary: an active leader/co_leader only`, () => {
      const body = functionBody(sql, name);
      expect(body).toContain("'leader'::public.user_role");
      expect(body).toContain("'co_leader'::public.user_role");
      expect(body).toContain(
        "v_target.status <> 'active'::public.profile_status"
      );
      expect(body).toContain("raise exception 'missing_profile'");
    });

    it(`${name} keeps the trimmed, 4000-bounded body check`, () => {
      const body = functionBody(sql, name);
      expect(body).toContain("length(v_body) > 4000");
      expect(body).toContain("raise exception 'invalid_input'");
    });
  }
});

describe("ADR 0023 authorship migration — visibility model untouched", () => {
  it("changes no RLS policy and no table grant (write-path-only migration)", () => {
    // Sealed-by-default is load-bearing: this migration must not restate or
    // alter any SELECT policy, or the truth table pinned by the #381/#382
    // suites could silently fork.
    expect(sql.lower).not.toContain("create policy");
    expect(sql.lower).not.toContain("drop policy");
    expect(sql.lower).not.toMatch(/grant\s+select/);
    expect(sql.lower).not.toContain("alter table");
  });

  it("never touches the transparency grants or the SC.4 private-note model", () => {
    expect(sql.lower).not.toContain("set_note_transparency_grant");
    expect(sql.lower).not.toContain("shepherd_care_private_notes");
    expect(sql.lower).not.toContain("shepherd_care_note_key_slots");
  });
});

describe("ADR 0023 authorship migration — DEFINER + audit + lockdown", () => {
  for (const { name, args } of WRITE_RPCS) {
    it(`${name} is SECURITY DEFINER with a pinned search_path`, () => {
      assertSecurityDefiner(sql, name);
    });

    it(`${name} writes a paired audit_events row`, () => {
      assertPairedAuditInsert(sql, name);
    });

    it(`${name} locks EXECUTE down to authenticated only`, () => {
      assertExecuteLockdown(sql, name, args);
    });
  }

  it("keeps the original action labels so audit dashboards don't fork", () => {
    assertPairedAuditInsert(
      sql,
      "admin_write_care_note",
      "'admin.care_note.write'"
    );
    assertPairedAuditInsert(
      sql,
      "admin_write_prayer_request",
      "'admin.prayer_request.write'"
    );
  });

  it("never writes note/prayer bodies into audit metadata (presence flag only)", () => {
    assertAuditContentFree(sql, {
      forbidden: ["'body', v_body", "'body', p_body", "v_body)", "p_body)"],
      required: ["has_body"],
    });
  });
});
