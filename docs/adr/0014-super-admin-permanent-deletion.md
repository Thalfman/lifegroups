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
- **Cascade and restrict dependents block; set-null dependents do not.** The
  RPC preflights dependents by **FK action**, because the action encodes the
  schema's intent:
  - `on delete cascade` → **blocker.** Relying on the DB would silently erase
    real child rows (e.g. `group_leaders`, `group_memberships`, the `group_id`
    history tables) with no tombstone. The RPC refuses and reports them so the
    operator archives/clears them first. No silent cascade through care history.
  - `on delete restrict` **and `no action` (the Postgres default, i.e. a plain
    `references …` with no `on delete` clause)** → **blocker.** They behave
    identically at the DB (the delete is refused), and several live FKs are the
    bare default — `attendance_sessions.submitted_by`, `guests.follow_up_owner_id`,
    `group_calendar_events.created_by/updated_by`, `group_history.changed_by`. The
    preflight must bucket these as blockers and report them; otherwise the RPC
    trips a raw DB constraint instead of the mapped blocker it promises. **A
    dependent counts as a blocker unless its FK is explicitly `set null` or
    `cascade`.**
  - `on delete set null` → **not a blocker.** These FKs were deliberately
    designed to null and let the row outlive its author (e.g.
    `launch_planning_scenarios.created_by/updated_by`, multiplication/leader
    pipeline rows, church-attendance snapshots, group-health assessments, and
    `audit_events.actor_profile_id`). Blocking on them would make any Ministry
    Admin who ever authored an operational row undeletable, contradicting the
    schema. They null on delete as intended. **But the tombstone must snapshot
    every set-null dependent it is about to null** (the child table, row id, and
    the FK column being cleared) so re-import can re-link them — otherwise
    nulling links like `follow_ups.related_member_id/related_guest_id/assigned_to`
    or `leader_pipeline.member_id` would be silent, unrecoverable loss against the
    recoverability promise. Where a nulled reference also loses display
    information — only `audit_events` today — we additionally preserve a durable
    descriptor (see Users below).
- **Private Care Notes are a permanent blocker.** A profile or care profile that
  has SC.4 private-note rows **cannot be permanently deleted** — `disable` is the
  path instead. SC.4 has no note hard-delete (the note RPC only upserts
  ciphertext; lifecycle RPCs only drop key slots), so there is genuinely no
  operator-clearable path, and the notes escape the Super Admin entirely (ADR
  0002/0003). The block is reported **opaquely** — "this person has confidential
  records and cannot be permanently deleted; disable instead" — with no table,
  count, or key-slot metadata, so the security-definer preflight cannot leak
  private-note existence to the Super Admin.
- **Every deletion writes both a tombstone and an `audit_events` row.** The
  tombstone is a full JSON snapshot of the deleted row **plus the set-null
  dependents it nulls** (child table, row id, FK column) captured before removal,
  so re-import restores both the row and those links. It does **not** replace the
  paired
  `audit_events` insert: the repo invariant that every RPC mutation writes a
  paired `audit_events` row in the same transaction still holds, so the deletion
  stays in the canonical immutable audit feed and existing audit tooling.
- **Users are `public.profiles` rows only.** `auth.users` is never touched, so
  the no-service-role-key invariant holds. Disable/re-enable
  (`set_profile_status`) remains the normal lever for logins.
  `audit_events.actor_profile_id` currently has no on-delete clause (so it would
  block like `restrict`); we migrate it to **`on delete set null`** so it falls
  under the set-null "not a blocker" rule above and the audit event survives with
  its actor link nulled. Because the audit feed renders "by &lt;name&gt;" only by
  joining `actor_profile_id` to a live profile, nulling that link alone would
  strip actor attribution from every past action of a deleted profile. So
  `audit_events` — **and its `audit_events_archive` mirror, plus the reset RPC
  that copies rows into it** — also gain a **denormalized actor descriptor**
  (name + email) captured at write time and backfilled from current profiles in
  the same migration. Without the archive carrying the descriptor, a Super Admin
  could reset audit logs and then delete the actor, re-introducing the same lost
  attribution in the archived history.
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
  `super_admin_*` SECURITY DEFINER delete RPC that snapshots the row and its
  set-null dependents, then deletes, writes the paired `audit_events` row, and
  surfaces blocking dependents (cascade / restrict / `no action`) as a mapped
  error token.
- Schema changes beyond the new table: `audit_events.actor_profile_id` gains
  `on delete set null`, and both `audit_events` and `audit_events_archive` (plus
  the audit-reset copy RPC) gain a denormalized actor descriptor (name + email)
  written at insert time and backfilled for existing rows — so a deleted
  profile's past actions keep their attribution in the live feed and the archive.
- Some profiles cannot be permanently deleted, by design: any profile with
  cascade/restrict dependents (until cleared) and any profile or care profile
  with SC.4 private notes (no clear path exists — `disable` instead). This is an
  accepted limit, not a gap.
- "Delete" is now an overloaded word: Archive (the reversible default) vs
  Permanent deletion (this hatch). CONTEXT.md disambiguates both, plus Tombstone.
- The archive-everywhere model is intact; this is the single, audited, bounded
  exception to it.
