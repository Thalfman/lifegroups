# Phase 6.0 — Admin Dashboard Metrics Integration

## Context

Phase 5A.4 introduced the metric settings foundation — the seeded
`app_settings.metric_defaults` row, the admin-only `group_metric_settings`
table, and the pure helpers in `lib/admin/metrics.ts`
(`decodeMetricDefaults`, `effectiveCapacity`, `capacityStatus`,
`effectiveHealthStatus`, `isExcludedFromCapacityMetrics`,
`hasActiveOverrides`, `missingCheckIn`). The settings page lets admins
configure ministry-wide thresholds and per-group overrides, but the
`/admin` dashboard itself still computed capacity and health using
hardcoded thresholds (`NEAR_CAPACITY_THRESHOLD = 0.8`, raw `group.capacity`,
raw `health.pulse`) and ignored those settings entirely.

Phase 6.0 turns `/admin` into Julian's ministry command center by routing
every dashboard signal through the 5A.4 helpers, adding a current-week
selector, and surfacing a prioritized action list — all read-only, with
no new migrations, no service role, and no new write workflows.

## What changed

### Read-only refactor

`/admin` now answers Julian's six command-center questions at a glance:

1. How are the Life Groups doing this week?
2. Which groups need attention?
3. Which groups are missing check-ins?
4. Which groups are near or over capacity?
5. Which groups have unknown or incomplete setup data?
6. What should I look at first?

There is no new write workflow, no new RLS, no new RPC, and no new
migration. Every existing admin write surface (`/admin/people`,
`/admin/groups`, `/admin/settings`, `/admin/super-admin`) remains
unchanged.

### URL parameter: `?week=YYYY-MM-DD`

`/admin` reuses the existing helpers from `lib/admin/check-ins.ts`:

- `validateWeekParam(raw, now)` — normalizes the URL parameter to a
  Monday-ISO date. Invalid input falls back to the current church week
  (`America/Chicago`).
- `buildWeekOptions(now)` — returns the last 8 Mondays, with the current
  week labelled "this week".

The week selector is now a shared component
(`components/admin/week-selector.tsx`) used by both `/admin` and
`/admin/check-ins`, so the visual stays identical across surfaces.

### New dashboard model

`AdminDashboardData` (in `lib/dashboard/types.ts`) was rewritten as:

```
AdminDashboardData {
  meetingWeek           string             // ISO Monday
  weekLabel             string             // "Week of May 18, 2026"
  isCurrentWeek         boolean
  summary               AdminSummary       // 6 KPI numbers
  attentionItems        AttentionItem[]    // prioritized action list
  capacitySummary       CapacitySummary    // full/warning/ok/unknown/excluded
  healthSummary         HealthSummary      // 7-bucket weekly partition
  setupGaps             SetupGaps          // no leader / day / time / capacity / members
  guestPipelineCount    number             // preserved
  guestPipelineBreakdown PipelineStageCount[] // preserved
  followUps             FollowUpItem[]     // preserved
}
```

The previous `CapacityRow / CapacityOverview / GroupHealthRow` types are
gone. Guest pipeline and follow-ups are preserved unchanged.

### Six summary cards (`SummaryCards`)

| Card                 | Definition                                                                                          |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| Active Groups        | groups with `lifecycle_status = active`                                                             |
| Submitted Check-Ins  | active groups with `attendance_sessions.status in {submitted, admin_entered}` for the selected week |
| Missing Check-Ins    | active groups with no session OR `status = not_submitted` for the selected week                     |
| Needs Follow-Up      | active groups with effective health = `needs_follow_up` OR `group_health_updates.follow_up_needed`  |
| Capacity Watch       | groups in `full` + `warning` capacity buckets (excludes the `excluded` bucket)                      |
| Unknown Capacity     | groups in the `unknown` capacity bucket                                                             |

### Attention queue (`AttentionList`)

One row per group, primary reason wins; secondary reasons surface as
outline badges. Priority ladder (lower number = more urgent):

| Reason                       | Priority |
| ---------------------------- | -------- |
| follow_up_open               | 10       |
| missing_check_in             | 20       |
| capacity_full                | 30       |
| capacity_warning             | 40       |
| health_needs_follow_up       | 50       |
| health_watch                 | 60       |
| capacity_unknown             | 70       |
| no_leader                    | 80       |
| no_members                   | 90       |
| missing_meeting_day_time     | 100      |

`exclude_from_capacity_metrics = true` suppresses only the three capacity
reasons; the group still surfaces for follow-ups, missing check-ins,
no-leader, etc. Closed groups never appear.

Each row links to `/admin/check-ins/[groupId]?week=...`,
`/admin/groups`, and (for capacity-related reasons) `/admin/settings`.

### Capacity section (`CapacitySection`)

Five buckets keyed off `capacityStatus(...)`:

- **Full** — utilization ≥ effective full threshold (default 100%)
- **Near capacity** — utilization ≥ effective warning threshold (default 80%)
- **OK** — below warning threshold
- **Unknown capacity** — no override, no group capacity, no global default
- **Excluded from capacity metrics** — `exclude_from_capacity_metrics = true`

Each row shows active member count, effective capacity, utilization %,
and capacity source (`Group override` · `Group capacity` · `Global default` · `Unknown`).

### Weekly health section (`HealthSection`)

Seven buckets, with precedence so each group lands in exactly one:

1. `needs_follow_up` (effective health OR `group_health_updates.follow_up_needed`)
2. `watch` (effective health)
3. `planned_pause` (`attendance_sessions.status`)
4. `did_not_meet` (`attendance_sessions.status`)
5. `missing` (no session OR `status = not_submitted`)
6. `submitted` (`status in {submitted, admin_entered}` and not flagged otherwise)
7. `healthy` (everything else)

Each row links to the per-group check-in detail at
`/admin/check-ins/[groupId]?week=...`.

### Setup gaps (`SetupGapsSection`)

Four bucket lists:

- **No capacity** — no override and no `groups.capacity` (a configured
  global default does NOT close this gap; the global default is a
  fallback, not a per-group configuration)
- **No leader** — no active row in `group_leaders`
- **Missing day/time** — `groups.meeting_day` or `groups.meeting_time` is null
- **No active members** — no rows in `group_memberships` with status = active

CTAs point to `/admin/groups` (for setup corrections) and
`/admin/settings` (for default capacity).

### Removed hardcoded thresholds

| Location                                                | Before                                                                       | After                                                                              |
| ------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `lib/dashboard/queries.ts:43`                           | `const NEAR_CAPACITY_THRESHOLD = 0.8`                                        | Deleted; per-group `effectiveCapacityWarningPct(override, defaults)`               |
| `lib/dashboard/queries.ts:193`                          | `g.capacity && g.capacity > 0 ? activeMembers / g.capacity : null`           | `effectiveCapacity(...)` + `capacityStatus({...})`                                 |
| `lib/dashboard/queries.ts:181 / :200`                   | `latestHealthByGroup.get(g.id)?.pulse ?? g.health_status`                    | `effectiveHealthStatus(g, override)` for buckets; pulse retained only for display  |
| `lib/dashboard/queries.ts:205-210`                      | `r.utilization >= 1`, `r.utilization >= 0.8`                                 | `capacityStatusValue === "full"` / `=== "warning"`                                 |
| `components/dashboard/admin-dashboard.tsx:21-26`        | `utilizationColor(pct)` with `>= 1`, `>= 0.85`                               | `capacityStatusColor(status)` switch keyed by `CapacityStatus`                     |

### Data flow

```
URL ?week=YYYY-MM-DD
   │
   ▼
validateWeekParam → selectedWeek
   │
   ▼
getAdminDashboardData(client, { selectedWeek })
   │  Single Promise.all batches 11 read-only fetches:
   │   • fetchAllGroups
   │   • fetchActiveGroupCount
   │   • fetchGuests
   │   • fetchOpenFollowUps {limit: 8}
   │   • fetchActiveMemberships
   │   • fetchLatestHealthUpdates {updateWeek: selectedWeek}
   │   • fetchAttendanceSessions {meetingWeek: selectedWeek}
   │   • fetchAllGroupLeaders {activeOnly: true}
   │   • fetchProfilesForAdmin
   │   • fetchMetricDefaults
   │   • fetchAllGroupMetricSettings
   │
   ▼
DerivedGroupRow per group (one pass)
   │  • effectiveCapacity / capacityStatus / utilizationPct
   │  • effectiveHealthStatus / hasManualHealthOverride
   │  • capacitySource / isCapacityUnknown / isExcluded
   │  • sessionStatus / followUpNeeded
   │  • leaderNames / hasLeader / hasMeetingDayTime / hasCapacityConfigured
   │  • followUpsForGroup
   │
   ▼
Section partitions
   • Summary (6 counts)
   • Attention queue (priority ladder)
   • Capacity buckets × 5
   • Health buckets × 7
   • Setup gap lists × 4
   • Guest pipeline (preserved)
   • Open follow-ups (preserved)
```

### Why no new migrations / writes

Every signal needed for the command center was already in the database
after Phase 5A.4. The Phase 6.0 work is purely a presentation
refactor — same RLS, same RPCs, same data — so the surface area for
regressions stays small and admins keep a single source of truth for
thresholds at `/admin/settings`.

### Public preview

`/admin-preview` renders the same `AdminDashboard` component using
`getAdminDashboardData(null)`, which returns the rebuilt `ADMIN_FALLBACK`
fixture. The fixture exercises every visual state: at least one group in
each capacity bucket (full / warning / ok / unknown / excluded), one
attention-queue entry per reason category, every setup gap, every health
bucket, the guest pipeline, and open follow-ups.

### Files touched

Modified:

- `lib/dashboard/queries.ts` — new `getAdminDashboardData(client, options)`
- `lib/dashboard/types.ts` — replaced admin types
- `lib/dashboard/fallback-data.ts` — rebuilt `ADMIN_FALLBACK`
- `app/(protected)/admin/page.tsx` — reads `?week=`, passes selected week
- `app/admin-preview/page.tsx` — passes `weekOptions`
- `components/dashboard/admin-dashboard.tsx` — re-export shim
- `components/admin/check-in-review-shell.tsx` — uses shared `WeekSelector`
- `README.md` — Phase 5A.4 ✅, Phase 6.0 current

Added:

- `components/admin/week-selector.tsx` — shared GET-form selector
- `components/dashboard/admin/admin-dashboard.tsx` — top-level layout
- `components/dashboard/admin/summary-cards.tsx`
- `components/dashboard/admin/attention-list.tsx`
- `components/dashboard/admin/capacity-section.tsx`
- `components/dashboard/admin/health-section.tsx`
- `components/dashboard/admin/setup-gaps-section.tsx`
- `components/dashboard/admin/guest-pipeline-section.tsx`
- `components/dashboard/admin/follow-ups-section.tsx`
- `components/dashboard/admin/shared.tsx`
- `docs/PHASE_6_0_ADMIN_DASHBOARD_METRICS.md` (this doc)
- `docs/PHASE_6_0_VERIFICATION.md`
