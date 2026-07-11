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
//   * the operational assignment rows are GONE, captured on the tombstone's
//     cleanup_snapshot for the record — including the two children the
//     care-profile delete CASCADES (admin note + follow-up), so no care
//     history leaves without a tombstone record;
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
    `);
  });

  afterAll(async () => {
    if (probe.kind !== "ready") return;
    // Disposable local scaffolding only; FK-safe order.
    await runSql(`
      delete from public.audit_events
       where entity_id in ('${targetProfileId}', '${careNoteId}',
                           '${subjectNoteId}', '${prayerRequestId}',
                            '${blockedProfileId}')
          or (action = 'super_admin.auth_user_delete'
              and metadata->>'profile_id' = '${targetProfileId}');
      delete from public.account_deletion_requests where id = '${accountDeletionRequestId}';
      delete from public.tombstones where entity_id = '${targetProfileId}';
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

  it("purges through the Edge Function and frees the Auth email", async () => {
    const response = await invokeProfilePurge(
      fx.superAdmin.client,
      targetProfileId
    );
    expect(response.status).toBe(200);
    const result = (await response.json()) as {
      ok: boolean;
      code: string;
      tombstoneId?: string;
      authUserState?: string;
    };
    expect(result).toMatchObject({
      ok: true,
      code: "ok",
      authUserState: "deleted",
    });
    tombstoneId = result.tombstoneId ?? "";
    expect(tombstoneId).toBeTruthy();

    const deletedAuth = await service.auth.admin.getUserById(targetAuthUserId);
    expect(deletedAuth.data.user).toBeNull();
    expect(deletedAuth.error).not.toBeNull();

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

  it("captures the cleanup on the tombstone and re-links the notes as set-null dependents", async () => {
    const tombstones = await queryRows<{
      id: string;
      entity_type: string;
      table_name: string;
      cleanup_snapshot: Array<{
        table: string;
        column: string;
        rows: Array<Record<string, unknown>>;
      }>;
      set_null_dependents: Array<{
        table: string;
        column: string;
        ids: string[];
      }>;
    }>(
      "select id, entity_type, table_name, cleanup_snapshot, set_null_dependents from public.tombstones where entity_id = $1",
      [targetProfileId]
    );
    expect(tombstones).toHaveLength(1);
    const tomb = tombstones[0];
    expect(tomb.id).toBe(tombstoneId);
    expect(tomb.entity_type).toBe("profile");
    expect(tomb.table_name).toBe("profiles");

    // The three deleted operational rows AND the two cascade children are on
    // the record, full snapshots.
    const cleanupByTable = new Map(
      tomb.cleanup_snapshot.map((c) => [c.table, c])
    );
    for (const table of [
      "group_leaders",
      "shepherd_coverage_assignments",
      "shepherd_care_profiles",
      "shepherd_care_admin_notes",
      "shepherd_care_follow_ups",
    ]) {
      const entry = cleanupByTable.get(table);
      expect(entry, `${table} should be captured`).toBeDefined();
      expect(entry!.rows).toHaveLength(1);
    }
    // The cascade capture carries the actual content — the admin summary
    // reached the tombstone before the cascade removed the live row.
    const adminNoteRow = cleanupByTable.get("shepherd_care_admin_notes")!
      .rows[0];
    expect(adminNoteRow.admin_summary).toBe(
      "Admin summary that must reach the tombstone."
    );

    // The retained notes are captured as set-null dependents, so a tombstone
    // restore re-links their authorship automatically.
    const setNullByTable = new Map(
      tomb.set_null_dependents.map((d) => [`${d.table}.${d.column}`, d])
    );
    expect(setNullByTable.get("care_notes.author_profile_id")?.ids).toContain(
      careNoteId
    );
    expect(
      setNullByTable.get("prayer_requests.author_profile_id")?.ids
    ).toContain(prayerRequestId);
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
      "select actor_profile_id, metadata from public.audit_events where entity_type = 'auth_user' and entity_id = $1 and action = 'super_admin.auth_user_delete'",
      [targetAuthUserId]
    );
    expect(authAudits).toHaveLength(1);
    expect(authAudits[0].actor_profile_id).toBe(fx.superAdmin.profileId);
    expect(authAudits[0].metadata).toMatchObject({
      profile_id: targetProfileId,
      tombstone_id: tombstoneId,
      outcome: "deleted",
    });
    expect(JSON.stringify(authAudits[0].metadata)).not.toContain(targetEmail);
    expect(JSON.stringify(authAudits[0].metadata)).not.toContain(
      "Personal reason"
    );
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
