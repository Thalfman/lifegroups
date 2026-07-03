import "server-only";

import type {
  CareNotesRow,
  NoteTransparencyGrantsRow,
  PrayerRequestsRow,
} from "@/types/database";
import { isUuid } from "@/lib/shared/uuid";
import {
  columns,
  wrapError,
  type ReadClient,
  type ReadResult,
} from "./read-core";

// Pivot slice 9 (#381 / ADR 0017) — Care Notes + Prayer Requests + the
// per-subject transparency grant reads. Extracted from the retired read-models
// barrel so this privacy-sensitive read domain has its own home.
//
// Column-allowlisted reads (never select("*")). RLS is the real boundary: the
// author reads their own rows, and the oversight ladder reads a subject's rows
// only when that subject has an active transparency grant — so these readers
// return whatever the caller's RLS admits. The transparency-grant reader is
// admin-only by RLS and powers the inline Care toggle's current state.

// Exported so the cross-subject feed reads (care-note-feed-reads.ts, ADR 0023)
// reuse exactly this allowlist rather than declaring a second one that could
// drift wider.
export const CARE_NOTE_COLUMNS = columns<CareNotesRow>()(
  "id",
  "author_profile_id",
  "subject_profile_id",
  "subject_group_id",
  "body",
  "created_at",
  "updated_at"
);

export const PRAYER_REQUEST_COLUMNS = columns<PrayerRequestsRow>()(
  "id",
  "author_profile_id",
  "subject_profile_id",
  "subject_group_id",
  "body",
  "status",
  "created_at",
  "updated_at"
);

const NOTE_TRANSPARENCY_GRANT_COLUMNS = columns<NoteTransparencyGrantsRow>()(
  "id",
  "subject_profile_id",
  "granted",
  "set_by",
  "created_at",
  "updated_at"
);

export async function fetchCareNotesForSubject(
  client: ReadClient,
  subjectProfileId: string
): Promise<ReadResult<CareNotesRow[]>> {
  if (!isUuid(subjectProfileId)) return { data: [], error: null };
  const { data, error } = await client
    .from("care_notes")
    .select(CARE_NOTE_COLUMNS.select)
    .eq("subject_profile_id", subjectProfileId)
    .order("created_at", { ascending: false });
  if (error)
    return { data: null, error: wrapError("fetchCareNotesForSubject", error) };
  return { data: (data ?? []) as CareNotesRow[], error: null };
}

export async function fetchPrayerRequestsForSubject(
  client: ReadClient,
  subjectProfileId: string
): Promise<ReadResult<PrayerRequestsRow[]>> {
  if (!isUuid(subjectProfileId)) return { data: [], error: null };
  const { data, error } = await client
    .from("prayer_requests")
    .select(PRAYER_REQUEST_COLUMNS.select)
    .eq("subject_profile_id", subjectProfileId)
    .order("created_at", { ascending: false });
  if (error)
    return {
      data: null,
      error: wrapError("fetchPrayerRequestsForSubject", error),
    };
  return { data: (data ?? []) as PrayerRequestsRow[], error: null };
}

// Pivot slice 11 (#382 / ADR 0020): a leader's GROUP-scoped care notes / prayer
// requests, newest first. RLS scopes the rows: a leader reads their own
// (author) rows for the group; the oversight ladder reads them only when that
// leader's transparency toggle is on. The group filter is belt-and-suspenders
// on top of RLS so the leader surface only ever asks for one group at a time.
export async function fetchGroupCareNotes(
  client: ReadClient,
  groupId: string
): Promise<ReadResult<CareNotesRow[]>> {
  if (!isUuid(groupId)) return { data: [], error: null };
  const { data, error } = await client
    .from("care_notes")
    .select(CARE_NOTE_COLUMNS.select)
    .eq("subject_group_id", groupId)
    .order("created_at", { ascending: false });
  if (error)
    return { data: null, error: wrapError("fetchGroupCareNotes", error) };
  return { data: (data ?? []) as CareNotesRow[], error: null };
}

export async function fetchGroupPrayerRequests(
  client: ReadClient,
  groupId: string
): Promise<ReadResult<PrayerRequestsRow[]>> {
  if (!isUuid(groupId)) return { data: [], error: null };
  const { data, error } = await client
    .from("prayer_requests")
    .select(PRAYER_REQUEST_COLUMNS.select)
    .eq("subject_group_id", groupId)
    .order("created_at", { ascending: false });
  if (error)
    return {
      data: null,
      error: wrapError("fetchGroupPrayerRequests", error),
    };
  return { data: (data ?? []) as PrayerRequestsRow[], error: null };
}

// Pivot slice 11 (#382 / ADR 0020): the GROUP notes a leader AUTHORED, newest
// first — the admin peek path for the leader-detail view. RLS gates these on the
// AUTHOR's transparency grant (the leader is the author of a group note), so the
// oversight ladder reads them only when that leader's toggle is on; off = the
// query returns nothing by construction. Filtered to group-subject rows so this
// never returns the OS-authored, subject-keyed notes.
export async function fetchAuthoredGroupCareNotes(
  client: ReadClient,
  authorProfileId: string
): Promise<ReadResult<CareNotesRow[]>> {
  if (!isUuid(authorProfileId)) return { data: [], error: null };
  const { data, error } = await client
    .from("care_notes")
    .select(CARE_NOTE_COLUMNS.select)
    .eq("author_profile_id", authorProfileId)
    .not("subject_group_id", "is", null)
    .order("created_at", { ascending: false });
  if (error)
    return {
      data: null,
      error: wrapError("fetchAuthoredGroupCareNotes", error),
    };
  return { data: (data ?? []) as CareNotesRow[], error: null };
}

export async function fetchAuthoredGroupPrayerRequests(
  client: ReadClient,
  authorProfileId: string
): Promise<ReadResult<PrayerRequestsRow[]>> {
  if (!isUuid(authorProfileId)) return { data: [], error: null };
  const { data, error } = await client
    .from("prayer_requests")
    .select(PRAYER_REQUEST_COLUMNS.select)
    .eq("author_profile_id", authorProfileId)
    .not("subject_group_id", "is", null)
    .order("created_at", { ascending: false });
  if (error)
    return {
      data: null,
      error: wrapError("fetchAuthoredGroupPrayerRequests", error),
    };
  return { data: (data ?? []) as PrayerRequestsRow[], error: null };
}

// The per-subject transparency grant (admin-only by RLS). Returns null when no
// grant row exists — the toggle defaults to DENIED (sealed) in that case.
export async function fetchNoteTransparencyGrant(
  client: ReadClient,
  subjectProfileId: string
): Promise<ReadResult<NoteTransparencyGrantsRow | null>> {
  if (!isUuid(subjectProfileId)) return { data: null, error: null };
  const { data, error } = await client
    .from("note_transparency_grants")
    .select(NOTE_TRANSPARENCY_GRANT_COLUMNS.select)
    .eq("subject_profile_id", subjectProfileId)
    .maybeSingle();
  if (error)
    return {
      data: null,
      error: wrapError("fetchNoteTransparencyGrant", error),
    };
  return {
    data: (data as NoteTransparencyGrantsRow | null) ?? null,
    error: null,
  };
}
