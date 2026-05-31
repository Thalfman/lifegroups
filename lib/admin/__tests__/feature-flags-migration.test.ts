import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

// Static boundary assertions over the SAC.2 feature-flags + editable-copy
// migration (#161 / #162). CI has no Postgres (RLS is verified manually), so
// these string assertions are the CI-runnable regression guard for the
// security-critical invariants: the platform-config write is re-created as a
// SECURITY DEFINER function, gates on auth_role() = 'super_admin', whitelists
// the feature_flags and editable_copy blocks, deep-merges them, and writes a
// paired audit_events row. Mirrors lib/admin/__tests__/group-health-migration.test.ts.

const MIGRATION_PATH = fileURLToPath(
  new URL(
    "../../../supabase/migrations/20260531010000_phase_sac2_feature_flags_and_copy.sql",
    import.meta.url
  )
);

let sql = "";
const lower = () => sql.toLowerCase();

beforeAll(() => {
  sql = readFileSync(MIGRATION_PATH, "utf8");
});

describe("SAC.2 migration — audited super-admin platform-config write", () => {
  it("create-or-replaces super_admin_set_platform_config", () => {
    expect(lower()).toContain(
      "create or replace function public.super_admin_set_platform_config"
    );
  });

  it("is SECURITY DEFINER with a pinned search_path", () => {
    expect(lower()).toContain("security definer");
    expect(lower()).toContain("set search_path = public, pg_temp");
  });

  it("gates on auth_role() = 'super_admin'", () => {
    expect(lower()).toContain("auth_role() <> 'super_admin'");
  });

  it("resolves the actor server-side", () => {
    expect(lower()).toContain("auth_profile_id()");
  });

  it("whitelists feature_flags and editable_copy in addition to the tracer", () => {
    expect(lower()).toContain("'feature_flags'");
    expect(lower()).toContain("'editable_copy'");
    expect(lower()).toContain("'console_tracer_note'");
  });

  it("deep-merges the submitted sub-keys rather than clobbering", () => {
    expect(lower()).toContain("-> 'feature_flags', '{}'::jsonb) || v_flags");
    expect(lower()).toContain("-> 'editable_copy', '{}'::jsonb) || v_copy");
  });

  it("raises invalid_input on malformed payloads", () => {
    expect(lower()).toContain("raise exception 'invalid_input'");
  });

  it("writes a paired audit_events row recording only submitted keys", () => {
    expect(lower()).toContain("insert into public.audit_events");
    expect(lower()).toContain("'super_admin.set_platform_config'");
    expect(lower()).toContain("submitted_keys");
  });

  it("locks function EXECUTE down to authenticated only", () => {
    expect(lower()).toContain(
      "revoke all     on function public.super_admin_set_platform_config(jsonb) from authenticated"
    );
    expect(lower()).toContain(
      "grant  execute on function public.super_admin_set_platform_config(jsonb) to authenticated"
    );
  });
});
