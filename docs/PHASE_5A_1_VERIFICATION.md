# Phase 5A.1 — Manual Verification Checklist

This document is the checklist that should be run against a live
Supabase project before declaring Phase 5A.1 verified.

## Prerequisites

- Supabase project has Phase 2 schema, Phase 4 RLS, and the Phase 5A.1
  migration `supabase/migrations/20260518050000_phase5a1_admin_people_writes.sql`
  applied.
- A `super_admin` profile exists and is linked to a Supabase Auth user
  (Tom's `tomhalfman22@gmail.com` in the live environment).
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  (or the legacy anon key) are set in the deployed environment.

## Automated checks

- `npm run lint`
- `npm run typecheck`
- `npm run build`

Each must pass with no new warnings or errors.

## Happy-path manual workflow

1. Sign in as Tom (`super_admin`).
2. Open `/admin/people`. Confirm the page renders, the Phase 5A.1
   notice appears, and Julian is named as the ministry admin persona.
3. Add a leader profile via the "Add leader" form (use a non-Julian,
   non-Tom email — Julian's real profile is provisioned outside the
   app).
4. Add a member via the "Add member" form.
5. In the group assignments section, assign the new leader to a group
   (pick role `leader`).
6. In the same group, place the new member into the group.
7. Deactivate the leader profile from the inline button. Confirm the
   row moves to inactive AND the group_leaders assignment from step 5
   shows `active = false`.
8. Deactivate the member from the inline button. Confirm the row moves
   to inactive AND the group_memberships row from step 6 shows
   `status = 'inactive'` with `ended_at` populated.
9. Scroll to the audit trail section. Confirm six events appear,
   newest first, with Tom as the actor:
   1. `admin.create_leader_profile`
   2. `admin.create_member`
   3. `admin.assign_leader_to_group`
   4. `admin.assign_member_to_group`
   5. `admin.deactivate_profile`
   6. `admin.deactivate_member`

## Empty-state checks

10. Reset to an empty database (or use a fresh schema). Open
    `/admin/people`. Confirm:
    - The leader and member sections render empty states without crashing.
    - The group assignments section renders its empty state.
    - The leader-assignment and member-assignment selects are disabled
      when no options are available, with helper text explaining why.
    - The audit trail shows its empty state.

## Authorization checks

11. Sign in as a `leader` or `co_leader` and visit `/admin/people`.
    Confirm the route redirects to `/unauthorized`.
12. Visit `/admin-preview` and `/leader-preview`. Confirm both still
    render with fallback demo data and never write to Supabase.

## SQL spot-check (run in Supabase SQL Editor)

```sql
select action, entity_type, created_at
  from public.audit_events
 where action like 'admin.%'
 order by created_at desc
 limit 10;

select id, profile_id, group_id, role, active
  from public.group_leaders
 order by created_at desc
 limit 10;

select id, member_id, group_id, status, ended_at
  from public.group_memberships
 order by created_at desc
 limit 10;
```

Expected:

- Six `admin.*` audit events exist (one per workflow), newest first.
- The deactivated leader's `group_leaders` row has `active = false`.
- The deactivated member's `group_memberships` row has
  `status = 'inactive'` and `ended_at` populated with today's date.

## Negative-path manual checks

- Submit a leader profile with an email that already exists →
  friendly "email already in use" error and no new profile row.
- Use the rendered UI to try to deactivate your own profile → action
  rejects with the self-target guard message. (The SQL function also
  raises `self_target_not_allowed` as defense in depth.)
- Submit an assignment with a non-leader profile → rejected with the
  `invalid_role` friendly text.
- Submit the same leader/group/role assignment twice → second attempt
  shows the "already assigned" friendly error.

## Security grep checks (run from repo root)

```bash
grep -r service_role .
grep -ri "SUPABASE_SERVICE\|sb_secret" .
grep -ri "halfman\|tomhalfman\|julian" app/ lib/ components/ supabase/ types/
grep -ri "\.delete(" "app/(protected)/admin/people/" lib/admin/
```

Expected:

- No `service_role` / `SUPABASE_SERVICE` / `sb_secret` references in
  app code (occurrences inside `node_modules/` or unrelated tooling
  can be ignored).
- Julian / Tom appear only in user-facing persona copy or docs — no
  hardcoded UUIDs and no hardcoded emails outside intentional
  documentation references (e.g., `README.md` and this verification
  doc that name Tom's real email for sign-in instructions).
- No `.delete(` invocations were added to the admin people workflow
  or `lib/admin/`.

## Acceptance criteria

Phase 5A.1 is verified once every check above passes. Anything that
fails should be addressed by a follow-up commit on the same branch
before merge.
