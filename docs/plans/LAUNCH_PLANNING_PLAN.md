# Launch Planning — Plan

Implementation plan for LP.1 / LP.2 in
[`PRODUCT_ROADMAP.md`](../PRODUCT_ROADMAP.md). LP.1 and LP.2 have shipped;
this plan remains the forward-looking reference for any extensions.

## Shipped — as-built summary

The detailed as-built specs are archived under
[`docs/archive/`](../archive/README.md) as
`LP_1_CAPACITY_LAUNCH_PLANNING.md` and `LP_2_FORECAST_SCENARIOS.md`.

**Route.** `/admin/launch-planning`.

**Storage.**
- LP.1 baseline assumptions: `app_settings.launch_planning` JSON row.
- LP.2 scenarios: `launch_planning_scenarios` table (named, editable
  scenarios; one marked `is_current`).

**RPCs.**
- `admin_update_launch_planning_assumptions(p_settings jsonb)` — LP.1.
- `admin_create_launch_planning_scenario`,
  `admin_update_launch_planning_scenario`,
  `admin_archive_launch_planning_scenario`,
  `admin_set_current_launch_planning_scenario` — LP.2.

Each writes a paired `audit_events` row in the same transaction; the
LP.1 audit row captures previous and new assumption JSON, so history is
reconstructable from the audit log.

**Helpers.** `lib/admin/launch-planning.ts` holds the pure
`computeLaunchPlan(assumptions, repoState)` plus
`decodeLaunchPlanningAssumptions()`. Capacity math reuses the existing
`effectiveCapacity()`, `capacityStatus()`, and
`isExcludedFromCapacityMetrics()` from `lib/admin/metrics.ts`; capacity
logic is **not** duplicated.

---

## Forward-looking plan

## 1. Purpose

Help Julian answer the question: **"Do I need to launch more Life Groups,
and when?"**

From Julian's feedback:

> If we have 10 groups and there's 100 people in the church, we might
> anticipate in August there being 20 more people who come, so I need to
> be ready to launch more groups.

LP.1 turns that mental math into a tool Julian can adjust and save.

## 2. Suggested route

`/admin/launch-planning`

## 3. Manual input model first

- All forecast inputs are **admin-entered**.
- **No church management system integration** in the MVP.
- **No automatic attendance ingestion** in the MVP.
- The MVP delivers value off Julian's own estimates plus what the app
  already knows about active groups and capacity.

## 4. Forecast assumptions

Editable by `super_admin` and `ministry_admin`. Defaults can be seeded.

- **Current church attendance** (manual).
- **Expected growth** (absolute number or % over the planning window).
- **Planning window / target date** (e.g. "by 2026-08-31").
- **Target group participation percentage** (what % of church attendees
  should be in a Life Group; e.g. 80%).
- **Average group size / capacity** (override of the default group
  capacity for forecasting math).
- **Launch buffer percentage** (how much headroom to keep above
  projected demand; e.g. 10%).
- **Leaders per group factor** (e.g. 2 — one leader + one co-leader).
- **Current active groups** (read from app data, not user-entered).
- **Current available seats** (read from app data using existing
  capacity helpers, not user-entered).

## 5. Outputs

Computed live as Julian edits assumptions.

- **Current capacity** — sum of effective capacities of active groups
  (excluding `exclude_from_capacity_metrics` groups, matching existing
  metric helpers).
- **Projected demand** — `(church_attendance + expected_growth) *
  target_participation_pct`.
- **Capacity gap** — `projected_demand - current_capacity` (positive
  number = need more groups).
- **Recommended new groups** —
  `ceil((projected_demand * (1 + launch_buffer_pct) - current_capacity) / avg_group_size)`,
  floored to zero. The buffer is applied to total projected demand (matching
  the § 4 definition of `launch_buffer_pct` as headroom above demand), so a
  zero-gap state still produces a recommendation when a non-zero buffer is
  configured.
- **Leader need** — `recommended_new_groups * leaders_per_group_factor`.
- **Launch timeline** — suggested launch milestone given the planning
  window (e.g. "Launch 2 by July to be ready for August demand").
- **Risk level** — one of:
  - **OK** — capacity gap ≤ 0.
  - **Watch** — gap > 0 but < buffer threshold.
  - **Launch Needed** — gap above buffer threshold.

## 6. Data model options

### Option A — Single JSONB row in `app_settings.launch_planning` (RECOMMENDED FOR MVP)

- One row in `app_settings` keyed by `setting_key = 'launch_planning'`,
  `setting_value` is a JSONB document of assumptions.
- Mirrors the existing `app_settings.metric_defaults` pattern
  (`BUILT_IN_METRIC_DEFAULTS` in `lib/admin/metrics.ts`).
- Pros: minimal schema; reuses existing settings infrastructure; one
  source of truth.
- Cons: not great for scenarios — but LP.2 introduces a dedicated
  scenarios table separately.

### Option B — `launch_planning_assumptions` table

- A typed table with one row per assumption set.
- Pros: cleaner typing; easier to extend.
- Cons: heavier migration; redundant for a single-row-of-truth MVP.

### Option C — Scenarios table

- Multi-row table with named scenarios.
- **Deferred to LP.2.** Not needed for the single-assumption-set MVP.

## 7. Recommended MVP

**Option A.** Use the existing `app_settings` pattern.

- One JSON row at `app_settings.setting_key = 'launch_planning'`.
- A decoder mirroring `decodeMetricDefaults()` in `lib/admin/metrics.ts`,
  living in a new `lib/admin/launch-planning.ts`.
- A single RPC: `admin_update_launch_planning_assumptions(<assumption
  fields>)` that updates the row and writes a paired `audit_events` row
  in the same transaction.
- **History reconstructable from audit metadata.** The audit row
  captures the previous and new assumption JSON, so we get a free
  history view without a separate audit table.

When LP.2 ships, scenarios live in their own table; the LP.1
assumption row may continue to exist as the "current/default" scenario
or be subsumed — that's a decision deferred to the LP.2 prompt.

## 8. What should be calculated from existing data

- **Active group count** — count of non-closed groups.
- **Effective capacity** — sum across active groups using the existing
  `effectiveCapacity()` helper in `lib/admin/metrics.ts`.
- **Available seats** — derived from current memberships against
  effective capacity.
- **Exclude-from-capacity behavior** — must respect
  `group_metric_settings.exclude_from_capacity_metrics` exactly as the
  admin dashboard does today.
- **Group capacity overrides** — respect
  `group_metric_settings.capacity_override` and the
  `app_settings.metric_defaults.default_group_capacity` fallback.

The launch-planning math **must not duplicate** capacity logic; it must
call into the existing helpers. Drift between the dashboard's capacity
buckets and the launch-planning page's "current capacity" would be a
correctness bug.

## 9. What should remain manual

- Current church attendance (no integration).
- Expected growth.
- Target participation percentage.
- Launch buffer percentage.
- Average group size override (for forecasting; defaults to the
  configured default group capacity).
- Leader readiness estimate (if surfaced; otherwise leader-need output
  is a count, not a readiness check).

## 10. Known limitations

- **Snapshot only.** LP.1 captures a single assumption set, not a
  history of forecasts over time.
- **No time-series modeling.** No seasonal curves, no week-by-week
  projection.
- **Guests not automatically included** in demand unless explicitly
  added to assumptions later.
- **Leader pipeline readiness is not tracked** in the MVP — the leader-
  need output is just a number, not a check against actual readiness.
- **No integrations.** No church management system, no attendance feed,
  no calendar sync.

## 11. Future scenario modeling (LP.2)

- A `launch_planning_scenarios` table with named, editable scenarios.
- Recommended starter set: **Conservative**, **Expected**, **Stretch**.
- One scenario can be marked **current** (the canonical one shown by
  default).
- Side-by-side comparison view.
- LP.2 adds RPCs for scenario CRUD with audit; SC.1 / LP.1's existing
  patterns carry over directly.

## 12. Suggested phased implementation prompts

Each item below is a self-contained prompt outline for a subsequent
implementation PR.

### LP.1A — Assumptions storage and decoder
- Decide A1 (`app_settings` JSON row) vs A2 (dedicated table). MVP =
  A1.
- Add a typed `LaunchPlanningAssumptions` shape in
  `lib/admin/launch-planning.ts`.
- Add a `decodeLaunchPlanningAssumptions()` mirror of
  `decodeMetricDefaults()`.
- Seed a default row.

### LP.1B — Pure calculation helpers
- Add `computeLaunchPlan(assumptions, repoState)` returning the
  computed outputs in § 5.
- Reuse `effectiveCapacity()`, `capacityStatus()`, and
  `isExcludedFromCapacityMetrics()` from `lib/admin/metrics.ts`. **Do
  not** duplicate capacity logic.
- Unit-test the helper against representative repo states (small / med
  / over-capacity ministry).

### LP.1C — Route UI
- Build `/admin/launch-planning` route, super_admin + ministry_admin
  only.
- Assumptions form with live computed outputs panel.
- Risk-level badge (OK / Watch / Launch Needed).
- Page header + body matching the existing warm-pastoral shell.

### LP.1D — Audit verification
- Confirm `admin_update_launch_planning_assumptions` RPC writes the
  matching `audit_events` row in the same transaction.
- Confirm the audit row captures both the previous and new assumption
  JSON.
- Add a verification checklist mirroring the existing phase
  verification doc style.

### LP.2 — Scenarios
- Add `launch_planning_scenarios` table.
- Add CRUD RPCs with audit.
- Add side-by-side comparison UI.
- Decide LP.1 single-row migration path (subsume into "current" scenario
  vs keep as default).
