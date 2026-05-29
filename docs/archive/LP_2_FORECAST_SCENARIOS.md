# LP.2 — Forecast Scenarios

Implementation reference for the LP.2 phase from
[`PRODUCT_ROADMAP.md`](../PRODUCT_ROADMAP.md) and
[`LAUNCH_PLANNING_PLAN.md`](../plans/LAUNCH_PLANNING_PLAN.md). Builds on
[`LP_1_CAPACITY_LAUNCH_PLANNING.md`](./LP_1_CAPACITY_LAUNCH_PLANNING.md).

## Purpose

Lets Julian author and compare multiple named launch-planning
scenarios — e.g. **Conservative**, **Expected**, **Stretch** — side by
side against the same already-known capacity facts (active groups,
effective capacity, participant counts). LP.1's baseline assumption
row stays as the canonical default; LP.2 adds *saved alternatives*.

## Route

`/admin/launch-planning`

- Page (extends LP.1): `app/(protected)/admin/launch-planning/page.tsx`
- Scenario server actions:
  `app/(protected)/admin/launch-planning/scenario-actions.ts`
- Scenario components:
  `components/admin/launch-planning/scenarios-panel.tsx`
  and `components/admin/launch-planning/scenario-form.tsx`.

## Role access

- ✅ `super_admin`
- ✅ `ministry_admin`
- ❌ `leader`
- ❌ `co_leader`
- ❌ `staff_viewer` (legacy / no access)
- ❌ Unauthenticated visitors

Enforced at the page (`requireAdmin()` → super_admin / ministry_admin
only), inside every scenario server action
(`requireAdminSession()`), and again inside each RPC body via
`auth_is_admin()`. Defense in depth.

## Relationship to LP.1 baseline assumptions

- The `app_settings.launch_planning_assumptions` row from LP.1 is
  **kept as-is** and continues to be the default forecast shown above
  the scenarios panel.
- Scenarios are *named alternatives*. They are not migrations of the
  baseline row; nothing about LP.1 is removed.
- "Make current" on a scenario does **not** rewrite the baseline row.
  The baseline form still saves to `app_settings`. The current
  scenario is highlighted in the scenarios panel and in the comparison
  table but does not replace the baseline display.
- If no scenarios exist, the page behaves exactly like LP.1 plus an
  empty-state CTA: *"Create scenario from current assumptions."*

## Data model

### Table: `launch_planning_scenarios`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid | primary key, default `gen_random_uuid()` |
| `name` | text not null | trimmed; 1–120 characters |
| `description` | text null | trimmed; 0–1000 characters |
| `assumptions` | jsonb not null | mirrors LP.1 assumption shape |
| `is_current` | boolean not null default false | partial unique among non-archived rows |
| `archived_at` | timestamptz null | soft-archive timestamp |
| `created_by` | uuid null → `profiles(id)` on delete set null | |
| `updated_by` | uuid null → `profiles(id)` on delete set null | |
| `created_at` | timestamptz default `now()` | |
| `updated_at` | timestamptz default `now()` | bumped by each RPC |

Constraints:

- `name` must be 1–120 characters after `btrim`.
- `description` must be ≤ 1000 characters or null.
- `assumptions` must be a JSON object (not an array, not a scalar).
- Partial unique index `launch_planning_scenarios_one_current` ensures
  at most one row has `is_current = true and archived_at is null`.

The stored `assumptions` JSONB uses the same shape as the LP.1
baseline:

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

Per-field bounds match LP.1 (validated in
`lib/admin/validation.ts` and the SQL helper
`lp2_validate_scenario_assumptions`):

| Field | Type | Range |
| --- | --- | --- |
| `current_church_attendance` | int | 0–100000 |
| `expected_growth` | int | −100000–100000 |
| `expected_growth_date` | `YYYY-MM-DD` or null | real calendar date |
| `target_group_participation_pct` | number | 0–1 |
| `average_group_size` | int | 1–500 |
| `launch_buffer_pct` | number | 0–0.95 |
| `leaders_per_new_group` | int | 0–10 |
| `notes` | string or null | ≤ 2000 chars, trimmed |

### RLS

- RLS enabled on `launch_planning_scenarios`.
- One `SELECT` policy gated by `public.auth_is_admin()`. `staff_viewer`
  and leader roles cannot see scenarios.
- **No** INSERT / UPDATE / DELETE table policies. All writes flow
  through the SECURITY DEFINER RPCs below.

## RPCs

Migration:
`supabase/migrations/20260518200000_phase_lp2_launch_planning_scenarios.sql`.

Every RPC is `SECURITY DEFINER`, granted to `authenticated` only, and
verifies the caller is an active admin via `auth_is_admin()` inside the
function body. Every write pairs with an `audit_events` insert in the
same transaction.

### 1. `admin_create_launch_planning_scenario(p_name, p_description, p_assumptions, p_make_current)`

Inserts a new scenario.

- Validates `p_name` (1–120 chars, trimmed) and `p_description`
  (≤ 1000 chars).
- Validates `p_assumptions` via `lp2_validate_scenario_assumptions`,
  which mirrors the LP.1 RPC's per-key bounds.
- If `p_make_current` is true, unsets `is_current` on the existing
  current scenario in the same transaction before insert so the
  partial unique index doesn't block the write.
- Records actor as `created_by` / `updated_by`.
- Returns the new scenario's uuid.

Audit action token: `admin.create_launch_planning_scenario`.

### 2. `admin_update_launch_planning_scenario(p_scenario_id, p_name, p_description, p_assumptions, p_make_current)`

Replaces the scenario's editable fields.

- Rejects archived scenarios with `scenario_archived`.
- Validates inputs the same way as create.
- If `p_make_current` is true and the scenario isn't currently the
  current one, clears `is_current` on every other non-archived
  scenario in the same transaction.
- Stamps `updated_by` and bumps `updated_at`.

Audit action token: `admin.update_launch_planning_scenario`.

### 3. `admin_archive_launch_planning_scenario(p_scenario_id)`

Soft-archives a scenario.

- Sets `archived_at = now()`.
- Clears `is_current` so the partial unique index can later allow a
  fresh current scenario.
- Stamps `updated_by` / `updated_at`.
- Returns the archived scenario's id.

Audit action token: `admin.archive_launch_planning_scenario`.

### 4. `admin_set_current_launch_planning_scenario(p_scenario_id)`

Marks the named scenario current.

- Rejects archived scenarios with `scenario_archived`.
- Clears `is_current` on every other non-archived scenario in the
  same transaction, then sets `is_current = true` on the target.
- Stamps `updated_by` / `updated_at`.

Audit action token: `admin.set_current_launch_planning_scenario`.

### Error tokens

| Token | Friendly message (action-result.ts) |
| --- | --- |
| `insufficient_privilege` | sign-in / role banner |
| `invalid_input` | "Some required fields are missing or malformed." |
| `missing_scenario` | "We couldn't find that scenario. Refresh the page and try again." |
| `scenario_archived` | "That scenario is archived. Restore or duplicate it before editing." |

## Privacy model

- Admin-only end-to-end. Leaders, co-leaders, and `staff_viewer` never
  read or write scenario rows. No leader page imports the scenario
  read models or components.
- Per-scenario `assumptions.notes` is admin-only freeform context. The
  audit row stores `has_notes` (boolean) only — never the body. Both
  the SQL helper `lp2_redact_assumptions_for_audit` and the
  TypeScript helper `redactNotesForAudit` enforce this; tests assert
  that the notes string never appears in serialized audit metadata.
- Notes bodies are also never written to the observability logs
  produced by `startActionLog` (the action only records a
  `has_notes_field` boolean diagnostic).

## Computation model

LP.2 reuses the LP.1 pure helpers in `lib/admin/launch-planning.ts`:

- `decodeLaunchPlanningAssumptions(row, metricDefaults?)` decodes the
  scenario's `assumptions` JSON, falling back to the configured
  metric default group capacity for missing `average_group_size`.
- `computeLaunchPlan(assumptions, inputs)` produces the launch-plan
  outputs (projected demand, capacity gap, recommended new groups,
  risk level, suggested launch date).
- `buildScenarioComparison(scenarios, inputs)` zips each scenario with
  its computed outputs against the shared capacity inputs (active
  groups, overrides, memberships).

Capacity math is **never duplicated**: scenarios always pass through
the same `LaunchPlanningInputs` derived from the existing
`effectiveCapacity()` and `isExcludedFromCapacityMetrics()` helpers in
`lib/admin/metrics.ts`, so the dashboard's capacity number and each
scenario's "effective capacity" column always match.

## Compare-scenarios behavior

The comparison table at the bottom of `/admin/launch-planning`:

- Includes a **Baseline** column (the LP.1 assumptions) so operators
  see the canonical default next to the saved alternatives.
- Includes a column for **every active (non-archived) scenario**.
- Shows the **current** scenario badge in the column header so it's
  obvious which alternative is the canonical one.
- Rows surfaced per scenario:
  - Attendance
  - Expected growth
  - Projected demand
  - Effective capacity (shared across all scenarios)
  - Capacity gap
  - Recommended new groups
  - Estimated new leaders
  - Risk level

Effective capacity does not vary between scenarios because it is read
from the same live group data — that's intentional. The forecast
differences come from the assumption inputs, not from capacity drift.

## Audit behavior

Each scenario RPC writes a paired `audit_events` row in the same
transaction (atomic via the function body). Metadata shape:

```json
{
  "before": { "name": "Expected", "is_current": false, ... },
  "after":  {
    "name": "Expected",
    "has_description": true,
    "is_current": true,
    "assumptions": { ...numeric fields..., "has_notes": false }
  }
}
```

- `name` appears in metadata (operators expect it in the audit feed).
- `description` is recorded as `has_description: boolean` only —
  never the body.
- `assumptions` are passed through
  `lp2_redact_assumptions_for_audit`, which strips the freeform
  `notes` field and adds `has_notes: boolean`.

Friendly audit summaries are rendered by
`components/admin/audit-trail-section.tsx` for:

- `admin.create_launch_planning_scenario`
- `admin.update_launch_planning_scenario`
- `admin.archive_launch_planning_scenario`
- `admin.set_current_launch_planning_scenario`

No notes body is ever surfaced in those summaries.

## Known limitations

- **Single-point estimates only.** Each scenario captures one snapshot
  set; LP.2 does not support per-scenario time-series modeling.
- **No leader-readiness check.** The leader-need output is still just
  `recommended_new_groups * leaders_per_new_group`. It is not checked
  against an actual leader pool.
- **No duplication helper yet.** "Create scenario" seeds from the
  baseline assumptions, not from another scenario.
- **No exports.** Scenarios live inside the admin UI.
- **No leader / public visibility.** Per the LP.2 product brief.
- **No church-management or attendance-feed integration.** Inputs are
  manual.

## Manual verification checklist

1. Log in as `super_admin` → `/admin/launch-planning` renders the
   form, summary cards, recommendation panel, and the new scenarios
   panel.
2. Log in as `ministry_admin` → same view.
3. Log in as `leader` → access denied by `requireAdmin()`.
4. Log in as `co_leader` → denied.
5. Log in as `staff_viewer` → denied.
6. Baseline LP.1 form still loads with seeded defaults and persists
   edits after a hard reload.
7. With no scenarios saved, the scenarios panel shows the empty-state
   CTA (*"Create scenario from current assumptions."*).
8. **Conservative**: create a scenario named "Conservative", set
   participation 0.5 and buffer 0.1, save.
9. **Expected**: create a scenario named "Expected" with the
   baseline assumptions, **Mark as current** checked.
10. **Stretch**: create a scenario named "Stretch" with
    participation 0.8, growth 60, buffer 0.2.
11. Scenarios panel shows all three; **Expected** shows the
    "Current" badge.
12. Select **Stretch**, click **Make current** → toast confirms.
    The "Current" badge moves from **Expected** to **Stretch**;
    no other scenario shows the badge.
13. Edit **Expected**: change participation to 0.65, save. The
    scenarios list updates; the comparison table reflects the new
    projected demand and recommended new-groups count.
14. Archive **Conservative**. It disappears from the scenarios list
    and the comparison table. The comparison still has Baseline,
    Expected, Stretch columns.
15. Query `audit_events` filtered to
    `action LIKE 'admin.%launch_planning%'`. Verify:
    - The scenario-create rows include `metadata.after.name`
      and `metadata.after.assumptions.has_notes` (boolean) but
      **never** the `notes` string body.
    - The scenario-update row's `before.assumptions` and
      `after.assumptions` both expose `has_notes` only.
    - The set-current and archive rows include `name` for context.
16. Admin audit summaries in
    `/admin/super-admin` show friendly labels
    (e.g. "Made launch scenario Stretch current",
    "Archived launch scenario Conservative") instead of raw
    action tokens.
17. Numeric forecasts in the comparison table line up with manual
    math: e.g. with attendance 200, growth 50, participation 0.6,
    buffer 0.15, average size 10, capacity 100, the recommended-new-
    groups column reads **8** (matching LP.1's example case).
18. `/admin/settings`, `/admin/groups`, `/admin/shepherd-care`,
    `/admin/super-admin`, and `/leader` all still work; no
    regressions.
19. Mobile viewports at 390 px and 430 px: the scenarios list,
    comparison table, and forms collapse to a single column with no
    horizontal overflow.

## Future follow-ups

- **Scenario duplication.** "Save as new scenario from selected" so
  Julian can fork Expected → Aggressive Expected without retyping
  every field.
- **Attendance trend imports.** Optional ingestion of attendance
  data so `current_church_attendance` is not purely manual.
- **Leader-readiness pipeline.** Surface the actual leader pool size
  next to `estimated_new_leaders_needed` (per scenario).
- **Exports.** PDF / spreadsheet export of a chosen scenario or the
  full comparison table for sharing with elders.
- **Comms-director views.** Read-only mirror of the recommendation
  scoped to communications staff — only if Julian explicitly
  requests it.
