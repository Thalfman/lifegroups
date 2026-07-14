// ===========================================================================
// The Care Note / Prayer Request visibility INPUT MATRIX — the shared,
// machine-readable enumeration of every read attempt the visibility rule must
// decide (sibling of ./rls-visibility-matrix.ts). It exports INPUTS ONLY — no
// expected values — so each consumer computes its own answer: the differential
// fitness check (tests/fitness/care-note-visibility-divergence.test.ts) runs
// the TS resolver (`canReadNote` + `applicableGrantProfileId`) and a pinned TS
// transcription of the RLS USING clause over every row and asserts they agree.
//
// Why the matrix is shaped this way (the gap it closes): the pivot-11 policy
// (20260608100000_phase_pivot11_leader_group_notes.sql) has TWO grant arms —
// a profile-subject note is gated by the SUBJECT's toggle, a group note by the
// AUTHOR's toggle. The old shape-only pin could not tell those keys apart: a
// migration that swapped them would still have matched every regex. The rows
// here vary the author-keyed and subject-keyed grants INDEPENDENTLY, so a
// swapped key disagrees with the resolver on concrete rows (e.g. subject note
// with subject-grant OFF but author-grant ON) and fails the differential.
// ===========================================================================

import type { UserRole } from "@/types/enums";
import type {
  NoteSubjectMeta,
  NoteViewer,
} from "@/lib/admin/care-note-visibility";

export const AUTHOR_ID = "11111111-1111-4111-8111-111111111111";
export const SUBJECT_ID = "22222222-2222-4222-8222-222222222222";
export const OTHER_ID = "33333333-3333-4333-8333-333333333333";
export const GROUP_ID = "44444444-4444-4444-8444-444444444444";

// Four effective note shapes cover each XOR-admitted subject with a live or
// permanently purged author. An Over-Shepherd
// note about a leader (profile subject) and a leader's group note (group
// subject); purge retains the subject while setting the author foreign key null.
export const CARE_NOTE_ROWS: readonly NoteSubjectMeta[] = [
  {
    authorProfileId: AUTHOR_ID,
    subjectProfileId: SUBJECT_ID,
    subjectGroupId: null,
  },
  {
    authorProfileId: AUTHOR_ID,
    subjectProfileId: null,
    subjectGroupId: GROUP_ID,
  },
  {
    authorProfileId: null,
    subjectProfileId: SUBJECT_ID,
    subjectGroupId: null,
  },
  {
    authorProfileId: null,
    subjectProfileId: null,
    subjectGroupId: GROUP_ID,
  },
];

// A grant row's three observable states: toggle ON, toggle OFF, and no row at
// all (the default — both sides must treat it as DENIED).
export type GrantState = "on" | "off" | "absent";
export const GRANT_STATES: readonly GrantState[] = ["on", "off", "absent"];

const ALL_ROLES: readonly UserRole[] = [
  "super_admin",
  "ministry_admin",
  "over_shepherd",
  "leader",
  "co_leader",
];

// Viewer identities: the author, the SUBJECT (pins "the person a note is about
// never reads it through being the subject"), and an unrelated third party.
const VIEWER_IDS: readonly string[] = [AUTHOR_ID, SUBJECT_ID, OTHER_ID];

export type VisibilityMatrixRow = {
  readonly note: NoteSubjectMeta;
  readonly viewer: NoteViewer;
  /** Independent toggle states for the two profiles a grant can key on. */
  readonly grants: {
    readonly author: GrantState;
    readonly subject: GrantState;
  };
};

// Every combination: 4 note shapes × (5 roles × 3 identities) × (3 × 3 grant
// environments) = 540 rows. Generated, not hand-written, so nothing is skipped.
export function enumerateVisibilityMatrix(): readonly VisibilityMatrixRow[] {
  const rows: VisibilityMatrixRow[] = [];
  for (const note of CARE_NOTE_ROWS) {
    for (const role of ALL_ROLES) {
      for (const profileId of VIEWER_IDS) {
        for (const author of GRANT_STATES) {
          for (const subject of GRANT_STATES) {
            rows.push({
              note,
              viewer: { role, profileId },
              grants: { author, subject },
            });
          }
        }
      }
    }
  }
  return rows;
}
