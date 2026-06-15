import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { makeServiceClient } from "./support/clients";
import { resolveIntegrationEnv, type IntegrationEnv } from "./support/env";
import { provisionFixtures, type Fixtures } from "./support/fixtures";
import { runSql } from "./support/sql";

// (b) The action-pipeline half of issue #607: a write that goes through a
// narrow SECURITY DEFINER RPC persists its row AND writes a paired
// `audit_events` row IN THE SAME TRANSACTION.
//
// The transactional pairing is the load-bearing invariant. We assert it three
// ways: the row + audit row both exist after a successful write; a body rejected
// at VALIDATION writes nothing (the pre-insert raise path); and — the real proof
// of atomicity (#625) — when the RPC fails AFTER the care_notes insert but at
// the audit_events insert, NEITHER row survives. A non-transactional pairing
// would leak the note without its audit row; the rollback proves it does not.

const probe = resolveIntegrationEnv();
const suite = probe.kind === "ready" ? describe : describe.skip;

if (probe.kind === "skip") {
  console.warn(`[rls-integration] ${probe.reason}`);
}

suite(
  "action pipeline — RPC write + paired audit_events (same transaction)",
  () => {
    let fx: Fixtures;
    let serviceEnv: IntegrationEnv;

    beforeAll(async () => {
      if (probe.kind !== "ready") return;
      serviceEnv = probe.env;
      fx = await provisionFixtures(probe.env);
    });

    afterAll(async () => {
      if (fx) await fx.teardown();
    });

    it("admin_write_care_note persists the row AND a paired audit_events row", async () => {
      const body = `Integration audit pairing ${fx.runId}`;
      const write = await fx.ministryAdmin.client.rpc("admin_write_care_note", {
        p_subject_profile_id: fx.leader.profileId,
        p_body: body,
      });
      expect(write.error, write.error?.message).toBeNull();
      const noteId = write.data as string;
      expect(noteId).toBeTruthy();

      // The persisted row exists (read back as its author — the always-on arm).
      const noteRead = await fx.ministryAdmin.client
        .from("care_notes")
        .select("id, author_profile_id, subject_profile_id")
        .eq("id", noteId);
      expect(noteRead.error).toBeNull();
      expect((noteRead.data ?? []).length).toBe(1);
      expect(noteRead.data![0].author_profile_id).toBe(
        fx.ministryAdmin.profileId
      );

      // The paired audit row exists, keyed to the same entity, written by the
      // same actor, with PRESENCE-ONLY metadata (has_body — never the body text).
      // audit_events is admin-readable; read it back as the Super Admin.
      const auditRead = await fx.superAdmin.client
        .from("audit_events")
        .select("action, entity_type, entity_id, actor_profile_id, metadata")
        .eq("entity_type", "care_notes")
        .eq("entity_id", noteId);
      expect(auditRead.error).toBeNull();
      expect((auditRead.data ?? []).length).toBe(1);
      const audit = auditRead.data![0];
      expect(audit.action).toBe("admin.care_note.write");
      expect(audit.actor_profile_id).toBe(fx.ministryAdmin.profileId);
      expect(audit.metadata).toMatchObject({ has_body: true });
      // The note body must NEVER be copied into audit metadata.
      expect(JSON.stringify(audit.metadata)).not.toContain(body);
    });

    it("a body rejected at VALIDATION writes nothing (pre-insert raise path)", async () => {
      // A whitespace-only body is rejected by the RPC's `invalid_input` guard
      // BEFORE the care_notes insert, so nothing is ever written. This proves the
      // validation-raise path, NOT transactional pairing (the insert is never
      // reached) — the atomic-rollback proof below covers the post-insert case.
      // Service client (RLS-bypassing) reads the unsealed truth on both tables.
      const service = makeServiceClient(serviceEnv);

      const beforeNotes = await service
        .from("care_notes")
        .select("id")
        .eq("subject_profile_id", fx.leader.profileId);
      const beforeAudit = await service
        .from("audit_events")
        .select("id")
        .eq("entity_type", "care_notes")
        .eq("action", "admin.care_note.write");
      const beforeNoteCount = (beforeNotes.data ?? []).length;
      const beforeAuditCount = (beforeAudit.data ?? []).length;

      const write = await fx.ministryAdmin.client.rpc("admin_write_care_note", {
        p_subject_profile_id: fx.leader.profileId,
        p_body: "   \n\t  ",
      });
      // The RPC raised; PostgREST surfaces it as an error, not a row.
      expect(write.error).not.toBeNull();
      expect(write.data).toBeNull();

      const afterNotes = await service
        .from("care_notes")
        .select("id")
        .eq("subject_profile_id", fx.leader.profileId);
      const afterAudit = await service
        .from("audit_events")
        .select("id")
        .eq("entity_type", "care_notes")
        .eq("action", "admin.care_note.write");
      // No new rows on either table: validation rejected before any write.
      expect((afterNotes.data ?? []).length).toBe(beforeNoteCount);
      expect((afterAudit.data ?? []).length).toBe(beforeAuditCount);
    });

    // The load-bearing atomicity proof (#625). A whitespace body raises at
    // validation, never reaching the insert — so it cannot show that the
    // care_notes insert and the paired audit_events insert live in ONE
    // transaction. Here we force a failure AFTER the care_notes insert, at the
    // audit insert, with a TEST-ONLY trigger keyed to a dedicated subject. A
    // non-transactional pairing would leave the note row behind; the rollback
    // proves the note row is gone too.
    describe("atomic rollback when the audit insert fails mid-transaction", () => {
      const triggerName = "_it625_fail_audit_insert";
      const functionName = "public._it625_fail_audit_insert";

      beforeAll(async () => {
        if (probe.kind !== "ready") return;
        // BEFORE INSERT on audit_events: raise only for this run's rollback
        // subject, so the trigger can never disturb any other test's writes.
        await runSql(`
          create or replace function ${functionName}()
            returns trigger language plpgsql as $fn$
          begin
            if new.action = 'admin.care_note.write'
               and new.metadata->>'subject_profile_id'
                   = '${fx.rollbackSubjectProfileId}' then
              raise exception 'it625_forced_audit_failure';
            end if;
            return new;
          end;
          $fn$;
          drop trigger if exists ${triggerName} on public.audit_events;
          create trigger ${triggerName}
            before insert on public.audit_events
            for each row execute function ${functionName}();
        `);
      });

      afterAll(async () => {
        if (probe.kind !== "ready") return;
        await runSql(`
          drop trigger if exists ${triggerName} on public.audit_events;
          drop function if exists ${functionName}();
        `);
      });

      it("leaves NEITHER the care_notes row NOR the audit row behind", async () => {
        const service = makeServiceClient(serviceEnv);
        const subjectId = fx.rollbackSubjectProfileId;

        // Sanity: the forced-failure subject starts with no note and no audit
        // row, so any leak below is unambiguous.
        const beforeNotes = await service
          .from("care_notes")
          .select("id")
          .eq("subject_profile_id", subjectId);
        expect((beforeNotes.data ?? []).length).toBe(0);

        const write = await fx.ministryAdmin.client.rpc(
          "admin_write_care_note",
          { p_subject_profile_id: subjectId, p_body: "Rollback proof body" }
        );
        // The trigger raised on the audit insert; PostgREST surfaces the error.
        expect(write.error).not.toBeNull();
        expect(write.data).toBeNull();

        // The care_notes insert succeeded first, then the audit insert raised.
        // If the two were not one transaction, the note row would survive. It
        // must NOT — assert both tables are clean for this subject.
        const afterNotes = await service
          .from("care_notes")
          .select("id")
          .eq("subject_profile_id", subjectId);
        expect((afterNotes.data ?? []).length).toBe(0);

        const afterAudit = await service
          .from("audit_events")
          .select("id, metadata")
          .eq("entity_type", "care_notes")
          .eq("action", "admin.care_note.write")
          .filter("metadata->>subject_profile_id", "eq", subjectId);
        expect((afterAudit.data ?? []).length).toBe(0);
      });
    });

    it("a non-admin without coverage cannot drive the RPC write (guard rejects)", async () => {
      // The Leader is not an admin and covers no one — the in-RPC authorship gate
      // must refuse, so no care_notes / audit_events row is created.
      const write = await fx.leader.client.rpc("admin_write_care_note", {
        p_subject_profile_id: fx.leader.profileId,
        p_body: "Leader should not be able to author this.",
      });
      expect(write.error).not.toBeNull();
      expect(write.data).toBeNull();
    });
  }
);
