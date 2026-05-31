import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

// Capacity & Multiplication #186: static boundary assertions over the migration
// that widens the scenario assumptions validator to accept the net-new launch
// plan fields. CI has no Postgres, so this guard pins that the whitelist + bounds
// were extended without dropping the existing keys.

const MIGRATION_PATH = fileURLToPath(
  new URL(
    "../../../supabase/migrations/20260531130000_julian_cap4_scenario_launch_plan.sql",
    import.meta.url
  )
);

let sql = "";
const lower = () => sql.toLowerCase();

beforeAll(() => {
  sql = readFileSync(MIGRATION_PATH, "utf8");
});

describe("scenario launch-plan migration", () => {
  it("re-creates the IMMUTABLE validation helper with a pinned search_path", () => {
    expect(lower()).toContain(
      "create or replace function public.lp2_validate_scenario_assumptions"
    );
    expect(lower()).toContain("immutable");
    expect(lower()).toContain("set search_path = public, pg_temp");
  });

  it("adds the three launch-plan keys to the whitelist", () => {
    for (const key of [
      "'planned_launch_count'",
      "'target_launch_month'",
      "'target_launch_year'",
    ]) {
      expect(lower()).toContain(key);
    }
  });

  it("keeps the existing assumption keys in the whitelist", () => {
    for (const key of [
      "'current_church_attendance'",
      "'leaders_per_new_group'",
      "'notes'",
    ]) {
      expect(lower()).toContain(key);
    }
  });

  it("bounds the new fields (count 0..100, month 1 or 8, year 2024..2100)", () => {
    expect(lower()).toContain(
      "(p_assumptions ->> 'planned_launch_count')::int"
    );
    expect(lower()).toMatch(/v_int\s*<\s*0\s*or\s*v_int\s*>\s*100/);
    expect(lower()).toMatch(/v_int not in \(1, 8\)/);
    expect(lower()).toMatch(/v_int\s*<\s*2024\s*or\s*v_int\s*>\s*2100/);
  });

  it("raises invalid_input on out-of-bounds values (no silent coercion)", () => {
    expect(lower()).toContain("raise exception 'invalid_input'");
  });
});
