# Runtime feature flags may re-enable ADR-0002-frozen surfaces

**Status:** Accepted

A Super-Admin-Console feature-flag store will be able to re-enable surfaces that
[ADR 0002](./0002-oversight-ladder-and-leader-gating.md) deliberately froze
behind code gates — the **Leader surface** and **check-ins**. This amends ADR
0002's posture: those surfaces move from "re-enabling requires a deliberate dev
pass" to "re-enabling is a runtime toggle held by the Super Admin (Tom)" —
subject to the two constraints below.

Guests is **not** in this set. `/admin/guests` is an active admin surface gated
by `requireAdmin()` and merely hidden from nav under EXT.1; the route still
resolves and its data is intact. Restoring it to nav is an EXT.1 scope
conversation with Julian (and the comms director), not an ADR-0002 re-enable —
do not fold it into this ADR.

## Why

Tom wants to configure the app from within the app rather than ship a deploy for
every product decision. The frozen surfaces are deferrals, not deletions (ADR
0002 already says "not for leaders _yet_"), so a guarded runtime switch is the
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

## The second constraint — Leader-surface flags still need Julian's go-ahead

The flag store lives in the Super Admin Console and is Tom's to operate, but a
flag does **not** override LDR.1: no new Leader-facing feature ships without
Julian's explicit go-ahead (CONTEXT.md, ADR 0002). The verify-before-flip rule
covers the _security_ boundary (routes + RLS); it does not cover the _product_
boundary (Julian owns whether the Leader surface opens at all).

Therefore: enabling the Leader-surface flag requires both re-verification **and**
Julian's LDR.1 approval. Tom holds the switch; Julian holds the decision to throw
it. (Cosmetic/platform flags that touch no Leader-facing surface need only the
security check.)

## Considered options

- **Flags for new/cosmetic surfaces only; frozen surfaces stay code-gated.**
  Rejected by Tom: he wants the power to flip the frozen surfaces too.
- **Flag-alone re-enable.** Rejected: would expose unaudited leader paths the
  instant a flag flips. The verify-before-flip rule exists to prevent this.

## Consequences

- A new, dedicated `feature_flags` store is introduced — **not** the existing
  `app_settings` table. `app_settings` carries the `app_settings_auth_read`
  policy, which grants SELECT to every authenticated user; any signed-in Leader,
  Co-Leader, or staff viewer could read flags placed there. `feature_flags` is
  Super-Admin-scoped by RLS for **both read and write**.
- Flag writes go through a **super-admin-only** auth gate
  (`requireSuperAdminSession` / `requireSuperAdmin`), not the default
  `runAdminWriteAction` path — that path falls back to `requireAdminSession`,
  which also accepts `ministry_admin`, and a Ministry Admin must not be able to
  flip Super-Admin launch gates. Writes remain audited.
- Each frozen surface placed behind a flag carries a re-verification task for its
  routes + RLS before the flag is allowed to enable it.
- The oversight ladder's guarantees (esp. the private-care-note exception) must
  continue to hold regardless of flag state.
