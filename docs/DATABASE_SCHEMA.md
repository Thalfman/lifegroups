# Database Schema

The base schema (Phase 2) lives at
`supabase/migrations/20260517040000_phase2_schema.sql`. The Phase 4 RLS
foundation lives at `supabase/migrations/20260518000000_phase4_rls.sql`.

## Core model
- **profiles**: user records mapped to Supabase Auth users via nullable
  `auth_user_id`. Phase 4 reads this column when resolving the signed-in
  session.
- **groups**: life groups with both lifecycle and health dimensions.
- **group_leaders**: links profiles to groups as leader/co-leader roles. The
  `active = true` rows drive Phase 4 leader scoping.
- **members** + **group_memberships**: people and their participation in
  specific groups.
- **attendance_sessions** + **attendance_records**: one session per week per
  group, then per-member attendance rows.
- **guests**: visitor pipeline.
- **follow_ups**: operational tasks.
- **group_health_updates** and **group_status_history**: pulse and
  status-change history.
- **audit_events**: immutable operational log.
- **app_settings**: lightweight JSON settings.

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

## Row Level Security (Phase 4)
Phase 4 enables RLS on every operational table and ships **SELECT-only**
policies.

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

| Table                  | Admin / Staff | Leader / Co-Leader                                              |
|------------------------|---------------|----------------------------------------------------------------|
| profiles               | All           | Self only (`auth_user_id = auth.uid()`)                        |
| groups                 | All           | Groups where `auth_is_leader_of(id)`                            |
| group_leaders          | All           | Self + peer leaders in same group                              |
| members                | All           | Members with an active membership in one of the leader's groups |
| group_memberships      | All           | Memberships where `auth_is_leader_of(group_id)`                |
| attendance_sessions    | All           | Sessions where `auth_is_leader_of(group_id)`                   |
| attendance_records     | All           | Via parent session                                              |
| guests                 | All           | Guests with first attended or assigned group the leader owns   |
| follow_ups             | All           | Follow-ups for the leader's groups or assigned to the leader   |
| group_health_updates   | All           | Updates where `auth_is_leader_of(group_id)`                    |
| group_status_history   | All           | History where `auth_is_leader_of(group_id)`                    |
| audit_events           | Admin only    | No access                                                       |
| app_settings           | Authenticated | Authenticated                                                   |

### What's intentionally missing
- **No INSERT / UPDATE / DELETE policies.** Write workflows arrive in Phase 5
  alongside the corresponding mutation paths in the app.
- **No anon read policies.** The publishable key client now returns zero rows
  for every operational table; preview routes render fallback demo data
  instead.

## Verifying RLS in the database
In the Supabase SQL editor, use the **Run as** dropdown to impersonate a user
and run `select count(*) from groups;`. Expected:

- `anon` → 0 rows.
- Leader Casey (after `supabase/dev/link_test_users.sql` is run) → 2 rows.
- Ministry admin → 5 rows.
