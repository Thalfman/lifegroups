# Phase 5B.1 — Manual Verification Checklist

This document is the checklist that should be run against a live
Supabase project before declaring Phase 5B.1 verified.

## Fast Smoke Test

The minimum end-to-end check after a deploy. Run this before the full
checklist below; if any step here fails, do not bother with the deeper
audit until the regression is understood.

1. Sign in as `super_admin`. Open `/admin/check-ins`. Confirm the
   page renders with the warm pastoral palette, the eyebrow reads
   "Phase 5B.1 · Check-ins", and the nav contains
   `Home · Admin · Manage People · Manage Groups · Check-Ins · Super Admin`.
2. Confirm the week selector defaults to the current
   `America/Chicago` Monday. The selector lists the most recent eight
   Mondays.
3. Confirm the summary tiles render six counts: Active groups,
   Submitted, Missing, Did not meet, Planned pause, Needs follow-up.
4. Confirm the group list renders one card per non-closed group,
   sorted with missing groups first.
5. Click "View details &rarr;" on any group. Confirm the route
   `/admin/check-ins/<groupId>?week=<W>` renders, shows the leader
   names, status, attendance counts (if submitted), and the roster
   below.
6. Click "&larr; Back to all check-ins". Confirm the same week is
   preserved in the URL.
7. Sign out, sign in as `ministry_admin`. Repeat step 1; the nav now
   reads `Home · Admin · Manage People · Manage Groups · Check-Ins`
   (no Super Admin entry). The page should render identically
   otherwise.
8. Sign out, sign in as a `leader`. Navigate to `/admin/check-ins`.
   Confirm a redirect to `/unauthorized`. Navigate to
   `/admin/check-ins/<groupId>?week=…` and confirm the same redirect.
9. Sign out, sign in as the `super_admin` again. Open `/admin/people`,
   `/admin/groups`, `/admin/super-admin`, `/leader`, and
   `/leader/<groupId>/checkin`. All five existing routes must still
   render correctly &mdash; this catches accidental regressions in
   navigation or shared components.

If all nine steps pass, Phase 5B.1 is healthy for live testing. Run
the full checklist below before any release.

## Prerequisites

- Supabase project has, in order:
  - Phase 2 schema (`20260517040000_phase2_schema.sql`)
  - Phase 4 RLS (`20260518000000_phase4_rls.sql`)
  - Phase 5A.1 admin people writes
    (`20260518050000_phase5a1_admin_people_writes.sql`)
  - Phase 5A.2 admin group writes
    (`20260518060000_phase5a2_admin_group_writes.sql`)
  - Phase 5A.2 grants hardening
    (`20260518070000_phase5a2_grants_hardening.sql`)
  - Phase 5B.0 leader check-in writes
    (`20260518080000_phase5b0_leader_checkin_writes.sql`)
  - Phase 5A.3 super admin role workflow
    (the migration that ships `super_admin_update_profile_role`)
- **No new migration is introduced in Phase 5B.1.** This is a
  read-only page; RLS already permits admin SELECT on every table
  read here via the Phase 4 `auth_is_admin_or_staff()` policies.
- A `super_admin` and a `ministry_admin` profile each linked to a
  Supabase Auth user.
- At least one `leader` or `co_leader` profile linked to a Supabase
  Auth user and actively assigned to a Life Group.
- Sample data covering at least: one submitted check-in, one
  `did_not_meet`, one `planned_pause`, one missing (active group, no
  session row), one with `follow_up_needed = true`, and one closed
  group.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  (or the legacy anon key) are set in the deployed environment.

## Automated checks

- `npm run lint`
- `npm run typecheck`
- `npm run build`

Each must pass with no new warnings or errors.

## Access control

1. **super_admin** can access `/admin/check-ins` and
   `/admin/check-ins/<groupId>?week=<W>`. Both render the warm
   pastoral shell with the Phase 5B.1 notice.
2. **ministry_admin** can access both routes identically; the nav
   omits the Super Admin link.
3. **leader** and **co_leader** are redirected to `/unauthorized`
   from both routes.
4. **staff_viewer** is redirected to `/unauthorized` from both
   routes. (This role is deprecated; `requireAdmin` rejects it.)
5. **signed-out** users are redirected to `/login` from both routes
   (via the protected layout).
6. The detail route rejects a malformed `groupId` path
   (`/admin/check-ins/not-a-uuid`) with a 404, not a redirect or a
   500.

## Week selector

7. The selector defaults to the current `America/Chicago` Monday.
   Reload at midnight Central on a Monday and confirm the new Monday
   becomes the default; reload during Sunday-evening Central time and
   confirm the **previous** Monday is still labelled "(this week)"
   (since `isoWeekStart` anchors on church-local time).
8. Selecting a prior Monday navigates to
   `/admin/check-ins?week=YYYY-MM-DD` and re-renders with that
   week&rsquo;s data. The selector defaults to the chosen value on
   the new page.
9. Manually crafting a URL with an invalid `?week=` value renders the
   current week without crashing. Try:
   - `?week=2025-13-99`
   - `?week=tuesday`
   - `?week=2025-11-04` (a Tuesday &mdash; should clamp to the
     current Monday because the value isn&rsquo;t a Monday)
   - `?week=` (empty)
   - `?week=2025-11-03&week=2025-11-10` (array form)
10. Detail-page direct URL with a malformed `?week=` falls back to
    the current week identically.

## Summary counts

Set up the following test fixture for week W and verify each tile:

- Group A &mdash; lifecycle `active`, submitted check-in.
- Group B &mdash; lifecycle `active`, `did_not_meet` for week W.
- Group C &mdash; lifecycle `active`, `planned_pause` for week W.
- Group D &mdash; lifecycle `active`, no session row for week W.
- Group E &mdash; lifecycle `active`, session row with
  `status = 'not_submitted'`.
- Group F &mdash; lifecycle `active`, submitted, with
  `group_health_updates.follow_up_needed = true`.
- Group G &mdash; lifecycle `launching_soon`, no session row.
- Group H &mdash; lifecycle `closed`.

Expected tile counts:

- Active groups = 6 (A&ndash;F).
- Submitted = 2 (A, F).
- Missing = 2 (D, E). Group G is non-active and therefore not
  counted as missing; group H is closed and excluded entirely.
- Did not meet = 1 (B).
- Planned pause = 1 (C).
- Needs follow-up = 1 (F).

Group G appears in the list with a muted "Launching soon" badge.
Group H does not appear in the list.

## Group cards (list view)

11. The list is sorted with missing groups first (D and E float to
    the top), then groups with `follow_up_needed` (F), then everyone
    else by group name.
12. Each card shows: group name, leader names (sorted), meeting
    day/time, status badge, lifecycle badge (only when non-active),
    follow-up badge (only when flagged), pulse badge (only when set).
13. Submitted cards (and admin-entered cards, when present) include
    a P/A/E count line whose numbers match exactly the count of
    `attendance_records.attendance_status` per session in SQL:
    ```sql
    select s.id, count(*) filter (where r.attendance_status = 'present') as p,
                  count(*) filter (where r.attendance_status = 'absent')  as a,
                  count(*) filter (where r.attendance_status = 'excused') as e
      from public.attendance_sessions s
      left join public.attendance_records r on r.session_id = s.id
     where s.meeting_week = '<W>'
     group by s.id;
    ```
14. Each card&rsquo;s `submitted_by` line uses the submitter&rsquo;s
    profile full name (not auth user id or email). Submitted-at is
    formatted in `America/Chicago`.
15. The leader-note preview truncates with an ellipsis at 140
    characters. Cards with no leader note simply omit the preview.

## Detail view

16. The detail header shows: week label ("Week of MMM D, YYYY"),
    group name, status badge, lifecycle badge, leaders line, meeting
    day/time.
17. The session card shows: status, meeting date (or "&mdash;" when
    blank), submitter full name, submitted-at, P/A/E counts (only
    when submitted), full leader note, full admin note (when
    present). Notes preserve line breaks.
18. The health card renders only when a `group_health_updates` row
    exists for `(group_id, update_week)`. Shows the pulse badge,
    follow-up flag, pulse leader note, pulse admin note.
19. The roster lists every active member. Members who appear in
    `attendance_records` for the session show their P/A/E status;
    members who do not appear show "Not recorded".
20. **Empty state.** Visit the detail URL for a group with no
    session row for the week. The session card is replaced with a
    sage-tinted "No check-in yet" banner. The roster still renders
    so the admin can see who would be marked.
21. **Closed group direct URL.** Visit
    `/admin/check-ins/<closed_group_id>?week=<W>`. The page renders
    with a muted "This group is closed" banner, the lifecycle badge
    reads "Closed", and the session/roster blocks render
    historically read-only.

## Negative paths

22. As `leader`, fetch `/admin/check-ins` via curl with a valid
    session cookie. Confirm a 307 to `/unauthorized` (server-side
    `requireAdmin()`).
23. As `staff_viewer`, same expectation: 307 to `/unauthorized`.
24. As a signed-out browser, same expectation: 307 to `/login`.

## Regression checks (Phase 5A.1 / 5A.2 / 5A.3 / 5B.0)

25. `/admin/people`: super_admin can still create a leader profile,
    add a member, assign a leader to a group, place a member, and
    deactivate. The audit trail still renders.
26. `/admin/groups`: super_admin can still create, edit, close, and
    reopen a group.
27. `/admin/super-admin`: super_admin can still see the audit trail,
    the role-change form, and the system-status checklist. The
    role-change workflow still rejects super_admin / staff_viewer
    targets and self-targets.
28. `/leader`: a leader still sees only the groups they are actively
    assigned to. The "Start check-in" / "Update check-in" CTA still
    works.
29. `/leader/<groupId>/checkin`: a leader can still submit a check-in
    that lands in `attendance_sessions` and writes the appropriate
    audit row. The corresponding entry should appear on
    `/admin/check-ins` the next time it is loaded.
30. `/admin-preview` and `/leader-preview` (no sign-in required)
    still render the fallback demo content.

## SQL spot-checks

```sql
-- Sessions for the verification week should be exactly the fixture above.
select g.name, s.status, s.submitted_at, p.full_name as submitter
  from public.attendance_sessions s
  join public.groups   g on g.id = s.group_id
  left join public.profiles p on p.id = s.submitted_by
 where s.meeting_week = '<W>'
 order by g.name;

-- Health updates for the verification week.
select g.name, h.pulse, h.follow_up_needed, h.leader_note
  from public.group_health_updates h
  join public.groups g on g.id = h.group_id
 where h.update_week = '<W>'
 order by g.name;
```

## Policy spot-check

```sql
-- Confirm no new INSERT/UPDATE/DELETE policies were added in 5B.1.
select tablename, cmd, count(*) as policy_count
  from pg_policies
 where schemaname = 'public'
   and tablename in (
     'attendance_sessions','attendance_records',
     'group_health_updates','audit_events',
     'groups','group_leaders','profiles','members','group_memberships'
   )
 group by tablename, cmd
 order by tablename, cmd;
```

Expected: every row&rsquo;s `cmd` for these tables remains as it was
after Phase 5B.0. No new policy rows from this phase &mdash; the page
is read-only.

## Security grep checks (run from repo root)

```bash
grep -r service_role .
grep -ri "SUPABASE_SERVICE\|sb_secret" .
grep -ri "\.delete(" "app/(protected)/admin/check-ins/" lib/
grep -ri "insert into public.attendance" app/ lib/
grep -ri "update public.attendance" app/ lib/
```

Expected:

- No `service_role` / `SUPABASE_SERVICE` / `sb_secret` references in
  app code (matches in `node_modules/`, `supabase/migrations/` audits,
  prior verification docs, or the published Phase 5B.1 docs
  themselves are fine).
- No `.delete(` invocations in
  `app/(protected)/admin/check-ins/` or in `lib/`.
- Zero `insert into public.attendance*` or `update public.attendance*`
  occurrences in `app/` or `lib/`; these live only in the Phase 5B.0
  migration body.

## Preview routes

- Visit `/admin-preview` and `/leader-preview` (no sign-in required).
  Both must render with fallback demo data. Phase 5B.1 does not
  introduce a public preview surface for the check-in review.

## Acceptance criteria

Phase 5B.1 is verified once every check above passes. Anything that
fails should be addressed by a follow-up commit on the same branch
before merge.
