# Retro — Admin IM 05 · Group health final filter logic (director sign-off)

_Admin Interaction Model PRD execution step 05 of 17 (#265), req 2 (gated filter
logic) / Open Question 1. Run after the gated slice landed on the step-04 shell
(intake → plan → execute → **retro** loop, PRD Sequencing step 2)._

## What shipped

The four director-confirmed triage filters now operate on the step-04 table
(`components/lg/admin/group-health-triage.tsx`) — still a review table, no
per-row save buttons, editing one group at a time in the EditingSurface drawer.

- **Not assessed** / **Needs rating** — unchanged from the shell. Per the
  sign-off, Needs rating is **missing-required-rating only**: the provisional
  "older than an interval" staleness clause was dropped, so a complete
  assessment never ages back into the filter.
- **Watch** — latest grade **at or below** the director's Watch threshold
  (default **C**) **OR** attendance **declining**.
- **Needs follow-up** — the assessment's `needs_follow_up` flag is set.

## Schema / write path (the flag is built, not faked)

- Migration `20260603120000_phase_gh3_group_health_follow_up.sql` adds
  `needs_follow_up boolean NOT NULL DEFAULT false` to `group_health_assessments`
  and **recreates** `admin_set_group_health_ratings` with a trailing
  `p_needs_follow_up boolean` (the prior overload is dropped first — a signature
  change can't be a create-or-replace). Same security envelope as #128:
  admin-only guard, SECURITY DEFINER, paired `audit_events` row, no service-role.
- The drawer **checkbox** persists on the existing "Save rating" save (same
  audited action), so there is no second save button. The all-empty no-op guard
  keys on the flag's **value** (not its presence — the action runner always lifts
  `needs_follow_up` into the payload): setting the flag is content worth saving,
  while a save with no ratings, no note, and the box unchecked is still rejected.
- **The flag carries across months.** The "Needs follow-up" filter reads each
  group's _latest_ assessment of any month (`listGroupHealthOverview`), so an
  open flag persists past a month boundary until cleared (director "latest
  assessment" / the drawer's "until the action is closed"). Both write paths keep
  this honest: the drawer checkbox defaults to the carried value and the recompute
  RPC (`admin_upsert_group_health_assessment`) inherits the latest flag when it
  creates a new month's row, so "Save grade only" can't silently reset it. (The
  cross-month read currently scans assessment rows newest-first and takes the
  first per group; a `distinct on` RPC is the optimization if history grows.)

## Director-tuned thresholds sourced from Settings (not hard-coded)

Both live in `app_settings.metric_defaults` (decoded in `lib/admin/metrics.ts`),
edited under Settings → **Advanced thresholds**, validated + bounded in the
recreated `admin_update_metric_defaults` RPC, and restored by
`admin_reset_metric_defaults`:

| Setting                                      | Default | Bounds     |
| -------------------------------------------- | ------- | ---------- |
| `group_health_watch_grade`                   | `C`     | A–D letter |
| `group_health_attendance_decline_margin_pct` | `10`    | 0–100 pts  |

## Declining attendance — honest two-window comparison

`attendanceTrend` (`lib/admin/group-health.ts`, unit-tested, no DB) compares the
**recent 4-week** average against the **prior 4-week** average inside the same
8-week window. Declining when recent is below prior by ≥ the decline margin.
**Insufficient data** (either 4-week window not fully recorded) → **not
declining** — the honest fallback the step-04 retro deferred, never an invented
trend. A stale per-group read (live attendance failed) is likewise reported as
not declining: there is no fresh window to compare.

## a11y

- Harness fixtures (`app/a11y-harness/harness-client.tsx`) gained the two new row
  signals (`needs_follow_up`, `attendance_declining`) and rows that exercise both
  Watch legs (grade-at-threshold and declining) and the follow-up flag.
- `tests/a11y/group-health.spec.ts` extended: the Watch and Needs-follow-up
  filter chips, and the drawer's follow-up checkbox carrying its group as
  record context (`Flag <group> as needing follow-up`), axe clean.
- `tests/a11y/settings.spec.ts` asserts the two new threshold fields render
  grouped, labelled, and inside the disclosure.

## Notes for the next slices

- The Watch threshold is a **letter** in otherwise-numeric `metric_defaults`; the
  RPC grew explicit string handling for it. A future "grade-like" setting can
  follow the same `jsonb_typeof = 'string'` + whitelist pattern.
- `attendanceTrend` is fixed to 4-week half-windows per the sign-off even though
  the attendance window itself is configurable; revisit if a director later wants
  the trend window to track the rubric's `attendance_window_weeks`.
