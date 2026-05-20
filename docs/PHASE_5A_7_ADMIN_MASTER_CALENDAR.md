# Phase 5A.7: Admin Master Calendar

## Purpose

Give ministry admins (Julian-style operators) and super admins a single,
read-first, ministry-wide view of every Life Group meeting in a month so
they can answer questions like:

- Which groups are meeting this week?
- Which groups are OFF or Cancelled?
- Which groups are running Community Night, Study, Men's Transformation,
  Women's Transformation, or Other?
- What does the ministry rhythm look like this month?
- Where should I click to manage a specific group's calendar?

This is an oversight surface, not an editor. All edits continue to
happen on the per-group calendar pages where the existing
`leader_*_group_calendar_event` and `admin_*_group_calendar_event`
RPCs already enforce auth, validation, and audit.

## Route

`/admin/calendar`

- File: `app/(protected)/admin/calendar/page.tsx`
- Server component (`export const dynamic = "force-dynamic"`)
- Accepts `?month=YYYY-MM` (validated against `^\d{4}-\d{2}$`),
  defaults to the current church-local month via
  `churchMonthIso()`.

The page renders inside `PastoralAppShell` with the standard
admin nav, eyebrow `"Calendar"`, title `"Ministry calendar"`, and
prev/this/next month navigation.

## Role access

- `super_admin` — full access.
- `ministry_admin` — full access.
- `leader`, `co_leader` — redirected to `/unauthorized` by
  `requireAdmin()` in `lib/auth/session.ts`.
- `staff_viewer` (legacy / no access) — redirected to
  `/unauthorized`.
- `member` — not an authenticated role; never reaches `/admin/*`.

Nav entry is gated through `navItemsForRole()` in
`lib/auth/roles.ts` and is added only for admin roles. There is no
leader-facing nav link.

## Read-first design

`/admin/calendar` is read-only. Clicking an occurrence opens a details
drawer with:

- group name
- leader/co-leader names
- date
- inherited meeting time (group's `meeting_time`)
- gathering type
- status (Scheduled / OFF / Cancelled)
- title and description if present on the override
- whether the occurrence is **Generated** (from the cadence) or an
  **Override** (a row in `group_calendar_events`)
- **Primary**: Open group calendar → `/admin/groups/[groupId]/calendar?month=<monthIso>`
- **Secondary**: View group → `/admin/groups/[groupId]`

There is intentionally no edit form, no time field, no day-of-week
field, no drag-and-drop, no per-event time override.

## Generated occurrence model

We reuse the Phase 5A.6 cadence engine in `lib/calendar/occurrences.ts`
unchanged:

- `generateMonthOccurrences(schedule, monthIso)` enumerates the dates a
  group is expected to meet in the visible month based on
  `meeting_day`, `meeting_frequency`, and (for biweekly groups)
  `meeting_week_parity`.
- Monthly groups meet on the first matching weekday of the calendar
  month.
- Biweekly groups without parity surface every matching weekday (a
  conservative default; the per-group calendar warns the leader).
- Default occurrences carry `eventType="study"`, `status="scheduled"`,
  and inherit the group's `meeting_time`.

Generated occurrences are **not persisted**. The DB still stores only
override rows.

## Override merge behavior

For each visible group we call `mergeOverrides(generated, saved,
group.meeting_time)`:

- A saved row on a generated date overrides the **gathering type**,
  **status**, **title**, **description**, and exposes the `overrideId`.
- Meeting time always comes from the group's `meeting_time` —
  `start_time` / `end_time` on `group_calendar_events` are intentionally
  ignored.
- A saved row on a non-generated date is included as a "Special"
  one-off occurrence.
- Archived rows (`archived_at IS NOT NULL`) are filtered out before
  merging.

`MasterOccurrence.isGenerated` is `true` iff `overrideId === null`.

## OFF / Cancelled behavior

- `status="off"` → coerced `eventType="off"`; rendered with the **pause**
  badge tone and a neutral left-border accent.
- `status="cancelled"` → coerced `eventType="cancelled"`; rendered with
  the **followup** badge tone and a terra-red left-border accent.
- Both are visually distinct from `status="scheduled"` occurrences.
- Both suppress check-in due for that occurrence (this is enforced
  inside the existing check-in pipeline, not by this surface).

## Filters

Implemented client-side in `AdminMasterCalendarShell`. All filters apply
in-memory to the flattened occurrence list before passing to the grid /
list components.

| Filter            | Behavior                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------- |
| Group             | Multi-select chip list of all non-closed groups.                                          |
| Gathering type    | Multi-select chips for Study, Community Night, Men's/Women's Transformation, Social, Service, Prayer, Other, plus the status-coerced OFF / Cancelled. |
| Status            | Multi-select chips for Scheduled, OFF, Cancelled.                                         |
| Meeting day       | Multi-select chips Sun…Sat. Filter uses the **resolved occurrence date's actual weekday**, not the group's default `meeting_day`. |
| Leader / co-leader | Single-select dropdown. Matches when any of the occurrence's `leaderNames` equals the value. |

A **Reset filters** button is shown when any filter is active. When
nothing matches, the empty state reads:
"No group meetings match these filters."

## Mobile list mode

A Month / List toggle is shown on every viewport. On viewports ≤ 720 px
the page defaults to **List** mode. Hydration safety:

- The initial SSR + first client render always use `"month"`.
- A `useEffect` after mount inspects `matchMedia("(max-width: 720px)")`
  and flips to `"list"` only if the user has not manually toggled.
- This avoids a server/client render mismatch.

The list groups occurrences by date, stacks single-column cards
(minimum 44 px tap target), and shows a direct "Open group calendar →"
link on each card alongside the same details drawer behavior. The
desktop month grid is preserved.

When the desktop grid has more than 3 occurrences on a single day, a
"+N more" pill switches the view to List and scrolls to that date so
admins can see the full set without breaking the cell layout.

## Why editing remains on the group calendar pages

- The existing per-group calendar pages already implement create /
  update / archive / restore through narrow SECURITY DEFINER RPCs that
  pair every write with an `audit_events` row.
- Bundling those write paths into a multi-group surface would duplicate
  validation, role gating, and audit wiring, and risks weakening any of
  them.
- The master view's value is rhythm visibility and one-click
  navigation, not in-place editing.

## Implementation summary

### New files

- `lib/admin/master-calendar.ts` — `loadMasterCalendar(client, { monthIso })`. Composes
  `fetchAllGroups`, `fetchAllGroupLeaders`, `fetchProfilesForAdmin`, and a
  single batched `fetchGroupCalendarEvents({ groupIds, fromDate, toDate })`
  call. Returns a strict `MasterOccurrence[]` shape (no `admin_notes`,
  no `admin_private_note`, no unused fields).
- `app/(protected)/admin/calendar/page.tsx` — server entry point.
- `components/admin/admin-master-calendar-shell.tsx` — client shell with
  filters, view toggle, drawer state, and hydration-safe mobile
  defaulting.
- `components/admin/admin-master-calendar-grid.tsx` — read-only month
  grid; uses `gridCellsForMonth` from `lib/calendar/occurrences`.
- `components/admin/admin-master-calendar-list.tsx` — grouped-by-date
  list view for mobile and overflow days.
- `components/admin/admin-master-calendar-drawer.tsx` — read-only details
  drawer with the two navigation actions.

### Edited files

- `lib/auth/roles.ts` — added `{ href: "/admin/calendar", label: "Calendar" }` to admin nav items.
- `components/dashboard/admin/admin-dashboard.tsx` — added a small
  drill-down card "View ministry calendar" → `/admin/calendar`.

### Reused (not duplicated)

- `lib/calendar/occurrences.ts`: `generateMonthOccurrences`,
  `mergeOverrides`, `toSavedOverrides`, `monthBounds`, `shiftMonthIso`,
  `monthLabel`, `churchMonthIso`, `todayChurchIso`, `gridCellsForMonth`,
  `WEEKDAY_HEADERS`, `dayNumberLabel`, `dateLabel`, `formatClock`.
- `lib/calendar/payload.ts`: `friendlyEventTypeLabel`,
  `friendlyEventStatusLabel`, `EVENT_TYPE_OPTIONS`,
  `EVENT_STATUS_OPTIONS`.
- `lib/supabase/read-models.ts`: `fetchAllGroups`,
  `fetchAllGroupLeaders`, `fetchProfilesForAdmin`,
  `fetchGroupCalendarEvents`.

## Known limitations

- Monthly cadence groups are surfaced on the **first** matching weekday
  of the month only. "Second Saturday" / specific-day-of-month support
  would require schema work and is deferred.
- Biweekly groups without `meeting_week_parity` will surface on every
  matching weekday so the gap is visible.
- One active override per `(group_id, event_date)` is enforced by a
  partial unique index, so multi-event days are not possible.
- No week view, agenda view, ICS export, or print layout.
- The "+N more" overflow switches to List view rather than opening a
  per-day mini-modal — chosen for code-size simplicity.
- Closed groups are excluded from the visible list. To audit a closed
  group's calendar history, open the group directly via
  `/admin/groups/[groupId]/calendar`.
- Leader display names fall back to email when `profiles.full_name` is
  empty, matching the convention in the rest of the admin UI.

## Manual verification checklist

### Desktop

1. Sign in as `super_admin`.
2. Visit `/admin/calendar`.
3. Confirm the month grid loads with weekday headers and a 6-week grid.
4. Confirm active groups show their generated occurrences on the
   expected dates.
5. Confirm overridden occurrences display the override type / status.
6. Confirm OFF and Cancelled pills are visually distinct from
   Scheduled.
7. Click an occurrence pill.
8. Confirm the details drawer opens.
9. Confirm the inherited meeting time is shown and there are no edit /
   time fields.
10. Confirm "Open group calendar" routes to
    `/admin/groups/[groupId]/calendar?month=<monthIso>`.
11. Confirm "View group" routes to `/admin/groups/[groupId]`.
12. Apply each filter individually and in combination; confirm the
    grid / list updates.
13. Confirm "Reset filters" clears all filters.

### Admin role

1. Sign in as `ministry_admin`.
2. Confirm `/admin/calendar` is accessible.
3. Confirm no super-admin-only controls are present (this page does
   not expose any super-admin surface anyway).

### Leader role

1. Sign in as `leader`.
2. Confirm `/admin/calendar` redirects to `/unauthorized`.
3. Confirm leader calendar behavior at
   `/leader/[groupId]/calendar` still works.

### Mobile (390 px and 430 px)

1. Confirm `/admin/calendar` has no horizontal overflow.
2. Confirm the nav drawer works.
3. Confirm the list view is the default and is legible.
4. Confirm occurrence cards have ≥ 44 px tap height.
5. Confirm filters are usable on small screens.
6. Confirm the details drawer fits on screen and scrolls if content
   exceeds 92 dvh.
7. Confirm "Open group calendar" is easy to tap.

### Privacy / security

1. Confirm `admin_private_note` does not appear anywhere in the new
   files or in leader-facing components.
2. Confirm an unrelated leader cannot access `/admin/calendar`.
3. Confirm no Staff View language appears.
4. Confirm no demo / preview links return.

### Regression

1. `/admin` still loads and stays high-level.
2. `/admin/groups` still works.
3. `/admin/groups/[groupId]/calendar` still works.
4. `/leader` still works.
5. `/leader/[groupId]/calendar` still works.
6. `/leader/[groupId]/checkin` still works.
