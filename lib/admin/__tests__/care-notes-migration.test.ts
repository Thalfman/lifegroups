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

// Static boundary assertions over the Pivot slice 9 migration (#381 / ADR 0017).
// CI has no Postgres (RLS is verified manually per supabase/dev/README.md), so
// these substring/regex checks are the runnable regression guard for the
// security-critical invariants: three tables; the grant-gated ladder read for
// BOTH Ministry Admin AND Super Admin (Super Admin gates on the SAME grant, it
// does not bypass); the author-only read path; separation from the SC.4 private
// care note; and SECURITY DEFINER + paired content-free audit + EXECUTE lockdown
// for all three RPCs.

const WRITE_RPCS = [
  { name: "admin_write_care_note", args: "uuid, text" },
  { name: "admin_write_prayer_request", args: "uuid, text" },
  { name: "set_note_transparency_grant", args: "uuid, boolean" },
] as const;

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration("20260608090000_phase_pivot9_care_notes.sql");
});

describe("pivot9 care-notes migration — three tables", () => {
  it("creates note_transparency_grants, care_notes, and prayer_requests", () => {
    expect(sql.lower).toContain(
      "create table if not exists public.note_transparency_grants"
    );
    expect(sql.lower).toContain("create table if not exists public.care_notes");
    expect(sql.lower).toContain(
      "create table if not exists public.prayer_requests"
    );
  });

  it("models note_transparency_grants as a per-subject toggle defaulting to DENIED", () => {
    const block = sql.raw.slice(
      sql.raw.indexOf(
        "create table if not exists public.note_transparency_grants"
      ),
      sql.raw.indexOf(
        ");",
        sql.raw.indexOf(
          "create table if not exists public.note_transparency_grants"
        )
      )
    );
    expect(block).toMatch(/subject_profile_id\s+uuid\s+not null\s+unique/i);
    expect(block).toMatch(/granted\s+boolean\s+not null\s+default false/i);
    expect(block).toMatch(/set_by\s+uuid/i);
    // Default DENIED: the boolean column must default to false.
    expect(block).not.toMatch(/granted\s+boolean\s+not null\s+default true/i);
  });

  it("gives care_notes + prayer_requests an author, subject, and text body", () => {
    for (const table of ["care_notes", "prayer_requests"]) {
      const block = sql.raw.slice(
        sql.raw.indexOf(`create table if not exists public.${table}`),
        sql.raw.indexOf(
          ");",
          sql.raw.indexOf(`create table if not exists public.${table}`)
        )
      );
      expect(block).toMatch(/author_profile_id\s+uuid\s+not null/i);
      expect(block).toMatch(/subject_profile_id\s+uuid\s+not null/i);
      expect(block).toMatch(/body\s+text\s+not null/i);
    }
  });
});

describe("pivot9 care-notes migration — RLS truth table", () => {
  it("enables RLS on all three tables", () => {
    expect(sql.lower).toContain(
      "alter table public.note_transparency_grants enable row level security"
    );
    expect(sql.lower).toContain(
      "alter table public.care_notes              enable row level security"
    );
    expect(sql.lower).toContain(
      "alter table public.prayer_requests         enable row level security"
    );
  });

  it("opens an author-only read path on care_notes + prayer_requests", () => {
    const policyChunks = sql.lower.split("create policy").slice(1);
    for (const table of ["care_notes", "prayer_requests"]) {
      // Match on the CREATE POLICY chunk by its name prefix, not "on public.<table>"
      // (a DROP POLICY ... ON public.<table> guard lands in a neighbouring chunk).
      const chunk = policyChunks.find((c) =>
        c.trimStart().startsWith(`${table}_author_or_granted_select`)
      );
      expect(chunk, `${table} should have a SELECT policy`).toBeDefined();
      expect(chunk).toContain("for select to authenticated");
      // The author always reads their own rows, grant-independent.
      expect(chunk).toContain("author_profile_id = public.auth_profile_id()");
    }
  });

  it("gates the ladder read on the SAME active transparency grant (no super-admin bypass)", () => {
    // Both Ministry Admin AND Super Admin read through auth_is_admin() (which
    // admits exactly those two roles) AND the grant EXISTS subquery. There is no
    // separate, broader super-admin arm — Super Admin sees exactly what Ministry
    // Admin sees.
    const policyChunks = sql.lower.split("create policy").slice(1);
    for (const table of ["care_notes", "prayer_requests"]) {
      const chunk = policyChunks.find((c) =>
        c.trimStart().startsWith(`${table}_author_or_granted_select`)
      );
      expect(chunk).toContain("public.auth_is_admin()");
      expect(chunk).toContain("from public.note_transparency_grants g");
      expect(chunk).toContain(
        `g.subject_profile_id = ${table}.subject_profile_id`
      );
      expect(chunk).toContain("and g.granted");
      // No unconditional admin read: the admin arm must be conjoined with the
      // grant EXISTS, never a bare auth_is_admin() that would let the ladder
      // (or super_admin) read a sealed note.
      expect(chunk).not.toMatch(/or\s+public\.auth_is_admin\(\)\s*\)/);
    }
  });

  it("keeps the grant table itself admin-only (no leader/over_shepherd read)", () => {
    const policyChunks = sql.lower.split("create policy").slice(1);
    const grantPolicies = policyChunks.filter((c) =>
      c.trimStart().startsWith("note_transparency_grants_admin_select")
    );
    expect(grantPolicies.length).toBeGreaterThan(0);
    for (const policy of grantPolicies) {
      expect(policy).toContain("public.auth_is_admin()");
      expect(policy).not.toContain("'over_shepherd'");
      expect(policy).not.toContain("auth_role() = 'leader'");
    }
  });

  it("writes no insert/update/delete policies (RPC-only writes)", () => {
    // Scope to CREATE POLICY chunks: a `select ... for update` row lock in an
    // RPC body legitimately contains "for update" but is not a policy.
    const policyChunks = sql.lower.split("create policy").slice(1);
    for (const chunk of policyChunks) {
      const clause = chunk.slice(0, chunk.indexOf("using"));
      expect(clause).not.toContain("for insert");
      expect(clause).not.toContain("for update");
      expect(clause).not.toContain("for delete");
      expect(clause).toContain("for select");
    }
  });

  it("grants only SELECT on the three tables to authenticated", () => {
    for (const table of [
      "note_transparency_grants",
      "care_notes",
      "prayer_requests",
    ]) {
      expect(sql.lower).toContain(
        `grant  select on public.${table} to authenticated`
      );
      expect(sql.lower).toContain(
        `revoke all    on public.${table} from authenticated`
      );
    }
  });
});

describe("pivot9 care-notes migration — separation from the SC.4 private note", () => {
  it("never touches the SC.4 private-note tables or RPCs", () => {
    expect(sql.lower).not.toContain("shepherd_care_private_notes");
    expect(sql.lower).not.toContain("shepherd_care_note_key_slots");
    expect(sql.lower).not.toContain("admin_upsert_shepherd_care_private_note");
    // No ciphertext / DEK key material — this is a plaintext-body, toggle-gated
    // model, the inverse of the zero-knowledge SC.4 note.
    expect(sql.lower).not.toContain("ciphertext");
    expect(sql.lower).not.toContain("wrapped_dek");
  });
});

describe("pivot9 care-notes migration — authored writes", () => {
  it("scopes both note writes to the over-shepherd coverage predicate", () => {
    for (const fn of ["admin_write_care_note", "admin_write_prayer_request"]) {
      const body = functionBody(sql, fn);
      expect(body).toContain(
        "public.auth_over_shepherd_covers(p_subject_profile_id)"
      );
      expect(body).toContain("raise exception 'not_covered'");
      // The author is derived server-side, never trusted from a client argument.
      expect(body).toContain("v_actor := public.auth_profile_id()");
      expect(body).toContain("author_profile_id");
    }
  });

  it("gates the transparency-grant write on auth_is_admin()", () => {
    const body = functionBody(sql, "set_note_transparency_grant");
    expect(body).toContain("if not public.auth_is_admin() then");
    expect(body).toContain("v_actor := public.auth_profile_id()");
  });
});

describe("pivot9 care-notes migration — SECURITY DEFINER + audit + lockdown", () => {
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

  it("records action labels on the paired audit rows", () => {
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
    assertPairedAuditInsert(
      sql,
      "set_note_transparency_grant",
      "'admin.note_transparency_grant.set'"
    );
  });

  it("never writes note/prayer bodies into audit metadata (presence flag only)", () => {
    // The migration mentions `body` as a column + a v_body local, so a blanket
    // ban on the substring is wrong. Instead assert each audit insert records a
    // presence flag and never a body value: the audit blocks contain has_body
    // but never the v_body / p_body local that carries the actual text.
    assertAuditContentFree(sql, {
      forbidden: ["'body', v_body", "'body', p_body", "v_body)", "p_body)"],
      required: ["has_body"],
    });
  });
});
