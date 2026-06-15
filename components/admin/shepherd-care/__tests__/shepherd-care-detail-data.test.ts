import { describe, expect, it } from "vitest";

import {
  buildShepherdCareDetailData,
  resolveShepherdCareSpine,
  type ShepherdCareDetailOptions,
  type ShepherdCareDetailReads,
} from "@/components/admin/shepherd-care/shepherd-care-detail-data";
import type { ReadResult } from "@/lib/supabase/read-core";

const ok = <T>(data: T): ReadResult<T> => ({ data, error: null });
const fail = (message: string): ReadResult<never> => ({
  data: null,
  error: new Error(message),
});

const PROFILE_ID = "00000000-0000-4000-8000-000000000001";
const CREATOR_ID = "00000000-0000-4000-8000-000000000002";
const CARE_PROFILE_ID = "00000000-0000-4000-8000-0000000000c1";

const PROFILE = {
  id: PROFILE_ID,
  full_name: "Avery Leader",
  email: "avery@example.com",
  role: "leader",
  status: "active",
};

const CARE_ROW = {
  id: CARE_PROFILE_ID,
  shepherd_profile_id: PROFILE_ID,
  current_status: "doing_well",
  last_contact_at: "2026-05-01",
  next_touchpoint_due: null,
  admin_summary: null,
  archived_at: null,
  created_at: "2026-01-01T00:00:00Z",
};

const COVERAGE = {
  id: "cov-1",
  shepherd_profile_id: PROFILE_ID,
  over_shepherd_id: "os-1",
  over_shepherd: { id: "os-1", full_name: "Pat Over-Shepherd" },
};

// A successful, empty-ish read for every dependency; each test overrides only
// the reads it cares about. Two adapters, one seam: this fake satisfies the
// same `ShepherdCareDetailReads` the live `supabaseShepherdCareDetailReads`
// adapter does, so the suppression rules — a failed read suppresses its derived
// section rather than reporting a false zero — are exercised with no database.
function detailReads(
  overrides: Partial<ShepherdCareDetailReads> = {}
): ShepherdCareDetailReads {
  return {
    fetchProfile: async () => ok(PROFILE as never),
    fetchCareProfile: async () => ok(CARE_ROW as never),
    fetchOverShepherds: async () => ok([]),
    fetchActiveCoverage: async () => ok(null),
    fetchGenericFollowUpCount: async () => ok(0),
    fetchLedGroups: async () => ok([]),
    fetchPrivateNoteKeySlots: async () => ok([]),
    fetchInteractions: async () => ok([]),
    fetchFollowUps: async () => ok([]),
    fetchPrivateNoteCiphertext: async () => ok(null),
    fetchLeaderHealthRubric: async () => ok({ criteria: [] }),
    fetchLeaderRubricGrade: async () => ok(null),
    fetchGroupHealthRubric: async () => ok(null),
    fetchGroupRubricGrade: async () => ok(null as never),
    fetchNoteTransparencyGrant: async () => ok(null),
    fetchCareNotesForSubject: async () => ok([]),
    fetchPrayerRequestsForSubject: async () => ok([]),
    fetchAuthoredGroupCareNotes: async () => ok([]),
    fetchAuthoredGroupPrayerRequests: async () => ok([]),
    fetchGroupsByIds: async () => ok([]),
    ...overrides,
  };
}

const OPTIONS: ShepherdCareDetailOptions = {
  profileId: PROFILE_ID,
  creatorProfileId: CREATOR_ID,
  canReadPrivateNotes: true,
  ministryYear: 2026,
};

describe("buildShepherdCareDetailData", () => {
  it("assembles every section when all reads succeed", async () => {
    const data = await buildShepherdCareDetailData(
      detailReads({
        fetchActiveCoverage: async () => ok(COVERAGE as never),
        fetchInteractions: async () =>
          ok([{ id: "i-1", interaction_at: "2026-05-02" }] as never),
        fetchFollowUps: async () => ok([{ id: "f-1" }] as never),
        fetchLedGroups: async () =>
          ok([{ id: "g-1", name: "Tuesday Night Life Group" }]),
        fetchGroupRubricGrade: async () =>
          ok({
            group_id: "g-1",
            ministry_year: 2026,
            criterion_scores: { attendance: 80 },
            grade: {
              computed_letter: "B",
              effective_letter: "B",
              overridden: false,
              override_scope: null,
            },
            last_saved_at: null,
          } as never),
        fetchNoteTransparencyGrant: async () => ok({ granted: true } as never),
        fetchCareNotesForSubject: async () => ok([{ id: "n-1" }] as never),
        fetchPrayerRequestsForSubject: async () => ok([{ id: "p-1" }] as never),
        fetchAuthoredGroupCareNotes: async () =>
          ok([
            {
              id: "gn-1",
              body: "We multiplied a table",
              created_at: "2026-05-03T00:00:00Z",
              subject_group_id: "g-1",
            },
          ] as never),
        fetchAuthoredGroupPrayerRequests: async () =>
          ok([
            {
              id: "gp-1",
              body: "Pray for our new co-leader",
              created_at: "2026-05-04T00:00:00Z",
              subject_group_id: "g-1",
              status: "answered",
            },
          ] as never),
        fetchGroupsByIds: async () =>
          ok([{ id: "g-1", name: "Tuesday Night Life Group" }] as never),
      }),
      OPTIONS
    );

    if (data.kind !== "ok") throw new Error("expected ok");
    expect(data.profileFullName).toBe("Avery Leader");
    expect(data.care).toMatchObject({ id: CARE_PROFILE_ID });
    expect(data.coverage).toMatchObject({ id: "cov-1" });
    expect(data.interactions).toHaveLength(1);
    expect(data.followUps).toHaveLength(1);
    expect(data.gradeByGroupId.get("g-1")).toMatchObject({
      criterion_scores: { attendance: 80 },
    });
    expect(data.transparencyGranted).toBe(true);
    expect(data.careNotes).toHaveLength(1);
    expect(data.prayerRequests).toHaveLength(1);
    // Authored group notes carry their resolved group name (and the prayer
    // request its pastoral status) for display context.
    expect(data.authoredGroupCareNotes).toEqual([
      expect.objectContaining({
        id: "gn-1",
        groupName: "Tuesday Night Life Group",
      }),
    ]);
    expect(data.authoredGroupPrayerRequests).toEqual([
      expect.objectContaining({ id: "gp-1", status: "answered" }),
    ]);
    expect(data.leaderGradeReadFailed).toBe(false);
    expect(data.groupRubricReadFailed).toBe(false);
    expect(data.gradeReadFailedGroupIds.size).toBe(0);
    expect(data.error).toBeNull();
  });

  it("yields the 404 shape for a missing, wrong-role, or inactive subject", async () => {
    // Missing entirely.
    expect(
      await buildShepherdCareDetailData(
        detailReads({ fetchProfile: async () => ok(null) }),
        OPTIONS
      )
    ).toEqual({ kind: "not_found" });
    // Only leaders / co-leaders are valid care targets.
    expect(
      await buildShepherdCareDetailData(
        detailReads({
          fetchProfile: async () => ok({ ...PROFILE, role: "member" } as never),
        }),
        OPTIONS
      )
    ).toEqual({ kind: "not_found" });
    // Archived / invited subjects 404 too.
    expect(
      await buildShepherdCareDetailData(
        detailReads({
          fetchProfile: async () =>
            ok({ ...PROFILE, status: "archived" } as never),
        }),
        OPTIONS
      )
    ).toEqual({ kind: "not_found" });
  });

  it("suppresses only coverage when the coverage read fails", async () => {
    const data = await buildShepherdCareDetailData(
      detailReads({
        fetchActiveCoverage: async () => fail("coverage boom"),
        fetchInteractions: async () => ok([{ id: "i-1" }] as never),
        fetchCareNotesForSubject: async () => ok([{ id: "n-1" }] as never),
      }),
      OPTIONS
    );

    if (data.kind !== "ok") throw new Error("expected ok");
    // No coverage claim — the section shows "not assigned" plus the page-level
    // error banner, never a confidently wrong owner.
    expect(data.coverage).toBeNull();
    expect(data.error).toBe("coverage boom");
    // Everything else still renders from its own successful reads.
    expect(data.care).not.toBeNull();
    expect(data.interactions).toHaveLength(1);
    expect(data.careNotes).toHaveLength(1);
  });

  it("suppresses only the timeline when the interactions read fails", async () => {
    const data = await buildShepherdCareDetailData(
      detailReads({
        fetchInteractions: async () => fail("interactions boom"),
        fetchFollowUps: async () => ok([{ id: "f-1" }] as never),
        fetchActiveCoverage: async () => ok(COVERAGE as never),
      }),
      OPTIONS
    );

    if (data.kind !== "ok") throw new Error("expected ok");
    expect(data.interactions).toEqual([]);
    expect(data.error).toBe("interactions boom");
    // Follow-ups and coverage came from their own reads and survive.
    expect(data.followUps).toHaveLength(1);
    expect(data.coverage).toMatchObject({ id: "cov-1" });
  });

  it("suppresses only the notes list when the care-notes read fails", async () => {
    const data = await buildShepherdCareDetailData(
      detailReads({
        fetchCareNotesForSubject: async () => fail("notes boom"),
        fetchPrayerRequestsForSubject: async () => ok([{ id: "p-1" }] as never),
        fetchNoteTransparencyGrant: async () => ok({ granted: true } as never),
        fetchInteractions: async () => ok([{ id: "i-1" }] as never),
      }),
      OPTIONS
    );

    if (data.kind !== "ok") throw new Error("expected ok");
    // The notes list degrades to empty (the section's sealed/empty copy carries
    // the explanation); prayer requests and the grant render from their own
    // successful reads, and the detail spine is untouched.
    expect(data.careNotes).toEqual([]);
    expect(data.prayerRequests).toHaveLength(1);
    expect(data.transparencyGranted).toBe(true);
    expect(data.interactions).toHaveLength(1);
    expect(data.error).toBeNull();
  });

  it("suppresses everything hanging off the care profile when its read fails", async () => {
    const data = await buildShepherdCareDetailData(
      detailReads({
        fetchCareProfile: async () => fail("care boom"),
        // These succeed, but interactions / follow-ups / coverage all hang off
        // the care profile, so they must not render against a failed spine.
        fetchActiveCoverage: async () => ok(COVERAGE as never),
        fetchLedGroups: async () => ok([{ id: "g-1", name: "Tuesday" }]),
        fetchCareNotesForSubject: async () => ok([{ id: "n-1" }] as never),
      }),
      OPTIONS
    );

    if (data.kind !== "ok") throw new Error("expected ok");
    expect(data.care).toBeNull();
    expect(data.interactions).toEqual([]);
    expect(data.followUps).toEqual([]);
    expect(data.coverage).toBeNull();
    expect(data.error).toBe("care boom");
    // Reads independent of the care profile still surface.
    expect(data.ledGroups).toEqual([{ id: "g-1", name: "Tuesday" }]);
    expect(data.careNotes).toHaveLength(1);
  });

  it("never invokes the private-note readers without ministry_admin access (SC.4)", async () => {
    let slotsCalled = false;
    let ciphertextCalled = false;
    const data = await buildShepherdCareDetailData(
      detailReads({
        fetchPrivateNoteKeySlots: async () => {
          slotsCalled = true;
          return ok([{ id: "slot-1" }] as never);
        },
        fetchPrivateNoteCiphertext: async () => {
          ciphertextCalled = true;
          return ok({ id: "note-1" } as never);
        },
      }),
      { ...OPTIONS, canReadPrivateNotes: false }
    );

    if (data.kind !== "ok") throw new Error("expected ok");
    // No read path at all for a super_admin request — not just no UI.
    expect(slotsCalled).toBe(false);
    expect(ciphertextCalled).toBe(false);
    expect(data.privateNote).toBeNull();
    expect(data.privateNoteKeySlots).toEqual([]);
  });

  it("flags failed grade reads instead of seeding blank editors", async () => {
    const data = await buildShepherdCareDetailData(
      detailReads({
        fetchLeaderHealthRubric: async () => fail("leader rubric boom"),
        fetchLedGroups: async () =>
          ok([
            { id: "g-1", name: "Tuesday" },
            { id: "g-2", name: "Thursday" },
          ]),
        fetchGroupRubricGrade: async (groupId) =>
          groupId === "g-2"
            ? fail("grade boom")
            : ok({
                group_id: "g-1",
                ministry_year: 2026,
                criterion_scores: {},
                grade: {
                  computed_letter: null,
                  effective_letter: null,
                  overridden: false,
                  override_scope: null,
                },
                last_saved_at: null,
              } as never),
      }),
      OPTIONS
    );

    if (data.kind !== "ok") throw new Error("expected ok");
    // A blank seed could overwrite a saved grade, so a failed read blocks the
    // editor (#377/#378) — per group where possible.
    expect(data.leaderGradeReadFailed).toBe(true);
    expect(data.gradeReadFailedGroupIds).toEqual(new Set(["g-2"]));
    expect(data.gradeByGroupId.has("g-1")).toBe(true);
    expect(data.groupRubricReadFailed).toBe(false);
  });

  it("resolves the header spine from the single profile read", async () => {
    const result = await resolveShepherdCareSpine(detailReads(), PROFILE_ID);
    expect(result).toEqual({
      kind: "ok",
      spine: { profileFullName: "Avery Leader", profileRole: "leader" },
    });
  });

  it("404s the spine for a missing, wrong-role, or inactive subject (matching the body)", async () => {
    expect(
      await resolveShepherdCareSpine(
        detailReads({ fetchProfile: async () => ok(null) }),
        PROFILE_ID
      )
    ).toEqual({ kind: "not_found" });
    expect(
      await resolveShepherdCareSpine(
        detailReads({
          fetchProfile: async () => ok({ ...PROFILE, role: "member" } as never),
        }),
        PROFILE_ID
      )
    ).toEqual({ kind: "not_found" });
    expect(
      await resolveShepherdCareSpine(
        detailReads({
          fetchProfile: async () =>
            ok({ ...PROFILE, status: "archived" } as never),
        }),
        PROFILE_ID
      )
    ).toEqual({ kind: "not_found" });
  });

  it("renders (not 404s) on a transient profile-read error, deferring to the body's error banner", async () => {
    const result = await resolveShepherdCareSpine(
      detailReads({ fetchProfile: async () => fail("profile boom") }),
      PROFILE_ID
    );
    expect(result).toEqual({
      kind: "ok",
      spine: { profileFullName: "Unknown", profileRole: "—" },
    });
  });

  it("skips every grade read in the Jun/Jul off-season", async () => {
    let leaderGradeCalled = false;
    let groupRubricCalled = false;
    let groupGradeCalled = false;
    const data = await buildShepherdCareDetailData(
      detailReads({
        fetchLeaderRubricGrade: async () => {
          leaderGradeCalled = true;
          return ok(null);
        },
        fetchGroupHealthRubric: async () => {
          groupRubricCalled = true;
          return ok(null);
        },
        fetchGroupRubricGrade: async () => {
          groupGradeCalled = true;
          return ok(null as never);
        },
        fetchLedGroups: async () => ok([{ id: "g-1", name: "Tuesday" }]),
      }),
      { ...OPTIONS, ministryYear: null }
    );

    if (data.kind !== "ok") throw new Error("expected ok");
    expect(leaderGradeCalled).toBe(false);
    expect(groupRubricCalled).toBe(false);
    expect(groupGradeCalled).toBe(false);
    expect(data.leaderGradeReadFailed).toBe(false);
    expect(data.gradeByGroupId.size).toBe(0);
  });
});
