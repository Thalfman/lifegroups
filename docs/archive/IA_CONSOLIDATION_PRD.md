# PRD — Information Architecture Consolidation

> 📌 **What this PRD is.** A scoped product requirements document for the structural
> consolidation that resolves why the app feels clunky, scattered, and fragmented.
> It is derived from a read-only audit of the repository at HEAD, and every claim
> traces to a file. It is written to be **sliced into GitHub issues**: each
> requirement is independently shippable and ordered by dependency and risk.
>
> **Scope boundary.** This PRD covers structure only: surface count, navigation,
> vocabulary, lingering concept, and scaffolding. The density of individual
> surfaces and the broader ease-of-use work are real and important, but they are
> deliberately **out of scope here** and will be handled in a separate
> simplification PRD built on top of this one, once the surfaces are settled.
>
> Vocabulary follows [`CONTEXT.md`](../../CONTEXT.md). Product scope follows
> [`PRD.md`](../PRD.md) and the existing audit
> [`plans/CONCEPT_RECONCILIATION.md`](./CONCEPT_RECONCILIATION.md). Where a
> requirement touches a decision, the ADR is cited inline.

---

## Bottom line

The app feels fragmented because two products share one codebase, and the
navigation maps roughly nine near-peer destinations onto only three real jobs.
The single highest-leverage move is to consolidate the four Job-2 launch surfaces
into one, because that is the clearest case of one job built several times. The
work that follows is lower risk: unify vocabulary, retire the lingering original
concept, remove duplicate scaffolding, and install one rule that stops the bloat
from returning.

This is not a redesign, and it is not the simplification work. The visual layer
is sound. The fix is structural, and it reduces surface count rather than adding
to it.

## Problem statement

The audit confirms a structural, not cosmetic, cause across five findings, each
evidenced below.

### Finding 1 — The pivot never finished

[`PRD.md`](../PRD.md) records that the app began as a broad, Leader-inclusive
group-operations platform and was inverted into Julian’s admin operating system,
and that the original concept still lingers in code, schema, and copy. The proof
already exists in [`plans/CONCEPT_RECONCILIATION.md`](./CONCEPT_RECONCILIATION.md):
half-finished Shepherd-to-Leader renames, a dead `staff_viewer` role, and frozen
surfaces that are dropped from nav but still resolve by URL. A per-tab read found
one more instance the audit had not catalogued: the in-scope Follow-ups surface
describes itself in its own lede as a leader-visible task queue, so the deferred
Leader concept is leaking into an admin tab that is supposed to be oversight-only.
That debris is the noise the owner feels.

### Finding 2 — The navigation is overloaded, and Job 2 is built four times

`lib/auth/roles.ts` defines a Ministry Admin nav group carrying nine items. Job 2,
knowing what to launch and when, is split across four destinations: Capacity
board, Launch planning, Multiplication, and Leader pipeline. Two of these are
effectively the same surface. The page at
`app/(protected)/admin/capacity-board/page.tsx` and the page at
`app/(protected)/admin/launch-planning/page.tsx` both render the title “Capacity”
with near-identical ledes about planning group capacity and launch timing. Four
front doors to one job is the fragmentation, and it prevents any user from forming
a stable mental model. A per-tab read adds that these four surfaces are not only
redundant but individually heavy: the multiplication planner is 770 lines with
eighteen inputs, the leader pipeline is 476 lines with thirteen inputs, and the
capacity board is 376 lines. Merging them naively would produce one oversized
surface, so the merge is a design problem, not a plumbing one.

### Finding 3 — Vocabulary drifts across the same concept

The terms Shepherd, Leader, Coach, and Over-Shepherd refer to overlapping ideas
depending on which file is read.
[`plans/CONCEPT_RECONCILIATION.md`](./CONCEPT_RECONCILIATION.md) already lists
specific live strings that contradict the `CONTEXT.md` glossary, including “coach”
in empty states and “My Shepherds” back-links on pages whose titles read “My
Leaders.” The same role reading three ways makes a clean app feel incoherent.

### Finding 4 — Two app-chrome shells coexist, one of them legacy

The app has two competing chrome shells. The live one is `components/lg/shell/*`,
imported by `app/(protected)/admin/layout.tsx` as `LgAppShell`. The legacy one is
`components/pastoral/shell.tsx`, which still powers the root landing page
(`app/page.tsx`), the Leader routes, and the in-scope Over-Shepherd surface. A
correction from the per-tab read: `components/layout/shell.tsx` is not a third
dead shell, it is shared layout infrastructure imported by twelve live admin
components, and `components/dashboard/cards` is likewise shared by in-scope care
and launch components. Neither is removable. The real duplication is the two chrome
shells, and retiring the legacy one is gated on migrating its remaining surfaces.
Separately, the codebase carries 134 component files and 82 Markdown docs, more
than 50 of them in `docs/archive/` including two competing roadmaps, so the
planning process has accreted as much as the application.

### Finding 5 — There is no forcing function

Nothing in the workflow requires a new surface to map to one of the three jobs or
to replace an existing surface. Refinement therefore defaults to addition. Until a
constraint exists, every consolidation pass will silently re-bloat.

## Goals and non-goals

**Goals.** Reduce the number of top-level admin destinations to the smallest set
that covers the three jobs plus System. Make every reachable surface map to
exactly one job. Unify user-facing vocabulary to the `CONTEXT.md` glossary. Retire
or explicitly mark the lingering original concept. Remove duplicate scaffolding.
Install one rule that prevents regression.

**Non-goals.** No visual redesign. No change to the `shepherd_care_*` schema or the
`shepherd-care` and `over-shepherd` route paths, which ADR 0008 froze on purpose.
No new Leader-facing or external features; LDR.1 and EXT.1 remain deferred. No
re-litigation of the three jobs. The density of individual surfaces and the
ease-of-use work are explicitly deferred to a separate simplification PRD.

## Success criteria

The pass is complete when the Ministry Admin nav group is materially smaller than
nine items, when Job 2 resolves to one consolidated surface rather than four, when
no user-facing string contradicts the glossary, when frozen surfaces are either
removed or gated behind a default-off flag rather than silently reachable, when
only one shell system remains, and when the surface-budget rule is recorded as an
ADR.

---

_Status legend:_ 🟢 zero-risk mechanical · 🟡 structural, reversible · 🔴 needs a
Julian or Tom sign-off before build. Each requirement is sized to become one
GitHub issue or a small epic.

## C — Concept and surface consolidation

**C1 — Merge the launch surfaces into one. 🔴**
Collapse Capacity board, Launch planning, and Multiplication into a single Launch
planning destination. Keep Leader pipeline distinct, because it tracks apprentices
moving toward leadership, which is a different object from launch timing and
capacity. Capacity board and Launch planning are already near-duplicates, both
titled “Capacity,” so they merge with no conceptual loss. The merge must reduce,
not stack: the three source surfaces total well over 1,400 lines and roughly two
dozen inputs, so the consolidated surface must shed redundant controls rather than
gather them onto one page. The structural merge belongs to this PRD; the detailed
layout and density of the resulting surface are owned by the simplification PRD,
which should be sequenced to follow C1 immediately. Recommended disposition below;
this is the default unless Julian objects.
Evidence: `app/(protected)/admin/capacity-board/page.tsx`,
`.../launch-planning/page.tsx`, `.../multiplication/page.tsx`,
`.../leader-pipeline/page.tsx`. Touches ADR 0006.

**C2 — Resolve frozen-but-reachable surfaces. 🟡**
`app/(protected)/leader/*`, `admin/guests`, and `admin/check-ins` are dropped from
nav but still resolve behind role gates. Route each through the ADR 0009
feature-flag default-off mechanism, which marks them frozen rather than silently
live. Remove only if a surface has no foreseeable re-enablement.
Evidence: `plans/CONCEPT_RECONCILIATION.md` section C; ADR 0009.

**C3 — Remove the deprecated `staff_viewer` role. 🔴**
Confirm whether any rows still carry `staff_viewer`. If none, remove the enum value
and its predicates outright. If rows exist, migrate them to no-access and then
remove the value. Quarantining is the fallback only if migration is blocked.
Recommended disposition: remove after a zero-row check.
Evidence: `types/enums.ts`, `lib/auth/roles.ts`, `lib/admin/validation.ts`.
Audit section B.

**C4 — Correct the Follow-ups scope leak. 🟢**
Reframe the Follow-ups surface as an admin oversight queue, not a leader-visible
task queue, so its copy stops referencing the deferred Leader concept. This is a
copy and framing correction on an in-scope surface, no behaviour change.
Evidence: `app/(protected)/admin/follow-ups/page.tsx` lede;
`components/admin/follow-ups/follow-ups-shell.tsx`.

## N — Navigation

**N1 — Ship the target sidebar. 🟡**
Reduce the Ministry Admin group from nine items to the consolidated set produced by
C1, with each remaining item mapping to exactly one job. State the before and after
destination counts in the pull request. This is the most visible win and depends on
C1 landing first.
Evidence: `lib/auth/roles.ts`, the `adminNavGroups` definition.

## V — Vocabulary

**V1 — Mechanical copy fixes to match the glossary. 🟢**
Apply the find-and-replace worklist already enumerated in section A of the audit:
the “coach” empty states, the “My Shepherds” back-link, the “This Shepherd”
fallback, and the over-shepherds page lede. No decisions, highest priority, ship
first.
Evidence: `plans/CONCEPT_RECONCILIATION.md` section A, with exact file and line.

**V2 — Reconcile the Leader Care Status vocabulary. 🔴**
The shipped enum is `healthy / watch / needs_attention`; Julian adopted five values
verbatim. Adopt Julian’s five values now, because the status vocabulary is the
spine of Job 1 and the mismatch is a live source of incoherence. The migration is
tracked in issue #122. Recommended disposition: land #122 in this pass.
Evidence: audit section E; ADR 0004.

## S — Scaffolding

**S1 — Retire the legacy chrome shell. 🟡**
The duplication is two app-chrome shells, not three. `components/lg/shell/*` is
live, imported by `app/(protected)/admin/layout.tsx` as `LgAppShell`.
`components/pastoral/shell.tsx` is the legacy chrome, still rendering the root
landing page (`app/page.tsx`), the Leader routes, and the in-scope Over-Shepherd
surface. Retire it in two steps: migrate the in-scope surfaces still on it, namely
the root landing page and Over-Shepherd, onto `lg/shell`, then delete
`pastoral/shell` once C2 has resolved the Leader routes. Do not touch
`components/layout/shell.tsx` or `components/dashboard/cards`, which are shared
layout infrastructure imported by many live admin components and are not legacy.
Evidence: importer scan of `pastoral/shell`, `layout/shell`, and `dashboard/cards`;
`app/(protected)/admin/layout.tsx`.

**S2 — Archive-hygiene pass on docs. 🟢**
Consolidate or clearly supersede the two competing roadmaps in `docs/archive/` so a
future reader has one source of truth.
Evidence: `docs/archive/APP_COMPLETION_ROADMAP.md`,
`docs/archive/CLAUDE_APP_COMPLETION_ROADMAP.md`.

## F — Forcing function

**F1 — Record a surface-budget ADR. 🟢**
Draft `docs/adr/00NN-surface-budget.md` stating that a new user-reachable surface
must map to exactly one of the three jobs and must name the surface it replaces, or
it does not ship. This is the rule that prevents re-bloat, and it is the hook the
later simplification PRD will extend with usability criteria.

---

## Recommended issue-slicing order

Slice by risk, lowest first, so the early issues are pure wins that shrink the
surface before the structural merges begin.

1. **V1, C4, S2, F1** — zero-risk copy, the Follow-ups scope-leak fix, docs, and
   the surface-budget rule. Ship the same day.
1. **C2** — gate or remove the frozen Leader, guests, and check-in surfaces.
1. **S1** — retire the legacy chrome shell. This now follows C2, because
   `pastoral/shell` cannot be deleted until the Leader routes are resolved, and it
   also requires migrating the root landing and Over-Shepherd surfaces first.
1. **C1 then N1** — the launch-surface merge, then the navigation that reflects it.
   N1 cannot ship before C1, and the simplification PRD should pick up the merged
   surface immediately after C1.
1. **C3, V2** — the two sign-off items, built on the recommended dispositions once
   Julian confirms.

## Known states, no action in this PRD

Group health is a live surface, not a stub. Its question wordings render as
documented placeholders when an operator has not set custom copy, which is an
intentional graceful fallback per ADR 0007, not unfinished UI. It is recorded here
so it is not mistaken for incomplete work during the consolidation. No change is
prescribed in this PRD.

## Sign-off needed before the 🔴 items build

Three items carry a recommended default and need only a yes from Julian to proceed,
not fresh analysis. C1: merge Capacity board, Launch planning, and Multiplication,
and keep Leader pipeline separate. C3: remove `staff_viewer` after a zero-row
check. V2: adopt Julian’s five care-status values now via issue #122.
