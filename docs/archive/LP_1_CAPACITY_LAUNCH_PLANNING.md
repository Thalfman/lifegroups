# LP.1 — Capacity & Launch Planning MVP

Implementation reference for the
[`LAUNCH_PLANNING_PLAN.md`](./LAUNCH_PLANNING_PLAN.md) LP.1 phase
("Assumptions storage + decoder + pure calculation + route UI + audit
verification"). Read alongside the plan; this document is the as-built
spec.

## Purpose

Help Julian answer the question: **"Do I need to launch more Life
Groups, and when?"** by combining:

- Editable forecast assumptions (church attendance, expected growth,
  participation %, buffer, etc.).
- Already-computed capacity facts read from existing app data (active
  group count, effective capacity, participants, excluded groups,
  unknown-capacity groups).
- A small, deterministic calculation that produces a recommendation,
  a capacity gap, a new-group count, a new-leader count, a risk level
  (OK / Watch / Launch Needed), and (when a date is set) a suggested
  launch milestone.

## Route

`/admin/launch-planning`

- Page: `app/(protected)/admin/launch-planning/page.tsx`
- Server action: `app/(protected)/admin/launch-planning/actions.ts`
  → `adminUpdateLaunchPlanningAssumptions`
- Components: `components/admin/launch-planning/{summary-cards,
  assumptions-form, results-panel, setup-warnings}.tsx`
- Nav entry: added to the `shepherd` group in
  `lib/auth/roles.ts` (`adminNavGroups`).

## Role access

- ✅ `super_admin`
- ✅ `ministry_admin`
- ❌ `leader`
- ❌ `co_leader`
- ❌ `staff_viewer` (legacy / no access)
- ❌ Unauthenticated visitors

Enforced at the page level via `requireAdmin()` (the same guard
`/admin/settings` and `/admin/shepherd-care` use) and again inside the
RPC via `auth_is_admin()`.

## Data sources

Reads only — no writes outside the RPC.

- `app_settings` row keyed `launch_planning_assumptions` — the
  editable JSONB document.
- `app_settings` row keyed `metric_defaults` — used to default
  `average_group_size` from the ministry-wide capacity setting.
- `groups` — for the active-group count.
- `group_metric_settings` — for capacity overrides and the
  `exclude_from_capacity_metrics` flag.
- `group_memberships` (status = `active`) — for current participant
  counts.

All read paths use explicit column allowlists. The new
`fetchLaunchPlanningAssumptions` helper uses
`"id, setting_key, setting_value, created_at, updated_at"` — no
`select("*")` on launch-planning paths.

## Assumptions model

Stored as a single JSONB document in `app_settings.setting_value`. Shape:

```json
{
  "current_church_attendance":       100,
  "expected_growth":                 20,
  "expected_growth_date":            null,
  "target_group_participation_pct":  0.60,
  "average_group_size":              10,
  "launch_buffer_pct":               0.15,
  "leaders_per_new_group":           2,
  "notes":                           null
}
```

Bounds (enforced both in `lib/admin/validation.ts` and the RPC body):

| Field | Type | Range |
| --- | --- | --- |
| `current_church_attendance` | int | 0–100000 |
| `expected_growth` | int | −100000–100000 |
| `expected_growth_date` | `YYYY-MM-DD` or null | real calendar date |
| `target_group_participation_pct` | number | 0–1 |
| `average_group_size` | int | 1–500 |
| `launch_buffer_pct` | number | 0–0.95 |
| `leaders_per_new_group` | int | 0–10 |
| `notes` | string or null | ≤ 2000 chars |

The `launch_buffer_pct` upper bound is strict at 0.95 so the
`(1 − buffer)` denominator in `computeLaunchPlan` can never reach
zero.

## Computation model

Pure helpers in `lib/admin/launch-planning.ts`. No I/O.

1. `decodeLaunchPlanningAssumptions(row, metricDefaults?)` — read the
   stored JSONB into a typed shape. Falls back to
   `metric_defaults.default_group_capacity` for `average_group_size`
   when the stored row omits it.
2. `buildLaunchPlanningInputs({ groups, overrides, memberships,
   metricDefaults })` — aggregate already-fetched rows. Reuses
   `effectiveCapacity()` and `isExcludedFromCapacityMetrics()` from
   `lib/admin/metrics.ts` so capacity math never drifts from the rest
   of the admin dashboard. Produces:
   - `active_group_count` — `lifecycle_status === "active"` only.
   - `excluded_active_group_count` — counted but excluded from the
     capacity / participant totals.
   - `unknown_capacity_group_count` — active, not-excluded, but no
     effective capacity. Contributes 0 to `effective_total_capacity`.
   - `effective_total_capacity`, `current_participants`,
     `available_seats`.
3. `computeLaunchPlan(assumptions, inputs)` — the deterministic
   forecast:
   - `projected_total_attendance = current_church_attendance + expected_growth`
   - `projected_group_demand = projected_total_attendance × target_group_participation_pct`
   - `target_capacity_with_buffer = projected_group_demand / (1 − launch_buffer_pct)`
   - `capacity_gap = target_capacity_with_buffer − effective_total_capacity`
   - `recommended_new_groups = ceil(max(0, capacity_gap) / max(1, average_group_size))`
   - `estimated_new_leaders_needed = recommended_new_groups × leaders_per_new_group`
   - `suggested_launch_by_date` — 30 days before
     `expected_growth_date` when one is set and `recommended_new_groups
     > 0`; otherwise `null`.

## Risk level rules

| Level | Condition |
| --- | --- |
| **OK** | `recommended_new_groups === 0` |
| **Watch** | `recommended_new_groups > 0` AND `capacity_gap ≤ projected_group_demand × launch_buffer_pct` (gap fits inside the configured buffer headroom) |
| **Launch Needed** | otherwise |

The intuition: **Watch** means the model recommends a launch as a
precaution because the gap sits inside your buffer reserve. **Launch
Needed** means projected demand will overrun configured capacity even
after the buffer.

## RPC and audit behavior

Migration: `supabase/migrations/20260518190000_phase_lp1_launch_planning.sql`.

- `admin_update_launch_planning_assumptions(p_settings jsonb)` is
  `SECURITY DEFINER`, locked to `authenticated`, and:
  1. Verifies `auth_is_admin()` (super_admin or ministry_admin).
  2. Validates each submitted key in PL/pgSQL against the bounds
     above. Unknown keys raise `invalid_input`.
  3. Locks the `app_settings` row, merges submitted keys onto the
     stored row, and writes the result.
  4. Writes a paired `audit_events` row in the same transaction so
     either both succeed or both roll back.
- Action token: `admin.update_launch_planning_assumptions`.
- Audit metadata shape:
  ```json
  {
    "before": { "current_church_attendance": …, …, "has_notes": false },
    "after":  { "current_church_attendance": …, …, "has_notes": true  },
    "submitted_keys": ["current_church_attendance", "notes"]
  }
  ```
- The `notes` body is stripped from both `before` and `after` before
  the audit row is written; a `has_notes` boolean takes its place.
  This is enforced inside the RPC, not just in the TypeScript layer —
  see lines `v_before_redacted` / `v_after_redacted` in the migration.

## Privacy model

- Admin-only end-to-end. No leader payload reads or writes touch the
  `launch_planning_assumptions` row, the RPC, or any of the
  components in `components/admin/launch-planning/`.
- `notes` is admin-only freeform context. It:
  - never appears in audit metadata,
  - never appears in observability logs (the action only records a
    `has_notes_field` boolean diagnostic indicating whether the
    submitted payload included a notes key, not its content),
  - is excluded from any future leader read model by construction
    (leader read-models never query `setting_key = 'launch_planning_assumptions'`).

## Known limitations

- **Snapshot only.** LP.1 captures a single assumption set, not a
  history of forecasts over time. History is reconstructable from
  `audit_events` but no UI surfaces it.
- **No time-series modeling.** No seasonal curves, no week-by-week
  projection.
- **Guests not automatically included** in demand unless an admin
  bakes them into `current_church_attendance` / `expected_growth`.
- **Leader pipeline readiness is not tracked.** The leader-need
  output is just a number; it is not checked against actual leader
  availability.
- **No integrations.** No church management system, no attendance
  feed, no calendar sync.
- **Single ministry default for average group size.** Per-group
  forecast tuning lands in LP.2 (scenarios).

## Manual verification checklist

1. Log in as `super_admin` → `/admin/launch-planning` renders the
   form, summary cards, and recommendation panel.
2. Log in as `ministry_admin` → page renders.
3. Log in as `leader` → access is denied by `requireAdmin()`.
4. Log in as `co_leader` → denied.
5. Log in as `staff_viewer` → denied.
6. With no prior writes, the form loads with the seeded defaults
   (attendance 100, growth 20, participation 0.6, etc.).
7. Save changes → the success toast appears and the values persist
   after a hard reload.
8. Query `audit_events` for the action
   `admin.update_launch_planning_assumptions`. Verify:
   - `metadata.before` and `metadata.after` contain numeric values
     for each assumption key (and a `has_notes` boolean).
   - `metadata.submitted_keys` lists exactly the keys the form
     posted.
   - **No `notes` string** appears anywhere in the metadata, even
     when the operator saved a non-empty note.
9. Summary cards update after save. Toggling `expected_growth`,
   `launch_buffer_pct`, or `effective_total_capacity` (via group
   capacity changes in `/admin/settings`) transitions the risk
   badge OK → Watch → Launch Needed.
10. Recommended-new-groups math: e.g. with attendance 200, growth 50,
    participation 0.6, buffer 0.15, avg size 10, and capacity 100,
    the page should show `Recommended new groups = 8`.
11. `/admin/settings`, `/admin/groups`, `/admin/shepherd-care`, and
    `/leader` still work; no regression in any of them.
12. Mobile viewports at 390 px and 430 px have no horizontal
    overflow (the form grid and summary cards collapse to a single
    column).

## Future follow-ups

- **LP.2 — Saved scenarios.** Add a `launch_planning_scenarios`
  table with named scenarios (Conservative / Expected / Stretch), a
  "current" flag, and side-by-side comparison. The LP.1 single row
  may be subsumed into "current scenario" or kept as the seed
  default — decided at LP.2 implementation time.
- **Leader pipeline / readiness.** Surface actual leader pool size
  next to `estimated_new_leaders_needed`.
- **Attendance trend imports.** Optional ingestion of attendance
  trend data so `current_church_attendance` is not purely manual.
- **Exports.** PDF / spreadsheet export of the recommendation for
  sharing with elders.
- **Comms-director views.** Read-only mirror of the recommendation
  scoped to communications staff — only if Julian explicitly
  requests it.
