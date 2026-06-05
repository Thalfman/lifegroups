import { beforeAll, describe, expect, it } from "vitest";

import {
  assertAuditContentFree,
  assertExecuteLockdown,
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// Static boundary assertions over the Prospect Next Step migration (#379). CI
// has no Postgres (RLS verified manually per supabase/dev/README.md), so these
// substring/regex checks are the CI-runnable regression guard for the
// security-critical invariants: SECURITY DEFINER write path, admin gate +
// server-side actor, paired audit row with action admin.set_prospect_next_step,
// presence-flags-only audit (no detail / note bodies), input validation of the
// next_step jsonb shape, and EXECUTE lockdown. Also checks the no-provider /
// no-service-role posture and the armed-follow-up index.

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration("20260608070000_phase_pivot7_prospect_next_step.sql");
});

describe("prospect-next-step migration — audited SECURITY DEFINER write path", () => {
  it("defines admin_set_prospect_next_step as SECURITY DEFINER with a pinned search_path", () => {
    assertSecurityDefiner(sql, "admin_set_prospect_next_step");
  });

  it("gates on auth_is_admin() and resolves the actor server-side", () => {
    const body = functionBody(sql, "admin_set_prospect_next_step");
    expect(body).toContain("if not public.auth_is_admin() then");
    expect(body).toContain("v_actor := public.auth_profile_id();");
  });

  it("writes a paired audit_events row with the action label", () => {
    assertPairedAuditInsert(
      sql,
      "admin_set_prospect_next_step",
      "'admin.set_prospect_next_step'"
    );
    expect(functionBody(sql, "admin_set_prospect_next_step")).toContain(
      "'prospects'"
    );
  });

  it("records presence flags only — never the detail / note bodies", () => {
    // The audit metadata must carry has_* presence flags, and must NOT carry
    // the raw column values v_detail / v_note.
    const body = functionBody(sql, "admin_set_prospect_next_step");
    expect(body).toContain("'has_detail'");
    expect(body).toContain("'has_note'");
    expect(body).toContain("'has_due_date'");
    assertAuditContentFree(sql, {
      forbidden: ["v_detail is not null and", "'detail', v_detail"],
      required: ["has_detail", "has_note"],
    });
    // The audit jsonb object must not echo the detail / note values directly.
    const auditStart = body.indexOf("insert into public.audit_events");
    const auditBlock = body.slice(auditStart);
    expect(auditBlock).not.toContain("'detail', v_detail");
    expect(auditBlock).not.toContain("'note', v_note");
  });

  it("validates the next_step jsonb shape with fixed tokens", () => {
    const body = functionBody(sql, "admin_set_prospect_next_step");
    // type restricted to the two allowed values
    expect(body).toContain("'connect_to_group_leader', 'follow_up'");
    // shape + length checks raise invalid_input; a missing row raises missing_prospect
    expect(body).toContain("raise exception 'invalid_input'");
    expect(body).toContain("raise exception 'missing_prospect'");
    // optional due_date is parsed as a date
    expect(body).toContain("::date");
    // detail / note length-bounded
    expect(body).toContain("char_length(v_detail) > 2000");
    expect(body).toContain("char_length(v_note) > 2000");
  });

  it("locks function EXECUTE down to authenticated only", () => {
    assertExecuteLockdown(
      sql,
      "admin_set_prospect_next_step",
      "uuid, jsonb, text"
    );
  });
});

describe("prospect-next-step migration — no table reshape, supporting index", () => {
  it("does not recreate the prospects table (columns reserved in #375)", () => {
    expect(sql.lower).not.toContain("create table");
    expect(sql.lower).not.toContain("add column");
  });

  it("adds a partial index for armed/due follow-ups", () => {
    expect(sql.lower).toContain(
      "create index if not exists prospects_armed_follow_up_idx"
    );
    expect(sql.lower).toContain("next_step ->> 'type' = 'follow_up'");
    expect(sql.lower).toContain("next_step ->> 'due_date' is not null");
  });
});

describe("prospect-next-step migration — no-provider / no-service-role posture", () => {
  it("never references a service role or an outbound provider", () => {
    expect(sql.lower).not.toContain("service_role");
    // No email/SMS provider is wired in this slice.
    expect(sql.lower).not.toContain("pg_net");
    expect(sql.lower).not.toContain("http_post");
    expect(sql.lower).not.toContain("net.http");
  });

  it("never writes to any leader-visible table (connect_to_group_leader is back-office)", () => {
    // The only table mutated is prospects (admin-only RLS); audit_events is the
    // only other insert. Nothing surfaces to a leader.
    expect(sql.lower).not.toContain("insert into public.follow_ups");
    expect(sql.lower).not.toContain("insert into public.notifications");
  });
});
