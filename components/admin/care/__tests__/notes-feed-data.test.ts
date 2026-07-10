import { describe, expect, it } from "vitest";

import {
  buildNotesFeedData,
  type NotesFeedContext,
  type NotesFeedReads,
} from "@/components/admin/care/notes-feed-data";
import type { ReadResult } from "@/lib/supabase/read-core";
import type {
  BroadNoteFeedRow,
  SealedNoteCount,
} from "@/lib/supabase/care-note-feed-reads";
import type { CareNotesRow, PrayerRequestsRow } from "@/types/database";

const ok = <T>(data: T): ReadResult<T> => ({ data, error: null });
const fail = (message: string): ReadResult<never> => ({
  data: null,
  error: new Error(message),
});

const VIEWER = "viewer-1";

function careNote(overrides: Partial<CareNotesRow> = {}): CareNotesRow {
  return {
    id: "cn-1",
    author_profile_id: "author-1",
    author_descriptor: null,
    subject_profile_id: "leader-1",
    subject_group_id: null,
    body: "Checked in after surgery.",
    created_at: "2026-06-09T10:00:00Z",
    updated_at: "2026-06-09T10:00:00Z",
    ...overrides,
  };
}

function prayerRequest(
  overrides: Partial<PrayerRequestsRow> = {}
): PrayerRequestsRow {
  return {
    id: "pr-1",
    author_profile_id: VIEWER,
    author_descriptor: null,
    subject_profile_id: "leader-1",
    subject_group_id: null,
    body: "Pray for the retreat.",
    status: "open",
    created_at: "2026-06-10T09:00:00Z",
    updated_at: "2026-06-10T09:00:00Z",
    ...overrides,
  };
}

const BROAD_NOTE: BroadNoteFeedRow = {
  id: "bn-1",
  interaction_at: "2026-06-08",
  created_at: "2026-06-08T12:00:00Z",
  notes: "Visited the Tuesday group.",
  created_by_profile_id: "os-1",
  shepherd_profile_id: "leader-2",
  shepherd_full_name: "Blair Leader",
};

function sealedCount(
  gating_profile_id: string,
  care: number,
  prayer: number
): SealedNoteCount {
  return {
    gating_profile_id,
    sealed_care_note_count: care,
    sealed_prayer_request_count: prayer,
  };
}

function feedContext(
  overrides: Partial<NotesFeedContext> = {}
): NotesFeedContext {
  return {
    viewerProfileId: VIEWER,
    nameByProfileId: new Map([["leader-1", "Avery Leader"]]),
    groupNameByGroupId: new Map([["group-1", "Tuesday Night"]]),
    ...overrides,
  };
}

// A successful, empty read for every dependency; each test overrides only the
// reads it cares about. Two adapters, one seam: this fake satisfies the same
// `NotesFeedReads` the live `supabaseNotesFeedReads` adapter does, so the #479
// no-false-zero degrade rules are exercised with no database.
function emptyReads(overrides: Partial<NotesFeedReads> = {}): NotesFeedReads {
  return {
    fetchCareNotes: async () => ok([]),
    fetchPrayerRequests: async () => ok([]),
    fetchBroadNotes: async () => ok([]),
    fetchSealedCounts: async () => ok([]),
    fetchProfileNames: async () => ok(new Map<string, string>()),
    ...overrides,
  };
}

describe("buildNotesFeedData", () => {
  it("returns the empty feed with every section available when all reads succeed empty", async () => {
    let nameReadCalls = 0;
    const data = await buildNotesFeedData(
      emptyReads({
        fetchProfileNames: async () => {
          nameReadCalls += 1;
          return ok(new Map<string, string>());
        },
      }),
      feedContext()
    );

    expect(data.items).toEqual([]);
    expect(data.sealedSummary).toEqual([]);
    expect(data.feedAvailable).toBe(true);
    expect(data.sealedAvailable).toBe(true);
    expect(data.namesAvailable).toBe(true);
    // Nothing was unresolved, so the supplemental name read never runs.
    expect(nameReadCalls).toBe(0);
  });

  it("aggregates the three sources newest-first, resolving only the names the seeds miss", async () => {
    let askedIds: string[] | undefined;
    const data = await buildNotesFeedData(
      emptyReads({
        fetchCareNotes: async () => ok([careNote()]),
        fetchPrayerRequests: async () => ok([prayerRequest()]),
        fetchBroadNotes: async () => ok([BROAD_NOTE]),
        fetchProfileNames: async (ids) => {
          askedIds = [...ids];
          return ok(
            new Map([
              ["author-1", "Casey Author"],
              ["os-1", "Ola Shepherd"],
            ])
          );
        },
      }),
      // The context accepts promised seeds so the content reads can overlap
      // the page batch producing them — exercised here.
      feedContext({
        nameByProfileId: Promise.resolve(
          new Map([["leader-1", "Avery Leader"]])
        ),
        groupNameByGroupId: Promise.resolve(new Map<string, string>()),
      })
    );

    // Only the ids the seed map misses are fetched: the two authors not in
    // the care directory and the viewer (never the seeded subject).
    expect(askedIds?.sort()).toEqual(["author-1", "os-1", "viewer-1"]);
    expect(data.items.map((i) => i.id)).toEqual(["pr-1", "cn-1", "bn-1"]);
    expect(data.items.map((i) => i.authorName)).toEqual([
      // The viewer's own name was not resolvable — fallback label, but the
      // row is still stamped as viewer-authored.
      "Unknown person",
      "Casey Author",
      "Ola Shepherd",
    ]);
    expect(data.items.map((i) => i.viewerAuthored)).toEqual([
      true,
      false,
      false,
    ]);
    expect(data.items[1].subjectName).toBe("Avery Leader");
    expect(data.feedAvailable).toBe(true);
    expect(data.namesAvailable).toBe(true);
  });

  it("resolves a group-subject note's name from the seeded group map", async () => {
    const data = await buildNotesFeedData(
      emptyReads({
        fetchCareNotes: async () =>
          ok([
            careNote({
              author_profile_id: VIEWER,
              subject_profile_id: null,
              subject_group_id: "group-1",
            }),
          ]),
      }),
      feedContext({ nameByProfileId: new Map([[VIEWER, "Julian Admin"]]) })
    );

    expect(data.items).toHaveLength(1);
    expect(data.items[0].subjectKind).toBe("group");
    expect(data.items[0].subjectName).toBe("Tuesday Night");
    expect(data.items[0].authorName).toBe("Julian Admin");
  });

  it("flags the feed unavailable when one content read fails, keeping the surviving sources", async () => {
    const data = await buildNotesFeedData(
      emptyReads({
        fetchCareNotes: async () => fail("care notes boom"),
        fetchPrayerRequests: async () => ok([prayerRequest()]),
      }),
      feedContext()
    );

    // The failed source is dropped, the survivors still render, and the
    // available flag tells the shell to show a load-failure note (and
    // suppress the tab badge) rather than presenting a complete feed.
    expect(data.items.map((i) => i.id)).toEqual(["pr-1"]);
    expect(data.feedAvailable).toBe(false);
    expect(data.sealedAvailable).toBe(true);
  });

  it('suppresses the sealed block entirely when the counts read fails (#479 — never "nothing sealed")', async () => {
    const data = await buildNotesFeedData(
      emptyReads({
        fetchSealedCounts: async () => fail("sealed boom"),
      }),
      feedContext()
    );

    expect(data.sealedAvailable).toBe(false);
    expect(data.sealedSummary).toEqual([]);
    expect(data.feedAvailable).toBe(true);
  });

  it("builds the sealed summary: zero rows dropped, names resolved, sorted by name", async () => {
    let askedIds: string[] | undefined;
    const data = await buildNotesFeedData(
      emptyReads({
        fetchSealedCounts: async () =>
          ok([
            sealedCount("leader-2", 1, 0),
            sealedCount("leader-1", 2, 1),
            sealedCount("leader-3", 0, 0),
          ]),
        fetchProfileNames: async (ids) => {
          askedIds = [...ids];
          return ok(new Map([["leader-2", "Zed Leader"]]));
        },
      }),
      feedContext()
    );

    // The gating leaders absent from the seeds are name-resolved too.
    expect(askedIds?.sort()).toEqual(["leader-2", "leader-3"]);
    expect(data.sealedSummary).toEqual([
      {
        profileId: "leader-1",
        name: "Avery Leader",
        careNoteCount: 2,
        prayerRequestCount: 1,
      },
      {
        profileId: "leader-2",
        name: "Zed Leader",
        careNoteCount: 1,
        prayerRequestCount: 0,
      },
    ]);
    expect(data.sealedAvailable).toBe(true);
  });

  it("keeps the feed but flags namesAvailable=false when the name read fails", async () => {
    const data = await buildNotesFeedData(
      emptyReads({
        fetchCareNotes: async () => ok([careNote()]),
        fetchProfileNames: async () => fail("names boom"),
      }),
      feedContext()
    );

    // "Unknown person" must read as a load failure, not a fact about the
    // person — the flag is what lets the shell say so.
    expect(data.namesAvailable).toBe(false);
    expect(data.feedAvailable).toBe(true);
    expect(data.items).toHaveLength(1);
    expect(data.items[0].authorName).toBe("Unknown person");
  });
});
