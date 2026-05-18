# Phase 5A — Admin People and Role Management

Phase 4 ships the security foundation (Supabase Auth, protected routes, RLS
SELECT policies). Phase 4.1 documents the role model and the super_admin
bootstrap workflow. Phase 5A is the **first** phase that introduces app
write paths, and it is intentionally narrow: it covers only admin-managed
people and roles. Operational writes (attendance, guests, follow-ups,
review queues) ship in Phase 5B once Phase 5A is verified end-to-end.

## Phase 5A.1 status

Phase 5A.0 shipped the UI scaffold (disabled cards, polished empty
states, throwing stubs). Phase 5A.1 turned those stubs into the first
set of live admin writes. The write path is intentionally tiny — six
narrow Postgres functions, each one workflow, each one transaction.

## Phase 5A.2 status (current)

Phase 5A.2 layers admin **group management** on top of the Phase 5A.1
architecture and tightens audit visibility. Four new SECURITY DEFINER
RPCs ship behind a new `/admin/groups` route:
`admin_create_group`, `admin_update_group`, `admin_close_group`,
`admin_reopen_group`. All four follow the Phase 5A.1 pattern (admin
gate, validated input, audit row in the same transaction, fixed error
tokens). There are **no hard deletes**: closing a group is a soft
update to `lifecycle_status='closed'` + `closed_at=now()`, and
`admin_reopen_group` restores `lifecycle_status='active'` and clears
`closed_at`.

In the same migration, the audit log RLS policy
`audit_events_admin_read` (which exposed audit rows to all admins) is
replaced with `audit_events_super_admin_read`. From Phase 5A.2 onward,
only `super_admin` can read `audit_events` — `ministry_admin` retains
every other admin workflow but cannot read the audit log via RLS, and
the `<AuditTrailSection />` is conditionally rendered on the
`/admin/people` and `/admin/groups` pages so ministry_admin doesn't see
the section.

### Personas

- **Julian** is the primary ministry admin / operator persona used
  throughout admin-facing copy. He'll be a `ministry_admin` once his
  Supabase Auth user exists.
- **Tom** is the owner / `super_admin` for bootstrap, oversight, and
  emergency access. He can use every Phase 5A.1 workflow today.
- Authorization is **role-based**. No Julian or Tom UUIDs or emails are
  hardcoded anywhere in migrations, RLS, RPC functions, server actions,
  types, or application logic.

## Goal

Give `super_admin` and `ministry_admin` users a small, allowlisted set of
workflows for managing the people who use the app, without turning the
dashboard into a generic database editor and without exposing any
multi-admin / role-change controls in this phase.

## Allowed workflows (Phase 5A.1 scope)

- Admins create `leader` profiles (server-forced `role='leader'`,
  `status='active'`).
- Admins create `member` records (non-auth participants; server-forced
  `status='active'`, `care_sensitivity_flag=false`).
- Admins assign leaders / co-leaders to groups (`group_leaders` with
  `active=true`, `assigned_at=current_date`).
- Admins place members into groups (`group_memberships` with
  `role='member'`, `status='active'`, `joined_at=current_date` — leader
  membership in a group is handled through `group_leaders`, not this
  workflow).
- Admins deactivate a profile (sets `profiles.status='inactive'` and
  cascade-deactivates any active `group_leaders` rows for that profile).
- Admins deactivate a member (sets `members.status='inactive'` and
  cascade-closes any active `group_memberships` with
  `status='inactive'`, `ended_at=current_date`).
- Admins view a recent audit trail of the actions above.

## Out of scope in Phase 5A.1

- App-based creation of another `ministry_admin` from within the app.
  (Tom remains the single super_admin; Julian's `ministry_admin`
  profile is provisioned through the documented Supabase bootstrap.)
- Changing any user's app-login role from within the app.
- Assigning `super_admin` to anyone from within the app.
- Reactivation, undeactivation, or row deletion of any kind.
- Generic database editor, arbitrary table writes, or broad
  `with check (true)` policies.
- Calendar, SMS messaging / consent / phone login, prayer requests,
  attendance writes / analytics, guest capture, follow-up editing,
  admin review queues, self-service member login, staff viewer
  management, multi-admin management. Those land in later phases.

The two pre-existing stubs `adminCreateMinistryAdmin` and
`adminChangeUserRole` remain as throwing stubs in
`app/(protected)/admin/people/actions.ts` but are intentionally absent
from the UI in Phase 5A.1.

## Implementation constraints (delivered in Phase 5A.1)

1. Each workflow is a dedicated **server action** with an explicit
   input schema and column allowlist. No generic "update profile"
   endpoint.
2. Each workflow ships with a matching narrow **SECURITY DEFINER
   Postgres RPC** (`public.admin_*`) granted execute only to
   `authenticated`. The RPC is the entire write surface; Phase 4 RLS
   stays SELECT-only.
3. Each workflow writes an entry to `audit_events` inside the same
   transaction as the data change. If the audit insert fails, the
   data change rolls back.
4. Server actions reject any attempt to modify the caller's own
   profile via these workflows (self-target guards in TypeScript;
   defense-in-depth in SQL).
5. `ministry_admin` cannot deactivate `super_admin`.
6. UI surfaces these workflows behind the existing `/admin/people`
   page only. Cookie-authenticated server client only — never the
   service role.

## What stays in Phase 5B

The original Phase 5 scope (attendance submission, guest capture, follow-up
updates, admin review queues) moves to Phase 5B and lands after Phase 5A is
verified. That sequencing matters: admin workflows need to be in place so
operational write tests can use real ministry_admin / leader accounts
created through the app rather than seeded by hand.

## Reference

- Role model + super_admin bootstrap: `README.md`, `docs/ARCHITECTURE.md`,
  `supabase/dev/README.md`.
- RLS helper functions: `supabase/migrations/20260518000000_phase4_rls.sql`.
- Phase 4 session helpers used to gate admin actions:
  `lib/auth/session.ts`, `lib/auth/roles.ts`.
- Phase 5A.1 admin page + actions:
  `app/(protected)/admin/people/page.tsx`,
  `app/(protected)/admin/people/actions.ts`,
  `components/admin/*`, `lib/admin/validation.ts`,
  `lib/admin/action-result.ts`.
- Phase 5A.1 write migration:
  `supabase/migrations/20260518050000_phase5a1_admin_people_writes.sql`.
- Phase 5A.2 admin page + actions:
  `app/(protected)/admin/groups/page.tsx`,
  `app/(protected)/admin/groups/actions.ts`,
  `components/admin/group-management-shell.tsx`,
  `components/admin/forms/group-create-form.tsx`,
  `components/admin/forms/group-edit-form.tsx`,
  `components/admin/forms/close-group-button.tsx`,
  `components/admin/forms/reopen-group-button.tsx`.
- Phase 5A.2 write + audit-visibility migration:
  `supabase/migrations/20260518060000_phase5a2_admin_group_writes.sql`.
- Action contracts: `docs/PHASE_5A_ACTION_CONTRACTS.md`.
- Phase 5A.1 manual verification: `docs/PHASE_5A_1_VERIFICATION.md`.
- Phase 5A.2 manual verification: `docs/PHASE_5A_2_VERIFICATION.md`.
