import { beforeAll, describe, expect, it } from "vitest";

import {
  assertExecuteLockdown,
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// Static boundary assertions over the Member Care list foundation migration
// (the member half of the Care list, gated behind the `care_member_list` flag;
// UI deferred). CI has no Postgres (RLS verified manually per
// supabase/dev/README.md), so these substring/regex checks are the runnable
// regression guard for the security-critical invariants: admin-only RLS read,
// writes only via SECURITY DEFINER RPCs with paired audit rows, member (not
// leader) target gating, enum REUSE (no second enum), and no note-body leak.

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration("20260624000000_phase_care_member_list_foundation.sql");
});

describe("member-care migration — tables", () => {
  it("creates both member care tables", () => {
    expect(sql.lower).toContain("create table public.member_care_profiles");
    expect(sql.lower).toContain("create table public.member_care_interactions");
  });

  it("keys one care profile per member", () => {
    expect(sql.lower).toContain(
      "constraint member_care_profiles_one_per_member unique (member_id)"
    );
  });

  it("references the members roster (not profiles) for the care subject", () => {
    expect(sql.lower).toContain(
      "member_id uuid not null references public.members(id) on delete restrict"
    );
  });

  it("links interactions to the member care profile", () => {
    expect(sql.lower).toContain(
      "care_profile_id uuid not null references public.member_care_profiles(id) on delete restrict"
    );
  });

  it("REUSES the shepherd_care enums — it does not create a second enum", () => {
    // Baseline is the post-rename value 'doing_well' (20260530030000 renamed
    // 'healthy' -> 'doing_well'); 'healthy' would be an invalid enum input here.
    expect(sql.lower).toContain(
      "current_status public.shepherd_care_status not null default 'doing_well'"
    );
    expect(sql.lower).toContain(
      "interaction_type public.shepherd_care_interaction_type not null"
    );
    // No new enum type for the member care status / interaction type.
    expect(sql.lower).not.toContain("create type public.member_care");
  });
});

describe("member-care migration — admin-only RLS", () => {
  it("enables RLS and gates SELECT on auth_is_admin() for both tables", () => {
    expect(sql.lower).toContain("enable row level security");
    const policyChunks = sql.lower.split("create policy").slice(1);
    for (const table of [
      "public.member_care_profiles",
      "public.member_care_interactions",
    ]) {
      const chunk = policyChunks.find((c) => c.includes(`on ${table}`));
      expect(chunk, `${table} should have a policy`).toBeDefined();
      expect(chunk).toContain("for select to authenticated");
      expect(chunk).toContain("public.auth_is_admin()");
    }
  });

  it("never opens a leader / over_shepherd / staff read path", () => {
    const policyChunks = sql.lower.split("create policy").slice(1);
    const carePolicies = policyChunks.filter((c) =>
      c.includes("on public.member_care")
    );
    expect(carePolicies.length).toBe(2);
    for (const policy of carePolicies) {
      expect(policy).not.toContain("'over_shepherd'");
      expect(policy).not.toContain("'leader'");
      expect(policy).not.toContain("auth_is_admin_or_staff");
    }
  });

  it("grants only SELECT to authenticated (no write grants on the tables)", () => {
    expect(sql.lower).toContain(
      "grant select on public.member_care_profiles     to authenticated"
    );
    expect(sql.lower).toContain(
      "grant select on public.member_care_interactions to authenticated"
    );
    expect(sql.lower).not.toContain("grant insert on public.member_care");
    expect(sql.lower).not.toContain("grant update on public.member_care");
    expect(sql.lower).not.toContain("grant delete on public.member_care");
  });
});

describe("member-care migration — audited SECURITY DEFINER write paths", () => {
  const UPSERT_ARGS =
    "uuid, public.shepherd_care_status, boolean, date, boolean, text, boolean";
  const LOG_ARGS =
    "uuid, date, public.shepherd_care_interaction_type, text, boolean, date, boolean, public.shepherd_care_status";

  it("both RPCs are SECURITY DEFINER with a pinned search_path", () => {
    assertSecurityDefiner(sql, "admin_upsert_member_care_profile");
    assertSecurityDefiner(sql, "admin_log_member_care_interaction");
  });

  it("both RPCs gate on auth_is_admin() and resolve the actor server-side", () => {
    for (const fn of [
      "admin_upsert_member_care_profile",
      "admin_log_member_care_interaction",
    ]) {
      const body = functionBody(sql, fn);
      expect(body).toContain("if not public.auth_is_admin() then");
      expect(body).toContain("v_actor := public.auth_profile_id();");
    }
  });

  it("gates the care target on an existing, ACTIVE member (no role check)", () => {
    for (const fn of [
      "admin_upsert_member_care_profile",
      "admin_log_member_care_interaction",
    ]) {
      const body = functionBody(sql, fn);
      expect(body).toContain("from public.members");
      expect(body).toContain(
        "v_target.status <> 'active'::public.membership_status"
      );
      expect(body).toContain("raise exception 'missing_member'");
      // Members are non-login — there is no role gate (unlike leader care).
      expect(body).not.toContain("'leader'::public.user_role");
    }
  });

  it("upserts on the member_id conflict target", () => {
    expect(functionBody(sql, "admin_upsert_member_care_profile")).toContain(
      "on conflict (member_id) do nothing"
    );
    expect(functionBody(sql, "admin_log_member_care_interaction")).toContain(
      "on conflict (member_id) do update"
    );
  });

  it("writes paired audit rows recording presence only (no note bodies)", () => {
    assertPairedAuditInsert(
      sql,
      "admin_upsert_member_care_profile",
      "'admin.upsert_member_care_profile'"
    );
    const upsert = functionBody(sql, "admin_upsert_member_care_profile");
    expect(upsert).toContain("'member_care_profiles'");
    expect(upsert).toContain("has_summary");

    assertPairedAuditInsert(
      sql,
      "admin_log_member_care_interaction",
      "'admin.log_member_care_interaction'"
    );
    const log = functionBody(sql, "admin_log_member_care_interaction");
    expect(log).toContain("'member_care_interactions'");
    expect(log).toContain("has_notes");
  });

  it("locks function EXECUTE down to authenticated only", () => {
    assertExecuteLockdown(sql, "admin_upsert_member_care_profile", UPSERT_ARGS);
    assertExecuteLockdown(sql, "admin_log_member_care_interaction", LOG_ARGS);
  });
});
