# Oversight ladder, Over-Shepherd login, and gating the leader surface

**Status:** Accepted — the ladder stands; the leader-surface gate was amended by
[ADR 0009](./0009-runtime-flags-may-reenable-frozen-surfaces.md) (runtime flags),
[ADR 0017](./0017-reopen-leader-os-logins-and-care-notes.md) (logins re-opened),
and [ADR 0024](./0024-default-on-leader-surface-and-groups-people-nav.md)
(default-on).

The app is repositioned as an oversight operating system for the ministry's
upper tiers only — **not** a tool for group leaders (Shepherds) yet. We adopt
a strict downward-visibility ladder and gate the entire leader-facing surface.

## Decision

**The oversight ladder** — each tier sees everything the tier below sees, plus more:

> **Super Admin ▸ Ministry Admin ▸ Over-Shepherd ▸ Shepherd**

- **Super Admin** (Tom): everything a Ministry Admin sees **plus platform/account
  administration** (user invites, accounts, system/audit, super-admin console).
  No ministry/operational data is hidden from the Ministry Admin — the only
  Super-Admin-exclusive surface is platform administration.
- **Ministry Admin** (Julian): all ministry/operational data (shepherd care,
  launch planning, groups, people, calendar).
- **Over-Shepherd** (NEW login tier): scoped to **only the Shepherds they
  cover** (via `shepherd_coverage_assignments`). A focused care surface — a "My
  Shepherds" directory plus per-Shepherd care history, log-interaction, and
  follow-ups. Read **plus the ability to log broad care notes**. No launch
  planning, no full directory, no platform admin.
- **Shepherd** (`leader` / `co_leader`): gated off. No login, no leader-facing
  surface — for now.

**The one deliberate inversion — Private Care Notes.** A Ministry Admin's
private care notes (SC.4) are readable by their creator alone and are **not**
visible up the ladder — not even to the Super Admin. Visibility flows down the
ladder for operational data, but private-to-creator notes escape it entirely.
Over-Shepherds can never create or read private notes.

## Considered options

- **Strict superset with no exceptions** (Super Admin sees Private Care Notes
  too). Rejected: breaks the "readable by Julian alone" promise SC.4 exists to
  keep. Pastoral confidentiality outweighs a clean mental model.
- **Over-Shepherds reuse `ministry_admin`** instead of a new role. Rejected:
  no privacy boundary between coaches, and no row-scoping to their coverage.
- **Delete the leader surface** rather than gate it. Rejected: this is a
  deferral ("not for leaders _yet_"), not a permanent removal. Gating keeps the
  work recoverable cheaply; git history is not a substitute for a working,
  dormant surface.

## Consequences

- A new `over_shepherd` value joins the `user_role` enum, and the non-auth
  `over_shepherds` roster gains a bridge to an auth profile (likely by email).
- `leader` / `co_leader` logins are treated as no-access (like `staff_viewer`);
  `/leader/*` routes redirect; leader code stays dormant in the repo.
- The leader→admin reporting loop comes out together: with nobody submitting
  check-ins, `attendance_sessions` / `group_health_updates` stop receiving new
  data. The `/admin/check-ins` page and check-in-derived dashboard tiles
  (attendance rhythm, leader health pulse) are removed from nav; their code
  stays dormant.
- RLS must enforce the ladder downward AND the private-note exception upward,
  and must row-scope Over-Shepherds to their active coverage assignments.
- Over-shepherd login is additive and carries its own threat model (a coach
  seeing pastoral data); the private-note exception is the load-bearing
  guarantee that must hold under review.
