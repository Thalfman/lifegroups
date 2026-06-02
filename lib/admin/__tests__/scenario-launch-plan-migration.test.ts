import { beforeAll, describe, expect, it } from "vitest";

import {
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// Capacity & Multiplication #186: static boundary assertions over the migration
// that widens the scenario assumptions validator to accept the net-new launch
// plan fields. CI has no Postgres, so this guard pins that the whitelist + bounds
// were extended without dropping the existing keys. This validator is an
// IMMUTABLE helper (not a SECURITY DEFINER write path), so it carries none of
// the admin-RPC invariants; the body is scoped via the shared migration-safety
// vocabulary's functionBody (see ./migration-safety.ts).

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration("20260531130000_julian_cap4_scenario_launch_plan.sql");
});

describe("scenario launch-plan migration", () => {
  it("re-creates the IMMUTABLE validation helper with a pinned search_path", () => {
    const body = functionBody(sql, "lp2_validate_scenario_assumptions");
    expect(body).toContain("immutable");
    expect(body).toContain("set search_path = public, pg_temp");
  });

  it("adds the three launch-plan keys to the whitelist", () => {
    const body = functionBody(sql, "lp2_validate_scenario_assumptions");
    for (const key of [
      "'planned_launch_count'",
      "'target_launch_month'",
      "'target_launch_year'",
    ]) {
      expect(body).toContain(key);
    }
  });

  it("keeps the existing assumption keys in the whitelist", () => {
    const body = functionBody(sql, "lp2_validate_scenario_assumptions");
    for (const key of [
      "'current_church_attendance'",
      "'leaders_per_new_group'",
      "'notes'",
    ]) {
      expect(body).toContain(key);
    }
  });

  it("bounds the new fields (count 0..100, month 1 or 8, year 2024..2100)", () => {
    const body = functionBody(sql, "lp2_validate_scenario_assumptions");
    expect(body).toContain("(p_assumptions ->> 'planned_launch_count')::int");
    expect(body).toMatch(/v_int\s*<\s*0\s*or\s*v_int\s*>\s*100/);
    expect(body).toMatch(/v_int not in \(1, 8\)/);
    expect(body).toMatch(/v_int\s*<\s*2024\s*or\s*v_int\s*>\s*2100/);
  });

  it("raises invalid_input on out-of-bounds values (no silent coercion)", () => {
    expect(functionBody(sql, "lp2_validate_scenario_assumptions")).toContain(
      "raise exception 'invalid_input'"
    );
  });
});
