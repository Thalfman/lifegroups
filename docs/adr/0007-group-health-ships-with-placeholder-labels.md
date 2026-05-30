# ADR 0007: The Group-Health Grade ships with placeholder ("TBD") question labels

**Status:** Accepted
**Date:** 2026-05-30
**Relates to:** [ADR 0004 / D8](./0004-systems-conversation-architecture.md) (group-health rubric), PRD Q12, and issue #125 (Julian's two question wordings).

## Context

The Group-Health Grade is built and dimension-complete: attendance consistency,
plus the two admin-entered 1–5 ratings (spiritual growth + relayed group
question), composite A–D, tunable weights/cut-lines, override
(`lib/admin/group-health.ts`; migrations `…gh1`, `…gh2`). The grade *math* needs
nothing more.

The one residual was treated as a launch gate: the **exact wording** of the two
1–5 questions is Julian's pastoral call (#125), and the surface ships placeholder
labels until he settles them. Framed that way, a shipped, working feature waits
on a copy decision from a busy Ministry Admin.

## Decision

**Decouple the wording from launch.** Ship the two 1–5 inputs with clear,
neutral **placeholder ("TBD") labels** and treat Julian's exact wording as a
**deferred cosmetic update, not a gate.** The ratings capture, the grade math,
and the dashboard all go live now; the labels get Julian's words whenever he
provides them.

Two supporting decisions, already recorded on #125:

- **Labels are code constants, not tunable config** — one source-of-truth
  constant per question, consolidated across the visible header, the field
  label, and the `aria-label` (today these three diverge in
  `app/(protected)/admin/group-health/page.tsx`).
- The placeholder must still read as a real, distinct question per dimension
  (spiritual growth vs. an observable engagement/connection facet) so the two
  1–5s don't collapse into one even before final wording lands.

## Why

- **A working grade is more useful than a perfectly-worded blank.** Julian can
  start grading groups immediately; the label text changes nothing about what
  the number means or how it's computed.
- **It removes the last Julian-blocking item from the launch path.** Combined
  with [ADR 0006](./0006-multiplication-planner-supersedes-google-doc.md), no
  North-Star item is gated on awaiting Julian.
- **The wording swap is genuinely trivial later** — once the labels are
  consolidated to one constant each, applying Julian's words is a one-line
  change per question plus a doc update. That work flips #125 to `ready-for-agent`
  the moment he replies.

## Consequences

- #125 is **no longer a launch gate**; it becomes a small post-launch polish
  ticket (swap placeholder → Julian's words, record in the rubric doc + PRD).
- The placeholder copy itself becomes a (deliberately low-stakes) product-copy
  choice we own until Julian overrides it.

## Revisit if

Julian's eventual wording implies a *different facet* than the placeholders
measure (e.g. the relayed question turns out to be about something attendance or
spiritual-growth already covers) — that would be a rubric change, not a relabel,
and belongs back with ADR 0004 / D8.
