# One Care Note surface kit; the broad note stays outside

**Status:** Accepted — 2026-07-06. Implements candidate 2 in the
2026-07-06 architecture deepening review (retired to git history).
Sibling to [ADR 0001](./0001-admin-write-action-runner.md)'s write-lifecycle
sharing (`useActionForm`) and to the `ConfirmActionButton` config precedent.

The Care Note / Prayer Request write **lifecycle** was already deep and shared
(`useActionForm`, the audited `SECURITY DEFINER` RPCs), but the rendered
**surface** — form markup, note card, labeled list with empty state — was
shallow copies across the three oversight-ladder tiers. Two near-identical
local `NoteCard`s, the labeled-list-with-empty-state idiom respelled ~6 times,
the note-body class string in five files, and the prayer-status chip logic
re-derived in the notes feed: deleting any one copy made it reappear verbatim
in another.

## Decision

**One kit, `components/notes/`, two files that make the RSC boundary
structural:**

- **`note-card.tsx`** (server-safe, no directive): `NoteCard`, `NoteList`,
  `PrayerStatusChip`, and the style tokens (`noteBodyClassName`,
  `noteListLabelClassName`, `noteEmptyTextClassName`). The card takes a
  minimal `NoteCardView` (`body`, `recordedAtIso`, `context?`,
  `prayerStatus?`) — deliberately **not** a DB row type, so each tier maps
  the rows it is allowed to read into the view and the card stays decoupled
  from any read surface.
- **`note-write-form.tsx`** (`"use client"`): the form lifecycle around
  `useActionForm` — privacy lede, labeled 4000-char `body` textarea,
  pending-aware submit with the label-in-name aria pattern, optional Cancel
  and drawer wiring (`onSaved` / `onDirty` / `onPendingChange`).

**Tiers are declarative configs, exactly how the archive buttons configure
`ConfirmActionButton`.** `CareNoteWriteForm` (Ministry Admin / Over-Shepherd
authoring about a person) and `GroupNoteWriteForm` (Shepherd authoring about
their group) keep their public prop contracts byte-identical — call sites and
tests are untouched — and own only the action pair, the tier's copy, and the
id scheme. The #785 id-uniqueness invariant (subject + optional namespace in
the prefix) stays with the admin config, where the repetition lives.

**The kit's label/meta sizing is canonical:** `text-xs font-medium text-ink3`
labels, `text-xs` meta (the admin idiom, design-direction §2). The
Over-Shepherd "my notes" surface normalized down from `text-sm font-semibold`
— a deliberate, small visual change accepted with this ADR.

## The boundary: what deliberately stays outside

- **`LogBroadNoteForm`** (Over-Shepherd). A broad note is a different entity
  with a different field contract — field name `note`, its own
  `NOTE_MAX_CHARS` cap, no care/prayer `kind`, no reset-on-success. Folding it
  in would cost the kit more config axes than the one 63-line form saves.
- **The notes feed's `FeedItemCard`** adopts the tokens and the shared
  `PrayerStatusChip` only. It is a genuinely richer, memoized client card
  (kind badges, per-leader action menu, author/about meta over the normalized
  `CareFeedItem`) — a sibling of `NoteCard`, not a duplicate.

## Consequences

- Note-rendering bugs concentrate in one module with one test target; tier
  copy diverges deliberately while markup can't drift.
- The `components/leader/` and `components/over-shepherd/` surfaces gained
  their first component coverage through the shared kit's tests.
- Anything new that renders a Care Note / Prayer Request body should map into
  `NoteCardView` and use the kit rather than re-spelling the idiom.
