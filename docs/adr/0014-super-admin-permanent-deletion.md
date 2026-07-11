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

The bounds — "anything" means anything _except_ the documented exceptions:

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
    dependent counts as a blocker unless its FK is explicitly `on delete set
null` (the one non-blocking exception below); `cascade` stays a blocker.**
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
- **Profile targets remove both the app profile and linked Auth identity.**
  The transactional database RPC remains confined to the profile/tombstone
  domain, while the amended flow routes profile targets through a verified
  Edge Function that owns the service-role Auth deletion and final audit.
  The service role never enters Next.js or client code. Disable/re-enable
  (`set_profile_status`) remains the normal lever for logins; permanent
  deletion remains the bounded exception.
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
- **Full auth-identity delete via a service-role client in Next.js.** Rejected:
  it would reverse the runtime no-service-role invariant. A narrowly scoped,
  caller-verifying Edge Function was later accepted for permanent profile
  deletion only; see the 2026-07-10 amendment.
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

## Amendment — 2026-06-06 (#388): author-private Care Notes are opaque too

The original opaque `super_admin_confidential_block` covered only the SC.4
Private Care Note (ADR 0002/0003). The Care · Plan · Multiply pivot added a
second sealed-by-default class of pastoral writing — **author-private Care Notes
and Prayer Requests** (#381 / #382, ADR 0017 / ADR 0020), visible only to the
author unless that leader's transparency toggle is on. Their subject/author FKs
are `on delete cascade` (subjects) / `on delete restrict` (authors), so
`super_admin_collect_dependents` bucketed them as named **blockers** and the
permanent-delete preflight leaked their **count/existence** to the Super Admin
regardless of the toggle — across both profile targets (`subject_profile_id` /
`author_profile_id`) and group targets (`subject_group_id`). Only the count +
existence leaked; RLS still sealed every body.

**Decision:** extend `super_admin_confidential_block` so any target holding these
notes is reported **opaquely** (`confidential: true`, no per-table counts),
exactly like SC.4 — chosen over the alternative of suppressing the count while
allowing the delete. A profile is sealed when it is the **subject _or_ author**
of any `care_notes` / `prayer_requests` row (both leak vectors); a group is
sealed when it is the **subject** (`subject_group_id`) of one. The block
short-circuits before `collect_dependents` runs, so the count never reaches the
report.

This does **not** change deletability: these cascade/restrict FKs already made
such a target undeletable via `has_blocking_dependents`, so the only change is
swapping a count-leaking block for an opaque one. The alternative — dropping them
from the blocker list to let the delete proceed — was rejected because the
`on delete cascade` would then silently destroy author-private pastoral content
that the tombstone (which snapshots only set-null dependents) could never
recover; "no delete RPC for these notes today" is the accepted, deliberate
posture (seal and disable, never erase). Implemented in
`20260609000000_phase_sad7_confidential_block_care_notes.sql`.

## Amendment - 2026-07-10 (#881/#882): complete account purge and review queue

The original decision stopped at deleting `public.profiles`. That is insufficient
for the self-service account-deletion promise introduced by
`account_deletion_requests`: leaving the linked Auth identity behind means the
person's sign-in account still exists after an approved permanent purge.

**Decision:** every permanent **profile** deletion launched from the app now
uses the `purge-profile-auth` Edge Function. Other curated entity types keep
using `super_admin_permanent_delete` directly. The function is the only new
service-role boundary and performs this ordered workflow:

1. Re-verify the bearer token with `auth.getUser()`, resolve exactly one active
   caller profile, and require `role = 'super_admin'`.
2. Resolve the target profile and its `auth_user_id` server-side, then call the
   existing transactional `super_admin_permanent_delete` RPC through the
   caller-scoped client. The RPC still owns dependency checks, tombstone capture,
   the profile delete, and its paired audit event.
3. Delete the linked Auth user with `auth.admin.deleteUser`.
4. Record a content-free `super_admin.auth_user_delete` audit event through the
   service-role-only `service_record_profile_auth_purge` RPC.

The service-role key remains confined to `supabase/functions/**`; it is never
present in Next.js runtime or client code. The Edge Function accepts only the
profile id. It never accepts an Auth user id from the caller, never logs email
or request reason, and still forbids every Super-Admin target.

The database and Auth service cannot share a transaction. If the database purge
commits but Auth deletion or final audit recording fails, the response clearly
reports a retryable partial failure. A retry resolves the trusted Auth id from
the immutable profile tombstone, treats an already-missing Auth user as success,
and records the final audit idempotently under a tombstone-scoped advisory lock.
An already-issued Auth token may remain cryptographically valid until it
expires, but the deleted profile makes the app's session/profile guards deny it.

The danger zone also reads pending `account_deletion_requests` through its
Super-Admin-only RLS policy and explicit named columns. The queue shows requester
identity, reason, status, and requested date, then preloads the same permanent
profile flow; it does not create a second write path or skip preflight and typed
confirmation. The existing profile-delete trigger completes the retained
request and wipes its free-text reason in the database transaction. Revalidating
the Super-Admin routes removes that request from the queue on the fresh render.

This amendment supersedes the original `auth.users` exclusion and the blanket
rejection of Auth deletion. It accepts only the narrow Edge Function boundary
above; archive/disable remains the normal account-management path.
