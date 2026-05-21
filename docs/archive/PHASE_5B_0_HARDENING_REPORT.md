# Phase 5B.0 — Post-Merge Hardening Report

## Scope

This report covers the **post-merge verification and product cleanup
pass** that ran immediately after Phase 5B.0 (leader weekly check-ins)
landed on `main`.

In scope:

- Inspect the Phase 5B.0 surface area (leader routes, RPC, migration).
- Run the standard automated checks (`lint`, `typecheck`, `build`).
- Run the standard security greps.
- Remove the Staff View product path (admin nav link + `/staff` route).
- Update the README to reflect Phase 5B.0 as current and 5B.1 as next.
- Add a Fast Smoke Test section to the Phase 5B.0 verification doc.
- Confirm no migration / grant fixes are required.

Out of scope (explicitly not built in this pass):

- Phase 5C, Phase 5B.1, and Phase 5A.3.
- Guest pipeline workflows, SMS, calendar integrations, prayer
  requests, reminders, or notifications.
- Advanced metrics or dashboards.
- Any new service-role usage.
- Any new hard deletes.
- Any edits to historical migrations.
- A new Super Admin Console.
- Removing the `staff_viewer` value from the `user_role` SQL enum.

## Automated checks

| Check | Result |
| --- | --- |
| `npm ci` | PASS |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |

The previous "failures" recorded during exploration were artifacts of a
fresh container without `node_modules`; once dependencies were
installed, all four commands succeeded.

## Security greps

The grep set below was run from the repo root. Hits are reported as
`file:line` references.

### `grep -rn "service_role" .` (excluding `node_modules`, `.next`)

No hits in application code. The string only appears in documentation
files where it is explicitly disclaimed (README role-model notes,
hardening guidance).

### `grep -rni "SUPABASE_SERVICE\|sb_secret" .`

No hits in application code, environment files, or migrations. The
string appears only in documentation explaining that the service role
and secret-style keys are intentionally **not** used.

### `grep -rn "\.delete(" "app/(protected)/leader/" lib/`

No hits. No client-side or server-action code calls a Supabase
`.delete()` directly. All deletes go through SECURITY DEFINER RPCs.

### `grep -rni "delete from public.attendance" supabase/migrations/`

Two hits, both inside the Phase 5B.0 migration body:

- `supabase/migrations/20260518080000_phase5b0_leader_checkin_writes.sql:207`
  — inside `leader_submit_group_checkin`, runs **after** the admin /
  leader-assignment authorization gate and only when the status is
  `did_not_meet` / `planned_pause` (so there are no records to keep).
- `supabase/migrations/20260518080000_phase5b0_leader_checkin_writes.sql:259`
  — inside the same function, replacing attendance for the current
  session before re-inserting the new payload.

Both statements are scoped to `where session_id = v_session_id` inside
a SECURITY DEFINER function whose body is unreachable except through
`GRANT EXECUTE ... TO authenticated` and an explicit `leader` /
`co_leader` ownership check.

### `grep -rni "delete from public.group_health_updates" supabase/migrations/`

One hit, inside the same Phase 5B.0 migration:

- `supabase/migrations/20260518080000_phase5b0_leader_checkin_writes.sql:301`
  — only fires when the leader clears the health pulse **and** the
  row has no `admin_note`. If `admin_note` exists, the row is updated
  instead of deleted, preserving admin context.

## Migration audit

- **EXECUTE grant.** Phase 5B.0 (`20260518080000_phase5b0_leader_checkin_writes.sql`)
  ends with `grant execute on function public.leader_submit_group_checkin(...)
  to authenticated;`. Confirmed in source.
- **Operational SELECT grants.** Phase 5A.2 hardening
  (`20260518070000_phase5a2_grants_hardening.sql`) issues explicit
  `grant select` to `authenticated` on the 13 operational tables
  (`profiles`, `groups`, `group_leaders`, `members`,
  `group_memberships`, `attendance_sessions`, `attendance_records`,
  `guests`, `follow_ups`, `group_health_updates`,
  `group_status_history`, `audit_events`, `app_settings`) and
  re-asserts RLS-enabled on each. No `grant insert / update / delete`
  to `authenticated` anywhere in the migration tree.
- **No broad write policies.** Cross-migration review confirms no
  blanket `for insert` / `for update` / `for delete` policies exist;
  every write is funnelled through a SECURITY DEFINER `admin_*` or
  `leader_*` RPC.
- **Delete scope.** The only `delete from public.*` statements in the
  whole migration tree are the three hits above, all inside the Phase
  5B.0 SECURITY DEFINER body.

**No new hardening migration is required.** Nothing is missing from
the existing 5A.2 hardening or 5B.0 migration; no historical migration
was edited as part of this pass.

## Live-read rules confirmed

The Phase 5B.0 spec called out a handful of invariants. Each was
re-verified against the merged code and migration:

- A signed-in `leader` / `co_leader` sees only the groups for which an
  active row exists in `group_leaders`. `/leader/page.tsx` reads
  through RLS plus the leader-scoping helpers; no client-side
  privilege escalation is possible.
- A `super_admin` or `ministry_admin` cannot use `/leader` unless they
  are themselves actively assigned as a leader. The
  `leader_submit_group_checkin` RPC raises `not_leader_of_group`
  otherwise, and the dashboard simply lists zero groups.
- A `closed` group rejects every check-in attempt: the RPC raises
  `group_closed` before touching `attendance_sessions`.
- Submitting the same week twice updates **one** `attendance_sessions`
  row (the unique key on `(group_id, week_start)` plus an `on conflict
  ... do update`). The second submission writes a
  `leader.update_checkin` audit row instead of
  `leader.submit_checkin`.
- `attendance_records` are replaced (delete-then-insert) **only**
  inside the SECURITY DEFINER body, scoped to the current session id.
- `group_health_updates.admin_note` is preserved: the upsert avoids
  overwriting `admin_note`, and the delete branch is gated on
  `admin_note is null`.
- `audit_events` are written in the same transaction as the data
  change for `leader.submit_checkin`, `leader.update_checkin`, and
  `leader.mark_did_not_meet`. Audit visibility is super_admin-only via
  RLS.

## Staff View product cleanup

- `lib/auth/roles.ts`: removed the "Staff View" entry from the
  admin/ministry_admin nav builder; changed
  `defaultLandingPathForRole("staff_viewer")` from `/staff` to
  `/unauthorized`.
- `app/(protected)/staff/page.tsx`: deleted along with its (now
  empty) directory.
- The `staff_viewer` value remains in `types/enums.ts` and in the
  Postgres `user_role` SQL enum — required for backwards compatibility
  with any existing rows in `profiles.role`.
- The `requireAdminOrStaff()` helper in `lib/auth/session.ts` and
  `isAdminOrStaffRole()` in `lib/auth/roles.ts` were left in place
  for now (compatibility); they are not referenced by any live
  product route after this pass but were not removed in order to keep
  the diff narrow. A future cleanup pass can drop them if they remain
  unused.

## Audit visibility TODO

`audit_events` continues to be readable only by `super_admin` (Phase
5A.2 RLS). That is the correct posture for this pass.

**Future work:** the audit trail should live behind a dedicated
`/admin/super-admin` console (proposed Phase 5A.3) so that
super-admin tooling has a single home and the existing `/admin`
dashboard does not need to know about it. This pass deliberately does
**not** build that console. Audit logs must not be exposed to
`ministry_admin` or to any other role.

## What remains manual

- The Fast Smoke Test added to
  `docs/PHASE_5B_0_VERIFICATION.md` must be run against a deployed
  Supabase environment by a human reviewer. CI cannot exercise the
  RPC end-to-end because the verification depends on real auth
  sessions and seed data.
- The deeper checklist in the same document (week-range tampering,
  follow-up signal, concurrent submits, OR-filter quoting, etc.)
  should be re-run before any release that touches leader or
  attendance code.

## Readiness

Phase 5B.0 is **ready for live testing.** All automated checks pass,
all security greps are clean, the RPC and grants are correct, and the
Staff View navigation cleanup removes the last visible-but-unsupported
product surface. The Fast Smoke Test exists for the human reviewer.

## Next phase options

This pass does **not** make a recommendation. Both options below are
independently buildable; the user should pick one to start next.

### Option A — Phase 5A.3 Super Admin Console

Scope:

- A `/admin/super-admin` route gated to `super_admin` only.
- Read-only audit trail viewer (`fetchRecentAuditEvents`, filtered).
- Optional: a small "settings" surface for super-admin-only toggles.

Pros:

- Naturally homes the existing super_admin-only audit RLS.
- Small, isolated surface; minimal RPC work.

Cons:

- Does not directly help leaders or ministry admins; benefits a
  single role.

### Option B — Phase 5B.1 Admin Check-in Review

Scope:

- A `/admin` view that lists every group's current-week check-in
  status (submitted / did_not_meet / missing).
- A missing-submission dashboard sortable by ministry and by leader.
- No new write surfaces in this phase.

Pros:

- Directly follows from Phase 5B.0 and gives ministry admins value.
- All reads; no new SECURITY DEFINER functions required.

Cons:

- Touches the existing admin dashboard, which has more surface area
  than the super-admin console alternative.
