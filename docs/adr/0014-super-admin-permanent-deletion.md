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
Slate pattern), routed through a new audited **`super_admin_*`** SECURITY DEFINER
RPC gated on `auth_role() = 'super_admin'`. The `super_admin_*` naming/gate is
deliberate: `admin_*` RPCs are Ministry-Admin-callable via `auth_is_admin()`, so
naming this `admin_*` would leave a realistic path to exposing permanent deletion
to Ministry Admins despite the UI copy.

The bounds — "anything" means anything *except* the documented exceptions:

- **Scope is curated**, not every table. Operational entities only. Private Care
  Notes and audit/tombstone rows are off-limits.
- **Dependents block, they do not cascade.** The RPC must **preflight every
  dependent row regardless of its FK action** — `on delete cascade` and
  `set null` rows count as blockers too, not just `on delete restrict`. Relying
  on DB `restrict` alone would let cascade FKs (e.g. `group_leaders`,
  `group_memberships`, and the `group_id` history tables) silently erase children
  with no tombstone before any block could fire. The RPC refuses when any
  dependent exists and reports what is blocking; the operator clears or reassigns
  first. No silent cascade through care history.
- **Every deletion writes both a tombstone and an `audit_events` row.** The
  tombstone is a full JSON snapshot of the row(s) captured before removal, making
  the act recoverable by re-import. It does **not** replace the paired
  `audit_events` insert: the repo invariant that every RPC mutation writes a
  paired `audit_events` row in the same transaction still holds, so the deletion
  stays in the canonical immutable audit feed and existing audit tooling.
- **Users are `public.profiles` rows only.** `auth.users` is never touched, so
  the no-service-role-key invariant holds. Disable/re-enable
  (`set_profile_status`) remains the normal lever for logins. Because
  `audit_events.actor_profile_id` references `profiles(id)` and audit rows are
  off-limits, deleting a profile that has performed audited actions would
  otherwise be impossible (an unclearable blocker). We migrate that FK to
  **`on delete set null`** so the audit event survives with its actor link
  nulled, rather than blocking the delete or deleting the audit row. Because the
  audit feed renders "by &lt;name&gt;" only by joining `actor_profile_id` to a
  live profile, nulling that link alone would strip actor attribution from every
  past action of a deleted profile. So `audit_events` also gains a **denormalized
  actor descriptor** (name + email) captured at write time — backfilled from
  current profiles in the same migration — so attribution is durable and survives
  both the FK null and the profile's deletion.
- **No Super Admin profile is ever a target.** Permanent deletion forbids
  targeting any `super_admin` row (not just self and bootstrap), matching the
  existing `super_admin_set_profile_status` `forbidden_target` guard. Permanent
  deletion is strictly more destructive than disable, so the role-boundary guard
  must be at least as wide.

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
  `super_admin_*` SECURITY DEFINER delete RPC that snapshots-then-deletes, writes
  the paired `audit_events` row, and surfaces blocking dependents as a mapped
  error token.
- Two schema changes beyond the new table: `audit_events.actor_profile_id` gains
  `on delete set null`, and `audit_events` gains a denormalized actor descriptor
  (name + email) written at insert time and backfilled for existing rows — so a
  deleted profile's past actions keep their attribution in the audit feed even
  after the FK is nulled.
- "Delete" is now an overloaded word: Archive (the reversible default) vs
  Permanent deletion (this hatch). CONTEXT.md disambiguates both, plus Tombstone.
- The archive-everywhere model is intact; this is the single, audited, bounded
  exception to it.
