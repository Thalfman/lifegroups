import { describe, expect, it } from "vitest";

import {
  buildCarePageData,
  type CarePageContext,
  type CarePageLoaders,
} from "@/components/admin/care/care-page-data";
import {
  emptyCareData,
  type CareData,
} from "@/components/admin/care/care-data";
import type { AdminFollowUpsData } from "@/components/admin/follow-ups/follow-ups-shell";
import { EMPTY_ADMIN_FOLLOW_UPS_DATA } from "@/components/admin/follow-ups/follow-ups-data";
import { EMPTY_ENRICHMENT } from "@/lib/supabase/care-accordion-reads";
import {
  EMPTY_NOTES_FEED,
  type NotesFeedContext,
  type NotesFeedData,
} from "@/components/admin/care/notes-feed-data";
import { group, profile } from "@/lib/dashboard/group-fixtures";
import type { ShepherdCareDirectoryEntry } from "@/lib/supabase/shepherd-care-reads";

// The Care page's promise threading is the trickiest in the app: a concurrent
// batch whose notes-feed seed maps are then-derived mid-flight, plus a
// handled-rejection guard. These tests drive buildCarePageData through fake
// loaders (resolvable/rejectable deferreds) and pin the concurrency contract,
// the seed-map derivation, the failure-propagation rules, and the pass-through
// into the real buildCareWorkspace.

const CONTEXT: CarePageContext = {
  viewerId: "viewer-1",
  isSuperAdmin: false,
  rosterFilter: "all",
  todayIso: "2026-06-12",
  ministryYear: 2025,
  periodMonthIso: "2026-06-01",
};

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function followUpsData(
  overrides: Partial<AdminFollowUpsData> = {}
): AdminFollowUpsData {
  return {
    ...EMPTY_ADMIN_FOLLOW_UPS_DATA,
    errors: {
      followUps: null,
      groups: null,
      members: null,
      guests: null,
      profiles: null,
    },
    ...overrides,
  };
}

function careData(overrides: Partial<CareData> = {}): CareData {
  return {
    ...emptyCareData("care unavailable"),
    assignmentsAvailable: true,
    outstandingFollowUpsAvailable: true,
    error: null,
    ...overrides,
  };
}

function leaderEntry(id: string, fullName: string): ShepherdCareDirectoryEntry {
  return {
    profile: profile({
      id,
      full_name: fullName,
      email: `${id}@example.com`,
      role: "leader",
      status: "active",
    }),
    care: null,
    needs_attention: false,
  };
}

// A fake notes-feed loader that mirrors the real buildNotesFeedData contract:
// it records when it was invoked and which context it received, and it awaits
// both seed maps (via Promise.all, exactly as production does) so a batch
// rejection also rejects the feed promise — the "mirrored rejection" the
// void-catch guard in buildCarePageData exists for.
function fakeNotesFeedLoader(result: NotesFeedData = EMPTY_NOTES_FEED) {
  const state = {
    called: false,
    context: null as NotesFeedContext | null,
  };
  const load = async (context: NotesFeedContext): Promise<NotesFeedData> => {
    state.called = true;
    state.context = context;
    await Promise.all([context.nameByProfileId, context.groupNameByGroupId]);
    return result;
  };
  return { state, load };
}

describe("buildCarePageData", () => {
  it("starts the notes feed concurrently, before the batch resolves", async () => {
    const followUps = deferred<AdminFollowUpsData>();
    const care = deferred<CareData>();
    const enrichment = deferred<typeof EMPTY_ENRICHMENT>();
    const feed = fakeNotesFeedLoader();

    const loaders: CarePageLoaders = {
      loadFollowUps: () => followUps.promise,
      loadCare: () => care.promise,
      loadEnrichment: () => enrichment.promise,
      loadNotesFeed: feed.load,
    };

    const resultPromise = buildCarePageData(loaders, CONTEXT);

    // The start-concurrently contract: the feed loader has already been
    // invoked while every batch deferred is still pending — it must never
    // wait behind the batch, only its seed maps do.
    expect(feed.state.called).toBe(true);

    followUps.resolve(followUpsData());
    care.resolve(careData());
    enrichment.resolve(EMPTY_ENRICHMENT);
    await resultPromise;
  });

  it("derives the feed's name seeds from the care entries and follow-up groups", async () => {
    const feed = fakeNotesFeedLoader();
    const loaders: CarePageLoaders = {
      loadFollowUps: async () =>
        followUpsData({
          groups: [group({ id: "group-1", name: "Riverside Group" })],
        }),
      loadCare: async () =>
        careData({
          entries: [
            leaderEntry("leader-1", "Lena Leader"),
            leaderEntry("leader-2", "Mo Shepherd"),
          ],
        }),
      loadEnrichment: async () => EMPTY_ENRICHMENT,
      loadNotesFeed: feed.load,
    };

    await buildCarePageData(loaders, CONTEXT);

    expect(feed.state.context?.viewerProfileId).toBe("viewer-1");
    await expect(feed.state.context?.nameByProfileId).resolves.toEqual(
      new Map([
        ["leader-1", "Lena Leader"],
        ["leader-2", "Mo Shepherd"],
      ])
    );
    await expect(feed.state.context?.groupNameByGroupId).resolves.toEqual(
      new Map([["group-1", "Riverside Group"]])
    );
  });

  it("propagates a notes-feed failure — the page fails, it does not degrade", async () => {
    const loaders: CarePageLoaders = {
      loadFollowUps: async () => followUpsData(),
      loadCare: async () => careData(),
      loadEnrichment: async () => EMPTY_ENRICHMENT,
      loadNotesFeed: async () => {
        throw new Error("notes feed failed");
      },
    };

    // The void-catch in buildCarePageData only marks the mirrored rejection
    // handled; the original promise is still awaited, so a feed failure must
    // surface as a page error, never as a silently-empty Notes tab.
    await expect(buildCarePageData(loaders, CONTEXT)).rejects.toThrow(
      "notes feed failed"
    );
  });

  it("propagates a batch failure without leaving an unhandled rejection behind", async () => {
    const feed = fakeNotesFeedLoader();
    const care = deferred<CareData>();
    const loaders: CarePageLoaders = {
      loadFollowUps: async () => followUpsData(),
      loadCare: () => care.promise,
      loadEnrichment: async () => EMPTY_ENRICHMENT,
      loadNotesFeed: feed.load,
    };

    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      const resultPromise = buildCarePageData(loaders, CONTEXT);
      care.reject(new Error("care read failed"));
      await expect(resultPromise).rejects.toThrow("care read failed");

      // The fake feed awaits the batch-derived seed maps, so its promise
      // rejects too ("mirrored rejection"); the void-catch guard must have
      // marked it handled. Give the runtime a macrotask to flush the
      // unhandled-rejection queue before asserting nothing surfaced.
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("assembles the workspace through the real buildCareWorkspace with the context fields", async () => {
    const careArgs: string[] = [];
    const enrichmentArgs: [number | null, string][] = [];
    const feed = fakeNotesFeedLoader({
      ...EMPTY_NOTES_FEED,
      feedAvailable: true,
    });
    const loaders: CarePageLoaders = {
      loadFollowUps: async () => followUpsData(),
      loadCare: async (todayIso) => {
        careArgs.push(todayIso);
        return careData({ entries: [leaderEntry("leader-1", "Lena Leader")] });
      },
      loadEnrichment: async (ministryYear, periodMonthIso) => {
        enrichmentArgs.push([ministryYear, periodMonthIso]);
        return EMPTY_ENRICHMENT;
      },
      loadNotesFeed: feed.load,
    };

    const workspace = await buildCarePageData(loaders, CONTEXT);

    // The context's anchors reach the loaders that key off them.
    expect(careArgs).toEqual(["2026-06-12"]);
    expect(enrichmentArgs).toEqual([[2025, "2026-06-01"]]);

    // The assembled reads flowed through the real buildCareWorkspace: the
    // canonical five tabs, the roster count from the care entries, and no
    // degraded-read banner because every read succeeded.
    expect(workspace.tabs.map((tab) => tab.key)).toEqual([
      "over-shepherds",
      "all-leaders",
      "follow-ups",
      "recent-interactions",
      "notes",
    ]);
    expect(workspace.tabs.find((tab) => tab.key === "all-leaders")?.count).toBe(
      1
    );
    expect(workspace.errorBanner).toBeNull();
  });
});
