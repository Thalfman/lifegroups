import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resolveIntegrationEnv } from "./support/env";
import { provisionFixtures, type Fixtures } from "./support/fixtures";
import {
  RLS_COVERAGE,
  reconcileCoverage,
} from "./support/rls-coverage-manifest";

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

// (b) Coverage manifest completeness. This is a PURE check (no database): it
// reconciles the RLS coverage map against the sensitive-table set derived from
// the data-classification manifest (#694). It runs even when the live stack is
// absent, so a newly-classified sensitive table that lacks a coverage entry
// fails loudly here rather than silently implying full coverage. See #693.
describe("RLS coverage manifest completeness", () => {
  const report = reconcileCoverage();

  it("every sensitive table (from the classification manifest) has a coverage entry", () => {
    expect(
      report.missing,
      report.missing.length === 0
        ? ""
        : `Sensitive tables with no RLS coverage entry — add an asserted or ` +
            `deferred(reason) entry to rls-coverage-manifest.ts:\n  ${report.missing.join(
              "\n  "
            )}`
    ).toEqual([]);
  });

  it("the coverage map has no stale (non-sensitive) entries", () => {
    expect(
      report.stale,
      report.stale.length === 0
        ? ""
        : `Coverage entries for tables no longer classified sensitive:\n  ${report.stale.join(
            "\n  "
          )}`
    ).toEqual([]);
  });

  it("every deferred entry documents a reason (incompleteness is visible)", () => {
    const undocumented = Object.entries(RLS_COVERAGE)
      .filter(
        ([, e]) =>
          e.status.kind === "deferred" && e.status.reason.trim().length === 0
      )
      .map(([t]) => t);
    expect(undocumented).toEqual([]);
  });

  it("reports the live asserted/deferred split (visibility, not a gate)", () => {
    // Not an assertion that everything is asserted — just a guard that the
    // harness asserts a meaningful core and the rest is consciously deferred.
    expect(report.asserted.length).toBeGreaterThanOrEqual(8);
    expect(report.asserted.length + report.deferred.length).toBe(
      Object.keys(RLS_COVERAGE).length
    );
  });
});

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

    it("the wrapped-DEK key slots follow the same creator-only seal", async () => {
      // shepherd_care_note_key_slots is PRIVATE_NOTE_EXCEPTION too: only the
      // Ministry Admin who enrolled them reads them; the Super Admin and every
      // lower tier cannot.
      const own = await fx.ministryAdmin.client
        .from("shepherd_care_note_key_slots")
        .select("id, created_by_profile_id")
        .eq("created_by_profile_id", fx.ministryAdmin.profileId);
      expect(own.error).toBeNull();
      expect((own.data ?? []).length).toBeGreaterThan(0);

      for (const tier of [fx.superAdmin, fx.overShepherd, fx.leader]) {
        const { data, error } = await tier.client
          .from("shepherd_care_note_key_slots")
          .select("id")
          .eq("created_by_profile_id", fx.ministryAdmin.profileId);
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

  describe("exception 2b — Prayer Requests share the author-private seal", () => {
    // prayer_requests is CARE_NOTE_EXCEPTION, gated on the SAME per-subject
    // transparency grant as care_notes. Mirrors the care-note proof to keep the
    // second exception table from drifting.
    let prayerId: string;

    beforeAll(async () => {
      if (probe.kind !== "ready") return;
      // Start from a sealed state for the Leader subject.
      await fx.ministryAdmin.client.rpc("set_note_transparency_grant", {
        p_subject_profile_id: fx.leader.profileId,
        p_granted: false,
      });
      const write = await fx.overShepherd.client.rpc(
        "admin_write_prayer_request",
        {
          p_subject_profile_id: fx.leader.profileId,
          p_body: "Integration: author-private prayer request for the Leader.",
        }
      );
      expect(write.error, write.error?.message).toBeNull();
      prayerId = write.data as string;
      expect(prayerId).toBeTruthy();
    });

    it("the author reads it; with the grant OFF both admins see it sealed", async () => {
      const author = await fx.overShepherd.client
        .from("prayer_requests")
        .select("id")
        .eq("id", prayerId);
      expect(author.error).toBeNull();
      expect((author.data ?? []).length).toBe(1);

      for (const admin of [fx.ministryAdmin, fx.superAdmin]) {
        const { data, error } = await admin.client
          .from("prayer_requests")
          .select("id")
          .eq("id", prayerId);
        expect(error).toBeNull();
        expect((data ?? []).length).toBe(0);
      }
    });

    it("after the grant flips ON, both admins read it on the same grant", async () => {
      const grant = await fx.ministryAdmin.client.rpc(
        "set_note_transparency_grant",
        { p_subject_profile_id: fx.leader.profileId, p_granted: true }
      );
      expect(grant.error, grant.error?.message).toBeNull();

      for (const admin of [fx.ministryAdmin, fx.superAdmin]) {
        const { data, error } = await admin.client
          .from("prayer_requests")
          .select("id")
          .eq("id", prayerId);
        expect(error).toBeNull();
        expect((data ?? []).length).toBe(1);
      }

      // Re-seal so the harness leaves no lingering grant.
      await fx.ministryAdmin.client.rpc("set_note_transparency_grant", {
        p_subject_profile_id: fx.leader.profileId,
        p_granted: false,
      });
    });
  });

  describe("OVER_SHEPHERD_SCOPED — shepherd_care_profiles", () => {
    // Admins read every care profile; the Over-Shepherd reads the profiles of
    // the Leaders they cover; the Leader themselves does not read their own
    // care-tracking row (it is admin/coverage-only, not self-serve).
    it("admins and the covering Over-Shepherd read the Leader's care profile", async () => {
      for (const tier of [fx.superAdmin, fx.ministryAdmin, fx.overShepherd]) {
        const { data, error } = await tier.client
          .from("shepherd_care_profiles")
          .select("id")
          .eq("id", fx.leaderCareProfileId);
        expect(error).toBeNull();
        expect((data ?? []).length).toBe(1);
      }
    });

    it("the Leader does not read their own care-tracking profile", async () => {
      const { data, error } = await fx.leader.client
        .from("shepherd_care_profiles")
        .select("id")
        .eq("id", fx.leaderCareProfileId);
      expect(error).toBeNull();
      expect((data ?? []).length).toBe(0);
    });
  });

  describe("ADMIN_READ — over_shepherds roster", () => {
    // The roster table is admin-only: both admins read it, the Over-Shepherd
    // and Leader tiers do not (an OS reaches their coverage through
    // shepherd_coverage_assignments, not this table).
    it("both admins read the roster row; lower tiers do not", async () => {
      for (const admin of [fx.superAdmin, fx.ministryAdmin]) {
        const { data, error } = await admin.client
          .from("over_shepherds")
          .select("id")
          .eq("email", fx.overShepherd.email);
        expect(error).toBeNull();
        expect((data ?? []).length).toBe(1);
      }
      for (const tier of [fx.overShepherd, fx.leader]) {
        const { data, error } = await tier.client
          .from("over_shepherds")
          .select("id")
          .eq("email", fx.overShepherd.email);
        expect(error).toBeNull();
        expect((data ?? []).length).toBe(0);
      }
    });
  });

  describe("SUPER_ADMIN_ONLY — audit_events (Ministry Admin excluded)", () => {
    // The audit spine sits above the Ministry Admin on the ladder. The fixture
    // RPCs (care/prayer writes, grant flips) have already written audit rows
    // keyed to our actors; the Super Admin reads them, the Ministry Admin sees
    // none — the one place the ladder puts a surface ABOVE Julian.
    it("the Super Admin reads fixture audit rows; the Ministry Admin reads none", async () => {
      const actorIds = [fx.ministryAdmin.profileId, fx.overShepherd.profileId];

      const sa = await fx.superAdmin.client
        .from("audit_events")
        .select("id")
        .in("actor_profile_id", actorIds);
      expect(sa.error).toBeNull();
      expect((sa.data ?? []).length).toBeGreaterThan(0);

      const ma = await fx.ministryAdmin.client
        .from("audit_events")
        .select("id")
        .in("actor_profile_id", actorIds);
      expect(ma.error).toBeNull();
      expect((ma.data ?? []).length).toBe(0);
    });
  });

  describe("no broad write policies — direct table writes are denied for every tier", () => {
    // Every app write goes through a SECURITY DEFINER RPC; no table carries a
    // direct INSERT policy. A tier client attempting a raw insert is therefore
    // refused by RLS — proven here at the live boundary, per tier.
    it("no tier can directly INSERT a care_note (must use the RPC)", async () => {
      for (const tier of [
        fx.superAdmin,
        fx.ministryAdmin,
        fx.overShepherd,
        fx.leader,
      ]) {
        const { error } = await tier.client.from("care_notes").insert({
          author_profile_id: tier.profileId,
          subject_profile_id: fx.leader.profileId,
          body: "Integration: direct insert must be denied by RLS.",
        });
        expect(
          error,
          `${tier.key} direct care_notes insert should be denied`
        ).not.toBeNull();
      }
    });

    it("no tier can directly INSERT an audit_events row", async () => {
      for (const tier of [fx.superAdmin, fx.leader]) {
        const { error } = await tier.client.from("audit_events").insert({
          actor_profile_id: tier.profileId,
          action: "integration.forged",
          entity_type: "test",
        });
        expect(
          error,
          `${tier.key} direct audit_events insert should be denied`
        ).not.toBeNull();
      }
    });
  });
});
