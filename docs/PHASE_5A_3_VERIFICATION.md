# Phase 5A.3 — Manual Verification Checklist

Run this checklist against a live Supabase project before declaring
Phase 5A.3 verified.

## Prerequisites

- Supabase project has, in order:
  - Phase 2 schema (`20260517040000_phase2_schema.sql`)
  - Phase 4 RLS (`20260518000000_phase4_rls.sql`)
  - Phase 5A.1 admin people writes
    (`20260518050000_phase5a1_admin_people_writes.sql`)
  - Phase 5A.2 admin group writes + audit visibility
    (`20260518060000_phase5a2_admin_group_writes.sql`)
  - Phase 5A.2 grants hardening
    (`20260518070000_phase5a2_grants_hardening.sql`)
  - Phase 5B.0 leader check-in writes
    (`20260518080000_phase5b0_leader_checkin_writes.sql`)
  - **Phase 5A.3 super admin role writes**
    (`20260518090000_phase5a3_super_admin_role_writes.sql`)
- A `super_admin` profile exists and is linked to a Supabase Auth user
  (Tom's account in the live environment).
- A `ministry_admin` profile exists and is linked to a Supabase Auth
  user (Julian's account in the live environment) — required to
  verify ministry_admin admin workflows still work AND that the
  /admin/super-admin route + audit log are inaccessible.
- At least one `leader` or `co_leader` profile exists and is linked
  to a Supabase Auth user — required to verify the role-change
  workflow end-to-end and that they cannot access /admin/super-admin.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  (or the legacy anon key) are set in the deployed environment.

## Automated checks

- `npm run lint`
- `npm run typecheck`
- `npm run build`

Each must pass with no new warnings or errors.

## Manual UI walkthrough (13 checkpoints)

### Navigation visibility

1. Sign in as the `super_admin` user. Confirm the nav reads, in
   order: **Home, Admin, Manage People, Manage Groups, Super Admin**.
2. Sign out, sign in as the `ministry_admin` user. Confirm the nav
   reads: **Home, Admin, Manage People, Manage Groups**. The
   "Super Admin" link is **not** present.
3. Sign out, sign in as a `leader` (or `co_leader`) user. Confirm the
   nav reads: **Home, My Groups**. Neither "Super Admin" nor any
   admin item appears.
4. There is no Staff View link in any nav.

### Route guards

5. As `super_admin`, open `/admin/super-admin`. The page renders
   with the Phase 5A.3 notice at the top and all five sections
   (Owner controls overview, Audit log, Role management, System
   status, Deprecated Staff View note).
6. Sign in as `ministry_admin`, navigate directly to
   `/admin/super-admin`. You are redirected to `/unauthorized`.
7. Sign in as `leader` (or `co_leader`), navigate directly to
   `/admin/super-admin`. You are redirected to `/unauthorized`.

### Audit visibility

8. As `ministry_admin`, open `/admin/people`. Scroll to the bottom —
   the audit trail section is **gone**. Repeat on `/admin/groups`.
9. As `super_admin`, open `/admin/people` and `/admin/groups`. Same
   result — the audit trail no longer appears on either page. The
   only surface is now the Audit log panel on `/admin/super-admin`.
10. As `ministry_admin`, attempt a raw query against `audit_events`
    in the Supabase SQL editor with the user's JWT. The response is
    an empty array — RLS policy `audit_events_super_admin_read`
    denies the read.

### Role management — happy path

11. As `super_admin`, on `/admin/super-admin`, pick a test
    `leader` profile from the Role management form, choose
    `ministry_admin`, submit.
    - The form shows "Role updated."
    - A new entry appears in the Audit log panel above reading
      "Changed role of {full_name} from leader to ministry_admin",
      with the super_admin as the actor.
    - Sign in as that test user — they now land on `/admin` and see
      the ministry_admin nav (no Super Admin link).
12. As `super_admin`, change the same test user back to `leader`.
    Confirm a second audit row appears with the inverse change. The
    test user, signed back in, lands on `/leader` and sees only the
    My Groups item.

### Role management — negative paths

13. As `super_admin`, attempt to change **your own** profile's role.
    The profile select omits you, and submitting a forged profile_id
    via the network tab is rejected by `guardAgainstSelfRoleChange`
    (server) and `self_target_not_allowed` (RPC). Message: "You
    can't deactivate, reassign, or change your own role through this
    screen."
14. As `super_admin`, attempt to assign `staff_viewer` to a target
    profile. The role select omits it. A forged `new_role=staff_viewer`
    POST is rejected by `guardAgainstStaffViewerAssignment` and, as
    defense in depth, by the RPC's `invalid_role` raise.
15. As `super_admin`, attempt to assign `super_admin` to a target
    profile. The role select omits it. A forged POST is rejected by
    `guardAgainstSuperAdminAssignment` and, as defense in depth, by
    the RPC's `forbidden_target` raise.

### Members remain non-auth

16. Open `/admin/people`. The Members section still shows
    non-auth member records added via Manage People. The Members
    UI is unchanged in Phase 5A.3; members never sign in.

### Regression sweep

17. `/admin/people` — add a leader, add a member, assign a leader,
    place a member in a group, deactivate. Every flow works as before.
18. `/admin/groups` — create, edit, close, reopen. Every flow works
    as before.
19. `/leader` — sign in as a leader, submit a weekly check-in for an
    assigned group, mark another as did_not_meet. Audit rows appear
    on `/admin/super-admin`.

## System status checklist (visual smoke)

20. On `/admin/super-admin`, scroll to the System status section.
    With a seeded Supabase project, you should see 7 "Good" / "Note"
    rows. With an empty project, "Groups exist", "Leaders exist",
    "Members exist", and "At least one leader has an active group
    assignment" may read "Missing" until you add data via
    `/admin/people` and `/admin/groups`.

## SQL spot-checks (run in Supabase SQL Editor as super_admin)

```sql
-- Confirm the new RPC exists.
select proname, prosecdef
  from pg_proc
 where proname = 'super_admin_update_profile_role';
```

Expected: one row, `prosecdef = true`.

```sql
-- Confirm the new audit action appears after a role change.
select actor_profile_id, action, entity_id, metadata, created_at
  from public.audit_events
 where action = 'super_admin.update_profile_role'
 order by created_at desc
 limit 5;
```

Expected: one row per role change, with metadata of the form
`{ "before": { "role": "..." }, "after": { "role": "..." } }`.

```sql
-- Confirm RLS is still super_admin-only on audit_events.
select policyname, qual
  from pg_policies
 where tablename = 'audit_events';
```

Expected: exactly one policy `audit_events_super_admin_read` whose
USING clause references `auth_role() = 'super_admin'`.

## Security grep checks (run from repo root)

```bash
grep -r service_role .
grep -ri "SUPABASE_SERVICE\|sb_secret" .
grep -ri "\.delete(" "app/(protected)/admin/" lib/admin/
grep -ri "super_admin_update_profile_role" supabase/migrations/
grep -ri "staff_viewer" app/ components/ lib/ docs/ supabase/
```

Expected results:

- **`service_role`**: only doc references inside
  `docs/PHASE_5A_*` / `docs/PHASE_5B_*` / `docs/LAUNCH_POLISH_QA.md`.
  No occurrences in `app/`, `components/`, or `lib/`.
- **`SUPABASE_SERVICE` / `sb_secret`**: only doc references in the
  same files. No app code uses either.
- **`.delete(`**: no matches under `app/(protected)/admin/` or
  `lib/admin/`. Phase 5A.3 introduces no hard-delete call sites; the
  role-change RPC is an UPDATE.
- **`super_admin_update_profile_role`**: hits only the new
  Phase 5A.3 migration (and the wrapper at
  `lib/admin/rpc.ts`, the action at
  `app/(protected)/admin/super-admin/actions.ts`, and these docs).
- **`staff_viewer`**: appears only in compat / type / docs surfaces
  (`types/enums.ts`, `lib/auth/roles.ts`, `lib/auth/session.ts`
  in the unreferenced `requireAdminOrStaff` helper,
  `lib/admin/validation.ts` `USER_ROLES` set,
  `lib/supabase/read-models.ts` comment, the SQL migrations and
  seed file, `supabase/dev/README.md`, `README.md`,
  `docs/ARCHITECTURE.md`, `docs/DATABASE_SCHEMA.md`, the
  Phase 5A.2 / 5B.0 / 5A.3 docs, and the new
  `staff-view-deprecated-note.tsx` UI surface that documents the
  deprecation). No nav promotion, no live workflow.

## Acceptance criteria

Phase 5A.3 is verified once every check above passes. Anything that
fails should be addressed by a follow-up commit on the same branch
before merge.
