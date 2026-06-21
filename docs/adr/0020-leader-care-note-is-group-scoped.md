# The Leader's Care Note is scoped to the group, not per member

**Status:** Accepted

ADR 0017 re-opened the Leader login and said a Leader "writes Care Notes and
Prayer Requests per member." Building that surface (#382) surfaced a modelling
mismatch, and Julian's call is to **scope the Leader's Care Note and Prayer
Request to the group as a whole, not to individual members.** This amends the
"per member" clause of ADR 0017; everything else in ADR 0017 (the two gates, the
author-private Care Note as the second exception to the ladder, the
transparency toggle) stands unchanged.

## Why group-scoped

- **Members are not profiles.** A Life Group's members live in a separate,
  non-login `members` table; the author-private Care Notes / Prayer Requests
  model (#381) keys its subject to a `profiles` row. Per-member notes would have
  meant threading a polymorphic "subject is a member, not a profile" path through
  the whole notes model and its RLS — real surface area for a privacy-critical
  table.
- **The roster is Julian's, not the Leader's data entry.** Per ADR 0016 the
  member/assignment/count UI is hidden; Julian keeps the roster current by his
  own methods. A Leader caring for "the group" — how it's doing, what to pray for
  — fits the pivot better than asking Leaders to maintain per-person records the
  app otherwise hides.
- **The transparency toggle has no per-member home.** The toggle is an inline,
  per-person act in the Care accordion, which lists Over-Shepherds → Leaders.
  Members don't appear there, so there is nowhere to hang a per-member toggle. A
  group note gated by the **authoring Leader's** existing toggle reuses exactly
  the per-leader grant #381 already built.

## What this means in the model

- A Leader's Care Note / Prayer Request has a **group subject**
  (`subject_group_id`), mutually exclusive with the Over-Shepherd note's profile
  subject (`subject_profile_id`) — exactly one is set (a DB check enforces it).
- **Visibility is unchanged in shape; the gating leader differs by note type.**
  An OS note about a Leader is gated by that Leader's toggle (the Leader is the
  note's _subject_). A Leader's group note is gated by that Leader's toggle (the
  Leader is the note's _author_). The RLS SELECT policy keeps the subject-grant
  arm and adds an author-grant arm; both key on the **Leader's**
  `note_transparency_grant`. Each arm is **scoped to its own note type** by a
  not-null guard (subject arm → `subject_profile_id is not null`; author arm →
  `subject_group_id is not null`) so a stale grant cannot cross-leak: without it,
  a leader converted to over-shepherd (whose grant row lingers) could expose the
  profile-subject notes they later author about _another_ leader. The author
  always reads their own note; peers never.
- Writes still flow only through narrow SECURITY DEFINER RPCs
  (`leader_write_group_care_note`, `leader_write_group_prayer_request`) that gate
  authorship on `auth_is_leader_of(group)` and write a paired, body-free audit
  row. No write RLS policy is added (RPC-only writes, ADR 0002 / AGENTS.md).

## Consequences

- The original #382 "members as care targets / per-member notes" UI is **not**
  built. The Leader care surface shows the group(s) the Leader leads, each with a
  group-scoped Care Notes + Prayer Requests space and its calendar.
- If per-member pastoral notes are ever wanted, they are a new, deliberate slice
  (with their own subject model and a place for a per-member toggle) — this ADR
  is the record that group-scoped was the chosen, narrower shape.
- ADR 0017's "per member" wording is superseded by this ADR for the Leader tier;
  the Over-Shepherd tier (notes about Leaders, subject = a profile) is unchanged.
- **Permanent-delete opacity (#388, ADR 0014):** because a group note's
  `subject_group_id` is `on delete cascade`, the super-admin permanent-delete
  preflight would have leaked the count/existence of a group's leader notes when
  deleting that group. ADR 0014's `super_admin_confidential_block` now seals a
  group holding any `care_notes` / `prayer_requests` row, so the delete is
  reported opaquely (no count) — consistent with the SC.4 Private Care Note.
