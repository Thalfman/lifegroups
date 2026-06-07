import { describe, expect, it } from "vitest";

import {
  assertExecuteLockdown,
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
} from "./migration-safety";

// Static boundary assertions for the admin-UX cleanup migrations (over-shepherd
// archive toggle, care follow-up soft-archive, prospect edit/archive, and the
// transition archive-guard). CI has no Postgres, so these substring/regex checks
// are the CI-runnable regression guard for the security-critical invariants
// (SECURITY DEFINER + search_path, paired audit rows, EXECUTE lockdown) plus the
// behavior each migration introduces.

describe("admin_set_over_shepherd_active migration", () => {
  const sql = loadMigration(
    "20260619000000_admin_set_over_shepherd_active.sql"
  );

  it("is an admin-gated SECURITY DEFINER write with a paired audit row", () => {
    assertSecurityDefiner(sql, "admin_set_over_shepherd_active");
    assertPairedAuditInsert(sql, "admin_set_over_shepherd_active");
    assertExecuteLockdown(
      sql,
      "admin_set_over_shepherd_active",
      "uuid, boolean"
    );
  });

  it("maintains archived_at on the toggle (soft archive/restore)", () => {
    const body = functionBody(sql, "admin_set_over_shepherd_active");
    expect(body).toContain("archived_at");
    expect(body).toContain("for update");
  });
});

describe("admin_archive_shepherd_care_follow_up migration", () => {
  const sql = loadMigration(
    "20260619010000_admin_shepherd_care_follow_up_archive.sql"
  );

  it("adds the nullable archived_at column idempotently", () => {
    expect(sql.lower).toContain(
      "add column if not exists archived_at timestamptz"
    );
  });

  it("is an admin-gated SECURITY DEFINER write with a paired audit row", () => {
    assertSecurityDefiner(sql, "admin_archive_shepherd_care_follow_up");
    assertPairedAuditInsert(sql, "admin_archive_shepherd_care_follow_up");
    assertExecuteLockdown(sql, "admin_archive_shepherd_care_follow_up", "uuid");
  });

  it("re-gates the active leader/co_leader target and is idempotent", () => {
    const body = functionBody(sql, "admin_archive_shepherd_care_follow_up");
    expect(body).toContain("missing_profile");
    expect(body).toContain("coalesce(v_existing.archived_at, now())");
  });
});

describe("admin_update_prospect / admin_archive_prospect migration", () => {
  const sql = loadMigration("20260619020000_admin_prospect_edit_archive.sql");

  it("update is an admin-gated SECURITY DEFINER write with a paired audit row", () => {
    assertSecurityDefiner(sql, "admin_update_prospect");
    assertPairedAuditInsert(sql, "admin_update_prospect");
    assertExecuteLockdown(
      sql,
      "admin_update_prospect",
      "uuid, text, text, text"
    );
  });

  it("archive is an admin-gated SECURITY DEFINER write with a paired audit row", () => {
    assertSecurityDefiner(sql, "admin_archive_prospect");
    assertPairedAuditInsert(sql, "admin_archive_prospect");
    assertExecuteLockdown(sql, "admin_archive_prospect", "uuid");
  });

  it("archive sets archived = true without touching state/group", () => {
    const body = functionBody(sql, "admin_archive_prospect");
    expect(body).toContain("set archived = true");
    expect(body).not.toContain("set state");
  });
});

describe("admin_transition_prospect archive-guard migration", () => {
  const sql = loadMigration(
    "20260619030000_admin_transition_prospect_archive_guard.sql"
  );

  it("re-creates the transition RPC as an admin-gated SECURITY DEFINER write", () => {
    assertSecurityDefiner(sql, "admin_transition_prospect");
    assertPairedAuditInsert(sql, "admin_transition_prospect");
    assertExecuteLockdown(
      sql,
      "admin_transition_prospect",
      "uuid, public.prospect_state, uuid"
    );
  });

  it("rejects transitions on an archived prospect", () => {
    const body = functionBody(sql, "admin_transition_prospect");
    // Reads the existing archived flag and bails before mutating.
    expect(body).toContain("group_id, archived into");
    expect(body).toContain("if v_was_archived then");
    expect(body).toContain("raise exception 'prospect_archived'");
  });

  it("keeps the legal-edge + group-required + joined-archives invariants", () => {
    const body = functionBody(sql, "admin_transition_prospect");
    expect(body).toContain("illegal_transition");
    expect(body).toContain("group_required");
    expect(body).toContain("v_archived := (p_state = 'joined')");
  });
});
