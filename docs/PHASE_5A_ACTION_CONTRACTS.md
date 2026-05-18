# Phase 5A — Admin Action Contracts

Phase 5A.1 wires six of the eight original action stubs. The other two
remain as throwing stubs and are intentionally absent from the UI in
this phase. Validation helpers live in `lib/admin/validation.ts` and
are pure TypeScript with no I/O.

Each shipped action below has:

- A narrow input payload (no full database rows).
- A column allowlist enforced by both the server action AND its matching
  Postgres SECURITY DEFINER RPC function. The RPC is the entire write
  surface; Phase 4 RLS stays SELECT-only.
- An `audit_events` row written from inside the same transaction as the
  data change. Audit failure rolls back the data change.
- Self-escalation guards (cannot target the caller; ministry_admin
  cannot deactivate super_admin).
- Cookie-authenticated server client only — never the service role.

The RPCs are defined in
`supabase/migrations/20260518050000_phase5a1_admin_people_writes.sql`.

### Fixed RPC error tokens (mapped to UI strings by the action layer)

`insufficient_privilege`, `duplicate_email`, `duplicate_assignment`,
`missing_group`, `missing_profile`, `missing_member`, `forbidden_target`,
`self_target_not_allowed`, `invalid_role`, `inactive_target`,
`invalid_input`.

## `adminCreateLeaderProfile` (shipped in 5A.1)

- **Allowed caller roles:** `super_admin`, `ministry_admin`.
- **Allowed input fields:** `full_name`, `email`, `phone?`.
- **Forbidden fields:** `role` (server forces `leader`), `status`
  (server forces `active`), `auth_user_id`, `id`, `created_at`,
  `updated_at`.
- **RPC:** `public.admin_create_leader_profile(text, text, text)`
  returns the new profile id.
- **Audit event:** `action = "admin.create_leader_profile"`,
  `entity_type = "profiles"`, `entity_id = <new id>`,
  `metadata.after = { role:'leader', status:'active', full_name, email }`.
  (Phone is intentionally omitted from metadata to avoid duplicating
  long-lived contact details in the audit log.)
- **Error tokens raised:** `insufficient_privilege`, `invalid_input`,
  `duplicate_email`.
- **Validation:** `validateCreateLeaderProfilePayload` — `full_name`
  non-empty, `email` valid, optional `phone` matches the phone regex.

## `adminCreateMember` (shipped in 5A.1)

- **Allowed caller roles:** `super_admin`, `ministry_admin`.
- **Allowed input fields:** `full_name`, `email?`, `phone?`.
- **Forbidden fields:** `status` (server forces `active`),
  `care_sensitivity_flag` (server forces `false`), `id`,
  `created_at`, `updated_at`.
- **RPC:** `public.admin_create_member(text, text, text)` returns
  the new member id.
- **Audit event:** `action = "admin.create_member"`,
  `entity_type = "members"`,
  `metadata.after = { status:'active', full_name, email_present, phone_present }`.
  (Email and phone are recorded only as presence booleans.)
- **Error tokens raised:** `insufficient_privilege`, `invalid_input`.
- **Validation:** `validateCreateMemberPayload` — `full_name`
  non-empty (trimmed); optional `email`/`phone` are normalized
  (empty / whitespace-only treated as absent) and validated only
  when a real value is present.

## `adminAssignLeaderToGroup` (shipped in 5A.1)

- **Allowed caller roles:** `super_admin`, `ministry_admin`.
- **Allowed input fields:** `group_id`, `profile_id`, `role`
  (`leader` or `co_leader`).
- **Forbidden fields:** `active` (server forces `true`),
  `assigned_at` (server forces `current_date`), `id`, `created_at`.
  INSERT-only.
- **RPC:** `public.admin_assign_leader_to_group(uuid, uuid, role_in_group)`
  returns the new `group_leaders.id`.
- **Audit event:** `action = "admin.assign_leader_to_group"`,
  `entity_type = "group_leaders"`,
  `metadata = { group_id, profile_id, role, active:true }`.
- **Guards:** target profile must exist, be `status='active'`, and
  have `role in ('leader','co_leader')`. Caller cannot assign
  themselves through this workflow.
- **Error tokens raised:** `insufficient_privilege`, `invalid_role`,
  `self_target_not_allowed`, `missing_group`, `missing_profile`,
  `inactive_target`, `duplicate_assignment`.
- **Validation:** `validateAssignLeaderToGroupPayload`.

## `adminAssignMemberToGroup` (shipped in 5A.1)

- **Allowed caller roles:** `super_admin`, `ministry_admin`.
- **Allowed input fields:** `group_id`, `member_id`. Phase 5A.1
  intentionally drops the `role` parameter — the RPC forces
  `role='member'`. Leader / co-leader assignments to a group flow
  through `adminAssignLeaderToGroup` + `group_leaders`.
- **Forbidden fields:** `role`, `status` (server forces `active`),
  `joined_at` (server forces `current_date`), `id`, `created_at`.
  INSERT-only.
- **RPC:** `public.admin_assign_member_to_group(uuid, uuid)` returns
  the new `group_memberships.id`.
- **Audit event:** `action = "admin.assign_member_to_group"`,
  `entity_type = "group_memberships"`,
  `metadata = { group_id, member_id, role:'member', status:'active' }`.
- **Error tokens raised:** `insufficient_privilege`, `missing_group`,
  `missing_member`, `duplicate_assignment`.
- **Validation:** `validateAssignMemberToGroupPayload`.

## `adminDeactivateProfile` (shipped in 5A.1)

- **Allowed caller roles:** `super_admin`, `ministry_admin`.
- **Allowed input fields:** `profile_id`.
- **Forbidden fields:** `role` (never touched), `full_name`, `email`,
  `phone`, `auth_user_id`, `id`, `created_at`, `updated_at`. The
  function writes only `profiles.status = 'inactive'` plus the
  cascade described below; `updated_at` is updated by the existing
  trigger.
- **Cascade:** also sets `group_leaders.active = false` for every
  active `group_leaders` row tied to the target profile. Still
  deactivation, not deletion.
- **RPC:** `public.admin_deactivate_profile(uuid)` returns the
  profile id.
- **Audit event:** `action = "admin.deactivate_profile"`,
  `entity_type = "profiles"`,
  `metadata = { before:{status:<previous>}, after:{status:'inactive'},
  deactivated_group_leader_assignments_count }`.
- **Guards:** `guardAgainstSelfTarget` (TS-side) plus a SQL-side
  `self_target_not_allowed` raise. `ministry_admin` cannot deactivate
  `super_admin` (`forbidden_target`).
- **Error tokens raised:** `insufficient_privilege`,
  `self_target_not_allowed`, `missing_profile`, `forbidden_target`.

## `adminDeactivateMember` (shipped in 5A.1)

- **Allowed caller roles:** `super_admin`, `ministry_admin`.
- **Allowed input fields:** `member_id`.
- **Forbidden fields:** every column on `members` other than
  `status`. No deletion.
- **Cascade:** also sets `group_memberships.status='inactive'` and
  `ended_at=current_date` for every active membership tied to the
  target member. Still deactivation, not deletion.
- **RPC:** `public.admin_deactivate_member(uuid)` returns the
  member id.
- **Audit event:** `action = "admin.deactivate_member"`,
  `entity_type = "members"`,
  `metadata = { before:{status:<previous>}, after:{status:'inactive'},
  deactivated_group_memberships_count }`.
- **Error tokens raised:** `insufficient_privilege`, `missing_member`.
- **Validation:** `validateDeactivateMemberPayload`.

## Deferred (NOT shipped in 5A.1)

### `adminCreateMinistryAdmin`

Still defined as a throwing stub in
`app/(protected)/admin/people/actions.ts`; absent from the UI in
Phase 5A.1. The app intentionally has a single super_admin (Tom),
and Julian's `ministry_admin` profile is provisioned through the
documented Supabase bootstrap, not through this action.

### `adminChangeUserRole`

Still defined as a throwing stub; absent from the UI in Phase 5A.1.
Role changes are out of scope for this phase. `super_admin` is never
an acceptable target role for any future variant of this action.
