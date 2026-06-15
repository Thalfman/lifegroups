import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { makeServiceClient } from "./support/clients";
import { resolveIntegrationEnv, type IntegrationEnv } from "./support/env";
import { provisionFixtures, type Fixtures } from "./support/fixtures";

// (b) The action-pipeline half of issue #607: a write that goes through a
// narrow SECURITY DEFINER RPC persists its row AND writes a paired
// `audit_events` row IN THE SAME TRANSACTION.
//
// The transactional pairing is the load-bearing invariant. We assert it two
// ways: the row + audit row both exist after a successful write, and — the real
// proof of atomicity — when the RPC RAISES, NEITHER row is left behind (a
// non-transactional pairing would leak one without the other).

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

    it("a RAISED RPC leaves NEITHER the row NOR an audit row (atomic rollback)", async () => {
      // Drive the RPC to its `invalid_input` raise with a whitespace-only body.
      // If the audit insert were a separate statement (not the same transaction),
      // a partial write could leak an audit row; the rollback proves it does not.
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
      // No new rows on either table: the whole transaction rolled back.
      expect((afterNotes.data ?? []).length).toBe(beforeNoteCount);
      expect((afterAudit.data ?? []).length).toBe(beforeAuditCount);
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
