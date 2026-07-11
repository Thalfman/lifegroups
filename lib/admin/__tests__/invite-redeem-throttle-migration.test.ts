import { beforeAll, describe, expect, it } from "vitest";

import {
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// Static boundary assertions over the Phase IL.2 invite-redeem throttle
// migration. CI has no Postgres, so these guard the security-critical
// invariants of the throttle table + RPC as string assertions over the SQL.

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration("20260604130000_phase_il2_invite_redeem_throttle.sql");
});

describe("IL.2 migration — invite_redeem_throttle table", () => {
  it("creates the ledger idempotently with RLS enabled and no policies", () => {
    expect(sql.lower).toContain(
      "create table if not exists public.invite_redeem_throttle"
    );
    expect(sql.lower).toContain(
      "alter table public.invite_redeem_throttle enable row level security"
    );
    // Reachable only via the SECURITY DEFINER RPC / service role — no policies.
    expect(sql.lower).not.toContain("create policy");
  });
});

describe("IL.2 migration — check_invite_redeem_rate", () => {
  it("is SECURITY DEFINER with a pinned search_path", () => {
    assertSecurityDefiner(sql, "check_invite_redeem_rate");
  });

  it("is gated to the service role only", () => {
    const body = functionBody(sql, "check_invite_redeem_rate");
    expect(body).toContain("'service_role'");
    expect(body).toContain("edge_function_only");
  });

  it("enforces a sliding window: counts, limits, and records the attempt", () => {
    const body = functionBody(sql, "check_invite_redeem_rate");
    expect(body).toContain("now() - v_window");
    expect(body).toContain("v_count >= p_limit");
    expect(body).toContain(
      "insert into public.invite_redeem_throttle (throttle_key)"
    );
  });

  it("covers keyed peer-IP attempts but deliberately permits a missing key", () => {
    const body = functionBody(sql, "check_invite_redeem_rate");
    expect(body).toMatch(
      /if p_key is null or btrim\(p_key\) = '' then\s+return true;/
    );
    expect(body).toContain("where throttle_key = p_key");
  });

  it("serializes same-key checks with a per-key advisory lock", () => {
    const body = functionBody(sql, "check_invite_redeem_rate");
    expect(body).toContain("pg_advisory_xact_lock");
    // The lock is taken before the count so count+insert is atomic per key.
    expect(body.indexOf("pg_advisory_xact_lock")).toBeLessThan(
      body.indexOf("v_count >= p_limit")
    );
  });

  it("grants EXECUTE only to service_role (not anon/authenticated)", () => {
    expect(sql.lower).toContain(
      "grant  execute on function public.check_invite_redeem_rate(text, integer, integer) to service_role"
    );
    expect(sql.lower).not.toContain("to authenticated");
  });
});
