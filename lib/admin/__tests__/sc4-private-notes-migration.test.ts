import { beforeAll, describe, expect, it } from "vitest";

import {
  assertAuditContentFree,
  assertExcludesSuperAdmin,
  assertExecuteLockdown,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// Static boundary assertions over the SC.4 migration SQL. The repo has no
// DB-backed test runner and CI has no Postgres (RLS is verified manually per
// supabase/dev/README.md), so these assertions are the CI-runnable regression
// guard for the security-critical invariants: creator-scoped RLS that excludes
// super_admin, no write policies, content-free audit, EXECUTE lockdown. The
// security-critical invariants compose the shared migration-safety vocabulary
// (see ./migration-safety.ts). The env-gated real-DB enforcement suite is #114.

const WRITE_RPCS = [
  "admin_enroll_private_note_keys",
  "admin_upsert_shepherd_care_private_note",
];

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration("20260529008000_phase_sc4_private_care_notes.sql");
});

describe("SC.4 migration — tables are ciphertext-only", () => {
  it("creates both private-note tables", () => {
    expect(sql.lower).toContain(
      "create table public.shepherd_care_private_notes"
    );
    expect(sql.lower).toContain(
      "create table public.shepherd_care_note_key_slots"
    );
  });

  it("stores the note body as bytea ciphertext + iv, with no plaintext/text column", () => {
    const block = sql.raw.slice(
      sql.raw.indexOf("create table public.shepherd_care_private_notes"),
      sql.raw.indexOf(
        ");",
        sql.raw.indexOf("create table public.shepherd_care_private_notes")
      )
    );
    expect(block).toMatch(/ciphertext\s+bytea\s+not null/i);
    expect(block).toMatch(/iv\s+bytea\s+not null/i);
    expect(block).toMatch(/dek_version\s+smallint/i);
    // No text/body column may exist on the ciphertext table.
    expect(block).not.toMatch(/\btext\b/i);
    expect(block).not.toMatch(/\bbody\b/i);
  });

  it("enforces one note per (care_profile_id, created_by_profile_id)", () => {
    expect(sql.lower).toMatch(
      /create unique index [\s\S]*shepherd_care_private_notes[\s\S]*\(care_profile_id, created_by_profile_id\)/
    );
  });

  it("allows at most one recovery slot per creator per dek generation", () => {
    expect(sql.lower).toMatch(
      /create unique index [\s\S]*shepherd_care_note_key_slots[\s\S]*where slot_type = 'recovery'/
    );
  });
});

describe("SC.4 migration — creator-scoped RLS excludes super_admin", () => {
  it("gates SELECT on both tables to the creating ministry_admin only", () => {
    const policyChunks = sql.lower.split("create policy").slice(1);
    for (const table of [
      "shepherd_care_private_notes",
      "shepherd_care_note_key_slots",
    ]) {
      const chunk = policyChunks.find((c) => c.includes(`on public.${table}`));
      expect(chunk, `${table} should have a SELECT policy`).toBeDefined();
      expect(chunk).toContain("for select to authenticated");
      expect(chunk).toContain("auth_role() = 'ministry_admin'");
      expect(chunk).toContain(
        "created_by_profile_id = public.auth_profile_id()"
      );
    }
  });

  it("never uses auth_is_admin() — that helper also admits super_admin", () => {
    assertExcludesSuperAdmin(sql);
  });

  it("adds no INSERT/UPDATE/DELETE policy (writes flow only through the RPCs)", () => {
    expect(sql.lower).not.toMatch(/for\s+insert/);
    expect(sql.lower).not.toMatch(/for\s+update/);
    expect(sql.lower).not.toMatch(/for\s+delete/);
  });

  it("grants SELECT only (never insert/update/delete) at the table level", () => {
    expect(sql.lower).toContain(
      "grant select on public.shepherd_care_private_notes to authenticated"
    );
    expect(sql.lower).toContain(
      "grant select on public.shepherd_care_note_key_slots to authenticated"
    );
    expect(sql.lower).not.toMatch(/grant\s+(insert|update|delete)/);
  });
});

describe("SC.4 migration — write RPCs are SECURITY DEFINER and actor-scoped", () => {
  it("defines the enroll and upsert RPCs as SECURITY DEFINER with a pinned search_path", () => {
    for (const fn of WRITE_RPCS) {
      assertSecurityDefiner(sql, fn);
      expect(functionBody(sql, fn)).toContain("auth_role() = 'ministry_admin'");
    }
  });

  it("derives created_by from the actor and never accepts it as a client argument", () => {
    expect(sql.lower).toContain("public.auth_profile_id()");
    expect(sql.lower).not.toContain("p_created_by");
  });

  it("rejects an enrollment slot set with no recovery slot", () => {
    expect(sql.lower).toContain("missing_recovery_slot");
  });
});

describe("SC.4 migration — audit is content-free", () => {
  it("records has_body presence but never ciphertext or key material", () => {
    assertAuditContentFree(sql, {
      required: ["has_body"],
      forbidden: [
        "ciphertext",
        "wrapped_dek",
        "prf_salt",
        "hkdf_salt",
        "wrap_iv",
        "recovery_code",
        "p_ciphertext",
        "p_slots",
      ],
    });
  });
});

describe("SC.4 migration — hardening (Codex review)", () => {
  it("the enroll RPC validates decoded wrapped-key byte lengths", () => {
    expect(functionBody(sql, "admin_enroll_private_note_keys")).toContain(
      "octet_length"
    );
  });

  it("the upsert RPC refuses to persist a body before enrollment", () => {
    const body = functionBody(sql, "admin_upsert_shepherd_care_private_note");
    expect(body).toContain("not_enrolled");
    expect(body).toContain("shepherd_care_note_key_slots");
  });
});

describe("SC.4 migration — EXECUTE lockdown", () => {
  it("revokes execute from public/anon/authenticated then grants to authenticated for each RPC", () => {
    for (const fn of WRITE_RPCS) {
      assertExecuteLockdown(sql, fn);
    }
  });
});
