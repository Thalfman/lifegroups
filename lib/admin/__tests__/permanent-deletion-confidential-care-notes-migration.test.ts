import { beforeAll, describe, expect, it } from "vitest";

import {
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// ADR 0014 (#388): static boundary assertions over the SAD7 slice that seals
// author-private Care Notes / Prayer Requests in the permanent-delete preflight.
// The fix extends super_admin_confidential_block so the engine + preflight report
// these targets opaquely (confidential: true, no per-table counts) instead of
// leaking care-note / prayer-request counts as named cascade/restrict blockers.
// CI has no Postgres, so the live opaque-report behavior is asserted statically
// over the SQL (per supabase/dev/README.md); these checks pin the boundary.

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration(
    "20260609000000_phase_sad7_confidential_block_care_notes.sql"
  );
});

describe("SAD7 — confidential block seals author-private care notes", () => {
  it("redefines super_admin_confidential_block (the single opaque-block hook)", () => {
    expect(sql.lower).toContain(
      "create or replace function public.super_admin_confidential_block"
    );
  });

  it("blocks a PROFILE that is the subject OR author of a care note / prayer request", () => {
    const body = functionBody(sql, "super_admin_confidential_block");
    expect(body).toContain("if p_entity_type = 'profile' then");
    // Both note kinds, both leak vectors (subject = Leak A, author = Leak B).
    expect(body).toContain("from public.care_notes");
    expect(body).toContain("from public.prayer_requests");
    expect(body).toContain("subject_profile_id = p_id");
    expect(body).toContain("author_profile_id = p_id");
  });

  it("blocks a GROUP that is the subject of a leader's group note / prayer request", () => {
    const body = functionBody(sql, "super_admin_confidential_block");
    expect(body).toContain("if p_entity_type = 'group' then");
    expect(body).toContain("subject_group_id = p_id");
  });

  it("preserves the SC.4 private-care-note arm for profiles", () => {
    const body = functionBody(sql, "super_admin_confidential_block");
    expect(body).toContain("shepherd_care_private_notes");
    expect(body).toContain("shepherd_care_profiles");
  });

  it("is existence-only — never reads a note body / ciphertext", () => {
    const body = functionBody(sql, "super_admin_confidential_block");
    expect(body).toContain("exists (");
    // No content columns: the block leaks neither body nor ciphertext.
    expect(body).not.toContain("ciphertext");
    expect(body).not.toContain(".body");
    expect(body).not.toContain("select body");
  });

  it("stays an internal helper with no EXECUTE grant (reached only via the engine)", () => {
    // Revoked from every role; never granted EXECUTE — it is callable only from
    // the SECURITY DEFINER engine/preflight, which short-circuit on it.
    expect(sql.lower).toContain(
      "revoke all on function public.super_admin_confidential_block(text, uuid) from authenticated"
    );
    expect(sql.lower).not.toContain(
      "grant  execute on function public.super_admin_confidential_block"
    );
    expect(sql.lower).not.toContain(
      "grant execute on function public.super_admin_confidential_block"
    );
  });

  it("pins an injection-safe search_path", () => {
    const body = functionBody(sql, "super_admin_confidential_block");
    expect(body).toContain("set search_path = public, pg_temp");
  });
});
