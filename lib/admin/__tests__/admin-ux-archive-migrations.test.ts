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

describe("archive_over_shepherd_ends_coverage migration (#423)", () => {
  const sql = loadMigration(
    "20260622000000_archive_over_shepherd_ends_coverage.sql"
  );

  it("re-creates the one-click archive RPC as an admin-gated SECURITY DEFINER write with paired audit + EXECUTE lockdown", () => {
    assertSecurityDefiner(sql, "admin_set_over_shepherd_active");
    assertPairedAuditInsert(
      sql,
      "admin_set_over_shepherd_active",
      "'admin.set_over_shepherd_active'"
    );
    assertExecuteLockdown(
      sql,
      "admin_set_over_shepherd_active",
      "uuid, boolean"
    );
  });

  it("ends the over-shepherd's active coverage on the archive transition", () => {
    const body = functionBody(sql, "admin_set_over_shepherd_active");
    // Only on the active true -> false archive transition.
    expect(body).toContain("= false and v_existing.active = true");
    // Bulk soft-ends this over-shepherd's active assignments (no hard delete).
    expect(body).toContain("update public.shepherd_coverage_assignments");
    expect(body).toContain("over_shepherd_id = p_over_shepherd_id");
    expect(body).toContain("and active = true");
    // Clamps ended_at so the ended_at >= assigned_at CHECK can't abort the
    // archive (mirrors admin_update_over_shepherd's hardened cascade).
    expect(body).toContain("greatest(");
    expect(body).toContain("assigned_at");
    // The ended count is folded into the audit row (no per-assignment row),
    // under the same key the edit-form cascade uses.
    expect(body).toContain("ended_active_assignments_count");
  });

  it("does NOT re-create admin_update_over_shepherd (its hardened cascade is already correct)", () => {
    expect(sql.lower).not.toContain(
      "function public.admin_update_over_shepherd"
    );
  });

  it("backfills assignments left active under already-archived over-shepherds with a system audit row", () => {
    expect(sql.lower).toContain(
      "system.backfill_end_coverage_for_archived_over_shepherds"
    );
    // Only assignments whose over-shepherd is inactive are ended.
    expect(sql.lower).toContain("os.active is not true");
    expect(sql.lower).toContain("sca.active = true");
    // Same ended_at clamp as the cascade.
    expect(sql.lower).toContain("greatest(current_date, sca.assigned_at)");
  });
});
