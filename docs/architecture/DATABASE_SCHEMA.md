# Database Schema

The schema is built up across the migrations in `supabase/migrations/`.
The base tables and `user_role` / `role_in_group` enums land in
`20260517040000_phase2_schema.sql`; the RLS foundation lands in
`20260518000000_phase4_rls.sql`; subsequent migrations layer on admin /
leader / super-admin RPCs, the shepherd-care surface, over-shepherd
coverage, and launch-planning storage.

## Core model

- **profiles**: app-login user records mapped to Supabase Auth users via
  nullable `auth_user_id`. Phase 4 reads this column when resolving the
  signed-in session. `profiles.role` uses the `user_role` enum with five
  values: `super_admin`, `ministry_admin`, `staff_viewer`, `leader`,
  `co_leader`. `member` is intentionally **not** present here — members
  are non-auth participant records (see `members` below).
  `full_name_pending` (ADR 0025) is true while an invited person hasn't
  chosen their own display name yet; `full_name` then holds a placeholder
  (their email on fresh invites) until the self-service `set_own_full_name`
  RPC clears it.
- **groups**: life groups with both lifecycle and health dimensions.
- **group_leaders**: links profiles to groups as leader/co-leader roles. The
  `active = true` rows drive Phase 4 leader scoping. The `role` column uses
  the `role_in_group` enum (`leader | co_leader` here; `member` is reserved
  for `group_memberships`).
- **members** + **group_memberships**: people and their participation in
  specific groups. Members are **non-auth participant records** — they live
  in `members`, are linked to groups through `group_memberships`, and do
  not have `auth.users` rows. `group_memberships.role` uses the
  `role_in_group` enum (`member | leader | co_leader`) and describes the
  person's role _within that specific group_, not an app-login role.
- **attendance_sessions** + **attendance_records**: one session per week per
  group, then per-member attendance rows.
- **guests**: visitor pipeline.
- **follow_ups**: operational tasks.
- **group_health_updates** and **group_status_history**: pulse and
  status-change history.
- **audit_events**: immutable operational log. Every RPC mutation
  writes one row in the same transaction as the data change.
- **app_settings**: lightweight JSON settings (includes
  `metric_defaults` and the `launch_planning` baseline assumption row).
- **shepherd_care_profiles** + **shepherd_care_interactions**:
  admin-only care tracking surfacing `/admin/shepherd-care`. Append-
  only interaction history; SELECT restricted to `super_admin` /
  `ministry_admin`.
- **over_shepherds** + **shepherd_coverage_assignments**: over-shepherd
  roster and shepherd ↔ over-shepherd coverage. Admin-only; no
  over-shepherd login surface.
- **launch_planning_scenarios**: named scenarios for
  `/admin/launch-planning` (LP.2). One row marked `is_current` is the
  canonical default; the LP.1 baseline lives in `app_settings`.

## Auth identity vs. participant identity

The schema deliberately separates two kinds of people:

- **App-login users** live in `profiles` and are linked to a Supabase Auth
  user through `profiles.auth_user_id`. Their `profiles.role` determines
  which dashboard they see. The owner/operator bootstraps their own
  `super_admin` profile via `supabase/dev/link_super_admin.sql.example`
  (see `supabase/dev/README.md`); seed test users in
  `phase2_seed.sql` cover the remaining four `user_role` values.
- **Non-auth participants** live in `members`. They are the people groups
  serve, with no sign-in capability. They are joined to groups through
  `group_memberships`. A `members` row never has, or needs, an
  `auth.users` row in the current design.

Admin workflows for creating and updating both kinds of records ship
through narrow `admin_*` `SECURITY DEFINER` RPCs; see the read-models
in `lib/supabase/read-models.ts` and the RPC sources in the migration
files for the per-table contracts.

## Key relationships

- `profiles.auth_user_id -> auth.users.id` (Supabase Auth, set manually
  via the bootstrap in `supabase/dev/README.md`).
- `group_leaders.group_id -> groups.id`
- `group_leaders.profile_id -> profiles.id`
- `group_memberships.group_id -> groups.id`
- `group_memberships.member_id -> members.id`
- `attendance_sessions.group_id -> groups.id`
- `attendance_records.session_id -> attendance_sessions.id`
- `attendance_records.member_id -> members.id`
- `follow_ups` can reference groups, members, guests, and assignees.

## Why lifecycle and health are separate

- **Lifecycle** tracks the operating state (`active`, `planned_pause`,
  `closed`, etc.).
- **Health** tracks ministry quality/risk (`healthy`, `watch`,
  `needs_follow_up`, etc.).

A group may be in a planned pause but still healthy paused. The separation
keeps reporting clear.

## Attendance model

- `attendance_sessions` stores weekly summary/submission state for each group.
- `attendance_records` stores person-level outcomes for each session.
- Constraint `unique(group_id, meeting_week)` prevents duplicate weekly
  sessions.

## Guest pipeline

`guests.pipeline_stage` supports journey tracking from `new` through
`placed`/`not_now` for ministry follow-up visibility.

## Follow-ups

`follow_ups` provides a shared task queue with priority, status, due dates,
assignees, and optional entity links.

## Row Level Security

RLS is enabled on every operational table, and policies are
**SELECT-only**. Writes flow through `SECURITY DEFINER` RPCs that
perform their own role checks and write paired `audit_events` rows in
the same transaction.

### Helper functions

All SQL helpers live in the `public` schema, are `security definer` + `stable`,
and are only executable by the `authenticated` role.

- `auth_profile_id()` — the caller's `profiles.id` (lookup by
  `auth_user_id = auth.uid()` **and** `status = 'active'`, so deactivated
  accounts get NULL).
- `auth_role()` — the caller's `user_role` (also gated on
  `status = 'active'`).
- `auth_is_admin()` — `super_admin` or `ministry_admin`.
- `auth_is_staff_viewer()` — `staff_viewer`.
- `auth_is_admin_or_staff()` — convenience for read policies that allow either
  admins or staff.
- `auth_is_leader_of(p_group_id uuid)` — true iff the caller has an
  `active = true` row in `group_leaders` for that group with
  `role in ('leader','co_leader')`. Inherits the active-profile gate via
  `auth_profile_id()`.

### Policy intent

| Table                     | Admin (super_admin / ministry_admin) | Leader / Co-Leader                                              |
| ------------------------- | ------------------------------------ | --------------------------------------------------------------- |
| profiles                  | All                                  | Self only (`auth_user_id = auth.uid()`)                         |
| groups                    | All                                  | Groups where `auth_is_leader_of(id)`                            |
| group_leaders             | All                                  | Self + peer leaders in same group                               |
| members                   | All                                  | Members with an active membership in one of the leader's groups |
| group_memberships         | All                                  | Memberships where `auth_is_leader_of(group_id)`                 |
| attendance_sessions       | All                                  | Sessions where `auth_is_leader_of(group_id)`                    |
| attendance_records        | All                                  | Via parent session                                              |
| guests                    | All                                  | Guests with first attended or assigned group the leader owns    |
| follow_ups                | All                                  | Follow-ups for the leader's groups or assigned to the leader    |
| group_health_updates      | All                                  | Updates where `auth_is_leader_of(group_id)`                     |
| group_status_history      | All                                  | History where `auth_is_leader_of(group_id)`                     |
| shepherd*care*\*          | All                                  | No access                                                       |
| over_shepherds, coverage  | All                                  | No access                                                       |
| launch_planning_scenarios | All                                  | No access                                                       |
| audit_events              | Admin only                           | No access                                                       |
| app_settings              | Authenticated                        | Authenticated                                                   |

### What's intentionally missing

- **No table-level INSERT / UPDATE / DELETE policies.** All writes flow
  through the `admin_*` / `leader_*` / `super_admin_*` RPCs above.
- **No anon read policies.** The publishable key client returns zero
  rows for every operational table; the app falls back to demo data
  when no session is present.

## Verifying RLS in the database

In the Supabase SQL editor, use the **Run as** dropdown to impersonate a user
and run `select count(*) from groups;`. Expected:

- `anon` → 0 rows.
- Leader Casey (after `supabase/dev/link_test_users.sql` is run) → 2 rows.
- Ministry admin → 5 rows.

## Retired columns (kept in place)

These stored shapes are **dead by decision** but deliberately left in place —
the frozen-schema discipline (ADR 0008/0009/0016: nothing is dropped just
because a surface stopped reading it, so re-enabling a surface never needs a
schema change). Recorded here per issues #472/#475:

- **`check_in_due_day_of_week`** — a key inside the `app_settings`
  `metric_defaults` JSON row: the global check-in due-day default from the
  frozen weekly check-in surface (ADR 0002). No app code reads it today; the
  settings RPCs still accept and merge the key, and any stored value is
  preserved.
- **Cell model (retired)** — the `group_categories` catalog,
  `category_type_targets` matrix, `audience_readiness_rule`,
  `multiplication_config`, and the `groups.audience_category` / `groups.category_id`
  columns were **dropped** by the collapse-cells migration
  (`20260708000000_collapse_cells_to_group_type_list.sql`). A group's
  segmentation is now the single free-text `groups.group_type` column (null =
  Untyped), chosen from the admin-managed `app_settings` `group_types` list.
  Per-type config (target group count + optional readiness-rule override) lives
  in `group_type_configs`, keyed on the type name. The single global readiness
  rule (`multiplication_readiness_rule`) is kept.
- **`group_metric_settings.check_in_due_offset_hours_override`** — retired
  from the Settings per-group form in #472. The full-state upsert RPC still
  accepts the parameter; the app now always passes null, which clears any
  stored override on the next per-group save.

## Member-care foundation (built; surfacing is flag-gated)

**`member_care_profiles` + `member_care_interactions`** are the member half
of the Care area — a deliberate parallel of the `shepherd_care_*` foundation
for non-auth `members` rows
(`supabase/migrations/20260624000000_phase_care_member_list_foundation.sql`).
The backend is **complete**: admin-only RLS SELECT (`auth_is_admin()`; no
leader / over-shepherd path), writes only via the audited
`admin_upsert_member_care_profile` / `admin_log_member_care_interaction`
RPCs (input validation lives in the RPC bodies), and column-allowlisted
reads in `lib/supabase/member-care-reads.ts`. No UI consumes any of it yet:
**surfacing is governed solely by the Super-Admin `care_member_list` flag**
(`lib/admin/feature-flags.ts`, default off ⇒ Care is leaders-only). Flipping
the flag is a UI-surfacing change only — no schema or policy change at flip
time.
