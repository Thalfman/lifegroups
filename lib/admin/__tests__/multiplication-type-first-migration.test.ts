import { beforeAll, describe, expect, it } from "vitest";

import {
  assertExecuteLockdown,
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// Static boundary assertions over the migration that makes multiplication
// candidates type-first: it adds the candidate's own cell (audience_category +
// category_id), relaxes group_id to optional, and re-creates the candidate
// write RPCs to anchor on a type with an OPTIONAL group. CI has no Postgres (RLS
// is verified manually per supabase/dev/README.md), so these assertions are the
// CI-runnable regression guard that the change stays additive/nullable, on the
// existing audited SECURITY DEFINER write path, and that the prior 10-arg RPC
// signatures are dropped in favour of the 12-arg shape.

const RPCS = [
  "admin_create_multiplication_candidate",
  "admin_update_multiplication_candidate",
] as const;

// The new signatures the app now calls. Create keeps p_group_id as its first
// arg (12 total: original 10 + audience + category); update appends p_group_id
// after the cell (13 total) since group was previously immutable on update.
const ARGS_CREATE =
  "uuid, integer, public.multiplication_candidate_status, boolean, boolean, " +
  "text, text, public.multiplication_meeting_time, uuid, integer, " +
  "public.group_audience_category, uuid";
const ARGS_UPDATE = ARGS_CREATE + ", uuid";
const ARGS_BY_FN: Record<(typeof RPCS)[number], string> = {
  admin_create_multiplication_candidate: ARGS_CREATE,
  admin_update_multiplication_candidate: ARGS_UPDATE,
};

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration(
    "20260625000000_phase_groups_multiplication_candidate_type_first.sql"
  );
});

describe("type-first migration — additive cell columns, optional group", () => {
  it("adds audience_category (enum) and category_id (FK) with `if not exists`", () => {
    expect(sql.lower).toContain(
      "add column if not exists audience_category public.group_audience_category"
    );
    expect(sql.lower).toMatch(
      /add column if not exists category_id uuid\s+references public\.group_categories\(id\)/
    );
  });

  it("relaxes group_id to nullable and never re-declares it NOT NULL", () => {
    expect(sql.lower).toContain("alter column group_id drop not null");
    expect(sql.lower).not.toContain("group_id uuid not null");
  });

  it("backfills the cell from each candidate's group, filling nulls only", () => {
    expect(sql.lower).toMatch(
      /update public\.multiplication_candidates c\s+set audience_category = g\.audience_category/
    );
    expect(sql.lower).toContain("c.audience_category is null");
  });

  it("adds the one-active-type-only-watch-per-cell partial unique index", () => {
    expect(sql.lower).toMatch(
      /create unique index if not exists multiplication_candidates_one_active_type_only\s+on public\.multiplication_candidates \(audience_category, category_id\)\s+where group_id is null and archived_at is null/
    );
  });

  it("never widens the existing one-active-per-group index to cover nulls", () => {
    // The original `(group_id) where archived_at is null` index is left as-is;
    // Postgres already treats NULLs as distinct.
    expect(sql.lower).not.toContain(
      "multiplication_candidates_one_active_per_group"
    );
  });
});

describe("type-first migration — audited write path", () => {
  it("re-creates both RPCs as SECURITY DEFINER with a pinned search_path", () => {
    for (const fn of RPCS) assertSecurityDefiner(sql, fn);
  });

  it("keeps the admin guard and server-side actor resolution on both RPCs", () => {
    for (const fn of RPCS) {
      const body = functionBody(sql, fn);
      expect(body).toContain("if not public.auth_is_admin() then");
      expect(body).toContain("v_actor := public.auth_profile_id();");
    }
  });

  it("threads the cell params and enforces an active cell on both RPCs", () => {
    for (const fn of RPCS) {
      const body = functionBody(sql, fn);
      expect(body).toContain(
        "p_audience_category   public.group_audience_category"
      );
      expect(body).toContain("p_category_id         uuid");
      // The cell must be active + applied (catalog cast to text), or reject.
      expect(body).toContain(
        "ctt.audience_category = p_audience_category::text"
      );
      expect(body).toContain("raise exception 'inactive_cell'");
    }
  });

  it("derives the cell from an attached group and guards the type-only path", () => {
    for (const fn of RPCS) {
      const body = functionBody(sql, fn);
      // An attached group is the source of truth: its cell is read into
      // v_audience/v_category rather than matched against a supplied type, so a
      // legacy/uncategorized or retagged group never blocks the save.
      expect(body).toContain("into v_group_found, v_audience, v_category");
      expect(body).not.toContain("group_type_mismatch");
      expect(body).toContain("raise exception 'missing_group'");
      // Type-only: no apprentice without a group, one active watch per cell.
      expect(body).toContain("raise exception 'apprentice_requires_group'");
      expect(body).toContain("raise exception 'type_candidate_exists'");
    }
  });

  it("records the cell + group-presence in the paired audit_events metadata", () => {
    for (const fn of RPCS) {
      assertPairedAuditInsert(sql, fn);
      const body = functionBody(sql, fn);
      expect(body).toContain("'audience_category'");
      expect(body).toContain("'category_id'");
      expect(body).toContain("'has_group'");
    }
  });

  it("drops the prior 10-arg signatures so callers must use the 12-arg shape", () => {
    for (const fn of RPCS) {
      expect(sql.lower).toMatch(
        new RegExp(
          `drop function if exists public\\.${fn}\\(\\s*uuid, integer, public\\.multiplication_candidate_status, boolean, boolean, text,\\s*text, public\\.multiplication_meeting_time, uuid, integer\\s*\\)`
        )
      );
    }
  });

  it("locks EXECUTE on the new RPCs down to authenticated only", () => {
    for (const fn of RPCS) assertExecuteLockdown(sql, fn, ARGS_BY_FN[fn]);
  });

  it("threads the optional p_group_id through the update RPC signature", () => {
    // The update body attaches/detaches the multiplying group, and the app
    // calls it with p_group_id, so the recreated signature must declare it.
    const body = functionBody(sql, "admin_update_multiplication_candidate");
    expect(body).toContain("p_group_id            uuid");
  });

  it("hardens the same-group trigger to reject an apprentice without a group", () => {
    const body = functionBody(
      sql,
      "multiplication_candidate_apprentice_same_group"
    );
    expect(body).toContain("if new.group_id is null then");
    expect(body).toContain("raise exception 'apprentice_requires_group'");
  });

  it("does not service-role write or hard-delete", () => {
    expect(sql.lower).not.toContain("service_role");
    expect(sql.lower).not.toMatch(
      /delete\s+from\s+public\.multiplication_candidates/
    );
  });
});
