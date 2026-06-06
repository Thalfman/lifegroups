import { beforeAll, describe, expect, it } from "vitest";

import {
  assertExecuteLockdown,
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// Static boundary assertions over the Group Category catalog + cell-matrix
// migration (#396). CI has no Postgres (RLS verified manually per
// supabase/dev/README.md), so these substring/regex checks are the runnable
// regression guard for the security-critical invariants: admin-only RLS, writes
// only via SECURITY DEFINER RPCs with a paired audit row + a pinned search_path,
// the cell's per-(type, category) upsert key, and the EXECUTE lockdown.

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration(
    "20260610000000_phase_groups1_category_catalog_and_matrix.sql"
  );
});

describe("group-categories migration — tables", () => {
  it("creates the free-form group_categories catalog", () => {
    expect(sql.lower).toContain(
      "create table if not exists public.group_categories"
    );
    expect(sql.lower).toContain("label       text not null");
  });

  it("keeps a category from going blank", () => {
    expect(sql.lower).toContain("length(btrim(label)) > 0");
  });

  it("uniquely keys a LIVE category per label, case-insensitively", () => {
    expect(sql.lower).toContain("group_categories_label_live_unique");
    expect(sql.lower).toContain("lower(btrim(label))");
    expect(sql.lower).toContain("where archived_at is null");
  });

  it("creates the (audience_category × category) cell table", () => {
    expect(sql.lower).toContain(
      "create table if not exists public.category_type_targets"
    );
    expect(sql.lower).toContain("audience_category text not null");
    expect(sql.lower).toContain(
      "category_id       uuid not null references public.group_categories(id) on delete cascade"
    );
    expect(sql.lower).toContain(
      "active            boolean not null default true"
    );
  });

  it("keys a cell uniquely on (audience_category, category_id)", () => {
    expect(sql.lower).toContain("unique (audience_category, category_id)");
  });

  it("constrains the cell's top type to the three audience categories", () => {
    expect(sql.lower).toContain("audience_category in ('men','women','mixed')");
  });

  it("creates the later-slice target/trigger columns defaulted and unused", () => {
    expect(sql.lower).toContain("target_count      integer not null default 0");
    expect(sql.lower).toContain(
      "trigger_overrides jsonb not null default '{}'::jsonb"
    );
  });

  it("attaches set_updated_at triggers to both tables", () => {
    expect(sql.lower).toContain("group_categories_set_updated_at");
    expect(sql.lower).toContain("category_type_targets_set_updated_at");
    expect(sql.lower).toContain("execute function public.set_updated_at()");
  });
});

describe("group-categories migration — admin-only RLS", () => {
  for (const table of ["group_categories", "category_type_targets"]) {
    it(`enables RLS and gates SELECT on auth_is_admin() for ${table}`, () => {
      expect(sql.lower).toContain("enable row level security");
      const policyChunks = sql.lower.split("create policy").slice(1);
      const chunk = policyChunks.find((c) => c.includes(`on public.${table}`));
      expect(chunk, `${table} should have a policy`).toBeDefined();
      expect(chunk).toContain("for select to authenticated");
      expect(chunk).toContain("public.auth_is_admin()");
    });

    it(`never opens a leader/over_shepherd read path on ${table}`, () => {
      const policyChunks = sql.lower.split("create policy").slice(1);
      const tablePolicies = policyChunks.filter((c) =>
        c.includes(`on public.${table}`)
      );
      expect(tablePolicies.length).toBeGreaterThan(0);
      for (const policy of tablePolicies) {
        expect(policy).not.toContain("'over_shepherd'");
        expect(policy).not.toContain("auth_role() = 'leader'");
      }
    });

    it(`revokes broad access and grants only SELECT to authenticated on ${table}`, () => {
      expect(sql.lower).toContain(
        `grant  select on public.${table} to authenticated`
      );
      expect(sql.lower).toContain(
        `revoke all    on public.${table} from public`
      );
      expect(sql.lower).toContain(`revoke all    on public.${table} from anon`);
      expect(sql.lower).toContain(
        `revoke all    on public.${table} from authenticated`
      );
    });
  }
});

describe("group-categories migration — audited write RPCs", () => {
  const rpcs: [string, string, string][] = [
    ["admin_create_group_category", "text", "admin.create_group_category"],
    [
      "admin_rename_group_category",
      "uuid, text",
      "admin.rename_group_category",
    ],
    ["admin_archive_group_category", "uuid", "admin.archive_group_category"],
    [
      "admin_set_category_type_cell",
      "uuid, text, boolean",
      "admin.set_category_type_cell",
    ],
  ];

  for (const [fn, argList, action] of rpcs) {
    it(`${fn} is SECURITY DEFINER with a pinned search_path`, () => {
      assertSecurityDefiner(sql, fn);
    });

    it(`${fn} gates on auth_is_admin() and a non-null actor`, () => {
      const body = functionBody(sql, fn);
      expect(body).toContain("not public.auth_is_admin()");
      expect(body).toContain("raise exception 'insufficient_privilege'");
      expect(body).toContain("public.auth_profile_id()");
    });

    it(`${fn} writes a paired audit_events row recording ${action}`, () => {
      assertPairedAuditInsert(sql, fn, `'${action}'`);
    });

    it(`${fn} locks down EXECUTE (deny by default, allow authenticated)`, () => {
      assertExecuteLockdown(sql, fn, argList);
    });
  }

  it("the cell write upserts on the per-(type, category) conflict target", () => {
    const body = functionBody(sql, "admin_set_category_type_cell");
    expect(body).toContain(
      "on conflict (audience_category, category_id) do update"
    );
  });

  it("the cell write refuses to apply an archived category", () => {
    const body = functionBody(sql, "admin_set_category_type_cell");
    expect(body).toContain("archived_at is null");
    expect(body).toContain("raise exception 'missing_category'");
  });

  it("archive is a soft delete (sets archived_at), never a hard DELETE", () => {
    const body = functionBody(sql, "admin_archive_group_category");
    expect(body).toContain("set archived_at = now()");
    expect(body).not.toContain("delete from public.group_categories");
  });
});
