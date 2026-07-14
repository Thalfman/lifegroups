import { beforeAll, describe, expect, it } from "vitest";

import {
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration("20260718010000_irreversible_profile_erasure.sql");
});

describe("irreversible profile erasure migration", () => {
  it("keeps the retry seam service-only with no authenticated policy", () => {
    expect(sql.lower).toContain(
      "alter table public.profile_auth_purge_jobs enable row level security"
    );
    expect(sql.lower).toContain(
      "revoke all on public.profile_auth_purge_jobs from authenticated"
    );
    expect(sql.lower).toContain(
      "grant select on public.profile_auth_purge_jobs to service_role"
    );
    expect(sql.lower).not.toMatch(
      /create policy\s+\w+\s+on\s+public\.profile_auth_purge_jobs/
    );
    expect(sql.lower).not.toMatch(
      /grant\s+(?:select|insert|update|delete)[^;]*profile_auth_purge_jobs[^;]*authenticated/
    );
  });

  it("atomically captures the pending Auth UUID then sanitizes the profile tombstone", () => {
    assertSecurityDefiner(sql, "capture_irreversible_profile_tombstone");
    const body = functionBody(sql, "capture_irreversible_profile_tombstone");
    const jobInsert = body.indexOf(
      "insert into public.profile_auth_purge_jobs"
    );
    const scrub = body.indexOf("update public.tombstones");
    expect(jobInsert).toBeGreaterThan(-1);
    expect(scrub).toBeGreaterThan(jobInsert);
    expect(body).toContain("'record_type', 'profile'");
    expect(body).toContain("'deletion_policy', 'irreversible'");
    expect(body).toContain("set_null_dependents = '[]'::jsonb");
    expect(body).toContain("cleanup_snapshot = '[]'::jsonb");
    expect(body).toContain("restorable = false");
    expect(sql.lower).toContain("after insert on public.tombstones");
  });

  it("backfills only incomplete legacy purges before scrubbing every profile tombstone", () => {
    const backfill = sql.lower.slice(
      sql.lower.indexOf("insert into public.profile_auth_purge_jobs", 1),
      sql.lower.indexOf("-- existing profile tombstones")
    );
    expect(backfill).toContain("t.restored_at is null");
    expect(backfill).toMatch(
      /not exists \(\s*select 1\s*from public\.profiles p\s*where p\.id = t\.entity_id\s*\)/
    );
    expect(backfill).toContain("ae.action = 'super_admin.auth_user_delete'");
    expect(backfill).toContain("not exists");
    expect(backfill).toContain("public.audit_events_archive");
    expect(sql.lower).toMatch(
      /update public\.tombstones[\s\S]*?set_null_dependents = '\[\]'::jsonb[\s\S]*?cleanup_snapshot = '\[\]'::jsonb[\s\S]*?restorable = false[\s\S]*?where entity_type = 'profile'/
    );
  });

  it("matches null-FK archived actors by normalized non-empty email, never name", () => {
    const auditBackfill = sql.lower.indexOf("-- backfill audit erasure");
    const archiveStart = sql.lower.indexOf(
      "update public.audit_events_archive ae",
      auditBackfill
    );
    const archiveEnd = sql.lower.indexOf(
      "-- existing profile tombstones",
      archiveStart
    );
    expect(auditBackfill).toBeGreaterThan(-1);
    expect(archiveStart).toBeGreaterThan(auditBackfill);
    expect(archiveEnd).toBeGreaterThan(archiveStart);

    const archiveBackfill = sql.lower.slice(archiveStart, archiveEnd);
    const nullActorEmailMatch =
      /ae\.actor_profile_id is null\s+and\s+\(\s+\(\s+coalesce\(t\.row_snapshot->>'email', ''\) <> ''\s+and lower\(coalesce\(ae\.actor_email, ''\)\)\s*=\s*lower\(t\.row_snapshot->>'email'\)\s+\)\s+\)/g;
    expect(archiveBackfill.match(nullActorEmailMatch)).toHaveLength(3);
    expect(archiveBackfill).not.toContain("row_snapshot->>'full_name'");
    expect(archiveBackfill).not.toMatch(/ae\.actor_name\s*=\s*t\.row_snapshot/);
  });
  it("excludes tombstones with a current profile from every legacy purge or scrub", () => {
    const legacy = sql.lower.slice(
      sql.lower.indexOf("-- backfill only legacy profile purges"),
      sql.lower.indexOf("-- future profile deletes")
    );
    const liveProfileGuard =
      /not exists \(\s*select 1\s*from public\.profiles p\s*where p\.id = t\.entity_id\s*\)/g;
    expect(legacy.match(liveProfileGuard)).toHaveLength(5);
  });

  it("clears the pending Auth UUID in the same audited completion transaction", () => {
    assertSecurityDefiner(sql, "service_record_profile_auth_purge");
    const body = functionBody(sql, "service_record_profile_auth_purge");
    expect(body).toContain("from public.profile_auth_purge_jobs");
    expect(body).toContain("for update");
    expect(body).toContain("if v_job.completed_at is not null");
    expect(body).toContain("insert into public.audit_events");
    expect(body).toContain("'super_admin.auth_user_delete'");
    expect(body).toContain("set auth_user_id = null");
    expect(body).toContain("outcome = p_outcome");
    expect(body).toContain("completed_at = now()");
    const outcomeGuard = body.indexOf("v_job.auth_user_id is null");
    const auditInsert = body.indexOf("insert into public.audit_events");
    expect(outcomeGuard).toBeGreaterThan(-1);
    expect(outcomeGuard).toBeLessThan(auditInsert);
    expect(body).toContain("p_outcome <> 'not_linked'");
    expect(body).toContain("v_job.auth_user_id is not null");
    expect(body).toContain("p_outcome not in ('deleted', 'already_missing')");
    expect(body).toContain("raise exception 'invalid_outcome'");
    expect(body).not.toContain("'auth_user_id'");
    assertPairedAuditInsert(
      sql,
      "service_record_profile_auth_purge",
      "'super_admin.auth_user_delete'"
    );
  });

  it("makes profile tombstones non-restorable without changing other entities", () => {
    assertSecurityDefiner(sql, "super_admin_restore_tombstone");
    const body = functionBody(sql, "super_admin_restore_tombstone");
    expect(body).toMatch(
      /execute format\('select 1 from public\.%i where id = \$1'[\s\S]*?into v_exists[\s\S]*?if v_exists is not null/
    );
    expect(body).not.toMatch(
      /execute format\('select 1 from public\.%i where id = \$1'[\s\S]*?if found/
    );
    expect(body).toContain(
      "v_tomb.entity_type = 'profile' or not v_tomb.restorable"
    );
    expect(body).toContain("raise exception 'irreversible_deletion'");
    expect(body).toContain("jsonb_populate_record");
    expect(body).toContain("insert into public.audit_events");
  });

  it("recursively erases profile PII from target and actor audit rows only", () => {
    expect(sql.lower).toMatch(
      /update public\.account_deletion_requests[\s\S]*?set reason = null[\s\S]*?where status = 'completed'/
    );
    const scrubber = functionBody(sql, "scrub_profile_pii_jsonb");
    expect(scrubber).toContain("jsonb_each(p_value)");
    expect(scrubber).toContain("jsonb_array_elements(p_value)");
    expect(scrubber).toContain("fullname|firstname|lastname|displayname|name");
    expect(scrubber).toContain("emailaddress|email");
    expect(scrubber).toContain("phonenumber|phone");

    const tombstoneRedaction = sql.lower.indexOf(
      "-- existing profile tombstones"
    );
    const auditBackfill = sql.lower.indexOf("-- backfill audit erasure");
    expect(auditBackfill).toBeGreaterThan(-1);
    expect(auditBackfill).toBeLessThan(tombstoneRedaction);
    const backfill = sql.lower.slice(auditBackfill, tombstoneRedaction);
    expect(backfill).toContain("t.restored_at is null");
    expect(
      backfill.match(
        /not exists \(\s*select 1\s*from public\.profiles p\s*where p\.id = t\.entity_id\s*\)/g
      )
    ).toHaveLength(2);
    expect(backfill).toContain("public.scrub_profile_pii_jsonb(ae.metadata)");
    expect(backfill).toContain("public.audit_events_archive ae");
    expect(sql.lower).not.toMatch(
      /update public\.audit_events\s+set actor_name = null,[\s\S]*?where actor_profile_id is null\s+and \(actor_name is not null or actor_email is not null\);/
    );

    const trigger = functionBody(
      sql,
      "scrub_deleted_profile_audit_attribution"
    );
    expect(trigger).toContain("update public.audit_events");
    expect(trigger).toContain("update public.audit_events_archive");
    expect(trigger).toContain("scrub_profile_pii_jsonb(metadata)");
    expect(trigger).toContain("actor_profile_id = old.id");
    expect(trigger).toContain("entity_id = old.id");
    expect(sql.lower).toContain("before delete on public.profiles");
  });
});
