# Phase 5B.0 — Manual Verification Checklist

This document is the checklist that should be run against a live
Supabase project before declaring Phase 5B.0 verified.

## Fast Smoke Test

The minimum end-to-end check after a deploy. Run this before the full
checklist below; if any step here fails, do not bother with the deeper
audit until the regression is understood.

1. Identify (or create) one open Life Group that has at least two
   active members in `group_memberships`.
2. Identify (or create) one `leader` or `co_leader` profile linked to a
   Supabase Auth user and actively assigned (`group_leaders.active =
   true`) to that group, plus a second group for step 6.
3. Sign in as that leader. Confirm `/leader` lists only the assigned
   group(s); admin routes redirect to `/unauthorized`.
4. Open the first group's check-in page and submit attendance for the
   current week (mark one member present, one absent). Confirm the
   leader is redirected back with a success notice and the row appears
   on the dashboard.
5. Re-open the same check-in and resubmit with a different attendance
   pattern. Confirm there is still exactly one row in
   `attendance_sessions` for `(group_id, week_start)` and that
   `audit_events` shows a `leader.update_checkin` row for the second
   submission.
6. From the leader dashboard, mark the second group as `did_not_meet`
   for the current week. Confirm a session row exists with status
   `did_not_meet` and an `audit_events` row with action
   `leader.mark_did_not_meet`.
7. Sign out, sign in as `super_admin`, and confirm all three audit
   events from steps 4–6 are visible in the audit trail.
8. From the same `super_admin` session, confirm `/admin/people` and
   `/admin/groups` still render and that at least one admin write
   (e.g. editing a group note) still succeeds.
9. Sign out, sign in as `ministry_admin`, and confirm the audit trail
   is **not** visible (RLS gate). All other admin pages should still
   work.
10. Sign out, sign in as the leader again, and confirm that visiting
    `/admin`, `/admin/people`, or `/admin/groups` redirects to
    `/unauthorized`.

If all ten steps pass, Phase 5B.0 is healthy for live testing. Run the
full checklist below before any release that touches leader or
attendance code.

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
- A `super_admin` profile exists and is linked to a Supabase Auth user
  (Tom's account in the live environment).
- A `ministry_admin` profile exists and is linked to a Supabase Auth
  user (Julian's account in the live environment).
- At least one `leader` or `co_leader` profile is linked to a Supabase
  Auth user and is actively assigned (`group_leaders.active = true`)
  to at least one Life Group. The group should have a few active
  members in `group_memberships` so the attendance form has rows to
  render.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  (or the legacy anon key) are set in the deployed environment.

## Automated checks

- `npm run lint`
- `npm run typecheck`
- `npm run build`

Each must pass with no new warnings or errors.

## Leader happy-path workflow

1. Sign in as the leader user.
2. Open `/leader`. Confirm:
   - The "My Groups" nav item is highlighted.
   - Each assigned group renders as a card; the hero callout reads
     "How did tonight go?" with a **Start check-in** button and a
     **Group did not meet** secondary button.
   - The dashboard shows the *current calendar week* in the card
     header.
3. Click **Start check-in** on one of the cards.
4. Confirm the route is `/leader/<group_id>/checkin`, the form
   renders, and the page header reads "<group name> — this week".
5. Pick **Yes — we met** (the default). Verify the attendance list
   appears with one row per active member, each row showing a P / A
   / E button group.
6. Tap a mix of P / A / E for the roster, then submit. Confirm:
   - The page redirects to `/leader?checkin=saved`.
   - A sage-toned "Saved" banner appears at the top of the dashboard.
   - The card hero callout now reads "Anything to add?", shows the
     `Submitted` status badge, and includes the P/A/E count.
   - The CTA changes to **Update check-in**.
7. Click **Update check-in**. Confirm the form is pre-filled with the
   selections from step 6 and the leader note (if any).
8. Change one person from "P" to "A", add a leader note like
   "Discussion went deep this week.", set the health pulse to
   **Watch**, and submit. Confirm the dashboard reflects the new
   counts and the success banner appears again.
9. Return to `/leader`. From the original card (still showing
   `Submitted`), the secondary **Group did not meet** button should be
   hidden once a session exists for this week — only an
   **Update check-in** link remains.
10. Pick a different assigned group (or revert to the original after
    deleting the session in SQL for a fresh start) and click
    **Group did not meet**. Confirm:
    - A confirm dialog appears.
    - On confirm, the page reloads with the saved banner; the card
      hero shows `Did not meet` and no P/A/E counts.

## did_not_meet via the form

11. Visit `/leader/<group_id>/checkin` for a group that has no
    current-week session. Pick **No — we didn't meet** and submit
    (you can leave the leader note blank). Confirm the dashboard
    updates to `Did not meet` and no attendance rows are written.

## planned_pause via the form

12. Same as above but pick **Planned pause** and submit. Confirm the
    card hero reads `Planned pause` and the dashboard accepts the
    submission.

## Health pulse persistence

13. Submit a check-in with `pulse=healthy` and `follow_up_needed=true`.
14. As `super_admin`, run in the SQL editor:
    ```sql
    select group_id, update_week, pulse, follow_up_needed,
           leader_note, admin_note, submitted_by
      from public.group_health_updates
     order by created_at desc
     limit 5;
    ```
15. Confirm the latest row shows the chosen pulse, the
    `follow_up_needed = true`, the leader note, and `admin_note IS
    NULL` (untouched).
16. As `super_admin`, manually set `admin_note = 'admin observation'`
    in SQL for that row, then have the leader re-submit the form (any
    edit). Re-run the query: `admin_note` should still be
    `'admin observation'` — the RPC must not overwrite it.

## Audit log (super_admin only)

17. Sign in as `super_admin`. Open `/admin/people`. Scroll to the
    audit trail. Confirm:
    - The most recent rows include the leader actions from steps
      6–11: `leader.submit_checkin`, `leader.update_checkin`, and
      `leader.mark_did_not_meet`.
    - Each row shows a friendly description like "Submitted check-in
      for <group name> (week of YYYY-MM-DD)".
18. Open `/admin/groups`. Scroll to the audit trail. Same set of
    leader rows are visible there.
19. Sign out, sign in as `ministry_admin`, and open either admin
    page. **The audit trail section must not render at all** —
    matches Phase 5A.2 behaviour. Use the SQL Editor (with the
    ministry_admin's JWT, or with the Supabase REST endpoint) to
    confirm `select * from public.audit_events` returns zero rows.

## Week-range tampering

26a. Replay a form `POST` with the hidden `meeting_week` field set to a
    date more than 7 days before the current Monday (e.g. last month).
    Confirm:
    - The RPC raises `invalid_input`.
    - The UI shows "Something in this check-in didn't look right.
      Refresh and try again."
    - No `attendance_sessions` or `attendance_records` rows were
      mutated for that historical week.
26b. Replay with `meeting_week` set to a Monday more than 7 days in
    the future. Same expectation: `invalid_input`, no writes.
26c. Replay with `meeting_week` set to the immediately preceding
    Monday (one week back). Confirm it succeeds — the 7-day grace
    window is intentional and covers Sunday-evening meetings
    submitted Monday morning.

## Follow-up without pulse

26d. Submit a check-in with `pulse=""` (no update) and
    `follow_up_needed=true`. Confirm:
    - The submit succeeds.
    - A new row appears in `group_health_updates` for that week
      with `pulse='needs_follow_up'`, `follow_up_needed=true`,
      `submitted_by` set to the leader, and `admin_note` left
      untouched. This guarantees the escalation signal is visible
      to admin even if the leader didn't explicitly choose a pulse.

## Malformed attendance payload

26e. Submit a check-in with `status=submitted` and the hidden
    `attendance` field set to a non-array value (e.g. `{}` or a
    string). Confirm:
    - The RPC raises `invalid_input` *before* any delete runs.
    - In SQL, `select count(*) from public.attendance_records
      where session_id = <the session id>` is unchanged from
      before the failed submit.

## Concurrent first-time submit (leader + co-leader race)

26f. Set up: an assigned leader AND co-leader on the same group,
    no `attendance_sessions` row for the current week yet.
26g. Have both sign in (different browsers / sessions) and submit
    a check-in for the same group at the same time (or simulate
    via two SQL Editor windows calling
    `select public.leader_submit_group_checkin(...)` with the
    same args concurrently). Confirm:
    - Both calls return successfully (no `unique_violation` error).
    - In SQL, `select count(*) from public.attendance_sessions
      where group_id = <id> and meeting_week = <W>` returns
      exactly 1.
    - Two audit events exist for this group/week; the later one
      may show `leader.submit_checkin` rather than
      `leader.update_checkin` under extreme races -- the data is
      correct, the audit semantics are best-effort under
      concurrency.

## Clearing a previously-saved pulse

26h. Submit a check-in with `pulse=watch` for the current week.
26i. Re-open the form, change the pulse selector to "No update",
    leave `follow_up_needed=false`, and submit. Confirm:
    - The submit succeeds.
    - In SQL, `select * from public.group_health_updates
      where group_id = <id> and update_week = <W>` returns
      zero rows (the leader's row was cleared).
26j. Repeat 26h-i, but before re-submitting set
    `admin_note = 'admin observation'` in SQL on the existing
    row. Re-submit the form with `pulse=""` and `follow_up=false`.
    Confirm:
    - The submit succeeds.
    - The row is **NOT** deleted; `admin_note` is still
      `'admin observation'`. Admin work is preserved.

## Audit feed OR-filter

26k. As `super_admin`, open `/admin/people`. Confirm the audit
    trail section renders without an error banner and shows
    both `admin.%` and `leader.%` events mixed (the page calls
    `fetchRecentAuditEvents` with `actionsLike: ["admin.%", "leader.%"]`
    and the PostgREST OR-filter must accept the dotted patterns).
    A regression in the OR-filter quoting would surface here as
    "Couldn't load audit events: ..." with a parse error.

## Historical-member attendance preservation

26l. Submit a `submitted` check-in for week W with three attendance
    rows (members A, B, C all active). Then as `super_admin`,
    deactivate member C via `/admin/people`.
26m. Reopen the leader check-in for week W and just edit the leader
    note (don't touch attendance). Submit. Confirm in SQL:
    ```sql
    select member_id, attendance_status
      from public.attendance_records
     where session_id = '<session id>'
     order by member_id;
    ```
    The result must still include C's original record — historical
    attendance for the now-inactive member is preserved.
26n. Reopen the same week. The roster shown in the form should NOT
    include C (since the prefill filters to active members). Toggle
    A's status from `P` to `A` and submit. Re-run the SQL above:
    A's row is now `absent`, B's row unchanged, C's record still
    present and unchanged. The "delete active-but-not-in-payload"
    branch must not touch C because C is no longer on the active
    roster.

## Timezone-correct week assignment

26o. (Manual / time-of-day dependent.) During the window when UTC
    has rolled past midnight but `America/Chicago` is still Sunday
    (roughly 7pm–midnight Central on a Sunday), open `/leader` and
    confirm the dashboard's "this week" label shows the Monday
    *before* today's Sunday (i.e. the week containing today's
    Sunday in Central time), not the upcoming Monday. Submit a
    check-in and confirm `attendance_sessions.meeting_week` matches
    the Sunday's Monday, and the dashboard immediately reflects the
    submission as "this week". Off-hours testing can be simulated by
    temporarily forcing `process.env.TZ=UTC` on the server and
    flipping the system clock to that window.

## Authorization (negative paths)

20. Sign in as a `leader` who is NOT assigned to group X. Manually
    navigate to `/leader/<X>/checkin`. Confirm the route redirects
    to `/leader` (the assignedGroupIds guard in the page rejects).
21. From a browser dev tool, replay the form `POST` request with a
    `group_id` set to a group the leader is not assigned to. Confirm
    the server action returns "Only an assigned leader or co-leader
    can submit this check-in." and the database is unchanged.
22. As `super_admin` or `ministry_admin` who is NOT in
    `group_leaders` for any group, visit `/leader`. Confirm the route
    redirects to `/unauthorized` (the existing `requireLeader()`
    guard rejects admins by role).
23. As a `super_admin` who is ALSO an active leader of some group,
    visit `/leader` — confirm they can use the workflow normally.
    (This is intentional: it lets a super_admin who actually shepherds
    a group still submit check-ins.)
24. Close a group via `/admin/groups`. As the leader assigned to that
    group, try to visit `/leader/<closed_group_id>/checkin`. Confirm
    the page redirects to `/leader?closed=...` and the dashboard hero
    callout reads "This group is closed."
25. With the same closed group, replay a form `POST` for it. Confirm
    the RPC raises `group_closed` and the friendly message
    "That group is closed, so check-ins are turned off for it."
    appears.

## Attendance validation

26. Submit a check-in payload that references a `member_id` that's
    NOT in any active membership of the target group (e.g. by editing
    the hidden `attendance` JSON in dev tools). Confirm:
    - The RPC raises `invalid_member`.
    - The UI shows "One of the people on the attendance list isn't
      in this group anymore. Refresh and try again."
    - No attendance records were written.
27. Repeat the submit with the corrected payload. Confirm the records
    save correctly.

## Empty / missing roster

28. Pick a group with **zero active members**. Visit
    `/leader/<group_id>/checkin`. Confirm:
    - The page renders without crashing.
    - The "Yes — we met" branch shows a friendly "no active members"
      empty state explaining that the leader can still submit a note
      or use the "did not meet" option.
    - Selecting "No — we didn't meet" and submitting works without
      errors.

## Duplicate submission (idempotency)

29. Submit a check-in for week W with status=submitted and three
    attendance rows.
30. Re-submit the same form again with no changes. Confirm:
    - The page redirects with a saved banner each time.
    - In SQL:
      ```sql
      select count(*) from public.attendance_sessions
       where group_id = '<id>' and meeting_week = '<W>';
      ```
      Returns exactly **1** row.
    - `attendance_records` for that session row shows the same three
      rows (no duplicates).
    - The audit trail shows two entries: the first
      `leader.submit_checkin`, the second `leader.update_checkin`.

## Cross-page regression checks (Phase 5A.1 / 5A.2)

31. As super_admin: open `/admin/people`. Add a new leader profile,
    add a member, assign the leader to a group, place the member in
    the group, then deactivate both. All workflows must still succeed
    and appear in the audit trail mixed with the new leader events.
32. As super_admin: open `/admin/groups`. Create a group, edit it,
    close it, reopen it. All workflows must still succeed.

## SQL spot-checks

```sql
-- Sessions are upserted, not duplicated.
select group_id, meeting_week, count(*) as session_count
  from public.attendance_sessions
 group by group_id, meeting_week
 having count(*) > 1;
-- Expected: zero rows.

-- Latest sessions, see the writer.
select s.group_id, s.meeting_week, s.status, s.submitted_by,
       s.submitted_at, s.leader_note
  from public.attendance_sessions s
 order by s.updated_at desc
 limit 10;

-- Attendance for the latest session.
select s.meeting_week, m.full_name, r.attendance_status
  from public.attendance_sessions s
  join public.attendance_records  r on r.session_id = s.id
  join public.members             m on m.id          = r.member_id
 where s.updated_at = (select max(updated_at) from public.attendance_sessions)
 order by m.full_name;

-- Audit events for leader workflows.
select action, entity_type, entity_id, metadata, created_at
  from public.audit_events
 where action like 'leader.%'
 order by created_at desc
 limit 10;
```

Expected:

- No duplicate `(group_id, meeting_week)` rows.
- `submitted_by` is the leader's profile id; `submitted_at` is
  populated.
- Audit metadata captures `meeting_week`, `status`, `attendance_count`,
  `pulse_set`, and `follow_up_needed`.

## Policy spot-check

```sql
-- No new INSERT/UPDATE/DELETE policies introduced.
select tablename, cmd, count(*) as policy_count
  from pg_policies
 where schemaname = 'public'
   and tablename in (
     'attendance_sessions','attendance_records',
     'group_health_updates','audit_events'
   )
 group by tablename, cmd
 order by tablename, cmd;
```

Expected: every row's `cmd` is `SELECT`. No `INSERT` / `UPDATE` /
`DELETE` policy rows for any of these tables. Writes flow only through
`leader_submit_group_checkin`.

## Security grep checks (run from repo root)

```bash
grep -r service_role .
grep -ri "SUPABASE_SERVICE\|sb_secret" .
grep -ri "\.delete(" "app/(protected)/leader/" lib/
grep -ri "delete from public.attendance" supabase/migrations/
grep -ri "delete from public.group_health_updates" supabase/migrations/
```

Expected:

- No `service_role` / `SUPABASE_SERVICE` / `sb_secret` references in
  app code (occurrences inside `node_modules/` or the published
  verification docs can be ignored).
- No `.delete(` invocations in the leader app code or in `lib/`.
- One `delete from public.attendance_records` inside the Phase 5B.0
  migration. It is scoped by `session_id` inside the SECURITY DEFINER
  RPC, after every authorization check has passed. No hard delete of
  `attendance_sessions` itself.
- One `delete from public.group_health_updates` inside the Phase 5B.0
  migration. It is scoped by `(group_id, update_week)` AND requires
  `admin_note is null`, inside the SECURITY DEFINER RPC after all
  authorization checks. This implements the leader's explicit
  "clear my pulse for this week" intent without ever overwriting
  admin work.

## Preview routes

- Visit `/admin-preview` and `/leader-preview` (no sign-in required).
  Both must render with fallback demo data only — no Supabase writes,
  no audit rows. The leader preview's primary CTA is shown as a
  disabled button with the tooltip "Preview — sign in as a leader to
  start a real check-in."

## Acceptance criteria

Phase 5B.0 is verified once every check above passes. Anything that
fails should be addressed by a follow-up commit on the same branch
before merge.
