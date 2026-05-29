import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

// Static boundary assertions over the SC.4 migration SQL. The repo has no
// DB-backed test runner and CI has no Postgres (RLS is verified manually per
// supabase/dev/README.md), so these assertions are the CI-runnable regression
// guard for the security-critical invariants: creator-scoped RLS that excludes
// super_admin, no write policies, content-free audit, EXECUTE lockdown. The
// env-gated real-DB enforcement suite lives in #114.

const MIGRATION_PATH = fileURLToPath(
  new URL(
    "../../../supabase/migrations/20260529008000_phase_sc4_private_care_notes.sql",
    import.meta.url,
  ),
);

let sql = "";
const lower = () => sql.toLowerCase();

// Returns the text of each `insert into public.audit_events ... ` statement,
// sliced to the `return` that follows it inside the same RPC body.
function auditInsertBlocks(): string[] {
  const blocks: string[] = [];
  const haystack = lower();
  let from = 0;
  for (;;) {
    const start = haystack.indexOf("insert into public.audit_events", from);
    if (start === -1) break;
    const end = haystack.indexOf("return ", start);
    blocks.push(haystack.slice(start, end === -1 ? undefined : end));
    from = start + 1;
  }
  return blocks;
}

beforeAll(() => {
  sql = readFileSync(MIGRATION_PATH, "utf8");
});

describe("SC.4 migration — tables are ciphertext-only", () => {
  it("creates both private-note tables", () => {
    expect(lower()).toContain("create table public.shepherd_care_private_notes");
    expect(lower()).toContain("create table public.shepherd_care_note_key_slots");
  });

  it("stores the note body as bytea ciphertext + iv, with no plaintext/text column", () => {
    const block = sql.slice(
      sql.indexOf("create table public.shepherd_care_private_notes"),
      sql.indexOf(");", sql.indexOf("create table public.shepherd_care_private_notes")),
    );
    expect(block).toMatch(/ciphertext\s+bytea\s+not null/i);
    expect(block).toMatch(/iv\s+bytea\s+not null/i);
    expect(block).toMatch(/dek_version\s+smallint/i);
    // No text/body column may exist on the ciphertext table.
    expect(block).not.toMatch(/\btext\b/i);
    expect(block).not.toMatch(/\bbody\b/i);
  });

  it("enforces one note per (care_profile_id, created_by_profile_id)", () => {
    expect(lower()).toMatch(
      /create unique index [\s\S]*shepherd_care_private_notes[\s\S]*\(care_profile_id, created_by_profile_id\)/,
    );
  });

  it("allows at most one recovery slot per creator per dek generation", () => {
    expect(lower()).toMatch(
      /create unique index [\s\S]*shepherd_care_note_key_slots[\s\S]*where slot_type = 'recovery'/,
    );
  });
});

describe("SC.4 migration — creator-scoped RLS excludes super_admin", () => {
  it("gates SELECT on both tables to the creating ministry_admin only", () => {
    const policyChunks = lower().split("create policy").slice(1);
    for (const table of ["shepherd_care_private_notes", "shepherd_care_note_key_slots"]) {
      const chunk = policyChunks.find((c) => c.includes(`on public.${table}`));
      expect(chunk, `${table} should have a SELECT policy`).toBeDefined();
      expect(chunk).toContain("for select to authenticated");
      expect(chunk).toContain("auth_role() = 'ministry_admin'");
      expect(chunk).toContain("created_by_profile_id = public.auth_profile_id()");
    }
  });

  it("never uses auth_is_admin() — that helper also admits super_admin", () => {
    expect(lower()).not.toContain("auth_is_admin");
  });

  it("adds no INSERT/UPDATE/DELETE policy (writes flow only through the RPCs)", () => {
    expect(lower()).not.toMatch(/for\s+insert/);
    expect(lower()).not.toMatch(/for\s+update/);
    expect(lower()).not.toMatch(/for\s+delete/);
  });

  it("grants SELECT only (never insert/update/delete) at the table level", () => {
    expect(lower()).toContain("grant select on public.shepherd_care_private_notes to authenticated");
    expect(lower()).toContain("grant select on public.shepherd_care_note_key_slots to authenticated");
    expect(lower()).not.toMatch(/grant\s+(insert|update|delete)/);
  });
});

describe("SC.4 migration — write RPCs are SECURITY DEFINER and actor-scoped", () => {
  it("defines the enroll and upsert RPCs as SECURITY DEFINER with a pinned search_path", () => {
    for (const fn of [
      "admin_enroll_private_note_keys",
      "admin_upsert_shepherd_care_private_note",
    ]) {
      const start = lower().indexOf(`function public.${fn}`);
      expect(start, `${fn} should be defined`).toBeGreaterThan(-1);
      const body = lower().slice(start, start + 2500);
      expect(body).toContain("security definer");
      expect(body).toContain("set search_path = public, pg_temp");
      expect(body).toContain("auth_role() = 'ministry_admin'");
    }
  });

  it("derives created_by from the actor and never accepts it as a client argument", () => {
    expect(lower()).toContain("public.auth_profile_id()");
    expect(lower()).not.toContain("p_created_by");
  });

  it("rejects an enrollment slot set with no recovery slot", () => {
    expect(lower()).toContain("missing_recovery_slot");
  });
});

describe("SC.4 migration — audit is content-free", () => {
  it("records has_body presence but never ciphertext or key material", () => {
    const blocks = auditInsertBlocks();
    expect(blocks.length).toBeGreaterThan(0);
    const joined = blocks.join("\n");
    expect(joined).toContain("has_body");
    for (const forbidden of [
      "ciphertext",
      "wrapped_dek",
      "prf_salt",
      "hkdf_salt",
      "wrap_iv",
      "recovery_code",
      "p_ciphertext",
      "p_slots",
    ]) {
      expect(joined, `audit metadata must not contain ${forbidden}`).not.toContain(forbidden);
    }
  });
});

describe("SC.4 migration — hardening (Codex review)", () => {
  it("the enroll RPC validates decoded wrapped-key byte lengths", () => {
    const start = lower().indexOf("function public.admin_enroll_private_note_keys");
    const body = lower().slice(start, lower().indexOf("$$;", start));
    expect(body).toContain("octet_length");
  });

  it("the upsert RPC refuses to persist a body before enrollment", () => {
    const start = lower().indexOf("function public.admin_upsert_shepherd_care_private_note");
    const body = lower().slice(start, lower().indexOf("$$;", start));
    expect(body).toContain("not_enrolled");
    expect(body).toContain("shepherd_care_note_key_slots");
  });
});

describe("SC.4 migration — EXECUTE lockdown", () => {
  it("revokes execute from public/anon/authenticated then grants to authenticated for each RPC", () => {
    for (const fn of [
      "admin_enroll_private_note_keys",
      "admin_upsert_shepherd_care_private_note",
    ]) {
      expect(lower()).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public`));
      expect(lower()).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from anon`));
      expect(lower()).toMatch(
        new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from authenticated`),
      );
      expect(lower()).toMatch(
        new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to authenticated`),
      );
    }
  });
});
