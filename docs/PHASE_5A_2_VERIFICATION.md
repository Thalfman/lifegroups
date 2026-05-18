# Phase 5A.2 — Manual Verification Checklist

This document is the checklist that should be run against a live
Supabase project before declaring Phase 5A.2 verified.

## Prerequisites

- Supabase project has, in order:
  - Phase 2 schema (`20260517040000_phase2_schema.sql`)
  - Phase 4 RLS (`20260518000000_phase4_rls.sql`)
  - Phase 5A.1 admin people writes
    (`20260518050000_phase5a1_admin_people_writes.sql`)
  - Phase 5A.2 admin group writes
    (`20260518060000_phase5a2_admin_group_writes.sql`)
  - Phase 5A.2 grants hardening
    (`20260518070000_phase5a2_grants_hardening.sql`) — this is what
    makes a fresh project work without the manual `grant select` step
    that Phase 5A.1 needed.
- A `super_admin` profile exists and is linked to a Supabase Auth user
  (Tom's account in the live environment).
- A `ministry_admin` profile exists and is linked to a Supabase Auth
  user (Julian's account in the live environment) — required to verify
  ministry_admin admin workflows still work AND that the audit trail is
  hidden from ministry_admin.
- At least one `leader` or `co_leader` profile exists and is linked to
  a Supabase Auth user — required to verify they cannot access
  `/admin/groups`.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  (or the legacy anon key) are set in the deployed environment.

## Automated checks

- `npm run lint`
- `npm run typecheck`
- `npm run build`

Each must pass with no new warnings or errors.

## Super admin happy-path workflow

1. Sign in as the super_admin user.
2. Open `/admin/groups`. Confirm the page renders, the Phase 5A.2
   notice appears, and the "Manage Groups" nav item is highlighted.
3. Use the **Create group** form to add a new Life Group. Confirm:
   - The card appears in the "Active groups" section with the
     `active` lifecycle badge.
   - The form is reset after submit, with a friendly success message.
4. Click **Edit** on the new group, change the description and meeting
   time, then **Save changes**. Confirm:
   - The card re-renders with the new copy.
   - The success message reads "Group updated."
5. Click **Close group**, confirm the prompt, and submit. Confirm:
   - The group moves to the "Closed groups" archive section with the
     "Closed <date>" line populated.
   - It no longer appears in the active roster.
6. Click **Reopen group** on the closed card. Confirm:
   - The group moves back to the "Active groups" section.
   - Its lifecycle badge reads `active`.
7. Scroll to the audit trail at the bottom. Confirm four new events
   appear, newest first, with the super_admin as the actor:
   1. `admin.create_group`
   2. `admin.update_group`
   3. `admin.close_group`
   4. `admin.reopen_group`
8. Open `/admin/people`. Confirm the audit trail at the bottom of that
   page now shows BOTH the Phase 5A.1 people events AND the Phase 5A.2
   group events (most recent first).

## Ministry admin workflow

9. Sign out and sign in as the ministry_admin user.
10. Open `/admin/groups`. Confirm:
    - The page renders, the create form works, edit / close / reopen
      buttons all work just like for super_admin.
    - The **audit trail section is NOT rendered**.
11. Open `/admin/people`. Confirm:
    - The leader / member / assignment workflows still work
      end-to-end.
    - The **audit trail section is NOT rendered**.
12. As a security spot-check, attempt to query `audit_events` directly
    while signed in as ministry_admin (Supabase SQL Editor with the
    user's JWT, or the network tab against the REST endpoint). The
    response should be an empty array — RLS policy
    `audit_events_super_admin_read` denies the read.

## Leader / co-leader workflow

13. Sign out and sign in as a `leader` or `co_leader` user.
14. Try to visit `/admin/groups`. Confirm the route redirects to
    `/unauthorized`.
15. Try to visit `/admin/people`. Confirm the same redirect.
16. Confirm `/leader` still loads and the assigned-group scoping works
    as before.

## Empty-state checks

17. With a fresh Supabase project (no groups), sign in as super_admin
    and open `/admin/groups`. Confirm:
    - The create form is the only thing in the "Active groups" section
      except for the empty-state card.
    - The "Closed groups" section is hidden when there are no closed
      groups.
    - The audit trail empty state renders without crashing.

## Negative-path manual checks

- Submit the create form with an empty name → friendly validation error.
- Submit the create form with a 1500-character description → friendly
  "too long" validation error.
- Submit the create form with `capacity = -3` → friendly validation
  error.
- Try to close an already-closed group via direct form submission →
  RPC raises `group_already_closed`, mapped to friendly text.
- Try to reopen a group that is already active via direct form
  submission → RPC raises `group_not_closed`, mapped to friendly text.
- Try to update a group that has been deleted underneath you (e.g.
  remove it via direct SQL, then submit the form) → RPC raises
  `missing_group`, mapped to "We couldn't find that group."

## SQL spot-check (run in Supabase SQL Editor as super_admin)

```sql
select action, entity_type, entity_id, created_at
  from public.audit_events
 where action like 'admin.%group%'
 order by created_at desc
 limit 20;

select id, name, lifecycle_status, closed_at
  from public.groups
 order by updated_at desc
 limit 10;
```

Expected:

- One audit row per workflow you triggered above
  (`admin.create_group`, `admin.update_group`, `admin.close_group`,
  `admin.reopen_group`), newest first.
- The closed-then-reopened group's `groups` row shows
  `lifecycle_status = 'active'` and `closed_at IS NULL` once reopened.

## Policy spot-check

```sql
select policyname, qual
  from pg_policies
 where tablename = 'audit_events';
```

Expected: a single `audit_events_super_admin_read` policy whose USING
clause references `auth_role() = 'super_admin'`. The old
`audit_events_admin_read` policy should be gone.

## Grants spot-check (proves no manual `grant select` is needed)

```sql
select table_name, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public'
   and grantee      = 'authenticated'
   and privilege_type = 'SELECT'
 order by table_name;
```

Expected rows (13 tables): `app_settings`, `attendance_records`,
`attendance_sessions`, `audit_events`, `follow_ups`, `group_health_updates`,
`group_leaders`, `group_memberships`, `group_status_history`, `groups`,
`guests`, `members`, `profiles`. If any of these are missing on a fresh
project, re-run migration `20260518070000_phase5a2_grants_hardening.sql`.

```sql
select n.nspname, c.relname, c.relrowsecurity
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
   and c.relname in (
     'profiles','groups','group_leaders','members','group_memberships',
     'attendance_sessions','attendance_records','guests','follow_ups',
     'group_health_updates','group_status_history','audit_events','app_settings'
   )
 order by c.relname;
```

Expected: `relrowsecurity = true` on every row. RLS must stay on; the
grants in the hardening migration are pre-RLS table privileges, not a
bypass.

## Security grep checks (run from repo root)

```bash
grep -rn service_role .
grep -rni "SUPABASE_SERVICE\|sb_secret" .
grep -rni "\.delete(" "app/(protected)/admin/groups/" lib/admin/
grep -rn "delete from public.groups" supabase/migrations/
```

Expected:

- No `service_role` / `SUPABASE_SERVICE` / `sb_secret` references in
  app code (occurrences inside `node_modules/` or unrelated tooling
  can be ignored).
- No `.delete(` invocations were added to the admin groups workflow
  or `lib/admin/`.
- No `delete from public.groups` (or any hard delete) in the new
  Phase 5A.2 migration.

## Preview routes

- Visit `/admin-preview` and `/leader-preview` (no sign-in required) and
  confirm both render with fallback demo data only — no Supabase writes,
  no audit rows.

## Minimal-data group creation (real-world pastoral entry)

The create form is intentionally lenient so a pastor can add a group
when they only know its name. Manually confirm:

- Submit the create form with only the **name** filled in (e.g.
  "Wednesday Westside"). A group is created with `lifecycle_status = 'active'`,
  `health_status = 'healthy'`, every other column null. No error.
- Submit with **name + meeting day + meeting time** filled in. The
  card on the active roster shows the meta line; the underlying row
  has those columns populated and the rest still null.
- The leader name is **not** captured on the group itself yet. Leader
  linkage happens through `/admin/people` once you have the leader's
  email. Do **not** fake an email to satisfy a form — leave the group
  unlinked until the real email is known. This is a documented
  follow-up (see `docs/PHASE_5A_2_HARDENING_REPORT.md`).

## Acceptance criteria

Phase 5A.2 is verified once every check above passes. Anything that
fails should be addressed by a follow-up commit on the same branch
before merge.
