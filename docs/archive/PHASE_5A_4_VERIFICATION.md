# Phase 5A.4 Verification Checklist

End-to-end smoke test + security checks for the Phase 5A.4 admin operations
UX and metric settings foundation. Every item below should be confirmed
before merging.

## 1. Navigation & access control

- [ ] Sign in as `ministry_admin` — nav shows **Home**, **Admin**, **Manage People**, **Manage Groups**, **Check-Ins**, **Settings**. No "Super Admin" link.
- [ ] Sign in as `super_admin` — nav also shows the **Super Admin** link.
- [ ] Sign in as `leader` or `co_leader` — admin pages redirect to `/leader` or `/unauthorized`. Direct GET of `/admin/settings` redirects to `/unauthorized`.
- [ ] A `staff_viewer` account, if any exists, is redirected to `/unauthorized` from every admin route including `/admin/settings`.

## 2. People management (`/admin/people`)

- [ ] Directory filter bar narrows the visible profiles + members by name / email substring.
- [ ] Status filter (Active / Inactive / All) switches the lists correctly.
- [ ] Type filter (Login + Members / Login only / Members only) shows / hides each section.
- [ ] A `leader` row shows a **Change role** button. Clicking it reveals an inline form; submitting `co_leader` succeeds and re-renders the role badge.
- [ ] After a successful role swap, the audit log (`/admin/super-admin` as super_admin) shows an `admin.change_leader_role` event with the actor and the before/after roles.
- [ ] A `ministry_admin` row does **not** show the Change role button (only leader / co_leader rows do).
- [ ] Members section explicitly labels rows as `Member · non-login`; members without an email render `—` (never a synthesized email).
- [ ] Adding a leader profile and a member from the **Add new** card section still works.
- [ ] Assigning leaders / co-leaders / members to groups from the Group assignments section still works.

## 3. Ministry-admin role-change guardrails

As ministry_admin, attempt each of these (the second column is the expected friendly toast):

| Attempt | Expected outcome |
|---|---|
| Submit `new_role = super_admin` via DevTools form override | "super_admin cannot be assigned through the app. Use the documented bootstrap procedure." |
| Submit `new_role = ministry_admin` | "That role isn't allowed here. Leaders and co-leaders are managed through the leader assignment workflow." |
| Submit `new_role = staff_viewer` | "staff_viewer is deprecated and can't be assigned from the app." |
| Submit target whose current role is `ministry_admin` | "That target isn't allowed through this screen…" (forbidden_target) |
| Submit own profile id | "Admins cannot change their own role." |
| Submit same role they currently have | "That profile already has that role. Nothing to change." |

Each attempt must surface as a friendly toast — no raw error token, no
unhandled exception in the server logs.

## 4. Groups management (`/admin/groups`)

- [ ] Directory filter narrows by search text, lifecycle, health status, meeting day. Default lifecycle filter is "Active".
- [ ] Each group card shows leader chips (resolved from `group_leaders`), an "Active members / capacity" stat ("/ Unknown" when capacity is null), latest check-in status for the most recent meeting week, and effective lifecycle + health badges.
- [ ] Creating a group with **only a name** succeeds; the card appears in the directory with `Unknown` capacity and "No meeting day/time set".
- [ ] Editing / closing / reopening a group works unchanged from Phase 5A.2.
- [ ] Closed groups appear in the **Archive** section; reopen restores them to the active directory.
- [ ] No N+1 fetch: opening DevTools Network tab on a page load shows a single round-trip to Supabase for each batched read (groups, group_leaders, profiles, memberships, latest week sessions, defaults, settings), not one per group.

## 5. Settings (`/admin/settings`)

- [ ] Page accessible to `super_admin` and `ministry_admin`. Leader / co_leader / staff_viewer redirected.
- [ ] **Global metric defaults** form pre-populated from the seeded `metric_defaults` row.
- [ ] Saving with valid values writes successfully; success line shows. The audit log records `admin.update_metric_defaults` with `before`/`after`/`submitted_keys` metadata.
- [ ] Submitting `capacity_full_threshold_pct < capacity_warning_threshold_pct` is rejected with "Capacity full % must be greater than or equal to capacity warning %." (UI-side validation) or `invalid_input` mapped to a friendly message (server-side, if the UI is bypassed).
- [ ] Out-of-range values are rejected with the bound spelled out in the error.
- [ ] **Group-specific overrides** picker reveals a form pre-filled with any existing overrides. Saving writes successfully and shows the success line. Audit log records `admin.upsert_group_metric_settings` with before/after metadata.
- [ ] Currently overridden list shows only groups with active overrides (a `group_metric_settings` row whose every field is empty / false / null is filtered out — confirmed via `hasActiveOverrides`).
- [ ] **Clear overrides** confirmation prompt fires, then the row's overrides become empty and the group disappears from the "Currently overridden" list. The row itself remains in `group_metric_settings` (no hard delete).

## 6. Regression checks (Phase 5B.0 / 5B.1 still work)

- [ ] Leader sign-in still lands on `/leader` with the right groups.
- [ ] Leader weekly check-in submission still writes through `leader_submit_group_checkin` and the audit log shows the matching event.
- [ ] `/admin/check-ins` and `/admin/check-ins/[groupId]?week=…` still render correctly.
- [ ] `/admin/super-admin` still loads for super_admin, the audit log still loads, and `super_admin_update_profile_role` still works for the legacy role-change form.

## 7. Automated checks

```
npm run lint        # No warnings or errors
npm run typecheck   # Zero TypeScript errors
npm run build       # Successful production build
```

All three are expected to pass without warnings.

## 8. Security greps

Capture output of each:

```bash
grep -r service_role .
grep -ri "SUPABASE_SERVICE\|sb_secret" .
grep -ri "\.delete(" "app/(protected)/admin/" lib/admin/
grep -ri "staff_viewer" app/ components/ lib/ docs/ supabase/
grep -ri "super_admin" app/ components/ lib/admin/ supabase/migrations/
```

Expected results:

- `service_role`: only doc references inside `docs/` and `supabase/` describing the policy. No code import / usage in `app/`, `components/`, `lib/`, or `supabase/migrations/`.
- `SUPABASE_SERVICE` / `sb_secret`: only doc references in `docs/`. No env-var reads.
- `.delete(` in `app/(protected)/admin/` or `lib/admin/`: **no matches**. All "delete-like" workflows are soft (status / lifecycle changes via SECURITY DEFINER RPCs).
- `staff_viewer` in app surface: only compatibility-only references — the enum value, deprecation notes, RLS helper functions, validation guards that reject staff_viewer assignment, the `requireAdminOrStaff()` helper preserved for read-only routes. No new promotion of staff_viewer as a target role anywhere.
- `super_admin` in app surface and migrations: assignment is blocked outside the documented bootstrap procedure. The new `admin_change_leader_role` rejects `super_admin` as a target role via `invalid_role`; the per-target current role check (`forbidden_target`) prevents modifying any super_admin profile. The Phase 5A.3 `super_admin_update_profile_role` RPC also rejects `super_admin` as a new role.

## 9. SQL spot-checks

Run against a database that has applied the Phase 5A.4 migration:

```sql
-- a) group_metric_settings has exactly the SELECT grant for authenticated,
--    nothing more. INSERT/UPDATE/DELETE must not appear.
select grantee, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public'
   and table_name   = 'group_metric_settings'
   and grantee      = 'authenticated'
 order by privilege_type;
-- Expected: a single row with privilege_type = SELECT.

-- b) RLS is enabled and the SELECT policy is admin-only.
select policyname, cmd, qual::text
  from pg_policies
 where schemaname = 'public'
   and tablename  = 'group_metric_settings';
-- Expected: one policy (group_metric_settings_admin_read) for SELECT,
-- qual referencing public.auth_is_admin().

-- c) metric_defaults row exists with all six expected keys.
select setting_value
  from public.app_settings
 where setting_key = 'metric_defaults';

-- d) The three new RPCs are SECURITY DEFINER and granted only to authenticated.
select p.proname,
       p.prosecdef as security_definer,
       array_agg(distinct g.grantee) as grantees
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  left join information_schema.role_routine_grants g
    on g.routine_schema = 'public'
   and g.routine_name   = p.proname
 where n.nspname = 'public'
   and p.proname in (
         'admin_update_metric_defaults',
         'admin_upsert_group_metric_settings',
         'admin_change_leader_role'
       )
 group by p.proname, p.prosecdef
 order by p.proname;
-- Expected: security_definer = true; grantees = {authenticated}.
```

## 10. Architecture posture (re-stated)

- No service role.
- No new INSERT / UPDATE / DELETE RLS policies.
- Every write goes through a narrow SECURITY DEFINER RPC.
- Every write is paired with an `audit_events` row in the same transaction.
- No hard deletes. Clearing overrides = upsert with all nulls.
- `audit_events` reads remain super_admin-only.
- `staff_viewer` stays compatibility-only.
- `super_admin` cannot be assigned anywhere outside the bootstrap procedure.
