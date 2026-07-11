import { beforeAll, describe, expect, it } from "vitest";

import {
  assertAuditContentFree,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration("20260716000000_record_profile_auth_purge.sql");
});

describe("#881 migration: auth-side purge audit", () => {
  it("exposes one SECURITY DEFINER recorder to service_role only", () => {
    assertSecurityDefiner(sql, "service_record_profile_auth_purge");
    expect(sql.lower).toMatch(
      /revoke all on function public\.service_record_profile_auth_purge\(\s*uuid, uuid, uuid, uuid, text\s*\) from authenticated/
    );
    expect(sql.lower).toMatch(
      /grant execute on function public\.service_record_profile_auth_purge\(\s*uuid, uuid, uuid, uuid, text\s*\) to service_role/
    );
    expect(sql.lower).not.toMatch(
      /grant execute on function public\.service_record_profile_auth_purge\([^;]+to authenticated/
    );
  });

  it("rechecks the actor and accepts only the fixed auth outcomes", () => {
    const body = functionBody(sql, "service_record_profile_auth_purge");
    expect(body).toContain("role = 'super_admin'");
    expect(body).toContain("status = 'active'");
    expect(body).toContain(
      "p_outcome not in ('deleted', 'already_missing', 'not_linked')"
    );
  });

  it("is idempotent per tombstone and writes one content-free audit event", () => {
    const body = functionBody(sql, "service_record_profile_auth_purge");
    expect(body).toContain("pg_advisory_xact_lock");
    expect(body).toContain("action = 'super_admin.auth_user_delete'");
    expect(body).toContain("metadata->>'tombstone_id'");
    expect(body).toContain("insert into public.audit_events");
    expect(body).toContain("'super_admin.auth_user_delete'");
    expect(body).toContain("'profile_id', p_profile_id");
    expect(body).toContain("'tombstone_id', p_tombstone_id");
    expect(body).toContain("'outcome', p_outcome");
    assertAuditContentFree(sql, {
      forbidden: ["email", "reason", "token", "credential"],
      required: ["profile_id", "tombstone_id", "outcome"],
    });
  });
});
