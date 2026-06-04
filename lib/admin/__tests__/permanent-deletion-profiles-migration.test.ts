import { beforeAll, describe, expect, it } from "vitest";

import {
  assertExecuteLockdown,
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// ADR 0014 (#314): static boundary assertions over the People / Profiles slice —
// the auth boundary, the actor-descriptor migration, the confidential block, and
// the super_admin forbidden-target guard.

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration(
    "20260604030000_phase_sad3_permanent_deletion_profiles.sql"
  );
});

describe("SAD3 — audit actor FK + descriptor", () => {
  it("migrates audit_events.actor_profile_id to ON DELETE SET NULL", () => {
    expect(sql.lower).toContain(
      "drop constraint if exists audit_events_actor_profile_id_fkey"
    );
    expect(sql.lower).toContain("on delete set null");
  });

  it("adds the actor descriptor to audit_events AND its archive, and backfills", () => {
    expect(sql.lower).toContain(
      "alter table public.audit_events add column if not exists actor_name text"
    );
    expect(sql.lower).toContain(
      "alter table public.audit_events_archive add column if not exists actor_name text"
    );
    expect(sql.lower).toContain("update public.audit_events ae");
    expect(sql.lower).toContain("update public.audit_events_archive ae");
  });

  it("writes the descriptor at insert via a BEFORE INSERT trigger", () => {
    expect(sql.lower).toContain(
      "create trigger trg_audit_events_actor_descriptor"
    );
    expect(sql.lower).toContain("before insert on public.audit_events");
    const body = functionBody(sql, "audit_events_set_actor_descriptor");
    expect(body).toContain("new.actor_name");
    expect(body).toContain("new.actor_email");
    expect(body).toContain("from public.profiles");
  });

  it("reset RPC copies the descriptor into the archive", () => {
    const body = functionBody(sql, "super_admin_reset_audit_logs");
    expect(body).toContain("actor_name, actor_email");
    expect(body).toContain("insert into public.audit_events_archive");
  });
});

describe("SAD3 — profile registration + guards", () => {
  it("registers the profile target -> public.profiles only (never auth.users)", () => {
    const body = functionBody(sql, "super_admin_deletable_table");
    expect(body).toContain("'profile'");
    expect(body).toContain("'profiles'");
    // The delete engine never references auth.users — only the resolved public
    // table — so the no-service-role-key invariant holds.
    expect(functionBody(sql, "super_admin_permanent_delete")).not.toContain(
      "auth.users"
    );
  });

  it("confidential block detects SC.4 private notes via the care profile (existence only)", () => {
    const body = functionBody(sql, "super_admin_confidential_block");
    expect(body).toContain("shepherd_care_private_notes");
    expect(body).toContain("shepherd_care_profiles");
    expect(body).toContain("return exists");
    // Existence check only — never selects note ciphertext / content.
    expect(body).not.toContain("ciphertext");
  });
});

describe("SAD3 — super_admin_permanent_delete profile boundaries", () => {
  it("is SECURITY DEFINER with a pinned search_path", () => {
    assertSecurityDefiner(sql, "super_admin_permanent_delete");
  });

  it("forbids ANY super_admin profile target", () => {
    const body = functionBody(sql, "super_admin_permanent_delete");
    expect(body).toContain("role = 'super_admin'");
    expect(body).toContain("raise exception 'forbidden_target'");
  });

  it("still refuses confidential records + blockers before deleting", () => {
    const body = functionBody(sql, "super_admin_permanent_delete");
    expect(body).toContain("raise exception 'has_confidential_records'");
    expect(body).toContain("raise exception 'has_blocking_dependents'");
  });

  it("writes one paired audit_events row", () => {
    assertPairedAuditInsert(
      sql,
      "super_admin_permanent_delete",
      "'super_admin.permanent_delete'"
    );
  });

  it("locks EXECUTE down to authenticated only", () => {
    assertExecuteLockdown(sql, "super_admin_permanent_delete", "text, uuid");
  });
});

describe("SAD3 — preflight reflects the super_admin guard", () => {
  it("returns forbidden for a super_admin profile target", () => {
    const body = functionBody(sql, "super_admin_permanent_delete_preflight");
    expect(body).toContain("role = 'super_admin'");
    expect(body).toContain("'forbidden', true");
  });
});
