# The Care Note visibility pin is a behavioral differential, not a regex

**Status:** Accepted — 2026-07-07. Implements candidate 5 in the
2026-07-06 architecture deepening review (retired to git history).
Deepens the SEC-1 pin from the 2026-06-21 audit; sibling to the audit-pairing
fitness check (the write path's behavioral guard).

The Care Note / Prayer Request read boundary is deliberately expressed twice:
`canReadNote` in `lib/admin/care-note-visibility.ts` (the pure, caller-free
executable specification) and the `care_notes_author_or_granted_select` RLS
policy (the real boundary). The old fitness pin kept them aligned by **regex
shape** only. That could not see the pivot-11 dimension: the net-effective
policy has **two grant arms** — a profile-subject note is gated by the
**subject's** transparency toggle, a group note by the **author's** — while the
TS resolver takes one already-selected grant. Swapping the two grant keys in a
migration (gating an Over-Shepherd's note about a leader on the _author's_
toggle) would have passed every regex and silently changed who can read what.

## Decision

**The pin has three layers; each catches what the previous can't.**

1. **Shape** (kept unchanged): the original regex assertions — author arm,
   `auth_is_admin()` ANDed with the grant, no standalone grant escape, no
   `super_admin` bypass on either side. This honours the review's constraint:
   the existing check stays; the differential deepens, never relaxes.
2. **Freshness**: the folded net-effective USING clause must equal a pinned
   verbatim constant (`PINNED_CARE_NOTES_USING`), and the
   `prayer_requests_author_or_granted_select` clause must be its exact sibling
   modulo table name — so one mirror provably covers both policies. A future
   migration that touches either policy fails here first, with a readable text
   diff; the deliberate friction is the instruction to re-transcribe the
   mirror, re-verify the differential, then update the constant.
3. **Behavioral differential**: `sqlCanReadNote` — a ~15-line TS transcription
   of the pinned clause, co-located in the fitness test — and the production
   resolver both decide **every row of a shared input matrix**
   (`lib/admin/__tests__/care-note-visibility-matrix.ts`) and must agree.
   The matrix is generated, not hand-written: 2 note shapes (the XOR check
   admits only profile-subject and group-subject) × 15 viewers (5 roles × the
   author / the subject / a third party) × 9 grant environments
   (author-keyed × subject-keyed toggles, each on/off/absent) = **270 rows**.
   Varying the two grants **independently** is the point — a swapped grant key
   disagrees with the resolver on concrete rows (subject-grant OFF,
   author-grant ON) and fails the build. Including the subject as a viewer
   pins "the person a note is about never reads it through being the subject",
   which no prior test covered.

**`applicableGrantProfileId(note)`** joins the resolver module as the
executable form of the whose-toggle rule (ADR 0020):
`note.subjectProfileId ?? note.authorProfileId`. It is deliberately
**spec/test-scoped**: the one production read that loads a grant for display
(`shepherd-care-detail-data`) views a leader who is simultaneously the subject
of OS notes and the author of group notes, so the selection collapses there by
construction, and every other surface relies on RLS itself. Forcing production
adoption would be invented work.

## Found already satisfied: no shared projector needed

The review's second sub-item — "four reads modules re-apply the
author/grant/sealed projection by hand; route them through one shared
projector" — was **stale** on inspection:

- `care-accordion-reads` already routes its presence/sealing projection through
  the one shared projector, `buildNoteStateByLeaderId`
  (`lib/admin/care-accordion.ts`), with its own contract comment and tests.
- `care-note-feed-reads` never re-derives visibility: rows come RLS-scoped and
  the sealed **counts** come from the count-only `admin_sealed_note_counts`
  `SECURITY DEFINER` RPC.
- `care-note-reads` deliberately returns whatever the caller's RLS admits;
  its subject/author filters are belt-and-suspenders, not a re-spelled rule.
- `shepherd-care-private-note-reads` is a different domain entirely — the SC.4
  Private Care Note (creator-only, Super Admin **excluded**, the inverse
  exception), pinned by its own fitness check.

No projector work was done; this ADR records the finding so the sub-item isn't
re-proposed.

## Consequences

- A semantic divergence between resolver and policy now fails the default CI
  lane on a concrete disagreeing row, not only when a regex happens to notice.
- Changing either policy costs one extra step (update the pinned text +
  re-transcribe the mirror). That cost is the guard.
- The opt-in integration lane (`tests/integration/rls-visibility.test.ts`)
  still exercises the real policy against a live stack; the differential is
  the deterministic, always-on approximation of it.
