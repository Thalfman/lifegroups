import type { CareNotesRow, PrayerRequestsRow } from "@/types/database";
import type { PrayerRequestStatus } from "@/lib/admin/prayer-request-status";
import type {
  BroadNoteFeedRow,
  SealedNoteCount,
} from "@/lib/supabase/care-note-feed-reads";

// ADR 0023 — the admin "All Notes" feed, as pure assembly. The Care area's
// Notes tab aggregates every note the VIEWER is allowed to read — Care Notes,
// Prayer Requests (both RLS-scoped: own authored rows + rows whose gating
// leader's transparency toggle is on) and Over-Shepherd broad notes (ladder-
// readable by design) — into one newest-first feed, plus a presence-only
// summary of what stays sealed. No I/O here: the reads live in
// lib/supabase/care-note-feed-reads.ts and components/admin/care/notes-feed-data.ts.

export type CareFeedItemKind = "care_note" | "prayer_request" | "broad_note";

export interface CareFeedItem {
  kind: CareFeedItemKind;
  id: string;
  body: string;
  // When the note happened: created_at for care notes / prayer requests,
  // interaction_at for broad notes.
  occurredAt: string;
  authorProfileId: string | null;
  authorName: string;
  // The viewer wrote this row — the feed labels it so an admin can tell their
  // own author-private notes from ladder-visible ones.
  viewerAuthored: boolean;
  // Who/what the note is about: a leader (profile-subject rows + broad notes)
  // or a group (leader-authored group notes, ADR 0020).
  subjectKind: "leader" | "group";
  subjectId: string;
  subjectName: string;
  prayerStatus?: PrayerRequestStatus;
}

export const CARE_FEED_KIND_LABELS: Record<CareFeedItemKind, string> = {
  care_note: "Care note",
  prayer_request: "Prayer request",
  broad_note: "Broad note",
};

const UNKNOWN_PERSON = "Unknown person";
const UNKNOWN_GROUP = "Unknown group";

function sortKey(item: CareFeedItem): number {
  const t = Date.parse(item.occurredAt);
  return Number.isNaN(t) ? 0 : t;
}

function noteSubject(
  row: Pick<CareNotesRow, "subject_profile_id" | "subject_group_id">,
  nameByProfileId: ReadonlyMap<string, string>,
  groupNameByGroupId: ReadonlyMap<string, string>
): Pick<CareFeedItem, "subjectKind" | "subjectId" | "subjectName"> {
  // The XOR constraint guarantees exactly one subject; a malformed row falls
  // back to the leader arm with an unknown label rather than throwing.
  if (row.subject_group_id !== null) {
    return {
      subjectKind: "group",
      subjectId: row.subject_group_id,
      subjectName:
        groupNameByGroupId.get(row.subject_group_id) ?? UNKNOWN_GROUP,
    };
  }
  const profileId = row.subject_profile_id ?? "";
  return {
    subjectKind: "leader",
    subjectId: profileId,
    subjectName: nameByProfileId.get(profileId) ?? UNKNOWN_PERSON,
  };
}

export function buildCareNoteFeed(input: {
  careNotes: CareNotesRow[];
  prayerRequests: PrayerRequestsRow[];
  broadNotes: BroadNoteFeedRow[];
  viewerProfileId: string;
  nameByProfileId: ReadonlyMap<string, string>;
  groupNameByGroupId: ReadonlyMap<string, string>;
}): CareFeedItem[] {
  const {
    careNotes,
    prayerRequests,
    broadNotes,
    viewerProfileId,
    nameByProfileId,
    groupNameByGroupId,
  } = input;

  const items: CareFeedItem[] = [];

  for (const n of careNotes) {
    items.push({
      kind: "care_note",
      id: n.id,
      body: n.body,
      occurredAt: n.created_at,
      authorProfileId: n.author_profile_id,
      authorName: nameByProfileId.get(n.author_profile_id) ?? UNKNOWN_PERSON,
      viewerAuthored: n.author_profile_id === viewerProfileId,
      ...noteSubject(n, nameByProfileId, groupNameByGroupId),
    });
  }

  for (const r of prayerRequests) {
    items.push({
      kind: "prayer_request",
      id: r.id,
      body: r.body,
      occurredAt: r.created_at,
      authorProfileId: r.author_profile_id,
      authorName: nameByProfileId.get(r.author_profile_id) ?? UNKNOWN_PERSON,
      viewerAuthored: r.author_profile_id === viewerProfileId,
      ...noteSubject(r, nameByProfileId, groupNameByGroupId),
      prayerStatus: r.status,
    });
  }

  for (const b of broadNotes) {
    items.push({
      kind: "broad_note",
      id: b.id,
      body: b.notes,
      occurredAt: b.interaction_at,
      authorProfileId: b.created_by_profile_id,
      authorName:
        nameByProfileId.get(b.created_by_profile_id) ?? UNKNOWN_PERSON,
      viewerAuthored: b.created_by_profile_id === viewerProfileId,
      subjectKind: "leader",
      subjectId: b.shepherd_profile_id,
      subjectName: b.shepherd_full_name,
    });
  }

  // Newest first; ties keep insertion order (stable sort), which already
  // groups care notes before prayers before broad notes for identical stamps.
  return items.sort((a, b) => sortKey(b) - sortKey(a));
}

// ——— Filters (client-side; the feed is already capped at read time) ———

export interface CareFeedFilter {
  // A leader matches notes ABOUT them (profile-subject + broad notes) and
  // notes they AUTHORED (their group notes) — "everything connected to this
  // leader", matching how the per-leader detail page scopes its sections.
  leaderId?: string;
  groupId?: string;
  kind?: CareFeedItemKind;
}

export function filterCareFeed(
  items: CareFeedItem[],
  filter: CareFeedFilter
): CareFeedItem[] {
  return items.filter((item) => {
    if (filter.kind !== undefined && item.kind !== filter.kind) return false;
    if (filter.groupId !== undefined) {
      if (item.subjectKind !== "group" || item.subjectId !== filter.groupId) {
        return false;
      }
    }
    if (filter.leaderId !== undefined) {
      const aboutLeader =
        item.subjectKind === "leader" && item.subjectId === filter.leaderId;
      const byLeader = item.authorProfileId === filter.leaderId;
      if (!aboutLeader && !byLeader) return false;
    }
    return true;
  });
}

// ——— Sealed summary (presence only — counts, never content) ———

export interface SealedLeaderSummary {
  profileId: string;
  name: string;
  careNoteCount: number;
  prayerRequestCount: number;
}

// Resolve the count rows into named, displayable summaries, dropping
// empty rows and sorting by name so the block reads as a roster.
export function buildSealedSummary(
  counts: SealedNoteCount[],
  nameByProfileId: ReadonlyMap<string, string>
): SealedLeaderSummary[] {
  return counts
    .filter(
      (c) => c.sealed_care_note_count > 0 || c.sealed_prayer_request_count > 0
    )
    .map((c) => ({
      profileId: c.gating_profile_id,
      name: nameByProfileId.get(c.gating_profile_id) ?? UNKNOWN_PERSON,
      careNoteCount: c.sealed_care_note_count,
      prayerRequestCount: c.sealed_prayer_request_count,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
