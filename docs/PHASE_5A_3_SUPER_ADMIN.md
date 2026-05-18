# Phase 5A.3 — Super Admin Console + Role Model Cleanup

## What this phase ships

Phase 5A.3 closes out the admin-write surface for the foreseeable
future by giving the owner/operator a dedicated console at
`/admin/super-admin` and tightening the role model so the app cannot
elevate itself.

Concretely:

- **New route**: `/admin/super-admin`. `requireSuperAdmin()` redirects
  every other role to `/unauthorized`.
- **Navigation**: super_admin now sees `Home, Admin, Manage People,
  Manage Groups, Super Admin`. ministry_admin keeps the same four
  items (Home, Admin, Manage People, Manage Groups). Leader and
  co-leader keep `Home, My Groups`. staff_viewer continues to redirect
  to `/unauthorized` from sign-in (no nav promotion).
- **Audit log moved**: previously surfaced at the bottom of
  `/admin/people` and `/admin/groups` behind a client-side
  `showAuditTrail` flag. Now lives only on `/admin/super-admin`. The
  Phase 5A.2 RLS policy already restricts `audit_events` reads to
  super_admin, so the move is a UI consolidation, not a security
  change.
- **Role management**: super_admin can change a profile's role to
  `ministry_admin`, `leader`, or `co_leader` through a new
  `public.super_admin_update_profile_role` SECURITY DEFINER RPC.
  `super_admin`, `staff_viewer`, self-target, and missing-profile
  cases are all rejected with fixed error tokens.
- **System status checklist**: 8-row read-only checklist surfacing
  whether Supabase is configured, baseline data exists, and the audit
  log is reachable.
- **Staff View deprecation note**: a static panel on the console
  documents that the `/staff` route is gone, while explaining that
  the `staff_viewer` value remains in the Postgres enum and TS union
  for backwards compatibility with any existing rows.

## RPC contract

```sql
public.super_admin_update_profile_role(
  p_profile_id uuid,
  p_new_role   public.user_role
) returns uuid
```

`SECURITY DEFINER`, `set search_path = public, pg_temp`. Grants:
revoked from `public` / `anon` / `authenticated`, then `grant execute
… to authenticated`. The function body is the security boundary; the
admin gate runs before any data is touched.

Behavior:

1. Require `public.auth_role() = 'super_admin'`. Otherwise
   `insufficient_privilege`.
2. Require `public.auth_profile_id() is not null`. Otherwise
   `insufficient_privilege`.
3. Reject `p_profile_id = auth_profile_id()` with
   `self_target_not_allowed`.
4. Reject `p_new_role = 'super_admin'` with `forbidden_target`.
5. Reject `p_new_role = 'staff_viewer'` with `invalid_role`.
6. `select ... for update` on the target profile. If null,
   `missing_profile`.
7. If `v_old_role = p_new_role`, raise `no_role_change` (no audit
   row is written for no-op submissions).
8. `update public.profiles set role = p_new_role where id =
   p_profile_id`.
9. `insert into public.audit_events ...` with action
   `'super_admin.update_profile_role'`, entity_type `'profiles'`,
   entity_id = target id, metadata `{ before: { role: <old> }, after:
   { role: <new> } }`.
10. Return the target profile id.

The data write and the audit insert are in the same transaction; an
audit failure rolls back the role change.

## Role-assignment matrix

| Target role     | Allowed from `/admin/super-admin`? | Notes |
|-----------------|------------------------------------|-------|
| `super_admin`   | No                                 | Set only via the documented bootstrap procedure in `supabase/dev/README.md`. RPC raises `forbidden_target`; UI omits the option. |
| `ministry_admin`| Yes                                | Standard ministry operator role. |
| `leader`        | Yes                                | Sign-in role scoped to assigned groups via `group_leaders`. |
| `co_leader`     | Yes                                | Same scoping as `leader`. |
| `staff_viewer`  | No                                 | Deprecated. RPC raises `invalid_role`; UI omits the option. |

The form also blocks the actor from changing their own role
(`self_target_not_allowed`), so a super_admin cannot accidentally
downgrade themselves and lock the owner account out.

Profiles whose **current** role is `staff_viewer` DO appear in the
target select. The deprecation cleanup path is "reassign deprecated
staff_viewer users to an active role", and hiding them would block
that. The new role still cannot be `staff_viewer` itself.

## Error tokens

| Token                     | Cause                                                                | UI copy (lib/admin/action-result.ts) |
|---------------------------|----------------------------------------------------------------------|--------------------------------------|
| `insufficient_privilege`  | Caller is not super_admin, or has no active profile.                  | "You're not signed in as an admin, or your session expired. Sign in again and retry." |
| `self_target_not_allowed` | Target profile id equals the caller's profile id.                     | "You can't deactivate, reassign, or change your own role through this screen." |
| `forbidden_target`        | `p_new_role` is `super_admin`.                                       | "That target isn't allowed through this screen. super_admin must be set via the documented bootstrap procedure, and ministry admins can't deactivate the super admin." |
| `invalid_role`            | `p_new_role` is `staff_viewer`.                                       | "That role isn't allowed here. Leaders and co-leaders are managed through the leader assignment workflow." |
| `missing_profile`         | No `profiles` row matches `p_profile_id`.                             | "We couldn't find that profile. Refresh the page and try again." |
| `no_role_change`          | `p_new_role` equals the target's current role.                        | "That profile already has that role. Nothing to change." |

## Security boundary

| Surface                                    | Read access            | Write access                                                    |
|--------------------------------------------|------------------------|-----------------------------------------------------------------|
| `audit_events`                             | super_admin only (RLS) | Inserts via SECURITY DEFINER RPCs only; never from app code.   |
| `profiles.role`                            | admin/staff per Phase 4 | Updates via `super_admin_update_profile_role` RPC only.        |
| `/admin/super-admin` route                 | super_admin only (`requireSuperAdmin()`) | n/a (the page renders the form; writes go through the action) |
| `superAdminUpdateProfileRole` server action | n/a                    | super_admin only (`requireSuperAdminSession()`) + 3 client-side guards before the RPC call |

The action runs the validation helpers in `lib/admin/validation.ts`
(`validateChangeUserRolePayload`, `guardAgainstSelfRoleChange`,
`guardAgainstSuperAdminAssignment`, `guardAgainstStaffViewerAssignment`)
before the RPC, so most negative paths surface friendly errors without
a database round-trip. The RPC is the ultimate authority: even if the
guards were bypassed, the SECURITY DEFINER body re-checks every
condition.

## Out of scope

- Admin check-in review dashboard (Phase 5B.1).
- Guest pipeline, follow-up workflows, SMS, calendar, prayer requests,
  advanced metrics.
- Creating Supabase Auth users from the app — auth-user creation
  continues to flow through the documented bootstrap in
  `supabase/dev/README.md`.
- Removing `staff_viewer` from the Postgres enum or the TS union — the
  value remains for backwards compatibility with any existing rows.
- Removing the unreferenced `requireAdminOrStaff()` /
  `isAdminOrStaffRole()` compat helpers in `lib/auth/`. They were
  flagged for future cleanup in the Phase 5B.0 hardening report and
  remain available; no live route imports them.

## Files

| Layer | File |
|---|---|
| Migration | `supabase/migrations/20260518090000_phase5a3_super_admin_role_writes.sql` |
| Server action | `app/(protected)/admin/super-admin/actions.ts` |
| Page | `app/(protected)/admin/super-admin/page.tsx` |
| Shell | `components/admin/super-admin-console-shell.tsx` |
| Sections | `components/admin/owner-controls-overview.tsx`, `components/admin/system-status-checklist.tsx`, `components/admin/staff-view-deprecated-note.tsx`, `components/admin/phase-5a3-notice.tsx` |
| Form | `components/admin/forms/role-change-form.tsx` |
| Audit summary update | `components/admin/audit-trail-section.tsx` (new `super_admin.update_profile_role` label and case) |
| Auth helpers | `lib/auth/session.ts` (`requireSuperAdmin`, `requireSuperAdminSession`), `lib/auth/roles.ts` (`navItemsForRole`) |
| Validation | `lib/admin/validation.ts` (`guardAgainstStaffViewerAssignment`) |
| RPC wrapper | `lib/admin/rpc.ts` (`rpcSuperAdminUpdateProfileRole`) |
| UI copy | `lib/admin/action-result.ts` (softened `forbidden_target` / `self_target_not_allowed` copy) |
| Page cleanups | `app/(protected)/admin/people/page.tsx`, `app/(protected)/admin/groups/page.tsx`, `components/admin/people-management-shell.tsx`, `components/admin/group-management-shell.tsx` |
| Stub removal | `app/(protected)/admin/people/actions.ts` (`adminChangeUserRole` removed) |
| Docs | `docs/PHASE_5A_3_SUPER_ADMIN.md`, `docs/PHASE_5A_3_VERIFICATION.md`, `README.md`, `supabase/dev/README.md` |
