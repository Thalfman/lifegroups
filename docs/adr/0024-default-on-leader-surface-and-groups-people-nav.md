# Leader surface and the Groups/People nav tabs default to ON

**Status:** Accepted

The 2026-06 pivot (ADR 0016) hid the Groups and People tabs behind
nav-visibility flags and left the Leader login frozen behind the
`leader_surface` verify-before-flip gate (ADR 0009/0017). Both were the right
posture while the Care · Plan · Multiply spine landed — and both had become
the wrong default: the Ministry Admin had no nav path to the (fully built)
group and people management surfaces, and Leaders could not sign in to write
the group-scoped Care Notes ADR 0020 built for them.

## Decision

Seed migration `20260701020000` deep-merges three flags to enabled in
`platform_config.feature_flags`:

- **`leader_surface.enabled = true`.** This is a flip of an
  **already-verified** surface, squarely inside ADR 0009's rules: the
  verify-before-flip checkpoint happened in migration `20260608040000`, which
  set `verified = true` in the same migration as the re-audited guards
  (`requireLeader` / `requireLeaderActor` consult the flag; leader RLS
  re-asserted group-scoped; check-ins decoupled behind their own `check_ins`
  gate, which **stays off**). `resolveFlag` = enabled AND verified, so the
  surface is now live: leaders land on `/leader` and can write group Care
  Notes / Prayer Requests.
- **`nav_show_groups.enabled = true`** and **`nav_show_people.enabled =
true`.** The management surfaces (`/admin/groups` + per-group detail,
  `/admin/people` + per-person detail) have existed all along and always
  resolved by direct URL (ADR 0008/0009); they return to the admin nav spine.
  `nav_show_planning` deliberately stays off.

This amends ADR 0016's hidden-by-default posture for Groups/People and
completes ADR 0017's "until the flag flips" for the Leader login.

## What does NOT change

- **The console keeps the off-switch.** All three flags remain Super-Admin
  toggles; `super_admin_set_platform_config`'s per-flag deep-merge
  (`20260627010000`) means flipping `enabled` off never clobbers
  `leader_surface.verified`, so a later re-enable needs no re-verification.
- **The fail-safe stays closed.** The code-level default with no flag config
  (demo routes, a failed flag read) still hides the flagged tabs
  (`DEFAULT_HIDDEN_ADMIN_AREAS`) and still freezes the leader surface
  (`read_frozen_surface_flag` fails closed). The seed widens nothing on error
  paths.
- The seed writes a paired `audit_events` row
  (`system.default_on_flags`, actor null) — the same audit-critical treatment
  `system.verify_leader_surface_flag` set the precedent for.

## Consequence: the revived surfaces pay their design-system debt

`docs/ui-followups.md` §1 deferred the Tailwind/design-system migration of the
hidden surfaces "until a surface un-freezes — migrate it in the PR that
revives it." Groups, People, and the person/group detail pages are revived by
this decision, so the same change-set migrates them to the PR #500 idiom
(PageHeader/Card/Button/Badge kit, pill tabs, shared field classes) and
updates the debt ledger. The master calendar, guests, planning, launch
planning, and capacity board remain frozen and keep their deferred debt.
