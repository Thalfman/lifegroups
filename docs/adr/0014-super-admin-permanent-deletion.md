# Super Admin permanent deletion as a bounded escape hatch

**Status:** Accepted
**Date:** 2026-06-03

## Context

The app is archive-only by design: every entity that leaves a surface is
soft-deleted (`archive`) and recoverable, and the oversight ladder governs
visibility. "Super Admin should have the ability to delete anything" asked for
a capability the codebase deliberately never had — a physical delete. Granting
it naively collides with three load-bearing guarantees: Private Care Notes
escape the Super Admin entirely (ADR 0002, ADR 0003), all writes flow through
audited `admin_*` SECURITY DEFINER RPCs with no service-role key in the runtime
(ADR 0001, AGENTS.md), and several `profiles` FKs are `on delete restrict`.

## Decision

Permanent deletion is a **bounded escape hatch**, not a new default. Archive
stays the normal path everywhere. We add a Super-Admin-only "Permanent deletion"
panel in the Super Admin Console danger zone, type-to-confirm (reusing the Clean
Slate pattern), routed through a new audited `admin_*` RPC.

The bounds — "anything" means anything *except* the documented exceptions:

- **Scope is curated**, not every table. Operational entities only. Private Care
  Notes and audit/tombstone rows are off-limits.
- **Dependents block, they do not cascade.** The RPC refuses when `restrict`
  dependents exist and reports what is blocking; the operator clears or
  reassigns first. No silent cascade through care history.
- **Every deletion writes a tombstone** — a full JSON snapshot of the row(s)
  captured before removal — making the act accountable and recoverable by
  re-import. This is the deletion's paired audit record.
- **Users are `public.profiles` rows only.** `auth.users` is never touched, so
  the no-service-role-key invariant holds. Disable/re-enable
  (`set_profile_status`) remains the normal lever for logins.
- **Self and bootstrap Super Admin are blocked**, mirroring the existing
  self-target guard.

## Considered options

- **Literal "delete any table", with cascade.** Rejected: one click could erase
  a person plus all their care history, and including audit logs would let a
  Super Admin erase evidence of their own deletes.
- **Full auth-identity delete via the service-role admin API.** Rejected: would
  reverse the no-service-role-key invariant for a marginal gain over a deleted
  profile row plus a disabled login.
- **Delete reaches Private Care Notes (read, or blind-delete).** Rejected:
  breaks the "readable by Julian alone" promise SC.4/ADR 0002 exist to keep.

## Consequences

- A new tombstone table (Super-Admin-readable, never deletable) and a new
  `admin_*` SECURITY DEFINER delete RPC that snapshots-then-deletes and surfaces
  blocking dependents as a mapped error token.
- "Delete" is now an overloaded word: Archive (the reversible default) vs
  Permanent deletion (this hatch). CONTEXT.md disambiguates both, plus Tombstone.
- The archive-everywhere model is intact; this is the single, audited, bounded
  exception to it.
