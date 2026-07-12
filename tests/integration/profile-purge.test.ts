import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveIntegrationEnv } from "./support/env";
import { makeServiceClient } from "./support/clients";
import { provisionFixtures, type Fixtures } from "./support/fixtures";
import { queryRows, runSql } from "./support/sql";

// Issues #880/#881/#882 — live proof of the complete profile purge path and
// profile purge. A leader encumbered with every dependent class the issue
// names — an active group_leaders assignment, a shepherd_coverage_assignments
// row, a shepherd_care_profiles row, and an authored Care Note + Prayer
// Request — is permanently deleted through purge-profile-auth by an
// authenticated Super Admin (real RLS, real RPC, real Auth). The pinned outcomes:
//
//   * the purge SUCCEEDS (no has_blocking_dependents / has_confidential_records);
//   * authored notes/prayers SURVIVE with author_profile_id nulled and the
//     anonymized 'Former Shepherd' descriptor stamped (no personal identifiers);
//   * the operational assignment rows are GONE, while every recoverable
//     tombstone snapshot is scrubbed at the erasure boundary;
//   * the profile tombstone is structural-only and cannot be restored;
//   * a service-only retry job survives a partial Auth/audit failure, then
//     clears its transient Auth UUID when completion is recorded;
//   * a care profile with a RESTRICT-linked interaction still REFUSES with
//     has_blocking_dependents (no partial purge);
//   * the tombstone + the paired audit_events row exist (same transaction);
//   * the linked Auth user is deleted and the same email can be invited again;
//   * the pending account-deletion request becomes completed, loses its profile
//     link, and has its free-text reason wiped;
//   * an id-only audit event records the Auth-side deletion;
//   * the sealed-note presence counts still include a retained (null-author)
//     profile-subject note whose gating leader's grant is off.
//
// Seeding and unsealed assertions go through the harness's superuser SQL
// escape hatch (support/sql.ts — local stack only); the purge call itself goes
// through the authenticated Super Admin's Edge Function boundary.

const probe = resolveIntegrationEnv();
const suite = probe.kind === "ready" ? describe : describe.skip;

if (probe.kind === "skip") {
  console.warn(`[rls-integration] ${probe.reason}`);
}

suite("complete profile purge (#880/#881/#882)", () => {
  let fx: Fixtures;

  const targetProfileId = randomUUID();
  const groupId = randomUUID();
  const rosterId = randomUUID();
  const careProfileId = randomUUID();
  const followUpId = randomUUID();
  const careNoteId = randomUUID();
  const subjectNoteId = randomUUID();
  const prayerRequestId = randomUUID();
  const accountDeletionRequestId = randomUUID();
  // A second encumbered leader whose care profile holds a RESTRICT-linked
  // interaction — the refusal control.
  const blockedProfileId = randomUUID();
  const blockedCareProfileId = randomUUID();
  const mismatchProfileId = randomUUID();
  const mismatchTombstoneId = randomUUID();
  const mismatchAuthUserId = randomUUID();
  const targetMetadataAuditId = randomUUID();
  const targetActorAuditId = randomUUID();
  const targetArchiveAuditId = randomUUID();
  const restoredCurrentAuditId = randomUUID();
  const restoredArchiveAuditId = randomUUID();
  const restoredTombstoneId = randomUUID();
  let tombstoneId: string;
  let service: SupabaseClient;
  let targetAuthUserId = "";
  let replacementAuthUserId = "";
  let targetEmail = "";

  async function invokeProfilePurge(
    client: SupabaseClient,
    profileId: string
  ): Promise<Response> {
    if (probe.kind !== "ready") throw new Error("integration env unavailable");
    const { data, error } = await client.auth.getSession();
    const accessToken = data.session?.access_token;
    if (error || !accessToken) {
      throw new Error("integration caller has no Auth access token");
    }

    return fetch(`${probe.env.supabaseUrl}/functions/v1/purge-profile-auth`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: probe.env.anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ profileId }),
    });
  }

  beforeAll(async () => {
    if (probe.kind !== "ready") return;
    fx = await provisionFixtures(probe.env);

    service = makeServiceClient(probe.env);
    targetEmail = `purge-target.${fx.runId}@lifegroups.local`;
    const { data: targetAuth, error: targetAuthError } =
      await service.auth.admin.createUser({
        email: targetEmail,
        password: "Integ-Purge-Target-Aa1!",
        email_confirm: true,
      });
    if (targetAuthError || !targetAuth.user) {
      throw new Error(
        `target Auth setup failed: ${targetAuthError?.message ?? "no user"}`
      );
    }
    targetAuthUserId = targetAuth.user.id;
    // The encumbered leader: active Leader of a group, covered by an
    // Over-Shepherd, tracked in shepherd care, and the AUTHOR of a group-
    // scoped Care Note + Prayer Request. Superuser seeding (setup, not
    // assertion) so the harness's narrow service grants don't matter.
    await runSql(`
      insert into public.profiles (id, auth_user_id, email, full_name, role, status)
      values ('${targetProfileId}', '${targetAuthUserId}', '${targetEmail}',
              'Integ Purge Target', 'leader', 'active');
      insert into public.account_deletion_requests (id, profile_id, reason)
      values ('${accountDeletionRequestId}', '${targetProfileId}',
              'Personal reason that must be wiped when the purge completes.');


      -- PII-bearing audit controls. The target rows must be recursively
      -- scrubbed; the restored/live profile controls must remain attributed.
      insert into public.audit_events
        (id, actor_profile_id, action, entity_type, entity_id, metadata)
      values
        (
          '${targetMetadataAuditId}', '${fx.superAdmin.profileId}',
          'integ.profile_target_pii', 'profile', '${targetProfileId}',
          jsonb_build_object(
            'profile_id', '${targetProfileId}',
            'group_id', '${groupId}',
            'before', jsonb_build_object(
              'full_name', 'Integ Purge Target',
              'email', '${targetEmail}',
              'phoneNumber', '555-0100',
              'status', 'active'
            )
          )
        ),
        (
          '${targetActorAuditId}', '${targetProfileId}',
          'integ.profile_actor_pii', 'groups', '${groupId}',
          jsonb_build_object(
            'group_id', '${groupId}',
            'after', jsonb_build_object(
              'displayName', 'Integ Purge Target',
              'email_address', '${targetEmail}',
              'mobile_phone', '555-0101',
              'status', 'kept'
            )
          )
        ),
        (
          '${restoredCurrentAuditId}', '${fx.leader.profileId}',
          'integ.restored_actor_control', 'groups', '${groupId}',
          jsonb_build_object('group_id', '${groupId}', 'status', 'kept')
        );

      insert into public.audit_events_archive
        (id, actor_profile_id, actor_name, actor_email, action, entity_type,
         entity_id, metadata, created_at)
      values
        (
          '${targetArchiveAuditId}', '${targetProfileId}',
          'Integ Purge Target', '${targetEmail}',
          'integ.profile_actor_archive_pii', 'groups', '${groupId}',
          jsonb_build_object(
            'profile_id', '${targetProfileId}',
            'nested', jsonb_build_object(
              'fullName', 'Integ Purge Target',
              'emailAddress', '${targetEmail}',
              'phone', '555-0102',
              'status', 'kept'
            )
          ),
          now()
        ),
        (
          '${restoredArchiveAuditId}', '${fx.leader.profileId}',
          'Integ Leader', '${fx.leader.email}',
          'integ.restored_actor_archive_control', 'groups', '${groupId}',
          jsonb_build_object('group_id', '${groupId}', 'status', 'kept'),
          now()
        );

      insert into public.tombstones
        (id, entity_type, table_name, entity_id, row_snapshot, restored_at)
      values (
        '${restoredTombstoneId}', 'profile', 'profiles',
        '${fx.leader.profileId}',
        jsonb_build_object(
          'full_name', 'Integ Leader',
          'email', '${fx.leader.email}',
          'role', 'leader',
          'status', 'active'
        ),
        now()
      );

      insert into public.groups (id, name)
      values ('${groupId}', 'Integ Purge Group ${fx.runId}');

      insert into public.group_leaders (group_id, profile_id, role)
      values ('${groupId}', '${targetProfileId}', 'leader');

      insert into public.over_shepherds (id, full_name, active)
      values ('${rosterId}', 'Integ Purge Roster OS', true);

      insert into public.shepherd_coverage_assignments
        (shepherd_profile_id, over_shepherd_id, active)
      values ('${targetProfileId}', '${rosterId}', true);

      insert into public.shepherd_care_profiles (id, shepherd_profile_id)
      values ('${careProfileId}', '${targetProfileId}');

      -- The two CASCADE children of the care profile: both must be captured
      -- on the tombstone before the care-profile delete cascades them away.
      -- (created_by is the Super Admin: follow-ups are admin-owned tasks.)
      insert into public.shepherd_care_admin_notes (care_profile_id, admin_summary)
      values ('${careProfileId}', 'Admin summary that must reach the tombstone.');

      insert into public.shepherd_care_follow_ups
        (id, care_profile_id, title, created_by_profile_id)
      values ('${followUpId}', '${careProfileId}', 'Integ purge follow-up',
              '${fx.superAdmin.profileId}');

      insert into public.care_notes (id, author_profile_id, subject_group_id, body)
      values ('${careNoteId}', '${targetProfileId}', '${groupId}',
              'Authored care note that must outlive its author.');

      -- A profile-subject note (about the fixture Leader) authored by the
      -- target: after the purge its author is null but it must still show in
      -- the sealed presence counts under its gating SUBJECT.
      insert into public.care_notes (id, author_profile_id, subject_profile_id, body)
      values ('${subjectNoteId}', '${targetProfileId}', '${fx.leader.profileId}',
              'Retained subject note about the covered leader.');

      insert into public.prayer_requests (id, author_profile_id, subject_group_id, body)
      values ('${prayerRequestId}', '${targetProfileId}', '${groupId}',
              'Authored prayer request that must outlive its author.');

      -- The refusal control: a leader whose care profile holds a RESTRICT-
      -- linked interaction. Its purge must fail atomically.
      insert into public.profiles (id, email, full_name, role, status)
      values ('${blockedProfileId}', 'purge-blocked.${fx.runId}@lifegroups.local',
              'Integ Purge Blocked', 'leader', 'active');

      insert into public.shepherd_care_profiles (id, shepherd_profile_id)
      values ('${blockedCareProfileId}', '${blockedProfileId}');

      insert into public.shepherd_care_interactions
        (care_profile_id, interaction_at, interaction_type, created_by_profile_id)
      values ('${blockedCareProfileId}', current_date, 'call',
              '${fx.superAdmin.profileId}');


      -- A pending service-only job used to prove outcome/UUID shape
      -- mismatches roll back without an audit row.
      insert into public.tombstones
        (id, entity_type, table_name, entity_id, row_snapshot)
      values (
        '${mismatchTombstoneId}',
        'profile',
        'profiles',
        '${mismatchProfileId}',
        jsonb_build_object(
          'auth_user_id', '${mismatchAuthUserId}',
          'full_name', 'Mismatch Control',
          'email', 'mismatch-control@example.test',
          'role', 'leader',
          'status', 'inactive'
        )
      );
    `);
  });

  afterAll(async () => {
    if (probe.kind !== "ready") return;
    // Disposable local scaffolding only; FK-safe order.
    await runSql(`
      delete from public.audit_events
       where id in ('${targetMetadataAuditId}', '${targetActorAuditId}',
                    '${restoredCurrentAuditId}')
          or entity_id in ('${targetProfileId}', '${careNoteId}',
                           '${subjectNoteId}', '${prayerRequestId}',
                            '${blockedProfileId}', '${mismatchProfileId}')
          or (action = 'super_admin.auth_user_delete'
              and metadata->>'profile_id' = '${targetProfileId}');
      delete from public.audit_events_archive
       where id in ('${targetArchiveAuditId}', '${restoredArchiveAuditId}');

      delete from public.account_deletion_requests where id = '${accountDeletionRequestId}';
      delete from public.profile_auth_purge_jobs
       where profile_id in ('${targetProfileId}', '${mismatchProfileId}');
      delete from public.tombstones
       where id = '${restoredTombstoneId}'
          or entity_id in ('${targetProfileId}', '${mismatchProfileId}');
      delete from public.care_notes
       where id in ('${careNoteId}', '${subjectNoteId}');
      delete from public.prayer_requests where id = '${prayerRequestId}';
      delete from public.group_leaders where group_id = '${groupId}';
      delete from public.groups where id = '${groupId}';
      delete from public.shepherd_coverage_assignments
       where shepherd_profile_id = '${targetProfileId}';
      delete from public.shepherd_care_interactions
       where care_profile_id in ('${careProfileId}', '${blockedCareProfileId}');
      delete from public.shepherd_care_follow_ups
       where care_profile_id in ('${careProfileId}', '${blockedCareProfileId}');
      delete from public.shepherd_care_admin_notes
       where care_profile_id in ('${careProfileId}', '${blockedCareProfileId}');
      delete from public.shepherd_care_profiles
       where id in ('${careProfileId}', '${blockedCareProfileId}');
      delete from public.over_shepherds where id = '${rosterId}';
      delete from public.profiles
       where id in ('${targetProfileId}', '${blockedProfileId}');
    `);
    if (replacementAuthUserId) {
      await service.auth.admin.deleteUser(replacementAuthUserId);
    }
    if (targetAuthUserId) {
      await service.auth.admin.deleteUser(targetAuthUserId);
    }
    if (fx) await fx.teardown();
  });

  it("denies a non-Super-Admin caller inside the Edge Function", async () => {
    const response = await invokeProfilePurge(
      fx.ministryAdmin.client,
      targetProfileId
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      ok: false,
      code: "super_admin_required",
    });
    const lookup = await service.auth.admin.getUserById(targetAuthUserId);
    expect(lookup.data.user?.id).toBe(targetAuthUserId);
  });

  it("preflight reports the encumbered profile deletable, with the cleanup announced", async () => {
    // #880: the danger-zone preflight must agree with the engine — the three
    // operational tables are announced cleanup, never blockers, and the
    // retained notes/prayers preview as set-null dependents.
    const preflight = await fx.superAdmin.client.rpc(
      "super_admin_permanent_delete_preflight",
      {
        p_entity_type: "profile",
        p_id: targetProfileId,
      }
    );
    expect(preflight.error, preflight.error?.message).toBeNull();
    const report = preflight.data as {
      deletable: boolean;
      forbidden: boolean;
      confidential: boolean;
      blockers: Array<{ table: string }>;
      cleanup: Array<{ table: string; column: string; count: number }>;
      set_null: Array<{ table: string; column: string; count: number }>;
    };
    expect(report.deletable).toBe(true);
    expect(report.forbidden).toBe(false);
    expect(report.confidential).toBe(false);
    expect(report.blockers).toEqual([]);

    const cleanupByTable = new Map(report.cleanup.map((c) => [c.table, c]));
    expect(cleanupByTable.get("group_leaders")).toMatchObject({
      column: "profile_id",
      count: 1,
    });
    expect(cleanupByTable.get("shepherd_coverage_assignments")).toMatchObject({
      column: "shepherd_profile_id",
      count: 1,
    });
    expect(cleanupByTable.get("shepherd_care_profiles")).toMatchObject({
      column: "shepherd_profile_id",
      count: 1,
    });
    // The care-profile CASCADE children are announced too (join counts).
    expect(cleanupByTable.get("shepherd_care_admin_notes")).toMatchObject({
      column: "care_profile_id",
      count: 1,
    });
    expect(cleanupByTable.get("shepherd_care_follow_ups")).toMatchObject({
      column: "care_profile_id",
      count: 1,
    });

    const setNullTables = report.set_null.map((s) => `${s.table}.${s.column}`);
    expect(setNullTables).toContain("care_notes.author_profile_id");
    expect(setNullTables).toContain("prayer_requests.author_profile_id");
  });

  it("rejects a purge outcome that contradicts the pending Auth UUID", async () => {
    const mismatch = await service.rpc("service_record_profile_auth_purge", {
      p_actor_profile_id: fx.superAdmin.profileId,
      p_profile_id: mismatchProfileId,
      p_auth_user_id: mismatchAuthUserId,
      p_tombstone_id: mismatchTombstoneId,
      p_outcome: "not_linked",
    });
    expect(mismatch.data).toBeNull();
    expect(mismatch.error?.message).toContain("invalid_outcome");

    const jobs = await queryRows<{
      auth_user_id: string | null;
      outcome: string | null;
      completed_at: string | null;
    }>(
      "select auth_user_id, outcome, completed_at from public.profile_auth_purge_jobs where tombstone_id = $1",
      [mismatchTombstoneId]
    );
    expect(jobs).toEqual([
      {
        auth_user_id: mismatchAuthUserId,
        outcome: null,
        completed_at: null,
      },
    ]);
    const audits = await queryRows<{ id: string }>(
      "select id from public.audit_events where action = 'super_admin.auth_user_delete' and metadata->>'tombstone_id' = $1",
      [mismatchTombstoneId]
    );
    expect(audits).toEqual([]);
  });
  it("resumes an Auth/audit partial failure and clears the retry identifier", async () => {
    await runSql(`
      drop trigger if exists trg_integ_fail_profile_auth_audit
        on public.audit_events;
      create or replace function public.integ_fail_profile_auth_audit()
      returns trigger
      language plpgsql
      set search_path = public, pg_temp
      as $$
      begin
        if new.action = 'super_admin.auth_user_delete'
           and new.metadata->>'profile_id' = '${targetProfileId}' then
          raise exception 'integ_forced_auth_audit_failure';
        end if;
        return new;
      end;
      $$;
      create trigger trg_integ_fail_profile_auth_audit
        before insert on public.audit_events
        for each row
        execute function public.integ_fail_profile_auth_audit();
    `);

    let firstResponse: Response;
    try {
      firstResponse = await invokeProfilePurge(
        fx.superAdmin.client,
        targetProfileId
      );
    } finally {
      await runSql(`
        drop trigger if exists trg_integ_fail_profile_auth_audit
          on public.audit_events;
        drop function if exists public.integ_fail_profile_auth_audit();
      `);
    }

    expect(firstResponse.status).toBe(500);
    const partial = (await firstResponse.json()) as {
      ok: boolean;
      code: string;
      tombstoneId?: string;
      warnings: string[];
    };
    expect(partial).toMatchObject({
      ok: false,
      code: "audit_record_failed",
      warnings: ["auth_user_delete_completed"],
    });
    tombstoneId = partial.tombstoneId ?? "";
    expect(tombstoneId).toBeTruthy();

    const pendingJobs = await queryRows<{
      tombstone_id: string;
      auth_user_id: string | null;
      outcome: string | null;
      completed_at: string | null;
    }>(
      "select tombstone_id, auth_user_id, outcome, completed_at from public.profile_auth_purge_jobs where profile_id = $1",
      [targetProfileId]
    );
    expect(pendingJobs).toEqual([
      {
        tombstone_id: tombstoneId,
        auth_user_id: targetAuthUserId,
        outcome: null,
        completed_at: null,
      },
    ]);

    const deletedAuth = await service.auth.admin.getUserById(targetAuthUserId);
    expect(deletedAuth.data.user).toBeNull();
    expect(deletedAuth.error).not.toBeNull();

    const retryResponse = await invokeProfilePurge(
      fx.superAdmin.client,
      targetProfileId
    );
    expect(retryResponse.status).toBe(200);
    expect(await retryResponse.json()).toMatchObject({
      ok: true,
      code: "ok",
      tombstoneId,
      authUserState: "already_missing",
      resumed: true,
    });

    const completedJobs = await queryRows<{
      tombstone_id: string;
      auth_user_id: string | null;
      outcome: string | null;
      completed_at: string | null;
    }>(
      "select tombstone_id, auth_user_id, outcome, completed_at from public.profile_auth_purge_jobs where profile_id = $1",
      [targetProfileId]
    );
    expect(completedJobs).toHaveLength(1);
    expect(completedJobs[0]).toMatchObject({
      tombstone_id: tombstoneId,
      auth_user_id: null,
      outcome: "already_missing",
    });
    expect(completedJobs[0].completed_at).toBeTruthy();

    const { data: replacement, error: replacementError } =
      await service.auth.admin.createUser({
        email: targetEmail,
        password: "Integ-Purge-Recreated-Aa1!",
        email_confirm: true,
      });
    expect(replacementError, replacementError?.message).toBeNull();
    expect(replacement.user).not.toBeNull();
    replacementAuthUserId = replacement.user?.id ?? "";

    const gone = await queryRows<{ id: string }>(
      "select id from public.profiles where id = $1",
      [targetProfileId]
    );
    expect(gone).toHaveLength(0);

    const requests = await queryRows<{
      status: string;
      profile_id: string | null;
      reason: string | null;
      processed_at: string | null;
    }>(
      "select status, profile_id, reason, processed_at from public.account_deletion_requests where id = $1",
      [accountDeletionRequestId]
    );
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      status: "completed",
      profile_id: null,
      reason: null,
    });
    expect(requests[0].processed_at).toBeTruthy();
  });

  it("scrubs target audit PII while preserving restored/live attribution", async () => {
    const current = await queryRows<{
      id: string;
      actor_profile_id: string | null;
      actor_name: string | null;
      actor_email: string | null;
      metadata: Record<string, unknown>;
    }>(
      "select id, actor_profile_id, actor_name, actor_email, metadata from public.audit_events where id = any($1::uuid[])",
      [[targetMetadataAuditId, targetActorAuditId, restoredCurrentAuditId]]
    );
    const currentById = new Map(current.map((row) => [row.id, row]));

    const targetMetadata = currentById.get(targetMetadataAuditId)!;
    expect(targetMetadata.actor_profile_id).toBe(fx.superAdmin.profileId);
    expect(targetMetadata.metadata).toMatchObject({
      profile_id: targetProfileId,
      group_id: groupId,
      before: { status: "active" },
    });
    expect(JSON.stringify(targetMetadata.metadata)).not.toContain(targetEmail);
    expect(JSON.stringify(targetMetadata.metadata)).not.toContain("555-0100");

    const targetActor = currentById.get(targetActorAuditId)!;
    expect(targetActor).toMatchObject({
      actor_profile_id: null,
      actor_name: null,
      actor_email: null,
    });
    expect(targetActor.metadata).toMatchObject({
      group_id: groupId,
      after: { status: "kept" },
    });
    expect(JSON.stringify(targetActor.metadata)).not.toContain(targetEmail);

    const archived = await queryRows<{
      id: string;
      actor_profile_id: string | null;
      actor_name: string | null;
      actor_email: string | null;
      metadata: Record<string, unknown>;
    }>(
      "select id, actor_profile_id, actor_name, actor_email, metadata from public.audit_events_archive where id = any($1::uuid[])",
      [[targetArchiveAuditId, restoredArchiveAuditId]]
    );
    const archiveById = new Map(archived.map((row) => [row.id, row]));
    expect(archiveById.get(targetArchiveAuditId)).toMatchObject({
      actor_profile_id: null,
      actor_name: null,
      actor_email: null,
      metadata: {
        profile_id: targetProfileId,
        nested: { status: "kept" },
      },
    });

    expect(currentById.get(restoredCurrentAuditId)).toMatchObject({
      actor_profile_id: fx.leader.profileId,
      actor_name: "Integ Leader",
      actor_email: fx.leader.email,
    });
    expect(archiveById.get(restoredArchiveAuditId)).toMatchObject({
      actor_profile_id: fx.leader.profileId,
      actor_name: "Integ Leader",
      actor_email: fx.leader.email,
    });
  });
  it("retains the authored note + prayer with anonymized authorship", async () => {
    const notes = await queryRows<{
      author_profile_id: string | null;
      author_descriptor: string | null;
      body: string;
    }>(
      "select author_profile_id, author_descriptor, body from public.care_notes where id = $1",
      [careNoteId]
    );
    expect(notes).toHaveLength(1);
    expect(notes[0].author_profile_id).toBeNull();
    expect(notes[0].author_descriptor).toBe("Former Shepherd");
    expect(notes[0].body).toBe(
      "Authored care note that must outlive its author."
    );

    const prayers = await queryRows<{
      author_profile_id: string | null;
      author_descriptor: string | null;
      body: string;
    }>(
      "select author_profile_id, author_descriptor, body from public.prayer_requests where id = $1",
      [prayerRequestId]
    );
    expect(prayers).toHaveLength(1);
    expect(prayers[0].author_profile_id).toBeNull();
    expect(prayers[0].author_descriptor).toBe("Former Shepherd");
    expect(prayers[0].body).toBe(
      "Authored prayer request that must outlive its author."
    );
  });

  it("cleans up the operational assignment rows", async () => {
    for (const [table, column] of [
      ["group_leaders", "profile_id"],
      ["shepherd_coverage_assignments", "shepherd_profile_id"],
      ["shepherd_care_profiles", "shepherd_profile_id"],
    ] as const) {
      const rows = await queryRows<{ id: string }>(
        `select id from public.${table} where ${column} = $1`,
        [targetProfileId]
      );
      expect(rows, `${table} should be cleaned up`).toHaveLength(0);
    }
    // The two CASCADE children went with the care profile.
    for (const table of [
      "shepherd_care_admin_notes",
      "shepherd_care_follow_ups",
    ]) {
      const rows = await queryRows<{ care_profile_id: string }>(
        `select care_profile_id from public.${table} where care_profile_id = $1`,
        [careProfileId]
      );
      expect(rows, `${table} should be cascade-removed`).toHaveLength(0);
    }
  });

  it("keeps only a non-restorable structural tombstone", async () => {
    const tombstones = await queryRows<{
      id: string;
      entity_type: string;
      table_name: string;
      row_snapshot: Record<string, unknown>;
      cleanup_snapshot: unknown[];
      set_null_dependents: unknown[];
      restorable: boolean;
      restored_at: string | null;
    }>(
      "select id, entity_type, table_name, row_snapshot, cleanup_snapshot, set_null_dependents, restorable, restored_at from public.tombstones where entity_id = $1",
      [targetProfileId]
    );
    expect(tombstones).toHaveLength(1);
    const tomb = tombstones[0];
    expect(tomb).toMatchObject({
      id: tombstoneId,
      entity_type: "profile",
      table_name: "profiles",
      row_snapshot: {
        record_type: "profile",
        role: "leader",
        status: "active",
        deletion_policy: "irreversible",
      },
      cleanup_snapshot: [],
      set_null_dependents: [],
      restorable: false,
      restored_at: null,
    });
    expect(tomb.row_snapshot).not.toHaveProperty("auth_user_id");
    expect(tomb.row_snapshot).not.toHaveProperty("full_name");
    expect(tomb.row_snapshot).not.toHaveProperty("email");
    expect(tomb.row_snapshot).not.toHaveProperty("phone");

    const restore = await fx.superAdmin.client.rpc(
      "super_admin_restore_tombstone",
      { p_tombstone_id: tombstoneId }
    );
    expect(restore.data).toBeNull();
    expect(restore.error?.message).toContain("irreversible_deletion");
  });

  it("writes the database and Auth-side audit events", async () => {
    const audits = await queryRows<{
      action: string;
      actor_profile_id: string | null;
      metadata: Record<string, unknown>;
    }>(
      "select action, actor_profile_id, metadata from public.audit_events where entity_type = 'profiles' and entity_id = $1 and action = 'super_admin.permanent_delete'",
      [targetProfileId]
    );
    expect(audits).toHaveLength(1);
    expect(audits[0].actor_profile_id).toBe(fx.superAdmin.profileId);
    expect(audits[0].metadata).toMatchObject({
      entity_type: "profile",
      tombstone_id: tombstoneId,
      // Two care notes: the group-scoped one + the profile-subject one.
      anonymized_care_note_count: 2,
      anonymized_prayer_request_count: 1,
      cleaned_group_leader_count: 1,
      cleaned_coverage_assignment_count: 1,
      cleaned_care_profile_count: 1,
      captured_care_admin_note_count: 1,
      captured_care_follow_up_count: 1,
    });
    // Content-free: never a note body or the admin summary.
    expect(JSON.stringify(audits[0].metadata)).not.toContain("outlive");
    expect(JSON.stringify(audits[0].metadata)).not.toContain("Admin summary");
    const authAudits = await queryRows<{
      actor_profile_id: string | null;
      metadata: Record<string, unknown>;
    }>(
      "select actor_profile_id, metadata from public.audit_events where entity_type = 'profile' and entity_id = $1 and action = 'super_admin.auth_user_delete'",
      [targetProfileId]
    );
    expect(authAudits).toHaveLength(1);
    expect(authAudits[0].actor_profile_id).toBe(fx.superAdmin.profileId);
    expect(authAudits[0].metadata).toMatchObject({
      profile_id: targetProfileId,
      tombstone_id: tombstoneId,
      outcome: "already_missing",
    });
    const authAuditMetadata = JSON.stringify(authAudits[0].metadata);
    expect(authAuditMetadata).not.toContain(targetEmail);
    expect(authAuditMetadata).not.toContain("Personal reason");
    expect(authAuditMetadata).not.toContain(targetAuthUserId);
  });

  it("still counts the retained null-author note in the sealed presence counts", async () => {
    // #880 finding 2: the subject-scoped sealed count must include the
    // retained note (author now NULL) while the subject's grant is off — a
    // null author is never the caller, so the row stays sealed-but-present.
    const counts = await fx.ministryAdmin.client.rpc(
      "admin_sealed_note_counts"
    );
    expect(counts.error, counts.error?.message).toBeNull();
    const rows = (counts.data ?? []) as Array<{
      gating_profile_id: string | null;
      sealed_care_note_count: number;
      sealed_prayer_request_count: number;
    }>;
    const leaderRow = rows.find(
      (r) => r.gating_profile_id === fx.leader.profileId
    );
    expect(leaderRow).toBeDefined();
    expect(leaderRow!.sealed_care_note_count).toBeGreaterThanOrEqual(1);
    // Group-subject rows with a purged author have no gating leader left —
    // they are the permanently-sealed bucket, never a NULL gating row.
    expect(rows.some((r) => r.gating_profile_id === null)).toBe(false);
  });

  it("still refuses a profile whose care profile holds a RESTRICT-linked interaction", async () => {
    const purge = await fx.superAdmin.client.rpc(
      "super_admin_permanent_delete",
      {
        p_entity_type: "profile",
        p_id: blockedProfileId,
      }
    );
    expect(purge.error).not.toBeNull();
    expect(purge.error?.message).toContain("has_blocking_dependents");
    expect(purge.data).toBeNull();

    // Atomic refusal: the profile, its care profile, and the interaction all
    // survive untouched (the pre-step's captures/deletes rolled back).
    const profile = await queryRows<{ id: string }>(
      "select id from public.profiles where id = $1",
      [blockedProfileId]
    );
    expect(profile).toHaveLength(1);
    const careProfile = await queryRows<{ id: string }>(
      "select id from public.shepherd_care_profiles where id = $1",
      [blockedCareProfileId]
    );
    expect(careProfile).toHaveLength(1);
    const interactions = await queryRows<{ id: string }>(
      "select id from public.shepherd_care_interactions where care_profile_id = $1",
      [blockedCareProfileId]
    );
    expect(interactions).toHaveLength(1);
  });
});
