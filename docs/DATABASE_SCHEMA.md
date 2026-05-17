# Database Schema (Phase 2)

Phase 2 adds Supabase/PostgreSQL schema files only. No auth wiring, no app runtime queries, and no RLS policies are applied yet.

## Core model
- **profiles**: future user records mapped to Supabase Auth users via nullable `auth_user_id`.
- **groups**: life groups with both lifecycle and health dimensions.
- **group_leaders**: links profiles to groups as leader/co-leader roles.
- **members** + **group_memberships**: people and their participation in specific groups.
- **attendance_sessions** + **attendance_records**: one session per week per group, then per-member attendance rows.
- **guests**: visitor pipeline.
- **follow_ups**: operational tasks.
- **group_health_updates** and **group_status_history**: pulse and status-change history.
- **audit_events**: immutable operational log.
- **app_settings**: lightweight JSON settings.

## Key relationships
- `group_leaders.group_id -> groups.id`
- `group_leaders.profile_id -> profiles.id`
- `group_memberships.group_id -> groups.id`
- `group_memberships.member_id -> members.id`
- `attendance_sessions.group_id -> groups.id`
- `attendance_records.session_id -> attendance_sessions.id`
- `attendance_records.member_id -> members.id`
- `follow_ups` can reference groups, members, guests, and assignees.

## Why lifecycle and health are separate
- **Lifecycle** tracks the operating state (`active`, `planned_pause`, `closed`, etc.).
- **Health** tracks ministry quality/risk (`healthy`, `watch`, `needs_follow_up`, etc.).

A group may be in a planned pause but still considered healthy paused. This separation improves reporting clarity.

## Attendance model
- `attendance_sessions` stores weekly summary/submission state for each group.
- `attendance_records` stores person-level outcomes for each session.
- Constraint `unique(group_id, meeting_week)` prevents duplicate weekly sessions.

## Guest pipeline
`guests.pipeline_stage` supports journey tracking from `new` through `placed`/`not_now` for ministry follow-up visibility.

## Follow-ups
`follow_ups` provides a shared task queue with priority, status, due dates, assignees, and optional entity links.

## RLS in Phase 4
Phase 2 intentionally creates no policies. Phase 4 will apply RLS to enforce:
- Ministry admins: global access.
- Staff viewers: read-only ministry-wide slices.
- Leaders/co-leaders: only assigned group data.
