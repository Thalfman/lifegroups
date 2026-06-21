# Surface budget: a new surface must map to one job and name what it replaces

**Status:** Accepted

The app fragmented because nothing in the workflow forced a new user-reachable
surface to justify its existence. Refinement defaulted to addition, so the
Ministry Admin navigation drifted to roughly nine near-peer destinations over
only three real jobs (IA Consolidation PRD, Finding 5). This ADR records the
forcing function that stops the re-bloat.

**The rule.** A new user-reachable surface ships only if it satisfies **both**
of these, stated in the pull request that introduces it:

1. **Maps to exactly one job.** The surface serves exactly one of Julian's three
   jobs (PRD.md, Q12): (1) know how my leaders are doing, (2) know what groups
   need to launch, (3) know how my groups are doing (group health). "System"
   (Settings, Super Admin Console) is the one non-job utility area and is not a
   loophole for product surfaces. A surface that serves two jobs, or none, does
   not ship as a new surface — it is split or folded into an existing one.
2. **Names the surface it replaces.** The PR explicitly names the existing
   surface this one supersedes, consolidates, or removes. "Adds a net-new
   destination, replaces nothing" is not an acceptable answer; the default is
   that the surface budget does not grow.

A surface that cannot satisfy both does not ship. This is deliberately a
constraint on _count_, not on quality — it does not judge whether a surface is
good, only whether it is allowed to exist as a new top-level destination.

## Why

A constraint is the only thing that holds. Every consolidation pass that lacks
one silently re-bloats, because adding a surface is always locally easier than
folding work into an existing one. Tying "ship a new surface" to "name the one
it replaces" makes the budget self-enforcing: the navigation can only stay flat
if growth is paid for by consolidation. The map-to-one-job half keeps each
surface legible — a user can form a stable mental model when every destination
answers to exactly one of three jobs.

## Scope

- Applies to **user-reachable surfaces**: top-level admin destinations and the
  routes behind them, the things a user can navigate to. It does not govern
  internal components, helpers, or non-navigable utility routes.
- "System" (Settings, Super Admin Console) is recognised as the non-job area
  that supports operating the three jobs; it is held to the same
  name-what-it-replaces discipline but is not forced to map to a product job.
- Frozen surfaces re-enabled by a runtime flag (ADR 0009) are governed by that
  ADR's verify-before-flip rule; flipping a frozen surface back on is not a
  "new surface" under this ADR, but adding a brand-new surface still is.

## The model-clarity gate

The count rule above governs whether a surface is _allowed to exist_. It does
not govern whether the surface, once it exists, presents an intuitive model to
the user. The Surface Simplification PRD found the app's pervasive fault is that
surfaces expose the internal model rather than the one a ministry leader holds,
so this gate extends the budget with that principle.

**The principle.** A user-reachable surface must present an intuitive model to
the user, not the internal one. Beyond the count rule above, a PR that adds or
materially changes a user-reachable surface states how the surface holds to the
principle, tested four ways:

1. **One primary action, no density regression.** The surface has one obvious
   primary action and does not regress in on-load density.
2. **Estimate over record.** It does not record a data series that no surface
   reads; where an editable estimate or a default would serve, it does not
   capture an exact value or a series.
3. **Default over precision.** It does not demand precision a sane default could
   supply, such as a decimal coefficient a non-technical ministry user cannot
   confidently give.
4. **Ministry words over implementation words.** Its labels use the ministry
   vocabulary defined in CONTEXT.md, not internal or developer vocabulary.

The standing test is whether a non-technical ministry user can complete the
surface's job without a glossary. A surface that fails a test is simplified, not
shipped as-is — this gate is on _model clarity_, complementing the count rule's
constraint on _surface count_; a surface must clear both.

## Consequences

- Every PR that adds a user-reachable surface states, up front, which one job it
  maps to and which existing surface it replaces or consolidates. A reviewer can
  reject a surface on budget grounds alone.
- The surface count trends down or flat, never silently up. The IA Consolidation
  PRD's nav reduction (nine → the consolidated set) is protected from regression.
- This is the hook the later simplification PRD extends: that PRD layers
  usability and density criteria on top of this count constraint rather than
  re-deriving the budget.
- If the three jobs themselves ever change, that is a PRD/Q12 decision recorded
  in its own ADR; this ADR then points at the new job set rather than being
  rewritten in place.
