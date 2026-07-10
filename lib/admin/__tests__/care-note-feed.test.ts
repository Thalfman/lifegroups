import { describe, expect, it } from "vitest";

import {
  buildCareNoteFeed,
  buildSealedSummary,
  filterCareFeed,
  type CareFeedItem,
} from "@/lib/admin/care-note-feed";
import type { BroadNoteFeedRow } from "@/lib/supabase/care-note-feed-reads";
import type { CareNotesRow, PrayerRequestsRow } from "@/types/database";

// ADR 0023 — pure assembly of the Care Notes tab's aggregate feed: merge the
// three sources newest-first, resolve names with fallbacks, mark the viewer's
// own rows, and reduce the sealed counts to a displayable summary.

const VIEWER = "00000000-0000-4000-8000-00000000000a";
const LEADER = "00000000-0000-4000-8000-00000000000b";
const OS = "00000000-0000-4000-8000-00000000000c";
const GROUP = "00000000-0000-4000-8000-00000000000d";

const NAMES = new Map<string, string>([
  [VIEWER, "Julian Admin"],
  [LEADER, "Lena Leader"],
  [OS, "Omar Shepherd"],
]);
const GROUP_NAMES = new Map<string, string>([[GROUP, "Tuesday Night Group"]]);

function careNote(overrides: Partial<CareNotesRow> = {}): CareNotesRow {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    author_profile_id: OS,
    author_descriptor: null,
    subject_profile_id: LEADER,
    subject_group_id: null,
    body: "Checked in after the move.",
    created_at: "2026-06-02T10:00:00+00:00",
    updated_at: "2026-06-02T10:00:00+00:00",
    ...overrides,
  };
}

function prayerRequest(
  overrides: Partial<PrayerRequestsRow> = {}
): PrayerRequestsRow {
  return {
    id: "20000000-0000-4000-8000-000000000001",
    author_profile_id: LEADER,
    author_descriptor: null,
    subject_profile_id: null,
    subject_group_id: GROUP,
    body: "Pray for the group's new families.",
    status: "open",
    created_at: "2026-06-03T10:00:00+00:00",
    updated_at: "2026-06-03T10:00:00+00:00",
    ...overrides,
  };
}

function broadNote(
  overrides: Partial<BroadNoteFeedRow> = {}
): BroadNoteFeedRow {
  return {
    id: "30000000-0000-4000-8000-000000000001",
    interaction_at: "2026-06-01",
    created_at: "2026-06-01T09:00:00+00:00",
    notes: "Grabbed coffee, doing well.",
    created_by_profile_id: OS,
    shepherd_profile_id: LEADER,
    shepherd_full_name: "Lena Leader",
    ...overrides,
  };
}

function build(input: {
  careNotes?: CareNotesRow[];
  prayerRequests?: PrayerRequestsRow[];
  broadNotes?: BroadNoteFeedRow[];
}): CareFeedItem[] {
  return buildCareNoteFeed({
    careNotes: input.careNotes ?? [],
    prayerRequests: input.prayerRequests ?? [],
    broadNotes: input.broadNotes ?? [],
    viewerProfileId: VIEWER,
    nameByProfileId: NAMES,
    groupNameByGroupId: GROUP_NAMES,
  });
}

describe("buildCareNoteFeed", () => {
  it("merges all three sources newest-first", () => {
    const items = build({
      careNotes: [careNote()],
      prayerRequests: [prayerRequest()],
      broadNotes: [broadNote()],
    });
    expect(items.map((i) => i.kind)).toEqual([
      "prayer_request", // 06-03
      "care_note", // 06-02
      "broad_note", // 06-01
    ]);
  });

  it("resolves subjects per note shape: leader for profile rows, group for group rows", () => {
    const items = build({
      careNotes: [careNote()],
      prayerRequests: [prayerRequest()],
    });
    const note = items.find((i) => i.kind === "care_note");
    expect(note).toMatchObject({
      subjectKind: "leader",
      subjectId: LEADER,
      subjectName: "Lena Leader",
      authorName: "Omar Shepherd",
    });
    const prayer = items.find((i) => i.kind === "prayer_request");
    expect(prayer).toMatchObject({
      subjectKind: "group",
      subjectId: GROUP,
      subjectName: "Tuesday Night Group",
      authorName: "Lena Leader",
      prayerStatus: "open",
    });
  });

  it("marks the viewer's own rows and falls back on unknown names", () => {
    const stranger = "00000000-0000-4000-8000-0000000000ff";
    const items = build({
      careNotes: [
        careNote({ author_profile_id: VIEWER }),
        careNote({
          id: "10000000-0000-4000-8000-000000000002",
          author_profile_id: stranger,
          subject_profile_id: stranger,
        }),
      ],
    });
    expect(items.find((i) => i.authorProfileId === VIEWER)).toMatchObject({
      viewerAuthored: true,
      authorName: "Julian Admin",
    });
    expect(items.find((i) => i.authorProfileId === stranger)).toMatchObject({
      viewerAuthored: false,
      authorName: "Unknown person",
      subjectName: "Unknown person",
    });
  });

  it("labels a purged author's rows with the stamped descriptor (issue #880)", () => {
    // A permanently purged author leaves author_profile_id null (FK SET NULL)
    // and a stamped descriptor — that renders, not "Unknown person".
    const items = build({
      careNotes: [
        careNote({
          author_profile_id: null,
          author_descriptor: "Former Shepherd",
        }),
      ],
      prayerRequests: [
        prayerRequest({
          author_profile_id: null,
          author_descriptor: "Former Shepherd",
        }),
      ],
    });
    for (const item of items) {
      expect(item).toMatchObject({
        authorProfileId: null,
        authorName: "Former Shepherd",
        viewerAuthored: false,
      });
    }
  });

  it("falls back to the default descriptor when a null-author row has none", () => {
    // Defensive: a null author without a stamped descriptor still reads as a
    // purge fact ("Former Shepherd"), never as a failed name lookup.
    const [item] = build({
      careNotes: [
        careNote({ author_profile_id: null, author_descriptor: null }),
      ],
    });
    expect(item.authorName).toBe("Former Shepherd");
  });

  it("prefers the live name map for a non-null author even when a descriptor lingers", () => {
    // Restore coherence: a tombstone restore re-links author_profile_id but
    // does NOT clear the descriptor — the live name must win again.
    const [item] = build({
      careNotes: [
        careNote({
          author_profile_id: OS,
          author_descriptor: "Former Shepherd",
        }),
      ],
    });
    expect(item.authorName).toBe("Omar Shepherd");
  });

  it("uses the broad note's interaction date and author attribution", () => {
    const [item] = build({ broadNotes: [broadNote()] });
    expect(item).toMatchObject({
      kind: "broad_note",
      occurredAt: "2026-06-01",
      authorProfileId: OS,
      authorName: "Omar Shepherd",
      subjectKind: "leader",
      subjectId: LEADER,
      subjectName: "Lena Leader",
      body: "Grabbed coffee, doing well.",
    });
  });

  it("interleaves same-day items by when they were recorded", () => {
    // Broad notes carry a DATE-only occurredAt (interaction_at); a raw parse
    // would pin them to UTC midnight, below every timed note that day. The
    // sort compares the day first, then created_at — so a broad note recorded
    // after a care note the same day lands above it.
    const items = build({
      careNotes: [careNote({ created_at: "2026-06-02T10:00:00+00:00" })],
      broadNotes: [
        broadNote({
          interaction_at: "2026-06-02",
          created_at: "2026-06-02T16:00:00+00:00",
        }),
      ],
    });
    expect(items.map((i) => i.kind)).toEqual(["broad_note", "care_note"]);
  });

  it("sorts unparseable dates last instead of throwing", () => {
    const items = build({
      careNotes: [careNote({ created_at: "not-a-date" })],
      prayerRequests: [prayerRequest()],
    });
    expect(items.map((i) => i.kind)).toEqual(["prayer_request", "care_note"]);
  });
});

describe("filterCareFeed", () => {
  const items = build({
    careNotes: [careNote()],
    prayerRequests: [prayerRequest()],
    broadNotes: [broadNote()],
  });

  it("filters by kind", () => {
    expect(filterCareFeed(items, { kind: "broad_note" })).toHaveLength(1);
    expect(filterCareFeed(items, { kind: "care_note" })).toHaveLength(1);
  });

  it("matches a leader as subject AND as author of group notes", () => {
    // Lena is the SUBJECT of the care note + broad note and the AUTHOR of the
    // group prayer request — the leader filter means "everything connected to
    // this leader", so all three match.
    expect(filterCareFeed(items, { leaderId: LEADER })).toHaveLength(3);
    // Omar only authored (the care note + broad note are about Lena).
    expect(filterCareFeed(items, { leaderId: OS })).toHaveLength(2);
  });

  it("filters groups by group subject only", () => {
    const matched = filterCareFeed(items, { groupId: GROUP });
    expect(matched).toHaveLength(1);
    expect(matched[0].kind).toBe("prayer_request");
  });

  it("intersects filters", () => {
    expect(
      filterCareFeed(items, { leaderId: LEADER, kind: "care_note" })
    ).toHaveLength(1);
    expect(
      filterCareFeed(items, { groupId: GROUP, kind: "care_note" })
    ).toHaveLength(0);
  });
});

describe("buildSealedSummary", () => {
  it("drops empty rows, resolves names, and sorts by name", () => {
    const summary = buildSealedSummary(
      [
        {
          gating_profile_id: OS,
          sealed_care_note_count: 0,
          sealed_prayer_request_count: 2,
        },
        {
          gating_profile_id: LEADER,
          sealed_care_note_count: 3,
          sealed_prayer_request_count: 0,
        },
        {
          gating_profile_id: VIEWER,
          sealed_care_note_count: 0,
          sealed_prayer_request_count: 0,
        },
      ],
      NAMES
    );
    expect(summary).toEqual([
      {
        profileId: LEADER,
        name: "Lena Leader",
        careNoteCount: 3,
        prayerRequestCount: 0,
      },
      {
        profileId: OS,
        name: "Omar Shepherd",
        careNoteCount: 0,
        prayerRequestCount: 2,
      },
    ]);
  });
});
