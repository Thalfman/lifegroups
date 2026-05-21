# Phase 5A.6: Group Calendar Foundation

## Purpose

Some Life Groups don't follow a simple weekly or bi-weekly pattern. One
group runs a 5-week rotation (Community Night, Men's Transformation,
Study, Women's Transformation, Study). Summer schedules drop OFF weeks
and cancelled dates into the calendar. Phase 5A.5 added the structured
meeting cadence fields (`meeting_frequency`, `meeting_week_parity`,
canonical `meeting_day`, `meeting_time`); this phase layers a
leader-editable per-group calendar on top so the actual schedule can
override the default cadence when needed.

Phase 5A.6 is intentionally MVP-shaped. There is one event per
group-and-date (partial unique), no recurring template engine, no
multi-event days or weeks, and no calendar integrations. Deferred
follow-ups are listed at the bottom of this doc.

## Schema

Migration:
`supabase/migrations/20260518140000_phase5a6_group_calendar.sql`

New table `public.group_calendar_events`:

| Column        | Type                                | Notes                                          |
| ------------- | ----------------------------------- | ---------------------------------------------- |
| `id`          | `uuid`                              | primary key, `gen_random_uuid()` default       |
| `group_id`    | `uuid`                              | FK to `groups.id`, not null                    |
| `event_date`  | `date`                              | not null                                       |
| `start_time`  | `time`                              | nullable                                       |
| `end_time`    | `time`                              | nullable                                       |
| `event_type`  | `group_calendar_event_type` enum    | not null, default `'study'`                    |
| `status`      | `group_calendar_event_status` enum  | not null, default `'scheduled'`                |
| `title`       | `text`                              | nullable, ≤ 200 chars                          |
| `description` | `text`                              | nullable, ≤ 1000 chars                         |
| `created_by`  | `uuid`                              | nullable FK to `profiles.id`                   |
| `updated_by`  | `uuid`                              | nullable FK to `profiles.id`                   |
| `created_at`  | `timestamptz`                       | `now()` default                                |
| `updated_at`  | `timestamptz`                       | maintained by `set_updated_at()` trigger       |
| `archived_at` | `timestamptz`                       | nullable; non-null = archived                  |

Constraints:

- `group_calendar_events_time_order` — when both `start_time` and
  `end_time` are set, `end_time > start_time`.
- `group_calendar_events_status_type_consistent` —
  - `status='off'` ⇒ `event_type='off'`
  - `status='cancelled'` ⇒ `event_type='cancelled'`
  - `status='scheduled'` ⇒ `event_type ∉ {off, cancelled}`
- `group_calendar_events_title_length` — `title` ≤ 200 chars
- `group_calendar_events_description_length` — `description` ≤ 1000 chars

Indexes:

- `(group_id, event_date)` for the calendar view fast-path
- `(event_date) WHERE archived_at IS NULL` for the week-batch fetch
- `(group_id) WHERE status='scheduled' AND archived_at IS NULL` for the
  upcoming-events strip on the leader dashboard
- `unique (group_id, event_date) WHERE archived_at IS NULL` —
  one active event per group/date. Re-using a date after archiving the
  previous event is intentionally allowed.

The `set_updated_at()` trigger from `20260517040000_phase2_schema.sql`
is reused; the new table has its own
`group_calendar_events_set_updated_at` trigger.

### Archive semantics

`archived_at` is orthogonal to `status`. A cancelled event remains
visible to leaders and admins (with the Cancelled badge) until it is
archived. Archive = soft delete; restore clears `archived_at`. There is
no hard delete.

## Enums

`public.group_calendar_event_type`:

`study`, `community_night`, `mens_transformation`,
`womens_transformation`, `social`, `service`, `prayer`, `off`,
`cancelled`, `other`.

`public.group_calendar_event_status`:

`scheduled`, `off`, `cancelled`.

The matching TypeScript unions live in `types/enums.ts`. The row type
lives in `types/database.ts`; the `Database.public.Tables` and
`Database.public.Functions` maps are updated for the new table and the
eight RPCs below.

## RPCs

Eight SECURITY DEFINER RPCs, all with `set search_path = public,
pg_temp`. Each function is the security boundary: RLS does NOT protect
writes inside the function body. Each function explicitly enforces auth
(`auth_is_admin()` or `auth_is_leader_of(group_id)` plus a non-null
`auth_profile_id()`), validates inputs, coerces `event_type` for OFF /
cancelled status, and writes the data change PLUS the matching
`audit_events` row in the same transaction. `unique_violation` from the
partial unique index is mapped to `date_conflict` for a friendly UI
message.

Admin (callable by `super_admin` and `ministry_admin`; closed groups
allowed for correction):

- `admin_create_group_calendar_event`
- `admin_update_group_calendar_event`
- `admin_archive_group_calendar_event`
- `admin_restore_group_calendar_event`

Leader (callable by `leader` and `co_leader` for groups they actively
lead; blocked on closed groups):

- `leader_create_group_calendar_event`
- `leader_update_group_calendar_event`
- `leader_archive_group_calendar_event`
- `leader_restore_group_calendar_event`

Grants follow the Phase 5A.2 / 5C.0 pattern: revoke from
public/anon/authenticated, grant execute to authenticated only.

### Audit actions

- `admin.group_calendar_event_created`
- `admin.group_calendar_event_updated`
- `admin.group_calendar_event_archived`
- `admin.group_calendar_event_restored`
- `leader.group_calendar_event_created`
- `leader.group_calendar_event_updated`
- `leader.group_calendar_event_archived`
- `leader.group_calendar_event_restored`

Audit metadata stores the event's `group_id`, before/after status and
event-type, and a `has_title` / `has_description` boolean — note
bodies are not stored in audit metadata so the audit log stays
shareable. As with the rest of the app, audit_events SELECT is
restricted to `super_admin` via `/admin/super-admin`.

### Error tokens

Reused: `insufficient_privilege`, `invalid_input`, `missing_group`,
`group_closed`.

New: `missing_event`, `event_already_archived`, `event_not_archived`,
`date_conflict`.

All eight tokens are mapped to friendly UI messages in
`lib/admin/action-result.ts` and `lib/leader/action-result.ts`.

## RLS

Two SELECT policies on `group_calendar_events`, no write policies:

- `group_calendar_events_admin_staff_read` —
  `auth_is_admin_or_staff()`. Matches the existing operational-table
  pattern (`groups`, `members`, `attendance_sessions`); staff_viewer
  remains the deprecated read-only role.
- `group_calendar_events_leader_read` — `auth_is_leader_of(group_id)`.

All writes flow through the SECURITY DEFINER RPCs above.

## Check-in due-date integration

Resolver in `lib/admin/check-in-due.ts`:

```ts
export type CalendarOverride = {
  status: GroupCalendarEventStatus;
  date: string;
  startTime: string | null;
};

export function pickCalendarOverrideForWeek(
  events: CalendarEventLite[],
  meetingWeekIso: string,
): CalendarOverride | null;
```

MVP precedence rules:

1. Filter events to `archived_at IS NULL` and `event_date` within the
   Monday-of-week through Monday+6 day window.
2. Prefer `scheduled` events; among ties, pick the earliest event_date,
   then earliest start_time.
3. If no scheduled event, pick the earliest off/cancelled event so the
   suppression applies once for the week.
4. If no events match the week, return `null`.

`computeCheckInDue` accepts an optional `calendarOverride`:

- `status === 'off' || 'cancelled'` → no due date,
  `isScheduledThisWeek: false`, not overdue. Bypasses cadence/parity.
- `status === 'scheduled'` → bypass cadence/parity gate; use the
  override's `date` and (`startTime ?? group.meetingTime`) for due-date
  math. `isScheduledThisWeek: true`.
- `null` (no override) → existing cadence-based logic unchanged.

The resolver is called from four places so all surfaces stay consistent:

- `lib/dashboard/queries.ts` `getAdminDashboardData` — batch fetch
  events for the selected week, build `eventsByGroup` once, resolve
  per-group inside the derived-rows map.
- `lib/dashboard/queries.ts` `getLeaderDashboardData` — batch fetch
  events for the assigned-group ids over an 8-week horizon, slice per
  group inside `buildLeaderGroupDashboard`. The same fetch also
  populates the upcoming-events strip.
- `lib/admin/check-ins.ts` `fetchAdminWeeklyCheckInReview` — same
  batch-and-map pattern as the admin dashboard.
- `app/(protected)/leader/[groupId]/checkin/page.tsx` — single-group
  fetch for the leader's own check-in due timestamp.

## Leader capabilities

- View upcoming and archived events for an assigned group at
  `/leader/[groupId]/calendar`.
- Add a calendar event (date, optional times, type, status, optional
  title, optional description).
- Edit a calendar event (inline edit in the actions cluster).
- Quick actions: Mark OFF, Cancel, Archive on scheduled events.
- Restore an archived event.
- Window: 4 weeks past + 16 weeks future by default; `?archived=1`
  toggles archived view.
- Leaders can only access groups they actively lead or co-lead;
  tampered `groupId` redirects to `/leader`.
- Leaders cannot write while a group is closed; past events remain
  visible for reference.

## Admin capabilities

- View, edit, archive, restore events for any group at
  `/admin/groups/[groupId]/calendar`.
- Window: 12 weeks past + 26 weeks future by default; `?archived=1`
  toggles archived view.
- Admins can correct events on closed groups.
- Per-row Calendar link added to `/admin/groups`.
- No `/admin/calendars` overview surface in this phase — detailed
  calendar work lives on the group-specific route and cross-group
  signal flows through the existing dashboard.

## Fallback / demo behavior

`/admin-preview` and `/leader-preview` continue to render without
Supabase. The leader preview now ships with a 2-event upcoming strip
on the demo group card so the calendar feature is visible end-to-end
in design preview. The admin preview's check-in derivation is
unchanged — calendar events default to empty for the admin fallback
since the admin dashboard's derived rows already render without them.

## Known limitations

- One active event per group per date. Multi-event days and multi-event
  weeks are deferred.
- No recurring-template engine. Leaders publish individual dates; the
  app does not auto-generate future occurrences.
- Multi-event weeks (multiple scheduled events in the same ISO week)
  follow the documented MVP priority rule: prefer scheduled, then the
  earliest by date + start_time. A future "primary meeting" flag could
  replace this heuristic.
- No ICS import or export.
- No Google or Outlook calendar integration.
- No public church-wide calendar surface.

## Deferred follow-ups

- Recurring event templates (e.g. publish a 5-week rotation in one
  step).
- True occurrence model supporting multiple events per week.
- Multi-event days.
- Multi-event weeks with explicit primary-meeting selection.
- ICS export.
- Google / Outlook integration.
