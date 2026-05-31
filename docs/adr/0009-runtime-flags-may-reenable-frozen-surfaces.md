# Runtime feature flags may re-enable ADR-0002-frozen surfaces

A Super-Admin-Console feature-flag store will be able to re-enable surfaces that
[ADR 0002](./0002-oversight-ladder-and-leader-gating.md) deliberately froze
behind code gates — the Leader surface, check-ins, and guests. This amends ADR
0002's posture: those surfaces move from "re-enabling requires a deliberate dev
pass" to "re-enabling is a runtime toggle held by the Super Admin (Tom) only."

## Why

Tom wants to configure the app from within the app rather than ship a deploy for
every product decision. The frozen surfaces are deferrals, not deletions (ADR
0002 already says "not for leaders *yet*"), so a guarded runtime switch is the
natural control.

## The load-bearing constraint — verify before flip

ADR 0002 froze these surfaces partly for safety: with no one using them, their
routes and RLS policies are dormant and unexercised. A flag that flips a surface
on does **not** by itself make that surface safe. Flipping the Leader surface on
turns dormant leader routes and leader-facing RLS back into live attack surface.

Therefore: a flag may only enable a frozen surface whose routes and RLS have been
re-verified as part of landing that flag. "Flag-gated" means **flag AND
verified**, never flag alone. The flag toggles an already-sound surface; it is
not a substitute for the security review.

## Considered options

- **Flags for new/cosmetic surfaces only; frozen surfaces stay code-gated.**
  Rejected by Tom: he wants the power to flip the frozen surfaces too.
- **Flag-alone re-enable.** Rejected: would expose unaudited leader paths the
  instant a flag flips. The verify-before-flip rule exists to prevent this.

## Consequences

- A new config store (`app_settings` / `feature_flags`) is introduced, written
  only through the audited admin write path, Super-Admin-scoped by RLS.
- Each frozen surface placed behind a flag carries a re-verification task for its
  routes + RLS before the flag is allowed to enable it.
- The oversight ladder's guarantees (esp. the private-care-note exception) must
  continue to hold regardless of flag state.
