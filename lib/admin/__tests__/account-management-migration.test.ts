import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

// Static boundary assertions over the SAC.3 account-management migration (#163).
// CI has no Postgres, so these string assertions are the CI-runnable regression
// guard for the security-critical invariants of the two RPCs.

const MIGRATION_PATH = fileURLToPath(
  new URL(
    "../../../supabase/migrations/20260531020000_phase_sac3_account_management.sql",
    import.meta.url
  )
);

let sql = "";
const lower = () => sql.toLowerCase();

beforeAll(() => {
  sql = readFileSync(MIGRATION_PATH, "utf8");
});

describe("SAC.3 migration — super_admin_set_profile_status", () => {
  it("defines the RPC as SECURITY DEFINER with a pinned search_path", () => {
    expect(lower()).toContain(
      "create or replace function public.super_admin_set_profile_status"
    );
    const fn = lower().slice(lower().indexOf("super_admin_set_profile_status"));
    expect(fn).toContain("security definer");
    expect(fn).toContain("set search_path = public, pg_temp");
  });

  it("gates on auth_role() = 'super_admin'", () => {
    expect(lower()).toContain("auth_role() <> 'super_admin'");
  });

  it("constrains status to active/inactive", () => {
    expect(lower()).toContain("not in ('active', 'inactive')");
  });

  it("blocks self-target and the bootstrap super_admin", () => {
    expect(lower()).toContain("self_target_not_allowed");
    expect(lower()).toContain("forbidden_target");
  });

  it("writes a paired audit_events row", () => {
    expect(lower()).toContain("insert into public.audit_events");
    expect(lower()).toContain("'super_admin.set_profile_status'");
  });
});

describe("SAC.3 migration — super_admin_log_password_reset", () => {
  it("defines the audit-only RPC behind the super-admin gate", () => {
    expect(lower()).toContain(
      "create or replace function public.super_admin_log_password_reset"
    );
    expect(lower()).toContain("'super_admin.request_password_reset'");
  });

  it("locks both functions' EXECUTE down to authenticated only", () => {
    expect(lower()).toContain(
      "grant  execute on function public.super_admin_set_profile_status(uuid, text) to authenticated"
    );
    expect(lower()).toContain(
      "grant  execute on function public.super_admin_log_password_reset(uuid) to authenticated"
    );
  });
});
