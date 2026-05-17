# Phase 5A — Admin Action Contracts (forward-looking)

This file documents the **future** server actions that will be enabled
in Phase 5A.1. Nothing in this file is wired today. The matching stubs
in `app/(protected)/admin/people/actions.ts` throw a "not enabled"
error and the matching UI controls in `components/admin/` are
disabled. Validation helpers for these payloads already live in
`lib/admin/validation.ts` and are pure TypeScript with no I/O.

Every action below ships with:

- A narrow input payload (no full database rows).
- A column allowlist enforced by both the server action and a matching
  narrow `INSERT` or `UPDATE` RLS policy. No `with check (true)`.
- An `audit_events` row written from inside the same transaction as the
  data change.
- Self-escalation guards (cannot target the caller, cannot assign
  `super_admin`, cannot change the caller's own role/status).
- Cookie-authenticated server client only — never the service role.

## `adminCreateMinistryAdmin`

- **Allowed caller roles:** `super_admin`.
- **Allowed input fields:** `full_name`, `email`.
- **Forbidden fields:** `role` (server forces `ministry_admin`),
  `status` (server forces `active`), `auth_user_id` (linked separately
  via the documented bootstrap), `id`, `created_at`, `updated_at`,
  anything else on `profiles`.
- **Expected audit event:** `action = "admin.create_ministry_admin"`,
  `target = <new profile id>`, `before = null`,
  `after = { role, status, full_name, email }`.
- **RLS policy needed later:** narrow `INSERT` on `profiles` gated by
  `auth_role() = 'super_admin'`, with a column allowlist enforced via
  a `WITH CHECK` clause that pins `role = 'ministry_admin'` and
  `status = 'active'`.
- **Validation rules:** `validateCreateMinistryAdminPayload` —
  `full_name` non-empty, `email` matches the email regex.
- **Self-escalation protections:** caller cannot pass their own
  `auth_user_id` or email; `guardAgainstSelfTarget` is consulted after
  the new profile id is generated.

## `adminCreateLeaderProfile`

- **Allowed caller roles:** `super_admin` always; `ministry_admin`
  only when a server-side flag is on (default off).
- **Allowed input fields:** `full_name`, `email`, `phone?`.
- **Forbidden fields:** `role` (server forces `leader`), `status`
  (server forces `active`), `auth_user_id`, `id`, `created_at`,
  `updated_at`.
- **Expected audit event:** `action = "admin.create_leader_profile"`,
  `target = <new profile id>`, `before = null`,
  `after = { role, status, full_name, email, phone }`.
- **RLS policy needed later:** narrow `INSERT` on `profiles` gated by
  `auth_is_admin()`, with `WITH CHECK` pinning `role = 'leader'` and
  `status = 'active'`. The `ministry_admin` half is feature-flagged
  at the application layer.
- **Validation rules:** `validateCreateLeaderProfilePayload` —
  `full_name` non-empty, `email` valid, optional `phone` matches the
  phone regex.
- **Self-escalation protections:** caller cannot pass their own email;
  cannot escalate themselves to a leader profile they then sign into
  with admin power.

## `adminCreateMember`

- **Allowed caller roles:** `super_admin`, `ministry_admin`.
- **Allowed input fields:** `full_name`, `email?`, `phone?`.
- **Forbidden fields:** `status` (server forces `active`),
  `care_sensitivity_flag` (set through its own future workflow), `id`,
  `created_at`, `updated_at`.
- **Expected audit event:** `action = "admin.create_member"`,
  `target = <new member id>`, `before = null`,
  `after = { full_name, email, phone, status }`.
- **RLS policy needed later:** narrow `INSERT` on `members` gated by
  `auth_is_admin()`, with `WITH CHECK` pinning `status = 'active'`.
- **Validation rules:** `validateCreateMemberPayload` — `full_name`
  non-empty (trimmed); optional `email`/`phone` are normalized first
  (empty / whitespace-only treated as absent) and validated only when
  a real value is present. Phone values must contain at least one
  digit, so whitespace-only inputs are rejected.
- **Self-escalation protections:** members are non-auth records and
  cannot grant the caller any new privilege; no extra guard required.

## `adminAssignLeaderToGroup`

- **Allowed caller roles:** `super_admin`, `ministry_admin`.
- **Allowed input fields:** `group_id`, `profile_id`, `role`
  (`leader` or `co_leader`).
- **Forbidden fields:** `active` (server forces `true`), `id`,
  `created_at`. The action is INSERT-only; existing rows are not
  updated through this entry point.
- **Expected audit event:**
  `action = "admin.assign_leader_to_group"`,
  `target = <new group_leaders id>`, `before = null`,
  `after = { group_id, profile_id, role, active }`.
- **RLS policy needed later:** narrow `INSERT` on `group_leaders`
  gated by `auth_is_admin()`, `WITH CHECK` pinning `active = true`
  and `role IN ('leader','co_leader')`.
- **Validation rules:** `validateAssignLeaderToGroupPayload` — both
  ids are UUIDs, role is one of the two allowed values.
- **Self-escalation protections:** `guardAgainstSelfTarget(actor.id,
  profile_id)` — admins cannot grant themselves a leader assignment
  through this path.

## `adminAssignMemberToGroup`

- **Allowed caller roles:** `super_admin`, `ministry_admin`.
- **Allowed input fields:** `group_id`, `member_id`, `role`. The
  payload field name matches the `group_memberships.role` column
  (typed as the `role_in_group` enum) so the allowlisted insert can
  use the payload directly with no remapping.
- **Forbidden fields:** `status` (server forces `active`),
  `joined_at` (server forces `now()`), `id`, `created_at`. INSERT-only.
- **Expected audit event:**
  `action = "admin.assign_member_to_group"`,
  `target = <new group_memberships id>`, `before = null`,
  `after = { group_id, member_id, role, status, joined_at }`.
- **RLS policy needed later:** narrow `INSERT` on
  `group_memberships` gated by `auth_is_admin()`, `WITH CHECK`
  pinning `status = 'active'`.
- **Validation rules:** `validateAssignMemberToGroupPayload` — both
  ids are UUIDs, `role` is one of `member | leader | co_leader`.
- **Self-escalation protections:** none required — members are
  non-auth records and `role` is scoped to a single group.

## `adminDeactivateProfile`

- **Allowed caller roles:** `super_admin`, `ministry_admin`.
- **Allowed input fields:** `profile_id`.
- **Forbidden fields:** `role` (never touched), `full_name`, `email`,
  `phone`, `auth_user_id`, `id`, `created_at`, `updated_at`. The only
  column the action writes is `status = 'inactive'`.
- **Expected audit event:** `action = "admin.deactivate_profile"`,
  `target = <profile_id>`, `before = { status: <previous> }`,
  `after = { status: 'inactive' }`.
- **RLS policy needed later:** narrow `UPDATE` on `profiles` gated by
  `auth_is_admin()`, with `WITH CHECK` and a column-set restriction
  that allows only `status` to change.
- **Validation rules:** `validateDeactivateProfilePayload` —
  `profile_id` is a UUID.
- **Self-escalation protections:**
  `guardAgainstSelfTarget(actor.id, profile_id)` — admins cannot
  deactivate themselves. `ministry_admin` is forbidden from
  deactivating `super_admin` profiles.

## `adminDeactivateMember`

- **Allowed caller roles:** `super_admin`, `ministry_admin`.
- **Allowed input fields:** `member_id`.
- **Forbidden fields:** every column other than `status`. No deletion.
- **Expected audit event:** `action = "admin.deactivate_member"`,
  `target = <member_id>`, `before = { status: <previous> }`,
  `after = { status: 'inactive' }`.
- **RLS policy needed later:** narrow `UPDATE` on `members` gated by
  `auth_is_admin()`, column-set restriction limiting writable columns
  to `status` only.
- **Validation rules:** `validateDeactivateMemberPayload` —
  `member_id` is a UUID.
- **Self-escalation protections:** none required for non-auth records.

## `adminChangeUserRole`

- **Allowed caller roles:** `super_admin`. `ministry_admin` cannot
  change roles in the first implementation.
- **Allowed input fields:** `profile_id`, `new_role`.
- **Forbidden fields:** every other column on `profiles`. The action
  writes only `role`. `super_admin` is never an accepted value for
  `new_role` — that role is bootstrapped through the documented
  Supabase procedure, not through the app.
- **Expected audit event:** `action = "admin.change_user_role"`,
  `target = <profile_id>`, `before = { role: <previous> }`,
  `after = { role: <new_role> }`.
- **RLS policy needed later:** narrow `UPDATE` on `profiles` gated by
  `auth_role() = 'super_admin'`, column-set restriction limiting
  writable columns to `role` only, and a `WITH CHECK` clause
  rejecting `role = 'super_admin'`.
- **Validation rules:** `validateChangeUserRolePayload` —
  `profile_id` is a UUID, `new_role` is in the `user_role` enum.
- **Self-escalation protections:**
  `guardAgainstSelfRoleChange(actor, payload)` — caller cannot change
  their own role. `guardAgainstSuperAdminAssignment(payload)` —
  `super_admin` cannot be assigned through this action.
