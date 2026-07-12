import { describe, it, expect } from "vitest";

import {
  applicableGrantProfileId,
  canReadNote,
  type NoteMeta,
  type NoteViewer,
  type TransparencyGrant,
} from "@/lib/admin/care-note-visibility";
import type { UserRole } from "@/types/enums";

// Exhaustive unit test of the Care Note / Prayer Request visibility resolver
// (#381 / ADR 0017). This is the runnable pin on the full truth table the RLS
// migration enforces — author always reads own; the oversight ladder (Ministry
// Admin AND Super Admin) reads only when the subject's transparency toggle is
// ON, and Super Admin sees EXACTLY what Ministry Admin sees (no broader bypass);
// peers never read; default is sealed.

const AUTHOR_ID = "11111111-1111-4111-8111-111111111111";
const SUBJECT_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_ID = "33333333-3333-4333-8333-333333333333";

const NOTE: NoteMeta = {
  authorProfileId: AUTHOR_ID,
  subjectProfileId: SUBJECT_ID,
};

const GRANT_ON: TransparencyGrant = { granted: true };
const GRANT_OFF: TransparencyGrant = { granted: false };

function viewer(role: UserRole, profileId: string): NoteViewer {
  return { role, profileId };
}

describe("care-note-visibility — canReadNote truth table", () => {
  describe("author always reads their own note", () => {
    // The author may carry any role (an Over-Shepherd or a Leader writes these);
    // identity, not role, is what grants the author read. Both grant states.
    const authorRoles: UserRole[] = [
      "over_shepherd",
      "leader",
      "co_leader",
      "ministry_admin",
      "super_admin",
    ];

    for (const role of authorRoles) {
      it(`reads own note as ${role} with grant ON`, () => {
        expect(canReadNote(viewer(role, AUTHOR_ID), NOTE, GRANT_ON)).toBe(true);
      });
      it(`reads own note as ${role} with grant OFF`, () => {
        expect(canReadNote(viewer(role, AUTHOR_ID), NOTE, GRANT_OFF)).toBe(
          true
        );
      });
      it(`reads own note as ${role} with no grant row (default)`, () => {
        expect(canReadNote(viewer(role, AUTHOR_ID), NOTE, null)).toBe(true);
      });
    }
  });

  describe("Ministry Admin — sealed off, readable on", () => {
    const ministryAdmin = viewer("ministry_admin", OTHER_ID);

    it("is SEALED when the subject's toggle is OFF", () => {
      expect(canReadNote(ministryAdmin, NOTE, GRANT_OFF)).toBe(false);
    });
    it("is SEALED when there is no grant row (default DENIED)", () => {
      expect(canReadNote(ministryAdmin, NOTE, null)).toBe(false);
    });
    it("may READ when the subject's toggle is ON", () => {
      expect(canReadNote(ministryAdmin, NOTE, GRANT_ON)).toBe(true);
    });
  });

  describe("Super Admin === Ministry Admin (no more)", () => {
    const superAdmin = viewer("super_admin", OTHER_ID);
    const ministryAdmin = viewer("ministry_admin", OTHER_ID);

    it("is SEALED when the toggle is OFF — exactly like Ministry Admin", () => {
      expect(canReadNote(superAdmin, NOTE, GRANT_OFF)).toBe(false);
      expect(canReadNote(superAdmin, NOTE, GRANT_OFF)).toBe(
        canReadNote(ministryAdmin, NOTE, GRANT_OFF)
      );
    });
    it("is SEALED with no grant row — exactly like Ministry Admin", () => {
      expect(canReadNote(superAdmin, NOTE, null)).toBe(false);
      expect(canReadNote(superAdmin, NOTE, null)).toBe(
        canReadNote(ministryAdmin, NOTE, null)
      );
    });
    it("may READ when the toggle is ON — exactly like Ministry Admin", () => {
      expect(canReadNote(superAdmin, NOTE, GRANT_ON)).toBe(true);
      expect(canReadNote(superAdmin, NOTE, GRANT_ON)).toBe(
        canReadNote(ministryAdmin, NOTE, GRANT_ON)
      );
    });
    it("never gets a broader bypass than Ministry Admin in any grant state", () => {
      for (const grant of [GRANT_ON, GRANT_OFF, null] as TransparencyGrant[]) {
        expect(canReadNote(superAdmin, NOTE, grant)).toBe(
          canReadNote(ministryAdmin, NOTE, grant)
        );
      }
    });
  });

  describe("peers / other tiers never read", () => {
    // An Over-Shepherd, Leader, or Co-Leader who is NOT the author is a peer.
    const peerRoles: UserRole[] = ["over_shepherd", "leader", "co_leader"];

    for (const role of peerRoles) {
      it(`never reads as ${role} with grant ON`, () => {
        expect(canReadNote(viewer(role, OTHER_ID), NOTE, GRANT_ON)).toBe(false);
      });
      it(`never reads as ${role} with grant OFF`, () => {
        expect(canReadNote(viewer(role, OTHER_ID), NOTE, GRANT_OFF)).toBe(
          false
        );
      });
      it(`never reads as ${role} with no grant row`, () => {
        expect(canReadNote(viewer(role, OTHER_ID), NOTE, null)).toBe(false);
      });
    }

    it("the transparency toggle never opens a peer read path", () => {
      // The grant gates the LADDER only; flipping it on must not leak to peers.
      const peer = viewer("over_shepherd", OTHER_ID);
      expect(canReadNote(peer, NOTE, GRANT_ON)).toBe(false);
    });
  });

  describe("applicableGrantProfileId — whose toggle gates the note (ADR 0020)", () => {
    it("a profile-subject note (OS note about a leader) is gated by the SUBJECT's toggle", () => {
      expect(
        applicableGrantProfileId({
          authorProfileId: AUTHOR_ID,
          subjectProfileId: SUBJECT_ID,
          subjectGroupId: null,
        })
      ).toBe(SUBJECT_ID);
    });
    it("a group note (leader-authored) is gated by the AUTHOR's toggle", () => {
      expect(
        applicableGrantProfileId({
          authorProfileId: AUTHOR_ID,
          subjectProfileId: null,
          subjectGroupId: "44444444-4444-4444-8444-444444444444",
        })
      ).toBe(AUTHOR_ID);
    });
  });

  describe("purged-author grant selection", () => {
    it("keeps a profile-subject note gated by the SUBJECT's toggle", () => {
      expect(
        applicableGrantProfileId({
          authorProfileId: null,
          subjectProfileId: SUBJECT_ID,
          subjectGroupId: null,
        })
      ).toBe(SUBJECT_ID);
    });

    it("returns no applicable grant for an authorless group-subject note", () => {
      expect(
        applicableGrantProfileId({
          authorProfileId: null,
          subjectProfileId: null,
          subjectGroupId: "44444444-4444-4444-8444-444444444444",
        })
      ).toBeNull();
    });
  });

  describe("purged authors", () => {
    const profileSubjectNote: NoteMeta = {
      authorProfileId: null,
      subjectProfileId: SUBJECT_ID,
    };
    const groupSubjectNote: NoteMeta = {
      authorProfileId: null,
      subjectProfileId: null,
    };

    it("never grants an author-self read when the author is null", () => {
      expect(
        canReadNote(
          viewer("over_shepherd", AUTHOR_ID),
          profileSubjectNote,
          GRANT_ON
        )
      ).toBe(false);
    });

    it("lets the oversight ladder read a profile-subject row only through the subject grant", () => {
      for (const role of [
        "ministry_admin",
        "super_admin",
      ] as const satisfies readonly UserRole[]) {
        expect(
          canReadNote(viewer(role, OTHER_ID), profileSubjectNote, GRANT_ON)
        ).toBe(true);
        expect(
          canReadNote(viewer(role, OTHER_ID), profileSubjectNote, GRANT_OFF)
        ).toBe(false);
      }
    });

    it("keeps an authorless group-subject row sealed from every role", () => {
      for (const role of [
        "super_admin",
        "ministry_admin",
        "over_shepherd",
        "leader",
        "co_leader",
      ] as const satisfies readonly UserRole[]) {
        expect(
          canReadNote(viewer(role, OTHER_ID), groupSubjectNote, GRANT_ON)
        ).toBe(false);
      }
    });
  });

  describe("default sealed", () => {
    it("denies a non-author, non-ladder viewer by default", () => {
      expect(canReadNote(viewer("leader", OTHER_ID), NOTE, null)).toBe(false);
    });
    it("denies the ladder by default (no grant === DENIED)", () => {
      expect(canReadNote(viewer("ministry_admin", OTHER_ID), NOTE, null)).toBe(
        false
      );
      expect(canReadNote(viewer("super_admin", OTHER_ID), NOTE, null)).toBe(
        false
      );
    });
  });
});
