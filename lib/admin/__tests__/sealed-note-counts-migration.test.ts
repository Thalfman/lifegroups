import { beforeAll, describe, expect, it } from "vitest";

import {
  assertExecuteLockdown,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// Static boundary assertions over the ADR 0023 sealed-note counts migration.
// admin_sealed_note_counts is the ONE deliberate presence-only exception to the
// sealed-notes model: it tells an admin how many sealed care notes / prayer
// requests each gating leader holds — counts only, never content. These checks
// pin the gate (auth_is_admin, identical for both admin roles), both ADR 0020
// gating arms (subject for profile rows, author for group rows via coalesce),
// the caller-author exclusion, and that no content column can leave the
// function.

let sql: MigrationSql;
let body: string;

beforeAll(() => {
  sql = loadMigration("20260701010000_admin_sealed_note_counts.sql");
  body = functionBody(sql, "admin_sealed_note_counts");
});

describe("sealed-note counts migration — admin gate", () => {
  it("gates on auth_is_admin() with no super-admin bypass", () => {
    expect(body).toContain("if not public.auth_is_admin() then");
    expect(body).toContain("raise exception 'insufficient_privilege'");
    // No role-specific arm: ministry_admin and super_admin see identical counts.
    expect(body).not.toContain("'super_admin'");
    expect(body).not.toContain("'ministry_admin'");
  });

  it("derives the caller server-side and fails closed without a profile", () => {
    expect(body).toContain("v_actor := public.auth_profile_id()");
    expect(body).toMatch(/if v_actor is null then/);
  });
});

describe("sealed-note counts migration — counting rules", () => {
  it("resolves the gating leader per ADR 0020 (subject XOR author) for both tables", () => {
    // coalesce(subject_profile_id, author_profile_id) is the gating leader:
    // profile-subject rows gate on the subject, group-subject rows on the
    // author. Pin it for both the count source and the grant lookup, on both
    // tables.
    const arms = body.match(
      /coalesce\(\w\.subject_profile_id, \w\.author_profile_id\)/g
    );
    expect(arms?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(body).toContain("from public.care_notes");
    expect(body).toContain("from public.prayer_requests");
  });

  it("counts only rows whose gating leader's grant is off or absent", () => {
    expect(body).toContain("not exists");
    expect(body).toContain("from public.note_transparency_grants g");
    expect(body).toContain("and g.granted");
  });

  it("excludes the caller's own authored rows (the author already reads them)", () => {
    const exclusions = body.match(/author_profile_id <> v_actor/g);
    expect(exclusions?.length ?? 0).toBe(2);
  });

  it("returns counts only — no content column in the return shape", () => {
    const returnShape = sql.lower.slice(
      sql.lower.indexOf("returns table"),
      sql.lower.indexOf("language plpgsql")
    );
    expect(returnShape).toContain("gating_profile_id uuid");
    expect(returnShape).toContain("sealed_care_note_count integer");
    expect(returnShape).toContain("sealed_prayer_request_count integer");
    for (const column of ["body", "status", "created_at", "group_id"]) {
      expect(
        returnShape,
        `return shape must not expose ${column}`
      ).not.toContain(column);
    }
    // The query never selects a body — only ids and the kind discriminator.
    expect(body).not.toMatch(/\bn\.body\b|\br\.body\b/);
  });
});

describe("sealed-note counts migration — DEFINER + lockdown, read-only", () => {
  it("is SECURITY DEFINER with a pinned search_path", () => {
    assertSecurityDefiner(sql, "admin_sealed_note_counts");
  });

  it("is STABLE and writes nothing (read-only: no audit row, no inserts)", () => {
    expect(body).toContain("stable");
    expect(sql.lower).not.toContain("insert into");
    expect(sql.lower).not.toContain("update ");
    expect(sql.lower).not.toContain("delete from");
  });

  it("locks EXECUTE down to authenticated only", () => {
    assertExecuteLockdown(sql, "admin_sealed_note_counts", "");
  });
});
