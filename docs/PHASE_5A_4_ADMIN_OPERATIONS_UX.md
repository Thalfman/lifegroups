# Phase 5A.4: Admin Operations UX + Metric Settings Foundation

Phase 5A.4 turns the admin pages into a coherent operations command center and
lays the metric-settings groundwork future dashboard logic will consume. It is
intentionally scoped: no dashboard rebuild, no guest pipeline, no SMS, no
exports, no formula editor. The phase delivers the polished admin shell, a
ministry-admin-safe role swap, a new `/admin/settings` route, and the
storage/RPC/helper layer that thresholds and overrides live in.

## What changed

### `/admin/people`
- Replaced the three stacked sections with a unified directory experience.
- New shared filter bar (search by name / email, status filter, type filter)
  drives both the Login profiles section and the Members section.
- Login profiles are clearly labelled; members carry a `Member · non-login`
  badge to make it obvious they don't sign in.
- Per-row inline "Change role" form swaps `leader` ⇄ `co_leader`. Other
  role transitions are not allowed from this screen.
- Members with no email render as `—` (no fake emails synthesized anywhere).
- Group assignment workflow (assign leader / co-leader / member) preserved.
- "Add new" forms live in their own section card under the directory so the
  page doesn't start with stacked forms.

### `/admin/groups`
- Replaced the bare list with a filterable directory: search by name /
  description / location, plus filters for lifecycle, health, and meeting day.
- Each group card now shows leader names (resolved from `group_leaders` +
  `profiles`), active-member count, capacity ("Unknown" when null), latest
  check-in status for the most recent meeting week, and an effective health
  badge that respects manual overrides.
- All data is batched: one query per resource, no N+1 per-group lookups.
  `fetchLatestMeetingWeek()` runs once and `fetchAttendanceSessions({
  meetingWeek })` joins client-side by `group_id`.
- Create / edit / close / reopen workflows preserved. Groups can still be
  created with just a name.

### `/admin/settings` (NEW)
- Ministry-admin-accessible page (`requireAdmin()`: super_admin OR
  ministry_admin; leaders, co-leaders, staff_viewer all denied).
- Global section: form for ministry-wide defaults — default group capacity,
  capacity warning %, capacity full %, check-in due day-of-week, missed
  check-in warning weeks, healthy attendance %.
- Per-group overrides section: pick a group from a dropdown to reveal the
  override form (capacity override, warning % override, healthy attendance %
  override, manual health status, exclude from capacity metrics, admin metric
  notes).
- "Currently overridden" summary list shows every group with active overrides
  and offers a per-group "Clear overrides" button (writes back through the
  upsert RPC with all nulls — no hard delete).

### Navigation
`navItemsForRole()` now emits `Settings` between `Check-Ins` and the
super-admin-only `Super Admin` link for both `super_admin` and
`ministry_admin`. Leaders / co-leaders / staff_viewer get nothing new.

## New database surface

Migration: `supabase/migrations/20260518100000_phase5a4_settings_and_role.sql`

### Table: `public.group_metric_settings`
- Keyed 1:1 by `group_id` (PK + `on delete cascade` FK to `groups`).
- Columns: `capacity_override`, `capacity_warning_threshold_pct_override`,
  `healthy_attendance_pct_override`, `manual_health_status_override`,
  `exclude_from_capacity_metrics` (default false), `admin_metric_notes`.
- CHECK constraints enforce the same bounds the RPC validates.
- RLS: enabled, **admin-only** SELECT via `public.auth_is_admin()`. The table
  holds `admin_metric_notes` so leaders / co-leaders must never read it.
- Grants: `grant select on public.group_metric_settings to authenticated`.
  No `insert`/`update`/`delete` grants — RLS is the access boundary and
  writes only flow through the SECURITY DEFINER RPC.
- `updated_at` maintained by the shared `set_updated_at()` trigger.

### Seed: `app_settings` `'metric_defaults'` row
- Inserted by the migration with the documented defaults.
- Repair-merge upsert (`EXCLUDED.setting_value || app_settings.setting_value`)
  so re-running the migration only fills in missing keys and never overwrites
  configured values.
- Existing `app_settings_auth_read` policy keeps the row readable by any
  authenticated user; writes still flow through the RPC.

### RPCs (SECURITY DEFINER, search_path locked)

| RPC | Purpose | Audit action |
|---|---|---|
| `admin_update_metric_defaults(p_settings jsonb)` | Whitelisted, per-key validated merge into `app_settings.metric_defaults`. Cross-field check enforces `capacity_full_threshold_pct ≥ capacity_warning_threshold_pct`. | `admin.update_metric_defaults` |
| `admin_upsert_group_metric_settings(...)` | Upserts a `group_metric_settings` row. Validates bounds. Clearing overrides = call with all nulls. | `admin.upsert_group_metric_settings` |
| `admin_change_leader_role(p_profile_id, p_new_role)` | Swap a target profile between `leader` and `co_leader`. Target's current role must already be `leader`/`co_leader` (`forbidden_target` otherwise); new role must be `leader`/`co_leader` (`invalid_role` otherwise). Self-target rejected. No-op short-circuits to `no_role_change`. **Does not touch `group_leaders` rows** — per-group role-in-group changes still go through `admin_assign_leader_to_group`. | `admin.change_leader_role` |

Error tokens, mapped to friendly UI copy by `lib/admin/action-result.ts`:
`insufficient_privilege`, `invalid_input`, `missing_settings`,
`missing_group`, `missing_profile`, `self_target_not_allowed`,
`forbidden_target`, `invalid_role`, `no_role_change`.

All three RPCs are `revoke all ... from public/anon/authenticated; grant
execute ... to authenticated`. The function bodies are the security
boundary.

## New / changed app code

### Helpers (pure, no I/O)
- `lib/admin/metrics.ts`: `decodeMetricDefaults`, `effectiveCapacity`,
  `effectiveCapacityWarningPct`, `effectiveCapacityFullPct`,
  `effectiveHealthyAttendancePct`, `capacityStatus`, `effectiveHealthStatus`,
  `isExcludedFromCapacityMetrics`, `hasActiveOverrides`, `missingCheckIn`,
  `unknownCapacity`. Built-in fallback defaults (`BUILT_IN_METRIC_DEFAULTS`)
  match the migration seed.

### Validation
- `lib/admin/validation.ts`: `validateMetricDefaultsPayload`,
  `validateGroupMetricSettingsPayload`, `validateChangeLeaderRolePayload`.
  Bounds mirror the RPC body so the UI surfaces a friendly message before
  hitting Supabase.

### Action result token
- `lib/admin/action-result.ts`: added `missing_settings` → "The settings
  record is missing. Refresh the page and try again." The existing
  `no_role_change` token already mapped to a friendly message; no-op role
  changes therefore surface as a toast instead of a raw token.

### RPC wrappers
- `lib/admin/rpc.ts`: `rpcAdminUpdateMetricDefaults`,
  `rpcAdminUpsertGroupMetricSettings`, `rpcAdminChangeLeaderRole`.

### Read models
- `lib/supabase/read-models.ts`: `fetchMetricDefaults`,
  `fetchAllGroupMetricSettings`, `fetchGroupMetricSettings`. Both per-group
  reads run against the admin-only RLS policy.

### Server actions
- `app/(protected)/admin/settings/actions.ts`: `adminUpdateMetricDefaults`,
  `adminUpsertGroupMetricSettings`. Both go through `requireAdminSession()`
  → validation → RPC → `mapRpcError` → `revalidatePath`.
- `app/(protected)/admin/people/actions.ts`: `adminChangeLeaderRole`.
  Reuses the existing form-payload pattern; `guardAgainstSelfTarget` runs
  as defense in depth.

### UI

| Path | Role |
|---|---|
| `app/(protected)/admin/settings/page.tsx` | New page. `requireAdmin()`. Loads defaults, groups, group_metric_settings; passes a typed `SettingsShellData` to `SettingsShell`. |
| `components/admin/settings-shell.tsx` | Layout for the settings page. Renders the defaults form, the per-group overrides form, and the active-overrides summary list with `ClearGroupMetricOverridesButton`. |
| `components/admin/forms/metric-defaults-form.tsx` | Number inputs + day-of-week select; submits only the changed keys (RPC merges). |
| `components/admin/forms/group-metric-overrides-form.tsx` | Group picker reveals a form pre-populated with current overrides; submits via the upsert RPC. |
| `components/admin/forms/clear-group-metric-overrides-button.tsx` | Confirmation + form that calls the upsert RPC with all nulls. |
| `components/admin/forms/change-leader-role-form.tsx` | Inline collapsible role swap form embedded in each leader / co_leader row. |
| `components/admin/people-directory.tsx` | New client component. Owns the filter state; renders both the login-profiles section and the members section with shared search/filter. |
| `components/admin/people-management-shell.tsx` | Refactored. Hosts the directory + an "Add new" cards section + the existing `GroupAssignmentsSection`. |
| `components/admin/groups-directory.tsx` | New client component. Filter bar + rich group cards with effective capacity/health, leader chips, latest check-in. |
| `components/admin/group-management-shell.tsx` | Refactored. Hosts the directory, the create form, and the closed-groups archive. |
| `components/admin/phase-5a4-notice.tsx` | New phase-banner component (mirrors prior phases). |
| `lib/auth/roles.ts` | `navItemsForRole` adds `Settings` for both admin roles, between Check-Ins and the super-admin-only link. |

Files removed (orphaned by the refactor): `phase-5a1-notice.tsx`,
`phase-5a2-notice.tsx`, `leader-profiles-section.tsx`,
`members-section.tsx`.

## Architecture parity

- No service role usage anywhere in app code.
- No new INSERT / UPDATE / DELETE RLS policies.
- All writes flow through narrow SECURITY DEFINER RPCs.
- Every RPC writes its data change AND its `audit_events` row in the same
  transaction; if the audit insert fails, the data change rolls back.
- No hard deletes. Clearing overrides means an upsert with all nulls; the
  `group_metric_settings` row persists.
- `audit_events` reads remain super_admin-only (Phase 5A.2 policy
  unchanged).
- `staff_viewer` remains compatibility-only — never promoted as a target
  role in any form or RPC.
- `super_admin` assignment remains blocked outside the documented bootstrap
  procedure (the new `admin_change_leader_role` cannot assign it at all).

## Out of scope (deferred to later phases)

Guest pipeline, follow-up task workflows, SMS, calendar, prayer requests,
reminders, notifications, exports, dashboard rebuild, custom formula
engine, advanced dashboard builder, mobile native work.
