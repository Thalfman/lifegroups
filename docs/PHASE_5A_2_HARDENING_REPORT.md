# Phase 5A.2 — Verification & Hardening Report

This is a snapshot of the verification & hardening pass performed
against the merged Phase 5A.2 work before opening Phase 5B. Its purpose
is to certify that the admin foundation is stable, that a fresh
Supabase project can be brought up to date by applying migrations
alone (no manual SQL grants), and that the live app can be manually
verified using the steps in `docs/PHASE_5A_2_VERIFICATION.md`.

## Scope of this pass

- Sync to latest main and inspect the merged Phase 5A.2 code.
- Run `npm run lint`, `npm run typecheck`, `npm run build`.
- Audit every migration for grants and policies.
- Confirm audit-trail visibility is super_admin only.
- Confirm group create / edit / close / reopen workflows.
- Confirm the create form does not require leader email, address, or
  capacity for early real-world data entry.
- Update the manual verification doc.
- Run the security grep checks.

No new feature work was performed. The single code change is a new
hardening migration; the verification doc was updated to include
grant + RLS spot checks and a minimal-data UX section.

## What passed

- **Automated checks**: `npm run lint`, `npm run typecheck`,
  `npm run build` all clean with no warnings.
- **Route protection**: `/admin/groups` calls `requireAdmin()` from
  `lib/auth/session.ts`, which redirects non-admins to
  `/unauthorized`. `requireAdminSession()` adds the same guard to the
  group server actions. Confirmed for `/admin/people` as well.
- **Nav visibility**: `lib/auth/roles.ts:navItemsForRole` includes
  "Manage Groups" only when `isAdminRole(role)` is true
  (`super_admin`, `ministry_admin`). Leaders and staff_viewer never
  see the link.
- **Audit-trail visibility**: both `app/(protected)/admin/groups/page.tsx`
  and `app/(protected)/admin/people/page.tsx` compute
  `showAuditTrail = session.profile.role === "super_admin"` and pass it
  to the shell. The shells gate `<AuditTrailSection />` on that flag,
  so `ministry_admin` and `staff_viewer` never render the audit panel.
- **RLS hardening for audit_events**: Phase 5A.2 migration drops the
  old `audit_events_admin_read` policy and creates
  `audit_events_super_admin_read` using
  `public.auth_role() = 'super_admin'`. ministry_admin selecting from
  `audit_events` via REST returns zero rows; the policy is the floor,
  the UI gating is defense in depth.
- **Group workflow contracts**:
  - Create allows name-only; meeting day, meeting time, location,
    address, capacity, description are all optional.
    `validateGroupWritablePayload` enforces only `name` as required.
  - Update edits the descriptive columns; lifecycle / health / closed_at
    are never touched here.
  - Close sets `lifecycle_status = 'closed'` and `closed_at = now()`.
  - Reopen sets `lifecycle_status = 'active'` and `closed_at = null`.
  - Each RPC writes an `audit_events` row in the same transaction;
    the audit insert and data change roll back together.
  - All four RPCs are `SECURITY DEFINER`, re-check `auth_is_admin()`,
    use `FOR UPDATE` row locks on `groups` to serialize concurrent
    state transitions, and surface fixed error tokens
    (`missing_group`, `group_already_closed`, `group_not_closed`,
    `insufficient_privilege`, `invalid_input`) which the action layer
    maps to friendly UI copy.
- **No hard deletes**:
  - `grep .delete( app/(protected)/admin/groups/ lib/admin/` → no matches.
  - `grep delete from public migrations` → no matches.
  - `grep audit_events migrations` shows only INSERTs and policy ops.
- **No service-role usage**:
  - `grep service_role` and `grep "SUPABASE_SERVICE|sb_secret"` against
    the repo (excluding `node_modules` and `.next`) match only the
    Phase 5A.1 / 5A.2 verification docs that warn against using them.
    No application code, no migration touches the service role.

## What failed and was fixed

### Missing table-level SELECT grants for `authenticated`

**Symptom (from Phase 5A.1 manual testing):** a freshly-deployed
Supabase project returned `permission denied for table profiles` (and
similar) on every authenticated read. The fix during that round was a
one-off SQL grant in the Supabase dashboard.

**Root cause:** the Phase 4 RLS migration enabled row-level security on
every operational table and added SELECT policies, but it never issued
`grant select on public.<table> to authenticated`. In Postgres, RLS
sits on top of table-level privileges — if the role lacks `SELECT`
on the table, the policy is never reached and the query is denied with
a permissions error rather than an empty result. Supabase Studio
projects sometimes inherit these grants from default privileges, which
masked the bug in Studio testing.

**Fix:** new migration
`supabase/migrations/20260518070000_phase5a2_grants_hardening.sql` that:

- Grants `usage on schema public` to `authenticated` and `anon`.
- Grants `select` on all 13 operational tables (`profiles`, `groups`,
  `group_leaders`, `members`, `group_memberships`,
  `attendance_sessions`, `attendance_records`, `guests`, `follow_ups`,
  `group_health_updates`, `group_status_history`, `audit_events`,
  `app_settings`) to `authenticated` only. Anon stays denied at the
  policy layer (policies are scoped `to authenticated`).
- Re-asserts `alter table ... enable row level security` on every
  operational table. RLS remains the row-level security boundary; the
  grants here are pre-RLS table privileges, not a bypass.
- Re-asserts `execute` grants on the Phase 4 helper functions and the
  Phase 5A.1 / 5A.2 admin write RPCs so a re-run of just this
  migration is self-sufficient.
- Ends with a verification `do $$` block that raises if any of the
  expected `SELECT` grants are missing after the migration runs. This
  surfaces drift in the migration log on the next deploy.

Nothing else was changed in production code. The build, lint, and
typecheck still pass.

## Remaining manual Supabase steps

**None.** The grants hardening migration removes the manual
`grant select` step that Phase 5A.1 required. A fresh project that
applies, in order:

1. `20260517040000_phase2_schema.sql`
2. `20260518000000_phase4_rls.sql`
3. `20260518030000_github_integration_deploy_trigger.sql`
4. `20260518050000_phase5a1_admin_people_writes.sql`
5. `20260518060000_phase5a2_admin_group_writes.sql`
6. `20260518070000_phase5a2_grants_hardening.sql` ← new

…will support all admin reads + admin writes without any manual SQL.

The only out-of-app step that remains is the **bootstrap** itself:
creating a `super_admin` profile linked to a Supabase Auth user via the
SQL Editor. That's documented in `docs/PHASE_5A_ADMIN_MANAGEMENT.md`
and is intentional — `super_admin` is never assignable from the app.

## SQL spot checks for the operator to run

After deploy, run these in the Supabase SQL Editor as a privileged
user (the platform owner; the `authenticated` role won't have access
to `information_schema.role_table_grants` for other grantees by
default).

```sql
-- 1. Confirm authenticated has SELECT on every operational table.
select table_name, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public'
   and grantee      = 'authenticated'
   and privilege_type = 'SELECT'
 order by table_name;
```

Expected rows: `app_settings`, `attendance_records`,
`attendance_sessions`, `audit_events`, `follow_ups`,
`group_health_updates`, `group_leaders`, `group_memberships`,
`group_status_history`, `groups`, `guests`, `members`, `profiles`.

```sql
-- 2. Confirm RLS is on for every operational table.
select c.relname, c.relrowsecurity
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

Expected: `relrowsecurity = true` on every row.

```sql
-- 3. Confirm audit_events is super_admin-only.
select policyname, qual
  from pg_policies
 where tablename = 'audit_events';
```

Expected: a single policy named `audit_events_super_admin_read` whose
`qual` references `auth_role() = 'super_admin'`. The old
`audit_events_admin_read` policy must be gone.

```sql
-- 4. Confirm no INSERT / UPDATE / DELETE policies exist on operational
--    tables. All writes flow through admin_* SECURITY DEFINER RPCs.
select tablename, policyname, cmd
  from pg_policies
 where schemaname = 'public'
   and cmd <> 'SELECT'
 order by tablename, policyname;
```

Expected: zero rows.

```sql
-- 5. Confirm the four Phase 5A.2 admin write RPCs exist and are
--    SECURITY DEFINER.
select p.proname, p.prosecdef
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in (
     'admin_create_group','admin_update_group',
     'admin_close_group','admin_reopen_group'
   )
 order by p.proname;
```

Expected: four rows, all with `prosecdef = true`.

```sql
-- 6. Spot-check the audit trail after running through the manual
--    workflow in PHASE_5A_2_VERIFICATION.md.
select action, entity_type, entity_id, created_at
  from public.audit_events
 where action like 'admin.%group%'
 order by created_at desc
 limit 20;
```

Expected: four newest rows after a single super_admin pass —
`admin.create_group`, `admin.update_group`, `admin.close_group`,
`admin.reopen_group`.

## Documented follow-ups (not blockers for 5B)

These are intentionally **not** implemented in this pass; they are
captured here so they can be picked up later without surprise.

- **Free-text leader name on `groups`.** The schema currently links
  leaders to groups exclusively through the `group_leaders` join
  table, which requires a `profiles` row with a real email. When a
  pastor only knows the leader's name and meeting time, the right
  pattern is to leave the leader unlinked on the group record until
  the leader's email is collected. We deliberately did **not** add a
  fake email to satisfy the constraint, and we did **not** add a
  free-text leader name column on `groups` in this pass (out of
  scope). If we want to capture "leader name" before linking, a
  `groups.leader_display_name text` column + a Phase 5A.2.x mini
  migration would be the cleanest path. It does not block Phase 5B.
- **Pause / restart workflow.** `admin_update_group` deliberately
  leaves `pause_reason`, `pause_start_date`, `expected_return_date`,
  `restart_reminder_date`, `health_status`, and `admin_notes` alone.
  Those fields ship through dedicated workflows in a later phase.
- **Per-tenant grant verification SQL.** The verification block at the
  end of the new hardening migration runs against
  `information_schema.role_table_grants`. On Supabase, that view is
  populated normally; the block is defensive in case a future
  environment lacks the view permission for the migration runner.

## Phase 5A → Phase 5B readiness

**Phase 5A is ready to move to Phase 5B** once the SQL spot checks
above all match expected and the manual workflow in
`docs/PHASE_5A_2_VERIFICATION.md` is exercised end-to-end on the live
project. The remaining items are documented follow-ups rather than
blockers; none of them are required to start the attendance / check-in
workflows that Phase 5B will introduce.
