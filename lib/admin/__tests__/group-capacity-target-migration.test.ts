import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

// Capacity & Multiplication #185: static boundary assertions over the migration
// that adds the set-group-target RPC. CI has no Postgres, so this guard pins the
// "one visible source of truth" invariant: the RPC writes groups.capacity AND
// clears any capacity_override, on the audited SECURITY DEFINER write path.

const MIGRATION_PATH = fileURLToPath(
  new URL(
    "../../../supabase/migrations/20260531120000_julian_cap3_group_capacity_target.sql",
    import.meta.url
  )
);

let sql = "";
const lower = () => sql.toLowerCase();

beforeAll(() => {
  sql = readFileSync(MIGRATION_PATH, "utf8");
});

describe("set group capacity target migration", () => {
  it("declares the RPC as SECURITY DEFINER with a pinned search_path + admin guard", () => {
    expect(lower()).toContain(
      "create or replace function public.admin_set_group_capacity_target"
    );
    expect(lower()).toContain("security definer");
    expect(lower()).toContain("set search_path = public, pg_temp");
    expect(lower()).toContain("if not public.auth_is_admin() then");
    expect(lower()).toContain("v_actor := public.auth_profile_id();");
  });

  it("writes the effective target source: sets groups.capacity AND clears any override", () => {
    expect(lower()).toMatch(/update public\.groups\s+set capacity = p_target/);
    expect(lower()).toContain("set capacity_override = null");
  });

  it("leaves allow_over_capacity / exclude_from_capacity_metrics untouched", () => {
    expect(lower()).not.toContain("set allow_over_capacity");
    expect(lower()).not.toContain("set exclude_from_capacity_metrics");
  });

  it("bounds the target and pairs the write with an audit_events row", () => {
    expect(lower()).toMatch(/p_target < 1 or p_target > 500/);
    expect(lower()).toContain("insert into public.audit_events");
    expect(lower()).toContain("'admin.set_group_capacity_target'");
  });

  it("grants execute to authenticated only and does not service-role write", () => {
    expect(lower()).toContain(
      "grant execute on function public.admin_set_group_capacity_target"
    );
    expect(lower()).not.toContain("service_role");
  });
});
