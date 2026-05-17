# Phase 5A — Admin People and Role Management

Phase 4 ships the security foundation (Supabase Auth, protected routes, RLS
SELECT policies). Phase 4.1 documents the role model and the super_admin
bootstrap workflow. Phase 5A is the **first** phase that introduces app
write paths, and it is intentionally narrow: it covers only admin-managed
people and roles. Operational writes (attendance, guests, follow-ups,
review queues) ship in Phase 5B once Phase 5A is verified end-to-end.

## Phase 5A.0 status (current)

Phase 5A is split into two sub-phases because live Supabase access is
not yet available to verify write policies end-to-end:

- **Phase 5A.0 — UI/UX scaffold only (this state).**
  - No mock data anywhere. No fake people, profiles, members, group
    rows, role assignments, or audit events are rendered or seeded.
  - No real writes. The route at `/admin/people` displays disabled
    action cards and polished empty states only.
  - No write RLS policies. Phase 4's SELECT-only policies are
    unchanged.
  - The server action stubs in
    `app/(protected)/admin/people/actions.ts` throw a "not enabled"
    error and never reach Supabase.
  - Validation helpers in `lib/admin/validation.ts` are pure
    TypeScript and perform no I/O. They will be reused by Phase 5A.1.
  - Action contracts are documented in
    `docs/PHASE_5A_ACTION_CONTRACTS.md` as the spec for Phase 5A.1.
- **Phase 5A.1 — write policies + real admin actions (pending).**
  - Lands the narrow `INSERT`/`UPDATE` RLS policies described in
    `PHASE_5A_ACTION_CONTRACTS.md`.
  - Wires the server actions to the Supabase server client with the
    same narrow column allowlists.
  - Records `audit_events` rows from inside each write transaction.
  - Requires live Supabase verification of Phase 4 RLS first.

Supabase verification of Phase 4 RLS is still required before
Phase 5A.1 may ship.

## Goal

Give `super_admin` and `ministry_admin` users a small, allowlisted set of
workflows for managing the people who use the app and their roles, without
turning the dashboard into a generic database editor.

## Allowed workflows (Phase 5A scope)

- `super_admin` creates `ministry_admin` users.
- `super_admin` creates or updates `leader` profiles.
- `ministry_admin` creates `leader` profiles if explicitly allowed
  (configurable, default off).
- Admins create `member` records (non-auth participant records in the
  `members` table).
- Admins assign members to groups (`group_memberships`).
- Admins assign leaders / co-leaders to groups (`group_leaders`).
- Admins deactivate people by setting `status = 'inactive'` on `profiles`
  or `members`. No row deletion in the first implementation.

## Forbidden in Phase 5A

- Generic database editor or table browser.
- Arbitrary table writes outside the workflows listed above.
- Self role escalation of any kind.
- Changing one's own role.
- Deleting records as a first implementation. Deactivation only.
- `service_role` (or any `sb_secret_*` / admin key) in app code.
- Broad `update-all-columns` RLS policies. Every workflow ships with an
  explicit column allowlist on both the server action and the matching RLS
  policy.

## Implementation constraints (for future-me)

1. Each workflow is a dedicated **server action** with an explicit input
   schema and column allowlist. No generic "update profile" endpoint.
2. Each workflow ships with matching narrow **INSERT/UPDATE RLS policies**.
   No blanket `with check (true)`. Policies are gated through the same
   `auth_is_admin()` helper family already defined in Phase 4.
3. Each workflow writes an entry to `audit_events` (actor, action, target,
   before/after where relevant).
4. Server actions reject any attempt to modify the caller's own `role` or
   `status` columns.
5. UI surfaces these workflows behind explicit "Manage people" / "Manage
   roles" pages under `/admin` — never inline in operational views.
6. Cookie-authenticated server client only. No service-role client, ever.

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
- Phase 5A.0 scaffold: `app/(protected)/admin/people/page.tsx`,
  `components/admin/*`, `lib/admin/validation.ts`.
- Action contracts (forward-looking, for Phase 5A.1):
  `docs/PHASE_5A_ACTION_CONTRACTS.md`.
