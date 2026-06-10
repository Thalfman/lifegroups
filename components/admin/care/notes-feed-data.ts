import { bindReads, type OmitClient } from "@/lib/supabase/reads-seam";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import {
  fetchAllReadableCareNotes,
  fetchAllReadablePrayerRequests,
  fetchBroadNoteInteractionsForAdmin,
  fetchProfileNamesByIds,
  fetchSealedNoteCounts,
} from "@/lib/supabase/care-note-feed-reads";
import {
  buildCareNoteFeed,
  buildSealedSummary,
  type CareFeedItem,
  type SealedLeaderSummary,
} from "@/lib/admin/care-note-feed";

// ADR 0023 — read orchestration for the Care area's Notes tab, as a pure
// function of a reads seam (ADR 0015). Gathers the three content sources
// (care notes, prayer requests, broad notes — all RLS-/gate-scoped to what the
// viewer may read), the presence-only sealed counts, and the author names the
// page context can't resolve, then hands the pure builder one typed shape.
//
// Degrade rules (#479 — no false zeros): a failed content read drops that
// source AND flags feedAvailable=false so the tab shows an error note (and the
// tab badge is suppressed); a failed sealed-counts read suppresses the sealed
// block entirely (sealedAvailable=false) rather than rendering "nothing
// sealed".

export type NotesFeedData = {
  items: CareFeedItem[];
  sealedSummary: SealedLeaderSummary[];
  // False when any content read failed — the tab renders a "couldn't load"
  // note and the badge is suppressed.
  feedAvailable: boolean;
  // False when the sealed-counts read failed — the sealed block is suppressed.
  sealedAvailable: boolean;
};

export type NotesFeedReads = {
  fetchCareNotes: OmitClient<typeof fetchAllReadableCareNotes>;
  fetchPrayerRequests: OmitClient<typeof fetchAllReadablePrayerRequests>;
  fetchBroadNotes: OmitClient<typeof fetchBroadNoteInteractionsForAdmin>;
  fetchSealedCounts: OmitClient<typeof fetchSealedNoteCounts>;
  fetchProfileNames: OmitClient<typeof fetchProfileNamesByIds>;
};

export function supabaseNotesFeedReads(
  client: AppSupabaseClient
): NotesFeedReads {
  return bindReads(client, {
    fetchCareNotes: fetchAllReadableCareNotes,
    fetchPrayerRequests: fetchAllReadablePrayerRequests,
    fetchBroadNotes: fetchBroadNoteInteractionsForAdmin,
    fetchSealedCounts: fetchSealedNoteCounts,
    fetchProfileNames: fetchProfileNamesByIds,
  });
}

export const EMPTY_NOTES_FEED: NotesFeedData = {
  items: [],
  sealedSummary: [],
  feedAvailable: false,
  sealedAvailable: false,
};

export async function buildNotesFeedData(
  reads: NotesFeedReads,
  context: {
    viewerProfileId: string;
    // Names the page already has (the care directory's leaders, the groups
    // list) — seeded so the author-name read only fetches what's missing.
    nameByProfileId: ReadonlyMap<string, string>;
    groupNameByGroupId: ReadonlyMap<string, string>;
  }
): Promise<NotesFeedData> {
  const [careNotesRes, prayerRequestsRes, broadNotesRes, sealedRes] =
    await Promise.all([
      reads.fetchCareNotes(),
      reads.fetchPrayerRequests(),
      reads.fetchBroadNotes(),
      reads.fetchSealedCounts(),
    ]);

  const careNotes = careNotesRes.data ?? [];
  const prayerRequests = prayerRequestsRes.data ?? [];
  const broadNotes = broadNotesRes.data ?? [];
  const sealedCounts = sealedRes.data ?? [];

  // Resolve names the seeded maps don't cover: authors (over-shepherds and
  // admins are not in the care directory), profile subjects, and the sealed
  // block's gating leaders.
  const unresolved = new Set<string>();
  const noteIds = (id: string | null) => {
    if (id !== null && !context.nameByProfileId.has(id)) unresolved.add(id);
  };
  for (const n of careNotes) {
    noteIds(n.author_profile_id);
    noteIds(n.subject_profile_id);
  }
  for (const r of prayerRequests) {
    noteIds(r.author_profile_id);
    noteIds(r.subject_profile_id);
  }
  for (const b of broadNotes) noteIds(b.created_by_profile_id);
  for (const c of sealedCounts) noteIds(c.gating_profile_id);

  // A failed name read degrades to fallback labels — never blocks the feed.
  const extraNames =
    unresolved.size === 0
      ? new Map<string, string>()
      : ((await reads.fetchProfileNames([...unresolved])).data ??
        new Map<string, string>());
  const nameByProfileId = new Map([...context.nameByProfileId, ...extraNames]);

  return {
    items: buildCareNoteFeed({
      careNotes,
      prayerRequests,
      broadNotes,
      viewerProfileId: context.viewerProfileId,
      nameByProfileId,
      groupNameByGroupId: context.groupNameByGroupId,
    }),
    sealedSummary:
      sealedRes.error === null
        ? buildSealedSummary(sealedCounts, nameByProfileId)
        : [],
    feedAvailable:
      careNotesRes.error === null &&
      prayerRequestsRes.error === null &&
      broadNotesRes.error === null,
    sealedAvailable: sealedRes.error === null,
  };
}
