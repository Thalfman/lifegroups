import { beforeAll, describe, expect, it } from "vitest";

import {
  assertExecuteLockdown,
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// Static boundary assertions over the wave-2 groups migration (#398): groups
// gains a category_id FK, the create/update RPCs are recreated to take
// p_category_id in place of p_life_stage, and the life_stage COLUMN is dropped.
// CI has no Postgres (RLS verified manually per supabase/dev/README.md), so
// these substring/regex checks are the runnable regression guard for the
// security-critical invariants AND the #398-specific contract (category FK,
// life_stage retired everywhere in the write path).

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration(
    "20260611000000_phase_groups2_group_category_retire_life_stage.sql"
  );
});

describe("group-category migration — category_id column", () => {
  it("adds a nullable category_id FK into the catalog", () => {
    expect(sql.lower).toContain("add column if not exists category_id uuid");
    expect(sql.lower).toContain(
      "references public.group_categories(id) on delete set null"
    );
  });

  it("comments the column as the Uncategorized-aware segmentation source", () => {
    expect(sql.lower).toContain("comment on column public.groups.category_id");
    expect(sql.lower).toContain("uncategorized");
  });
});

describe("group-category migration — life_stage is retired", () => {
  it("drops the life_stage column", () => {
    expect(sql.lower).toContain(
      "alter table public.groups drop column if exists life_stage"
    );
  });

  it("no longer threads p_life_stage through the recreated RPCs", () => {
    const create = functionBody(sql, "admin_create_group");
    const update = functionBody(sql, "admin_update_group");
    expect(create).not.toContain("p_life_stage");
    expect(create).not.toContain("group_life_stage");
    expect(update).not.toContain("p_life_stage");
    expect(update).not.toContain("group_life_stage");
  });

  it("never inserts/updates the life_stage column in the recreated RPCs", () => {
    const create = functionBody(sql, "admin_create_group");
    const update = functionBody(sql, "admin_update_group");
    // The only allowed appearances of "life_stage" in the file are the DROP and
    // the prior-overload drops; the RPC bodies must be clean.
    expect(create).not.toContain("life_stage");
    expect(update).not.toContain("life_stage");
  });
});

describe("group-category migration — recreated write RPCs", () => {
  const rpcs: [string, string][] = [
    [
      "admin_create_group",
      "text, text, text, time, text, text, integer, public.meeting_frequency, public.meeting_week_parity, public.group_audience_category, uuid, date",
    ],
    [
      "admin_update_group",
      "uuid, text, text, text, time, text, text, integer, public.meeting_frequency, public.meeting_week_parity, public.group_audience_category, uuid, date",
    ],
  ];

  for (const [fn, argList] of rpcs) {
    it(`${fn} takes a p_category_id argument`, () => {
      const body = functionBody(sql, fn);
      expect(body).toContain("p_category_id uuid");
    });

    it(`${fn} writes category_id to the groups row`, () => {
      expect(functionBody(sql, fn)).toContain("category_id");
    });

    it(`${fn} is SECURITY DEFINER with a pinned search_path`, () => {
      assertSecurityDefiner(sql, fn);
    });

    it(`${fn} gates on auth_is_admin() and a non-null actor`, () => {
      const body = functionBody(sql, fn);
      expect(body).toContain("not public.auth_is_admin()");
      expect(body).toContain("raise exception 'insufficient_privilege'");
      expect(body).toContain("public.auth_profile_id()");
    });

    it(`${fn} rejects a category that isn't an active cell for the top type`, () => {
      const body = functionBody(sql, fn);
      // The gate joins category_type_targets to the live catalog and requires an
      // active cell for (audience_category × category), so an unapplied or
      // archived cell can't be persisted.
      expect(body).toContain("public.category_type_targets ctt");
      expect(body).toContain(
        "ctt.audience_category = p_audience_category::text"
      );
      expect(body).toContain("ctt.active");
      expect(body).toContain("archived_at is null");
      expect(body).toContain("raise exception 'inactive_cell'");
    });

    it(`${fn} writes a paired audit_events row`, () => {
      assertPairedAuditInsert(sql, fn);
    });

    it(`${fn} locks down EXECUTE (deny by default, allow authenticated)`, () => {
      assertExecuteLockdown(sql, fn, argList);
    });
  }

  it("admin_update_group only gates the cell when the (audience × category) pair changes", () => {
    // Lenient edit path: an UNCHANGED tag is left untouched so a group already
    // sitting in a cell that was later un-applied/archived stays editable; only
    // a new/changed cell is held to an active cell.
    const body = functionBody(sql, "admin_update_group");
    expect(body).toContain(
      "p_category_id is distinct from (v_before->>'category_id')::uuid"
    );
    expect(body).toContain(
      "p_audience_category::text is distinct from (v_before->>'audience_category')"
    );
  });

  it("admin_create_group gates the cell unconditionally (no change-guard)", () => {
    // A new group can never be created into an inactive cell.
    const body = functionBody(sql, "admin_create_group");
    expect(body).not.toContain("is distinct from");
  });

  it("drops the prior life_stage-signature overloads so only one signature remains", () => {
    expect(sql.lower).toContain(
      "drop function if exists public.admin_create_group("
    );
    expect(sql.lower).toContain(
      "drop function if exists public.admin_update_group("
    );
    // The dropped overloads name the retired enum in their signatures.
    expect(sql.lower).toContain("public.group_life_stage");
  });
});
