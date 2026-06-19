import { beforeAll, describe, expect, it } from "vitest";

import {
  assertExecuteLockdown,
  assertPairedAuditInsert,
  assertSecurityDefiner,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// Static boundary assertions over the collapse-cells → free-text group_type
// migration. CI has no Postgres (RLS verified manually), so these
// substring/regex checks are the runnable regression guard: the new write paths
// (admin_set_group_types, admin_set_group_type_config) must be audited SECURITY
// DEFINER with the EXECUTE lockdown, the new table must carry admin-only RLS,
// and the retired cell objects must be dropped.

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration("20260708000000_collapse_cells_to_group_type_list.sql");
});

describe("collapse-cells migration — schema changes", () => {
  it("drops the four cell tables", () => {
    expect(sql.lower).toContain(
      "drop table if exists public.category_type_targets"
    );
    expect(sql.lower).toContain(
      "drop table if exists public.audience_readiness_rule"
    );
    expect(sql.lower).toContain(
      "drop table if exists public.multiplication_config"
    );
    expect(sql.lower).toContain("drop table if exists public.group_categories");
  });

  it("drops the cell columns and adds groups.group_type", () => {
    expect(sql.lower).toContain("drop column if exists audience_category");
    expect(sql.lower).toContain("drop column if exists category_id");
    expect(sql.lower).toContain("add  column if not exists group_type text");
  });

  it("removes the prospect desired-cell columns", () => {
    expect(sql.lower).toContain(
      "drop column if exists desired_audience_category"
    );
    expect(sql.lower).toContain("drop column if exists desired_category_id");
  });

  it("creates group_type_configs keyed on the free-text type, admin-only RLS", () => {
    expect(sql.lower).toContain(
      "create table if not exists public.group_type_configs"
    );
    // Keyed on the NORMALIZED identity (case-insensitive) so case-only twins
    // can't split a type's config.
    expect(sql.lower).toContain(
      "create unique index if not exists group_type_configs_group_type_norm_unique"
    );
    expect(sql.lower).toContain("(lower(btrim(group_type)))");
    expect(sql.lower).toContain(
      "alter table public.group_type_configs enable row level security"
    );
    expect(sql.lower).toContain("group_type_configs_admin_read");
  });

  it("serializes per-type config upserts with a per-key advisory lock", () => {
    // Matches the 20260617 audit-before-advisory-lock pattern so a brand-new
    // type's concurrent upserts can't both audit an empty `before`.
    expect(sql.lower).toContain("pg_advisory_xact_lock");
    expect(sql.lower).toContain("hashtext('group_type_configs')");
  });

  it("soft-archives type-only multiplication candidates before dropping the cell columns", () => {
    expect(sql.lower).toContain("update public.multiplication_candidates");
    expect(sql.lower).toContain("set archived_at = now()");
  });
});

describe("collapse-cells migration — new audited RPCs", () => {
  it("defines admin_set_group_types as an audited SECURITY DEFINER fn", () => {
    expect(sql.lower).toContain(
      "create function public.admin_set_group_types(p_types jsonb)"
    );
    assertSecurityDefiner(sql, "admin_set_group_types");
    assertPairedAuditInsert(sql, "admin_set_group_types");
    assertExecuteLockdown(sql, "admin_set_group_types", "jsonb");
  });

  it("defines admin_set_group_type_config as an audited SECURITY DEFINER fn", () => {
    expect(sql.lower).toContain(
      "create function public.admin_set_group_type_config("
    );
    assertSecurityDefiner(sql, "admin_set_group_type_config");
    assertPairedAuditInsert(sql, "admin_set_group_type_config");
    assertExecuteLockdown(
      sql,
      "admin_set_group_type_config",
      "text, integer, jsonb"
    );
  });

  it("recreates the group RPCs with p_group_type and no cell parameters", () => {
    expect(sql.lower).toContain("p_group_type text");
    // The cell args survive only in the documentary header; no executable
    // parameter declaration (`p_audience_category <type>`) remains.
    expect(sql.lower).not.toMatch(/p_audience_category\s+(text|uuid|jsonb)/);
    expect(sql.lower).not.toMatch(/p_category_id\s+(uuid|text)/);
  });
});
