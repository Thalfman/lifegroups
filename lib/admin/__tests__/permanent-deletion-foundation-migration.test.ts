import { beforeAll, describe, expect, it } from "vitest";

import {
  assertExecuteLockdown,
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// ADR 0014 (#312): static boundary assertions over the permanent-deletion
// foundation migration. CI has no Postgres, so these string assertions guard the
// security-critical invariants of the tombstone spine and the delete RPC.

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration(
    "20260604010000_phase_sad1_permanent_deletion_foundation.sql"
  );
});

describe("SAD1 — tombstones table", () => {
  it("creates the tombstones table with set-null dependent capture", () => {
    expect(sql.lower).toContain("create table if not exists public.tombstones");
    expect(sql.lower).toContain("row_snapshot jsonb not null");
    expect(sql.lower).toContain("set_null_dependents jsonb not null");
  });

  it("is super-admin read only with no write policy", () => {
    expect(sql.lower).toContain("enable row level security");
    expect(sql.lower).toContain("for select to authenticated using");
    expect(sql.lower).toContain("auth_role() = 'super_admin'");
    // No INSERT/UPDATE/DELETE policy — writes flow only through the RPC.
    expect(sql.lower).not.toMatch(
      /create policy[^;]*for (insert|update|delete)/
    );
    expect(sql.lower).toContain("grant  select on public.tombstones");
  });
});

describe("SAD1 — super_admin_deletable_table allowlist", () => {
  it("registers the launch_scenario foundation target", () => {
    const body = functionBody(sql, "super_admin_deletable_table");
    expect(body).toContain("'launch_scenario'");
    expect(body).toContain("launch_planning_scenarios");
    expect(body).toContain("else null");
  });

  it("is an internal helper — no EXECUTE grant", () => {
    expect(sql.lower).not.toMatch(
      /grant\s+execute\s+on\s+function\s+public\.super_admin_deletable_table/
    );
    expect(sql.lower).toContain(
      "revoke all on function public.super_admin_deletable_table(text) from authenticated"
    );
  });
});

describe("SAD1 — super_admin_collect_dependents", () => {
  it("walks inbound FKs via pg_constraint keyed on FK action", () => {
    const body = functionBody(sql, "super_admin_collect_dependents");
    expect(body).toContain("pg_constraint");
    expect(body).toContain("confdeltype");
    expect(body).toContain("contype = 'f'");
  });

  it("captures set-null dependents (with ids) and buckets the rest as blockers", () => {
    const body = functionBody(sql, "super_admin_collect_dependents");
    expect(body).toContain("'set_null'");
    expect(body).toContain("'blockers'");
    expect(body).toContain("jsonb_agg(t.id)");
    // 'n' (set null) is the captured bucket; everything else is a blocker.
    expect(body).toContain("if r.del_action = 'n' then");
  });

  it("is an internal helper — no EXECUTE grant", () => {
    expect(sql.lower).not.toMatch(
      /grant\s+execute\s+on\s+function\s+public\.super_admin_collect_dependents/
    );
    expect(sql.lower).toContain(
      "revoke all on function public.super_admin_collect_dependents(text, uuid) from authenticated"
    );
  });
});

describe("SAD1 — super_admin_permanent_delete", () => {
  it("is SECURITY DEFINER with a pinned search_path", () => {
    assertSecurityDefiner(sql, "super_admin_permanent_delete");
  });

  it("gates on auth_role() <> 'super_admin'", () => {
    expect(functionBody(sql, "super_admin_permanent_delete")).toContain(
      "auth_role() <> 'super_admin'"
    );
  });

  it("rejects unregistered targets with forbidden_target", () => {
    const body = functionBody(sql, "super_admin_permanent_delete");
    expect(body).toContain("super_admin_deletable_table(p_entity_type)");
    expect(body).toContain("raise exception 'forbidden_target'");
  });

  it("snapshots the row before removal and raises missing_entity when gone", () => {
    const body = functionBody(sql, "super_admin_permanent_delete");
    expect(body).toContain("to_jsonb");
    expect(body).toContain("raise exception 'missing_entity'");
    // The snapshot+tombstone must precede the delete.
    expect(body.indexOf("insert into public.tombstones")).toBeLessThan(
      body.indexOf("delete from public.")
    );
  });

  it("captures set-null dependents into the tombstone", () => {
    const body = functionBody(sql, "super_admin_permanent_delete");
    expect(body).toContain("super_admin_collect_dependents");
    expect(body).toContain("set_null");
  });

  it("writes one paired audit_events row", () => {
    assertPairedAuditInsert(
      sql,
      "super_admin_permanent_delete",
      "'super_admin.permanent_delete'"
    );
  });

  it("locks EXECUTE down to authenticated only", () => {
    assertExecuteLockdown(sql, "super_admin_permanent_delete", "text, uuid");
  });
});
