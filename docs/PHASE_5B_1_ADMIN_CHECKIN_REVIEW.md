# Phase 5B.1 — Admin weekly check-in review

This phase gives ministry admins and super admins a one-page sweep of
the leader check-ins for any given week. It is read-only: it surfaces
existing data through the Phase 4 SELECT policies and adds no new
write paths, RPCs, or RLS policies.

## What&rsquo;s new for admins

- A new protected route at `/admin/check-ins` lists every non-closed
  Life Group with its current week&rsquo;s check-in status, leader
  attribution, attendance counts, health pulse, follow-up flag, and a
  short leader-note preview. Missing groups float to the top so they
  are the first thing an admin sees.
- A week selector dropdown lets the admin scroll back through the last
  eight Mondays. The URL stays canonical (`/admin/check-ins?week=YYYY-MM-DD`),
  so a particular week can be linked, bookmarked, or pasted into a
  pastoral conversation.
- A detail route at `/admin/check-ins/[groupId]?week=YYYY-MM-DD` shows
  the leader&rsquo;s full note, the admin note (if any), the health
  pulse, the follow-up flag, and the member-by-member attendance for
  that week. The roster is rendered even when no check-in has been
  submitted so the admin can see who would be marked.
- Six summary tiles at the top of the list: Active groups, Submitted,
  Missing, Did not meet, Planned pause, Needs follow-up. Tiles emphasise
  the urgent counts (missing &gt; 0 and needs follow-up &gt; 0) with
  the terra accent already used elsewhere in the warm pastoral palette.
- The admin nav now includes a `Check-Ins` item between `Manage Groups`
  and the super-admin entry. Both `super_admin` and `ministry_admin`
  see the link; leaders and co-leaders are unaffected; `staff_viewer`
  continues to redirect to `/unauthorized`.

The visual system is the same warm pastoral palette used elsewhere.
The list is mobile-first cards with a responsive summary tile grid;
the detail view is centred at 840px with the same field-label /
field-value rhythm as the existing super-admin console.

## Access control

- Page guards: both `/admin/check-ins` and
  `/admin/check-ins/[groupId]` call `requireAdmin()` from
  `lib/auth/session.ts`, which accepts `super_admin` and
  `ministry_admin` only. Anything else (`leader`, `co_leader`,
  `staff_viewer`, no profile, inactive profile, signed-out user)
  redirects to `/unauthorized`.
- `getCurrentSession()` is cached per request, so the dual page guard
  and the navigation render share one Supabase round-trip.
- The detail route also rejects malformed `groupId` paths via a UUID
  regex and `notFound()`s if the group has been removed. Closed groups
  are still rendered on a direct URL — useful for pastoral history
  lookups — but show a muted "This group is closed" banner.

## Data architecture

This page reads from existing tables only. RLS policies already permit
`super_admin` / `ministry_admin` to `SELECT` from every table touched
below (see `supabase/migrations/20260518000000_phase4_rls.sql`):

- `groups` — group metadata and `lifecycle_status`.
- `group_leaders` (`active = true`) — leader profile IDs per group.
- `profiles` — leader and admin names; used to render
  `submitted_by` and the leaders line.
- `attendance_sessions` — one row per `(group_id, meeting_week)`. The
  authoritative source for status, meeting date, leader note,
  submitter, and submitted-at.
- `attendance_records` — attendance status per member per session.
  Drives the P/A/E counts on the list cards and the per-member roster
  on the detail page.
- `group_health_updates` — health pulse and follow-up flag per
  `(group_id, update_week)`.
- `group_memberships` (`status = 'active'`) — active roster for the
  detail roster.
- `members` — display names for the roster.

No service role, no `sb_secret` / `SUPABASE_SERVICE` key, no new RPCs,
no new RLS policies, and no `.delete()` / `.insert()` / `.update()` /
`.rpc()` from any new file. The page calls only SELECT-only helpers
in `lib/supabase/read-models.ts`.

### Two new admin-scoped read models

Both live in the new file `lib/admin/check-ins.ts` and call only the
single-table helpers above. They compose results into the typed
shapes consumed by the review and detail shells.

- `fetchAdminWeeklyCheckInReview(client, meetingWeek)` —
  fans out to `fetchAllGroups`, `fetchAllGroupLeaders({ activeOnly: true })`,
  `fetchProfilesForAdmin()`, `fetchAttendanceSessions({ meetingWeek })`,
  and `fetchLatestHealthUpdates({ updateWeek: meetingWeek })`, then
  pulls `fetchAttendanceRecordsForSessions(sessionIds)` for the P/A/E
  counts. Returns `{ meetingWeek, rows, summary, errors }`. Closed
  groups are filtered out of the list **and** the summary.
- `fetchAdminCheckInDetail(client, groupId, meetingWeek)` —
  fans out to `fetchGroupsByIds`, `fetchAllGroupLeaders`,
  `fetchProfilesForAdmin`, `fetchAttendanceSessions({ groupId, meetingWeek })`,
  `fetchLatestHealthUpdates({ groupId, updateWeek: meetingWeek })`,
  and `fetchActiveMemberships({ groupId })`, then pulls
  `fetchMembersByIds` for the roster and
  `fetchAttendanceRecordsForSessions([session.id])` when a session
  exists.

### One additive change to `read-models.ts`

`fetchLatestHealthUpdates` now accepts an optional `updateWeek` so
this page can scope health updates to the selected week in a single
query instead of filtering in memory. No behavior change for the two
existing callers (`/admin/super-admin` and the leader check-in form),
which omit the new option.

`fetchAttendanceRecordsForSessions` now passes an explicit
`.range(0, 9999)` to defend against the PostgREST 1000-row default
cap when a single week spans many groups × members. Pure widening,
no breaking impact.

## The &ldquo;missing&rdquo; rule

A group counts as missing when **both** of these hold:

1. `groups.lifecycle_status = 'active'`.
2. Either no `attendance_sessions` row exists for the week, **or** a
   row exists with `status = 'not_submitted'`.

This is the same rule used by the existing admin dashboard
(`lib/dashboard/queries.ts:157-160`); keeping the rule in one
codepath avoids the dashboard&rsquo;s &ldquo;missing check-ins&rdquo;
number and this page&rsquo;s &ldquo;Missing&rdquo; tile silently
disagreeing. Closed groups are excluded entirely from the missing
count and from the list (a direct URL still renders the detail page
with a muted closed banner for historical review). Groups with a
non-active, non-closed lifecycle (planned_pause, seasonal_break,
launching_soon, needs_leader, at_risk) still appear in the list with
a muted lifecycle badge but do not count toward
`summary.missingCount`.

## Badge taxonomy

| State | Component | Tone | Rationale |
|---|---|---|---|
| Session submitted by leader | `<PBadge tone="healthy">Submitted</PBadge>` | sage | Same green used everywhere "healthy". |
| Session admin-entered | `<PBadge tone="healthy" outline>Submitted · admin</PBadge>` | sage outline | Distinguishes from a leader submission while reading like "submitted". |
| Session missing | `<PBadge tone="followup">Missing</PBadge>` | terra | The one urgent tone; reused for follow-up. |
| Session did_not_meet | `<PBadge tone="neutral">Did not meet</PBadge>` | gray | Neutral; the meeting genuinely didn&rsquo;t happen. |
| Session planned_pause | `<PBadge tone="pause">Planned pause</PBadge>` | gray-brown | Distinct from did_not_meet. |
| Pulse healthy / watch / needs_follow_up | `<PBadge outline>` | sage / mustard / terra | Outline form so the pulse reads as supplementary to the session status. |
| Follow-up needed (separate from pulse) | `<PBadge tone="followup">Follow-up needed</PBadge>` | terra | Solid; this is the explicit "please look at this" signal. |
| Non-active lifecycle | `<PBadge tone="neutral" outline>` | gray outline | Communicates "this group isn&rsquo;t expected to meet" without crowding the urgent rows. |
| Lifecycle closed (detail only) | `<PBadge tone="neutral" outline>Closed</PBadge>` | gray outline | Reads as archive, not "needs attention". |

## Week selector

The week selector is an RSC `<form method="GET" action="/admin/check-ins">`
with a `<select name="week">`. No client component needed. The week
options are the most recent eight Mondays computed via
`isoWeekStart()` from `lib/leader/validation.ts`, the same helper the
leader workflow uses, so the dashboard, the leader check-in form, and
this page all anchor on `America/Chicago`. `validateWeekParam` then
canonicalises whatever value lands in the URL: any non-Monday or
otherwise malformed input falls back to the current week.

## Out of scope

Per the Phase 5B.1 brief, these intentionally do **not** ship in this
phase:

- Admin editing or reopening submitted check-ins.
- Follow-up task creation, prayer requests, care notes.
- SMS / calendar / reminder workflows.
- Guest pipeline workflows.
- Bulk exports, CSV downloads, advanced metric tuning.
- Any new write policy, RPC, or migration.

Anything in that list will land in a later phase with its own write
path, validation, RLS surface, and verification doc.

## File map

New files in this phase:

- `app/(protected)/admin/check-ins/page.tsx`
- `app/(protected)/admin/check-ins/[groupId]/page.tsx`
- `lib/admin/check-ins.ts`
- `components/admin/check-in-review-shell.tsx`
- `components/admin/check-in-detail-shell.tsx`
- `components/admin/phase-5b1-notice.tsx`
- `docs/PHASE_5B_1_ADMIN_CHECKIN_REVIEW.md` (this file)
- `docs/PHASE_5B_1_VERIFICATION.md`

Touched files:

- `lib/auth/roles.ts` — `navItemsForRole` now includes the
  `/admin/check-ins` link for both admin roles.
- `lib/supabase/read-models.ts` — `fetchLatestHealthUpdates` accepts
  an optional `updateWeek`; `fetchAttendanceRecordsForSessions` widens
  its result range past the PostgREST default cap.
- `README.md` — phase status updated.
