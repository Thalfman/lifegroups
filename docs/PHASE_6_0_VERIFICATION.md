# Phase 6.0 verification checklist

All steps below are read-only against the admin dashboard. Pre-existing
write surfaces (`/admin/people`, `/admin/groups`, `/admin/settings`,
`/admin/super-admin`) are out of scope for this phase but should still
work end-to-end.

## Automated checks

```
npm install
npm run lint
npm run typecheck
npm run build
```

All four commands should pass without errors.

## Security greps

Each grep below should return only legitimate matches.

| Grep                                                         | Expected                                                                                                                                                                                                                                |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `grep -rn "service_role\|SUPABASE_SERVICE\|sb_secret" .`     | No matches in app code. (`docs/`, migration `RAISE` statements, and seed scripts may legitimately mention the role for context — confirm no app/lib references.)                                                                         |
| `grep -rn "NEAR_CAPACITY_THRESHOLD" lib app components`      | No matches.                                                                                                                                                                                                                              |
| `grep -rn "0\.8\|0\.85" components/dashboard/admin`          | No matches.                                                                                                                                                                                                                              |
| `grep -ri "\.insert(" "app/(protected)/admin/" lib/`         | No matches inside `app/(protected)/admin/`. Existing write actions in `lib/admin/*` (for Phase 5A.1–5A.4 RPC wrappers) are pre-existing approved surfaces — `lib/admin/rpc.ts` only, never the dashboard.                                  |
| `grep -ri "\.update(" "app/(protected)/admin/" lib/`         | Same as above.                                                                                                                                                                                                                           |
| `grep -ri "\.delete(" "app/(protected)/admin/" lib/`         | Same as above.                                                                                                                                                                                                                           |
| `grep -ri "\.rpc(" "app/(protected)/admin/" lib/`            | Matches in `lib/admin/rpc.ts` and `lib/leader/rpc.ts` only (Phase 5A.1, 5A.2, 5A.3, 5A.4, 5B.0 RPC wrappers). No `.rpc(` from `app/(protected)/admin/page.tsx` or the dashboard components.                                                |

Phase 6.0 introduced no new RPC, RLS policy, migration, write action, or
service-role usage.

## Access control

| Step                                                                | Expected                                                                  |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Sign in as `super_admin`                                            | `/admin` and `/admin/super-admin` both load.                              |
| Sign in as `ministry_admin`                                         | `/admin` loads; `/admin/super-admin` redirects to `/unauthorized`.        |
| Sign in as `leader` or `co_leader`                                  | `/admin` redirects (via `requireAdmin()`); `/leader` continues to work.   |
| Visit `/admin` while signed out                                     | Redirected to `/login`.                                                   |

## Week selector

| Step                                                                | Expected                                                                                                              |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Load `/admin` with no `?week=` param                                | Defaults to the current church week (`America/Chicago` Monday).                                                       |
| Load `/admin?week=2026-05-11`                                       | Renders the May 11 week; selector reflects that value.                                                                |
| Load `/admin?week=garbage`                                          | Falls back to current week; selector resets; page renders without errors.                                             |
| Compare missing / submitted counts to `/admin/check-ins?week=…`     | Counts match for the same week (closed groups excluded; "missing" = no session OR `status = not_submitted`).          |

## Summary cards

For the selected week, each of the six cards reflects:

- **Active Groups** — count of `lifecycle_status = active`.
- **Submitted Check-Ins** — active groups with session `status ∈ {submitted, admin_entered}`.
- **Missing Check-Ins** — active groups with no session OR `status = not_submitted`.
- **Needs Follow-Up** — active groups where `effectiveHealthStatus = needs_follow_up` OR `group_health_updates.follow_up_needed = true`.
- **Capacity Watch** — active groups in `full` + `warning` capacity buckets (excludes the `excluded` bucket).
- **Unknown Capacity** — active groups in the `unknown` bucket.

## Metric defaults & overrides

| Step                                                                                                                                              | Expected                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `/admin/settings` → change `capacity_warning_threshold_pct` to 70                                                                                 | A group at 70% utilization moves into the `warning` bucket on `/admin` after refresh; summary `Capacity Watch` increments.          |
| `/admin/settings` → set `group_metric_settings.capacity_override` for a group                                                                     | `/admin` capacity bucket and utilization reflect the override; `/admin/groups` shows the same effective capacity.                   |
| `/admin/settings` → set `exclude_from_capacity_metrics = true` for a group                                                                        | Group appears in the `Excluded` bucket; is NOT counted in `Capacity Watch` / `Unknown Capacity`; capacity reasons drop from the attention queue. |
| `/admin/settings` → set `manual_health_status_override = needs_follow_up` for a group                                                             | Group appears in the `needs_follow_up` health bucket regardless of latest pulse; summary `Needs Follow-Up` increments.              |
| `/admin/settings` → set `default_group_capacity = 12`, leave a group without `capacity` and without `capacity_override`                            | Group's capacity displays as `12 (default)` with `capacitySource = default`; group does NOT appear in `Unknown Capacity` summary.   |
| Group with no `groups.capacity` AND no override                                                                                                   | Even when a global default exists, the group still surfaces in the "No capacity" setup gap (the default is a fallback, not config).  |

## Attention queue ordering

Sample sequence to exercise the priority ladder:

1. Open `/admin/people` → mark a group's leader inactive ⇒ `no_leader`
   attention row (priority 80).
2. Create a fresh group with no meeting day / time / members ⇒ row jumps
   to `no_members` / `missing_meeting_day_time`.
3. Set `groups.capacity = 10` and add 10 active members ⇒ row jumps to
   `capacity_full` (priority 30).
4. Trigger a leader health pulse of `needs_follow_up` for any group ⇒
   row jumps to `health_needs_follow_up` (priority 50).
5. Create an open follow-up linked to that group ⇒ row jumps to
   `follow_up_open` (priority 10). Secondary reasons remain visible as
   outline badges on the same row.

## Setup gaps

Create a fresh group with name only:

- Appears in **No capacity** (links to `/admin/settings`).
- Appears in **No leader** (links to `/admin/groups`).
- Appears in **Missing day/time** (links to `/admin/groups`).
- Appears in **No active members** (links to `/admin/groups`).

Fix each gap in turn and the group should disappear from that list while
remaining in the others.

## Health buckets

| Step                                                                                              | Expected bucket                          |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Leader submits a check-in with pulse `healthy`                                                    | `submitted` (also `healthy` aggregated)  |
| Leader submits with pulse `watch`                                                                 | `watch`                                  |
| Leader submits with pulse `needs_follow_up`                                                       | `needs_follow_up`                        |
| Leader submits with `follow_up_needed = true`                                                     | `needs_follow_up`                        |
| Leader marks `did_not_meet`                                                                       | `did_not_meet`                           |
| Leader marks `planned_pause`                                                                      | `planned_pause`                          |
| No session yet for the selected week                                                              | `missing`                                |
| Admin override `manual_health_status_override = watch`                                            | `watch` regardless of leader pulse       |

## Public preview

Visit `/admin-preview` without signing in:

- Page renders with `DataSourceBadge source="fallback"` and `PublicPreviewNotice`.
- All six summary cards render.
- Attention queue, capacity buckets (including `excluded`), health
  buckets, and setup-gaps lists all show example rows.
- No Supabase calls are made (verify by network panel).

## Cross-route smoke

After the above:

- `/admin/people` still loads.
- `/admin/groups` still loads.
- `/admin/settings` still loads and writes still succeed.
- `/admin/check-ins` still loads; the shared week selector matches `/admin`.
- `/admin/check-ins/[groupId]?week=…` still loads.
- `/admin/super-admin` still loads (super_admin only).
- `/leader` still loads (leader / co_leader).
- `/leader/[groupId]/checkin` still loads and submits.
- `/admin-preview`, `/leader-preview`, `/login` all still render.

## Pastoral copy

`/admin` page header reads:

```
Eyebrow:        Ministry command center
Title:          Life Groups,
TitleItalic:    this week.
Lede:           Review check-ins, capacity, health signals, and setup gaps
                so the next right follow-up is clear.
```

If any of those strings change, update this checklist.
