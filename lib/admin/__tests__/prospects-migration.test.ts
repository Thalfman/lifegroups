import { beforeAll, describe, expect, it } from "vitest";

import {
  assertExecuteLockdown,
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// Static boundary assertions over the Prospects / Interest Funnel migration
// (#375). CI has no Postgres (RLS verified manually per supabase/dev/README.md),
// so these substring/regex checks are the CI-runnable regression guard for the
// security-critical invariants: admin-only RLS, write only via SECURITY DEFINER
// RPCs, paired audit rows, EXECUTE lockdown — plus the funnel-specific CHECKs,
// the guests→prospects data migration, and that guests is left intact.

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration("20260608020000_phase_pivot6_prospects.sql");
});

describe("prospects migration — enum + table shape", () => {
  it("creates the prospect_state enum (guarded)", () => {
    expect(sql.lower).toContain("create type public.prospect_state as enum");
    expect(sql.lower).toContain(
      "'interested','matched','joined','not_at_this_time'"
    );
    expect(sql.lower).toContain("if not exists (select 1 from pg_type");
  });

  it("creates the prospects table with the funnel columns", () => {
    expect(sql.lower).toContain("create table if not exists public.prospects");
    const block = sql.raw.slice(
      sql.raw.indexOf("create table if not exists public.prospects"),
      sql.raw.indexOf(
        ");",
        sql.raw.indexOf("create table if not exists public.prospects")
      )
    );
    expect(block).toMatch(
      /state\s+public\.prospect_state\s+not null\s+default\s+'interested'/i
    );
    expect(block).toMatch(
      /group_id\s+uuid\s+references\s+public\.groups\(id\)/i
    );
    expect(block).toMatch(/archived\s+boolean\s+not null\s+default\s+false/i);
  });

  it("reserves next_step + additional_note for #379 (nullable, not wired)", () => {
    const block = sql.raw.slice(
      sql.raw.indexOf("create table if not exists public.prospects"),
      sql.raw.indexOf(
        ");",
        sql.raw.indexOf("create table if not exists public.prospects")
      )
    );
    expect(block).toMatch(/next_step\s+jsonb/i);
    expect(block).toMatch(/additional_note\s+text/i);
  });

  it("installs the set_updated_at trigger", () => {
    expect(sql.lower).toContain("create trigger prospects_set_updated_at");
    expect(sql.lower).toContain("execute function public.set_updated_at()");
  });
});

describe("prospects migration — CHECK invariants", () => {
  it("requires a group for matched / joined", () => {
    expect(sql.lower).toContain(
      "check (state not in ('matched','joined') or group_id is not null)"
    );
  });

  it("forces joined to be archived", () => {
    expect(sql.lower).toContain("check (state <> 'joined' or archived = true)");
  });
});

describe("prospects migration — admin-only RLS, no leader exposure", () => {
  it("enables RLS and gates SELECT on auth_is_admin()", () => {
    expect(sql.lower).toContain("enable row level security");
    const chunk = sql.lower
      .split("create policy")
      .slice(1)
      .find((c) => c.includes("on public.prospects"));
    expect(chunk, "the table should have a policy").toBeDefined();
    expect(chunk).toContain("for select to authenticated");
    expect(chunk).toContain("public.auth_is_admin()");
  });

  it("never grants a leader or over_shepherd policy", () => {
    expect(sql.lower).not.toContain("'leader'");
    expect(sql.lower).not.toContain("'over_shepherd'");
  });

  it("revokes broad access and grants only SELECT to authenticated", () => {
    expect(sql.lower).toContain(
      "revoke all    on public.prospects from authenticated"
    );
    expect(sql.lower).toContain(
      "grant  select on public.prospects to authenticated"
    );
  });
});

describe("prospects migration — guests → prospects data migration", () => {
  it("inserts from guests with the stage mapping", () => {
    expect(sql.lower).toContain("insert into public.prospects");
    expect(sql.lower).toContain("from public.guests");
    // The mapping cases (mirrors mapGuestStageToProspectState).
    expect(sql.lower).toContain("when 'assigned' then 'matched'");
    expect(sql.lower).toContain("when 'placed'   then 'joined'");
    expect(sql.lower).toContain("when 'not_now'  then 'not_at_this_time'");
    // assigned/placed carry assigned_group_id; placed sets archived.
    expect(sql.lower).toContain("then g.assigned_group_id");
    expect(sql.lower).toContain("(g.pipeline_stage = 'placed') as archived");
  });

  it("leaves the guests table intact (frozen alias, never dropped)", () => {
    expect(sql.lower).not.toContain("drop table");
    expect(sql.lower).not.toContain("alter table public.guests");
  });
});

describe("prospects migration — audited SECURITY DEFINER write path", () => {
  it("defines admin_create_prospect as SECURITY DEFINER with a pinned search_path", () => {
    assertSecurityDefiner(sql, "admin_create_prospect");
  });

  it("defines admin_transition_prospect as SECURITY DEFINER with a pinned search_path", () => {
    assertSecurityDefiner(sql, "admin_transition_prospect");
  });

  it("guards both writes on auth_is_admin() and resolves the actor server-side", () => {
    for (const fn of ["admin_create_prospect", "admin_transition_prospect"]) {
      const body = functionBody(sql, fn);
      expect(body).toContain("if not public.auth_is_admin() then");
      expect(body).toContain("v_actor := public.auth_profile_id();");
    }
  });

  it("writes a paired audit_events row from each RPC", () => {
    assertPairedAuditInsert(
      sql,
      "admin_create_prospect",
      "'admin.create_prospect'"
    );
    assertPairedAuditInsert(
      sql,
      "admin_transition_prospect",
      "'admin.transition_prospect'"
    );
    for (const fn of ["admin_create_prospect", "admin_transition_prospect"]) {
      expect(functionBody(sql, fn)).toContain("'prospects'");
    }
  });

  it("enforces the funnel invariants in admin_transition_prospect with fixed tokens", () => {
    const body = functionBody(sql, "admin_transition_prospect");
    expect(body).toContain("raise exception 'illegal_transition'");
    expect(body).toContain("raise exception 'group_required'");
    expect(body).toContain("raise exception 'missing_prospect'");
  });

  it("locks function EXECUTE down to authenticated only", () => {
    assertExecuteLockdown(sql, "admin_create_prospect", "text, text, text");
    assertExecuteLockdown(
      sql,
      "admin_transition_prospect",
      "uuid, public.prospect_state, uuid"
    );
  });
});
