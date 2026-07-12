// Care-note / prayer-request visibility resolver (Pivot slice 9, #381 / ADR 0017).
//
// Author-private Care Notes and Prayer Requests follow the per-person
// transparency model: an Over-Shepherd (or Leader) authors notes ABOUT a
// subject person, and those notes are sealed to the author by default. A
// per-subject transparency toggle, controlled by the Ministry Admin team in the
// Care surface, is the ONLY thing that lets the oversight ladder (Ministry Admin
// / Super Admin) peek. Julian (Super Admin) sees EXACTLY what a Ministry Admin
// can — gated on the same grant, with no broader super-admin bypass — never more.
//
// This module is the pure, isolation-testable MIRROR of the RLS truth table the
// 20260608090000_phase_pivot9_care_notes.sql migration enforces in the database.
// Like lib/admin/feature-flags.ts, it encodes the security rule in pure logic,
// not glue: no I/O, callers load the viewer + note + grant and this resolves a
// single boolean. RLS is the real boundary; this resolver is deliberately
// CALLER-FREE in production code — it exists as the executable specification of
// that policy, pinned by the unit test's full truth table and by the SEC-1
// fitness check below, so a policy change can never silently diverge from the
// documented rule. Do not delete it for being "unused"; its use is the pin.
//
// SEC-1 pin (audit 2026-06-21, deepened 2026-07-07 / ADR 0037): the fitness
// check tests/fitness/care-note-visibility-divergence.test.ts is DIFFERENTIAL —
// it executes THIS resolver and a pinned TS transcription of the net-effective
// `care_notes_author_or_granted_select` USING clause over one shared input
// matrix (lib/admin/__tests__/care-note-visibility-matrix.ts: both note types,
// every viewer role/identity, independent author/subject grant states) and
// asserts they agree on every row; the prayer_requests policy is proven
// identical modulo table name. A change here without the matching migration
// (or vice versa) fails the build instead of drifting silently.
//
// Visibility truth table (default = SEALED):
//
//   | Viewer                        | grant OFF | grant ON |
//   |-------------------------------|-----------|----------|
//   | Author (OS or Leader)         | yes       | yes      |
//   | Ministry Admin (not author)   | no/sealed | yes/read |
//   | Super Admin (not author)      | no/sealed | yes/read |  (=== Ministry Admin)
//   | Peers / other tiers           | no/never  | no/never |
//
// The author always reads their own note regardless of role or grant. Everyone
// else is sealed unless they are on the oversight ladder (Ministry Admin OR
// Super Admin) AND the relevant transparency toggle is ON. Peers — any other
// Over-Shepherd, Leader, or Co-Leader who is not the author — never read, in
// either grant state. Anything not explicitly granted is denied.
//
// Which toggle is "relevant" is always the LEADER's, but the leader sits in a
// different slot depending on the note type (Pivot slice 11, #382 / ADR 0020):
//   * Over-Shepherd note about a leader — the leader is the SUBJECT, so the
//     caller loads the grant for note.subjectProfileId.
//   * Leader's group note — the leader is the AUTHOR (the subject is a group,
//     not a profile), so the caller loads the grant for note.authorProfileId.
// `applicableGrantProfileId` below is the executable form of that selection
// rule. Either way this resolver takes the already-resolved grant; the RLS
// policy in 20260608100000_phase_pivot11_leader_group_notes.sql ORs the two
// arms so each note is gated by exactly that leader's toggle. This pure
// function is unchanged by the group-note case: given the applicable grant, it
// resolves the boolean. Production reads rely on RLS itself; the one place that
// loads a grant to *display* transparency state (shepherd-care-detail-data)
// views a leader who is simultaneously subject (OS notes) and author (group
// notes), so the selection collapses to the same profile id there.

import type { UserRole } from "@/types/enums";

// The party attempting to read a note: their role and their own profile id.
export type NoteViewer = {
  role: UserRole;
  profileId: string;
};

// The note (or prayer request) being read: who authored it and which subject
// person it is about. Only the author identity is load-bearing for visibility;
// the subject id is carried so callers can correlate to the right grant.
export type NoteMeta = {
  authorProfileId: string | null;
  subjectProfileId: string | null;
};

// The subject person's transparency grant. `granted` ON lets the Ministry Admin
// team (and, identically, the Super Admin) peek; OFF (the default) seals the
// note from the ladder. A null/undefined grant is treated as OFF (sealed) — the
// per-person toggle defaults to DENIED.
export type TransparencyGrant = {
  granted: boolean;
} | null;

// A note's subject slots as the database stores them: exactly one of
// subjectProfileId / subjectGroupId is set (the `care_notes_one_subject` /
// `prayer_requests_one_subject` XOR checks enforce it).
export type NoteSubjectMeta = {
  authorProfileId: string | null;
  subjectProfileId: string | null;
  subjectGroupId: string | null;
};

// Whose transparency toggle gates this note for the oversight ladder — the
// pivot-11 rule (#382 / ADR 0020) in executable form. The gating toggle is
// always the LEADER's: the SUBJECT of a profile-subject note (Over-Shepherd
// note about a leader), the AUTHOR of a group note (the leader wrote it about
// their group). Mirrors the two not-null-guarded arms of the RLS USING clause;
// the differential fitness test runs both sides over every matrix row.
export function applicableGrantProfileId(note: NoteSubjectMeta): string | null {
  return note.subjectProfileId ?? note.authorProfileId;
}

// The oversight-ladder roles that the transparency grant gates. Both read
// EXACTLY the same thing through the same gate: a Super Admin gets no broader
// bypass than a Ministry Admin (the deliberate "no more" of the truth table).
const LADDER_ROLES: ReadonlySet<UserRole> = new Set<UserRole>([
  "ministry_admin",
  "super_admin",
]);

// Whether `viewer` may read `note`, given the subject person's `grant`.
//
// Resolution order (default sealed):
//   1. Author — anyone whose profile id matches the note's author — always
//      reads their own note, in any role and either grant state.
//   2. Oversight ladder (ministry_admin OR super_admin), NOT the author — reads
//      only when the grant is ON. Super Admin is gated on the SAME grant as the
//      Ministry Admin, so it never sees more.
//   3. Everyone else (peers / other tiers) — never reads, in either grant state.
//
// Pure and total: no I/O. The grant being null/undefined or `granted: false`
// both mean OFF (sealed). RLS enforces this same table in the database.
export function canReadNote(
  viewer: NoteViewer,
  note: NoteMeta,
  grant: TransparencyGrant
): boolean {
  // 1. Author always reads their own note (role-independent, grant-independent).
  if (viewer.profileId === note.authorProfileId) {
    return true;
  }

  // A purged-author group note has neither a profile subject nor an author
  // whose transparency grant could apply. It remains sealed even if a caller
  // accidentally supplies an unrelated enabled grant.
  if (note.subjectProfileId === null && note.authorProfileId === null)
    return false;

  // 2. Oversight ladder reads only when the subject's toggle is ON. Super Admin
  //    is gated on the identical grant as Ministry Admin — no broader bypass.
  if (LADDER_ROLES.has(viewer.role)) {
    return grant?.granted === true;
  }

  // 3. Peers / other tiers (over_shepherd, leader, co_leader who are not the
  //    author) never read, regardless of the grant. Default sealed.
  return false;
}
