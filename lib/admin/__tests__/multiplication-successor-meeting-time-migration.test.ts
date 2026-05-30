import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

// Julian #143: static boundary assertions over the migration that adds the
// successor/leader-designate and meeting-time fields to multiplication
// candidates. The repo has no DB-backed test runner and CI has no Postgres
// (RLS is verified manually per supabase/dev/README.md), so these assertions
// are the CI-runnable regression guard that the new fields stay additive,
// nullable, and on the existing audited SECURITY DEFINER write path.
// Mirrors lib/admin/__tests__/group-health-migration.test.ts.

const MIGRATION_PATH = fileURLToPath(
  new URL(
    "../../../supabase/migrations/20260530030000_julian_p4c_multiplication_successor_meeting_time.sql",
    import.meta.url,
  ),
);

let sql = "";
const lower = () => sql.toLowerCase();

beforeAll(() => {
  sql = readFileSync(MIGRATION_PATH, "utf8");
});

describe("multiplication successor/meeting-time migration — additive, nullable columns", () => {
  it("defines the meeting-time enum with exactly the two Doc values", () => {
    expect(lower()).toContain(
      "create type public.multiplication_meeting_time as enum",
    );
    const block = lower().slice(
      lower().indexOf("multiplication_meeting_time as enum"),
    );
    expect(block).toContain("'during_the_day'");
    expect(block).toContain("'evening'");
  });

  it("adds both columns with `add column if not exists` (no breaking reshape)", () => {
    expect(lower()).toContain(
      "add column if not exists successor_designate text",
    );
    expect(lower()).toContain(
      "add column if not exists meeting_time public.multiplication_meeting_time",
    );
  });

  it("bounds the successor text length without forcing existing rows", () => {
    // A guarded length constraint, allowing null so existing rows stay valid.
    expect(lower()).toMatch(
      /successor_designate is null or char_length\(successor_designate\) <= 120/,
    );
  });

  it("never makes either column NOT NULL", () => {
    expect(lower()).not.toContain("successor_designate text not null");
    expect(lower()).not.toContain("meeting_time public.multiplication_meeting_time not null");
  });
});

describe("multiplication successor/meeting-time migration — audited write path", () => {
  const createFn = () =>
    lower().slice(lower().indexOf("admin_create_multiplication_candidate"));
  const updateFn = () =>
    lower().slice(lower().indexOf("admin_update_multiplication_candidate"));

  it("re-creates both RPCs as SECURITY DEFINER with a pinned search_path", () => {
    expect(lower()).toContain(
      "create or replace function public.admin_create_multiplication_candidate",
    );
    expect(lower()).toContain(
      "create or replace function public.admin_update_multiplication_candidate",
    );
    expect(createFn()).toContain("security definer");
    expect(createFn()).toContain("set search_path = public, pg_temp");
    expect(updateFn()).toContain("security definer");
    expect(updateFn()).toContain("set search_path = public, pg_temp");
  });

  it("keeps the admin guard and server-side actor resolution on both RPCs", () => {
    for (const fn of [createFn(), updateFn()]) {
      expect(fn).toContain("if not public.auth_is_admin() then");
      expect(fn).toContain("v_actor := public.auth_profile_id();");
    }
  });

  it("threads both new params through and persists them on the candidate", () => {
    for (const fn of [createFn(), updateFn()]) {
      expect(fn).toContain("p_successor_designate");
      expect(fn).toContain("p_meeting_time");
      expect(fn).toContain("successor_designate");
      expect(fn).toContain("meeting_time");
    }
  });

  it("validates the successor length server-side", () => {
    for (const fn of [createFn(), updateFn()]) {
      expect(fn).toMatch(/char_length\(v_successor\) > 120/);
    }
  });

  it("records the new fields in the paired audit_events metadata", () => {
    for (const fn of [createFn(), updateFn()]) {
      expect(fn).toContain("insert into public.audit_events");
      expect(fn).toContain("'has_successor'");
      expect(fn).toContain("'meeting_time'");
    }
  });

  it("does not service-role write or hard-delete", () => {
    expect(lower()).not.toContain("service_role");
    expect(lower()).not.toMatch(/delete\s+from\s+public\.multiplication_candidates/);
  });
});
