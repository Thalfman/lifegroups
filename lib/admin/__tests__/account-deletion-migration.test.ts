import { beforeAll, describe, expect, it } from "vitest";

import {
  assertAuditContentFree,
  assertExecuteLockdown,
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  selectPolicies,
  type MigrationSql,
} from "./migration-safety";

// Static boundary assertions over the account-deletion-request migration
// (#563). CI has no Postgres, so these string assertions guard the security
// invariants of the new table + self-service RPC.

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration("20260704000000_account_deletion_requests.sql");
});

describe("#563 migration — account_deletion_requests table", () => {
  it("creates the table with RLS enabled", () => {
    expect(sql.lower).toContain(
      "create table public.account_deletion_requests"
    );
    expect(sql.lower).toContain(
      "alter table public.account_deletion_requests enable row level security"
    );
  });

  it("references profiles ON DELETE SET NULL so a later purge isn't blocked", () => {
    // cascade/restrict dependents block super_admin_permanent_delete; set-null
    // is captured (recoverable). Both FKs to profiles must be set-null.
    expect(sql.lower).toContain(
      "profile_id uuid references public.profiles(id) on delete set null"
    );
    expect(sql.lower).toContain(
      "processed_by uuid references public.profiles(id) on delete set null"
    );
  });

  it("keeps at most one pending request per profile", () => {
    expect(sql.lower).toContain(
      "create unique index account_deletion_requests_one_pending_per_profile"
    );
    expect(sql.lower).toContain("where status = 'pending'");
  });

  it("is Super-Admin-only SELECT (Ministry Admin sealed out)", () => {
    const policies = selectPolicies(sql, "account_deletion_requests");
    expect(policies.map((p) => p.name)).toContain(
      "account_deletion_requests_super_admin_read"
    );
    const predicate = policies[0]?.predicate ?? "";
    expect(predicate).toContain("auth_role() = 'super_admin'");
    expect(predicate).not.toContain("auth_is_admin");
  });

  it("has NO insert/update/delete policies (RPC-only writes)", () => {
    expect(sql.lower).not.toMatch(
      /create policy[^;]*on public\.account_deletion_requests[^;]*for (insert|update|delete)/
    );
  });

  it("finalizes the retained request when the profile is permanently purged", () => {
    // The retained request row outlives the purge (profile_id SET NULL). A
    // BEFORE UPDATE trigger fires when the purge nulls profile_id and (a) wipes
    // the free-text reason so no PII outlives the deletion, and (b) marks a
    // still-pending row completed so it leaves the Super-Admin review queue.
    expect(sql.lower).toContain(
      "create trigger trg_account_deletion_requests_finalize_on_purge"
    );
    expect(sql.lower).toContain("before update of profile_id");
    const body = functionBody(
      sql,
      "account_deletion_requests_finalize_on_purge"
    );
    expect(body).toContain(
      "new.profile_id is null and old.profile_id is not null"
    );
    expect(body).toContain("new.reason := null");
    expect(body).toContain("new.status := 'completed'");
    expect(body).toContain("new.processed_at := now()");
  });
});

describe("#563 migration — request_own_account_deletion", () => {
  it("is SECURITY DEFINER with a pinned search_path", () => {
    assertSecurityDefiner(sql, "request_own_account_deletion");
  });

  it("gates on the caller's own active profile", () => {
    const body = functionBody(sql, "request_own_account_deletion");
    expect(body).toContain("auth_user_id = auth.uid()");
    expect(body).toContain("status is distinct from 'active'");
    expect(body).toContain("for update");
    expect(body).toContain("insufficient_privilege");
  });

  it("refuses the super_admin (purge stays a danger-zone action)", () => {
    const body = functionBody(sql, "request_own_account_deletion");
    expect(body).toContain("v_role = 'super_admin'");
    expect(body).toContain("forbidden_target");
  });

  it("blocks a duplicate pending request", () => {
    const body = functionBody(sql, "request_own_account_deletion");
    expect(body).toContain("deletion_already_requested");
  });

  it("soft-archives the profile to inactive — no hard delete", () => {
    const body = functionBody(sql, "request_own_account_deletion");
    expect(body).toContain("set status = 'inactive'");
    // No hard delete anywhere in this migration's normal workflow.
    expect(sql.lower).not.toMatch(/delete from public\.profiles/);
  });

  it("writes a paired, content-free audit row", () => {
    assertPairedAuditInsert(
      sql,
      "request_own_account_deletion",
      "'account.request_deletion'"
    );
    // Records presence only; the free-text reason itself is never recorded.
    assertAuditContentFree(sql, {
      forbidden: ["v_reason", "p_reason"],
      required: ["has_reason"],
    });
  });

  it("locks EXECUTE down to authenticated only", () => {
    assertExecuteLockdown(sql, "request_own_account_deletion", "text");
  });
});
