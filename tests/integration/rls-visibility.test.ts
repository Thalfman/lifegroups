import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resolveIntegrationEnv } from "./support/env";
import { provisionFixtures, type Fixtures } from "./support/fixtures";

// (a) Per-tier RLS visibility across the oversight ladder, INCLUDING the two
// visibility exceptions. Every assertion runs through a per-tier authenticated
// client, so it exercises REAL Row Level Security against the local stack — the
// same boundary the running app sees. See issue #607.
//
// The downward-visibility ladder: Super Admin ▸ Ministry Admin ▸ Over-Shepherd
// ▸ Leader. The two deliberate inversions/seals:
//   1. The Ministry Admin's Private Care Note (SC.4, encrypted) — readable only
//      by its creator, HIDDEN EVEN FROM THE SUPER ADMIN.
//   2. Author-private Care Notes — sealed to the author until the Ministry Admin
//      flips that subject's transparency toggle, after which the Super Admin can
//      read them too (the ladder peeks on the SAME grant; no super-admin bypass).

const probe = resolveIntegrationEnv();
const suite = probe.kind === "ready" ? describe : describe.skip;

if (probe.kind === "skip") {
  // Surface the reason so a skipped run is self-explanatory, not silent.
  console.warn(`[rls-integration] ${probe.reason}`);
}

suite("RLS per-tier visibility (local Supabase stack)", () => {
  let fx: Fixtures;

  beforeAll(async () => {
    if (probe.kind !== "ready") return;
    fx = await provisionFixtures(probe.env);
  });

  afterAll(async () => {
    if (fx) await fx.teardown();
  });

  describe("oversight ladder — profiles visibility", () => {
    it("Super Admin reads every tier's profile (top of the ladder)", async () => {
      const ids = [
        fx.superAdmin.profileId,
        fx.ministryAdmin.profileId,
        fx.overShepherd.profileId,
        fx.leader.profileId,
      ];
      const { data, error } = await fx.superAdmin.client
        .from("profiles")
        .select("id, role")
        .in("id", ids);
      expect(error).toBeNull();
      expect(new Set((data ?? []).map((r) => r.id))).toEqual(new Set(ids));
    });

    it("Ministry Admin reads every tier's profile", async () => {
      const ids = [
        fx.superAdmin.profileId,
        fx.ministryAdmin.profileId,
        fx.overShepherd.profileId,
        fx.leader.profileId,
      ];
      const { data, error } = await fx.ministryAdmin.client
        .from("profiles")
        .select("id, role")
        .in("id", ids);
      expect(error).toBeNull();
      expect(new Set((data ?? []).map((r) => r.id))).toEqual(new Set(ids));
    });

    it("Over-Shepherd reads the Leader they cover, not the admins above them", async () => {
      const { data, error } = await fx.overShepherd.client
        .from("profiles")
        .select("id")
        .in("id", [
          fx.leader.profileId,
          fx.ministryAdmin.profileId,
          fx.superAdmin.profileId,
        ]);
      expect(error).toBeNull();
      const visible = new Set((data ?? []).map((r) => r.id));
      expect(visible.has(fx.leader.profileId)).toBe(true);
      expect(visible.has(fx.ministryAdmin.profileId)).toBe(false);
      expect(visible.has(fx.superAdmin.profileId)).toBe(false);
    });

    it("Leader does not read the tiers above them", async () => {
      const { data, error } = await fx.leader.client
        .from("profiles")
        .select("id")
        .in("id", [
          fx.overShepherd.profileId,
          fx.ministryAdmin.profileId,
          fx.superAdmin.profileId,
        ]);
      expect(error).toBeNull();
      expect((data ?? []).length).toBe(0);
    });
  });

  describe("exception 1 — Ministry Admin Private Care Note (hidden even from Super Admin)", () => {
    // The encrypted SC.4 note: creator-scoped RLS, the one deliberate inversion
    // of the ladder. The Ministry Admin who wrote it reads it; the Super Admin
    // above them cannot.
    beforeAll(async () => {
      if (probe.kind !== "ready") return;
      // Enroll a recovery key slot, then write a private note as the Ministry Admin.
      const enroll = await fx.ministryAdmin.client.rpc(
        "admin_enroll_private_note_keys",
        {
          p_dek_version: 1,
          p_slots: [
            {
              slot_type: "recovery",
              // Fixed sizes the RPC validates: hkdf 16B, wrap_iv 12B, wrapped_dek 48B.
              hkdf_salt: Buffer.alloc(16, 7).toString("base64"),
              wrap_iv: Buffer.alloc(12, 7).toString("base64"),
              wrapped_dek: Buffer.alloc(48, 7).toString("base64"),
            },
          ],
        }
      );
      expect(enroll.error, enroll.error?.message).toBeNull();

      const upsert = await fx.ministryAdmin.client.rpc(
        "admin_upsert_shepherd_care_private_note",
        {
          p_care_profile_id: fx.leaderCareProfileId,
          // ciphertext >= 16B (the GCM tag floor), iv exactly 12B.
          p_ciphertext: Buffer.alloc(32, 9).toString("base64"),
          p_iv: Buffer.alloc(12, 9).toString("base64"),
          p_dek_version: 1,
          p_set_body: true,
        }
      );
      expect(upsert.error, upsert.error?.message).toBeNull();
    });

    it("the authoring Ministry Admin can read their own private note row", async () => {
      const { data, error } = await fx.ministryAdmin.client
        .from("shepherd_care_private_notes")
        .select("id, care_profile_id, created_by_profile_id")
        .eq("care_profile_id", fx.leaderCareProfileId);
      expect(error).toBeNull();
      expect((data ?? []).length).toBe(1);
      expect(data![0].created_by_profile_id).toBe(fx.ministryAdmin.profileId);
    });

    it("the Super Admin CANNOT read the Ministry Admin's private note (the inversion)", async () => {
      const { data, error } = await fx.superAdmin.client
        .from("shepherd_care_private_notes")
        .select("id")
        .eq("care_profile_id", fx.leaderCareProfileId);
      expect(error).toBeNull();
      expect((data ?? []).length).toBe(0);
    });

    it("lower tiers cannot read the private note either", async () => {
      for (const tier of [fx.overShepherd, fx.leader]) {
        const { data, error } = await tier.client
          .from("shepherd_care_private_notes")
          .select("id")
          .eq("care_profile_id", fx.leaderCareProfileId);
        expect(error).toBeNull();
        expect((data ?? []).length).toBe(0);
      }
    });
  });

  describe("exception 2 — author-private Care Notes sealed until the transparency toggle flips", () => {
    let careNoteId: string;

    beforeAll(async () => {
      if (probe.kind !== "ready") return;
      // The Over-Shepherd authors a Care Note about the Leader they cover.
      const write = await fx.overShepherd.client.rpc("admin_write_care_note", {
        p_subject_profile_id: fx.leader.profileId,
        p_body:
          "Integration: author-private care note about the covered Leader.",
      });
      expect(write.error, write.error?.message).toBeNull();
      careNoteId = write.data as string;
      expect(careNoteId).toBeTruthy();
    });

    it("the author (Over-Shepherd) always reads their own Care Note", async () => {
      const { data, error } = await fx.overShepherd.client
        .from("care_notes")
        .select("id, author_profile_id, subject_profile_id")
        .eq("id", careNoteId);
      expect(error).toBeNull();
      expect((data ?? []).length).toBe(1);
      expect(data![0].author_profile_id).toBe(fx.overShepherd.profileId);
    });

    it("with the grant OFF, the Ministry Admin and Super Admin see the note SEALED", async () => {
      for (const admin of [fx.ministryAdmin, fx.superAdmin]) {
        const { data, error } = await admin.client
          .from("care_notes")
          .select("id")
          .eq("id", careNoteId);
        expect(error).toBeNull();
        expect((data ?? []).length).toBe(0);
      }
    });

    it("a peer Leader never reads the Care Note (regardless of grant)", async () => {
      const { data, error } = await fx.leader.client
        .from("care_notes")
        .select("id")
        .eq("id", careNoteId);
      expect(error).toBeNull();
      expect((data ?? []).length).toBe(0);
    });

    it("after the Ministry Admin flips the grant ON, BOTH admins read it (ladder peek on the same grant)", async () => {
      const grant = await fx.ministryAdmin.client.rpc(
        "set_note_transparency_grant",
        { p_subject_profile_id: fx.leader.profileId, p_granted: true }
      );
      expect(grant.error, grant.error?.message).toBeNull();

      for (const admin of [fx.ministryAdmin, fx.superAdmin]) {
        const { data, error } = await admin.client
          .from("care_notes")
          .select("id, subject_profile_id")
          .eq("id", careNoteId);
        expect(error).toBeNull();
        expect((data ?? []).length).toBe(1);
        expect(data![0].subject_profile_id).toBe(fx.leader.profileId);
      }
    });

    it("flipping the grant back OFF re-seals the note from the ladder", async () => {
      const grant = await fx.ministryAdmin.client.rpc(
        "set_note_transparency_grant",
        { p_subject_profile_id: fx.leader.profileId, p_granted: false }
      );
      expect(grant.error, grant.error?.message).toBeNull();

      const { data, error } = await fx.superAdmin.client
        .from("care_notes")
        .select("id")
        .eq("id", careNoteId);
      expect(error).toBeNull();
      expect((data ?? []).length).toBe(0);

      // The author still reads it through the author arm.
      const author = await fx.overShepherd.client
        .from("care_notes")
        .select("id")
        .eq("id", careNoteId);
      expect(author.error).toBeNull();
      expect((author.data ?? []).length).toBe(1);
    });
  });
});
