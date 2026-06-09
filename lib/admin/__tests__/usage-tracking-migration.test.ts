import { beforeAll, describe, expect, it } from "vitest";

import {
  assertExecuteLockdown,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// Static boundary assertions over the Phase USAGE.1 usage-tracking migration.
// CI has no Postgres (RLS is verified manually), so these string assertions are
// the CI-runnable regression guard for the security-critical invariants:
// log_usage_event is a SECURITY DEFINER function with a pinned search_path, it
// resolves the actor server-side, it self-gates on the usage_tracking flag (so
// turning the toggle off stops recording), it validates the event type + bounds
// the area to a slug, and usage_events is Super-Admin-only by RLS.

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration("20260628000000_phase_usage_tracking.sql");
});

describe("USAGE.1 migration — gated usage telemetry write", () => {
  it("defines log_usage_event as SECURITY DEFINER with a pinned search_path", () => {
    assertSecurityDefiner(sql, "log_usage_event");
  });

  it("resolves the actor server-side and no-ops when there is none", () => {
    const body = functionBody(sql, "log_usage_event");
    expect(body).toContain("auth_profile_id()");
    // A null actor returns rather than raising — telemetry must not error.
    expect(body).toMatch(/v_actor is null/);
  });

  it("self-gates on the usage_tracking flag, defaulting off", () => {
    const body = functionBody(sql, "log_usage_event");
    // Reads the flag out of the platform_config feature_flags blob ...
    expect(body).toContain("'feature_flags'");
    expect(body).toContain("'usage_tracking'");
    expect(body).toContain("'enabled'");
    // ... defaults to false (absent flag => off) ...
    expect(body).toContain("coalesce");
    expect(body).toContain("false");
    // ... and records nothing unless it resolves true.
    expect(body).toMatch(/v_enabled is not true/);
  });

  it("validates the event type and rejects anything else", () => {
    const body = functionBody(sql, "log_usage_event");
    expect(body).toContain("'login'");
    expect(body).toContain("'area_view'");
    expect(body).toContain("raise exception 'invalid_input'");
  });

  it("bounds the area to a lowercase slug (structural facts only, no free text)", () => {
    const body = functionBody(sql, "log_usage_event");
    expect(body).toContain("^[a-z][a-z-]{0,31}$");
  });

  it("locks EXECUTE down to authenticated only", () => {
    assertExecuteLockdown(sql, "log_usage_event", "text, text");
  });

  it("creates usage_events with Super-Admin-only SELECT RLS", () => {
    expect(sql.lower).toContain(
      "create table if not exists public.usage_events"
    );
    expect(sql.lower).toContain(
      "alter table public.usage_events enable row level security"
    );
    expect(sql.lower).toContain("for select to authenticated");
    expect(sql.lower).toContain("auth_role() = 'super_admin'");
  });

  it("exposes no INSERT/UPDATE/DELETE policy — the RPC is the only write path", () => {
    expect(sql.lower).not.toContain("for insert");
    expect(sql.lower).not.toContain("for update");
    expect(sql.lower).not.toContain("for delete");
  });

  it("does not write an audit_events row (telemetry is not audited)", () => {
    // Auditing every usage call would drown the audit log and leak Super-Admin
    // usage data into the ministry_admin-readable audit trail.
    expect(sql.lower).not.toContain("insert into public.audit_events");
  });

  it("never blocks profile deletion — actor FK is ON DELETE SET NULL", () => {
    expect(sql.lower).toContain(
      "references public.profiles(id) on delete set null"
    );
  });
});
