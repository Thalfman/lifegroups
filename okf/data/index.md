---
type: Data Model
title: Data Model — Tables, Enums, RLS & Conventions
description: The Postgres schema by domain area, the role-based RLS visibility model, soft-delete conventions, and the audit-pairing invariant.
resource: repo://supabase/migrations
tags: [database, schema, rls, supabase, audit, soft-delete]
timestamp: 2026-06-18T00:00:00Z
---

# Purpose

The schema is the security and domain boundary. Every read is RLS-scoped and
every write is audited. This file maps the tables, their visibility rules, and
the conventions (soft-delete, audit pairing, privacy exceptions) that must hold.

# Source of truth

- `docs/architecture/DATABASE_SCHEMA.md`, `docs/architecture/RLS_VISIBILITY.md`
- `types/database.ts` (hand-rolled Row types — the trust boundary), `types/enums.ts`
- `supabase/migrations/20260517040000_phase2_schema.sql` (base schema)
- `supabase/migrations/20260518000000_phase4_rls.sql` (RLS helpers + policies)
- Later migrations add: prospects, care_notes/prayer_requests, group/leader
  rubric grades, category catalog + cells, readiness rules, member care, tombstones

# Key details

## Tables by domain

- **People/roles:** `profiles` (app-login users; `auth_user_id`, `role`,
  `status`, `full_name_pending` ADR 0032), `invitations`, `members` (non-auth
  participants), `group_leaders` (profile↔group, `active` flag),
  `group_memberships` (member↔group, `role_in_group`, `ended_at`).
- **Over-shepherd coverage:** `over_shepherds` (non-auth roster; `active`,
  `archived_at`), `shepherd_coverage_assignments` (over_shepherd↔leader join,
  `active`/`ended_at`) — the join that `auth_over_shepherd_id()` /
  `auth_over_shepherd_covers()` scope `/over-shepherd` reads and care-note
  authorship by. Admin-managed; over-shepherds read their own active rows.
- **Groups/cells:** `groups` (`lifecycle_status`, `health_status`,
  `audience_category`, `category_id`, `closed_at`), `group_categories` (catalog),
  `category_type_targets` (the **cell** = audience × category, `active`,
  `target_count`, `trigger_overrides` jsonb), `group_calendar_events`,
  `group_status_history`, `group_metric_settings`.
- **Care:** `shepherd_care_profiles` (leader care tracker, `archived_at` —
  admin read **plus** coverage-scoped over-shepherd SELECT),
  `shepherd_care_admin_notes` (admin-only), `shepherd_care_interactions`
  (append-only; coverage-scoped over-shepherd SELECT),
  `shepherd_care_follow_ups`, `shepherd_care_private_notes` (**encrypted**,
  zero-knowledge) + `shepherd_care_note_key_slots`, `care_notes` +
  `prayer_requests` (**plaintext author-private**) + `note_transparency_grants`,
  `member_care_profiles` + `member_care_interactions`.
- **Interest funnel:** `prospects` (`state` enum, `group_id`, `archived`,
  `desired_audience_category`/`desired_category_id`) — replaces frozen `guests`.
- **Multiplication:** `multiplication_candidates`, `leader_pipeline`,
  `multiplication_readiness_rule` (global/year), `audience_readiness_rule`
  (per-type), retired `multiplication_config`.
- **Health:** `group_health_assessments` (monthly), `group_rubric_grades`,
  `leader_rubric_grades`, `health_rubrics` (configurable group/leader criteria).
- **Audit/compliance:** `audit_events` (**super-admin-only read** —
  phase5a2 dropped `audit_events_admin_read` for `audit_events_super_admin_read`,
  removing Ministry Admin visibility; immutable to **ordinary** writes, but the
  super-admin `super_admin_reset_audit_logs()` archives rows into
  `audit_events_archive`, purges live rows, then inserts a reset marker),
  `audit_events_archive`,
  `tombstones` (permanent-deletion snapshots), `clean_slate_snapshots`,
  `history_reset_snapshots`, `account_deletion_requests`.
- **Attendance:** `attendance_sessions`, `attendance_records`.
- **Tasks:** `follow_ups` (carries `leader_visible_note` + `admin_private_note`).
- **Settings/platform:** `app_settings` (admin-only), `platform_config`
  (super-admin-only), `usage_events`, reset baselines, `invite_redeem_throttle`.

## Key enums

`user_role` (super_admin, ministry_admin, **over_shepherd**, leader, co_leader;
plus `staff_viewer` which is **retired/inert**, not assignable; **no member**),
`profile_status` (active/inactive/invited),
`role_in_group` (member/leader/co_leader), `group_lifecycle_status`
(active/planned_pause/seasonal_break/launching_soon/needs_leader/at_risk/closed),
`group_audience_category` (men/women/mixed), `prospect_state`
(interested/matched/joined/not_at_this_time), `shepherd_care_status`
(doing_well/needs_encouragement/needs_follow_up/concern/inactive),
`group_health_letter`/`leader_health_letter` (A/B/C/D/F),
`multiplication_candidate_status`, `leader_readiness_stage`.

## RLS model

Helpers in `public` (SECURITY DEFINER, STABLE, authenticated-only):
`auth_profile_id()` (NULL when status≠active → denies deactivated users),
`auth_role()`, `auth_is_admin()` (super+ministry), `auth_is_leader_of(group_id)`
(checks `active=true` group_leaders row), `auth_over_shepherd_id()`,
`auth_over_shepherd_covers(profile_id)`. Visibility is a downward ladder. As a
**default operational pattern** admins (super + ministry) read most tables — but
**not everything**: `audit_events` + platform telemetry are super-admin-only,
SC.4 private notes are creator-scoped (even from Super Admin), and Care
Notes/Prayer Requests are grant-gated. Leaders read only rows scoped to their
active groups;
over-shepherds read only covered leaders' data. `audit_events` read is
**super-admin-only** (not ministry_admin). Shepherd-care tables have **no leader
path**, but they are **not** uniformly admin-only: over-shepherds have
coverage-scoped SELECT on `shepherd_care_profiles` and
`shepherd_care_interactions` (phase_os3); only the private / admin-summary care
tables (`shepherd_care_private_notes`, `shepherd_care_admin_notes`) are
admin-only. A future RLS sweep must preserve the over-shepherd coverage SELECTs.
**Write policies are deliberately absent at table level** — all writes go
through RPCs.

## Soft-delete / archive conventions

Never hard-delete operational rows. Mechanisms: `archived_at` timestamp
(candidates, pipeline, categories, calendar events, care profiles, scenarios,
over_shepherds), `status` enum transition (profiles, members, memberships),
boolean flag (`group_leaders.active`, `coverage.active`,
`category_type_targets.active`), nullable end date (`ended_at`, `closed_at`).
Permanent deletion is super-admin-only, writes a **tombstone** (full row JSON
snapshot, recoverable), refuses rather than cascading.

## Audit-pairing invariant

Every **domain-write** RPC writes exactly one `audit_events` row in the same
transaction; if the audit insert fails, the data change rolls back. Metadata
holds presence flags / diffs, never sensitive plaintext bodies. `actor_name` /
`actor_email` are denormalized so the audit row survives actor deletion
(ADR 0014). **Deliberate exceptions** (classified in
`tests/fitness/support/rpc-classification.ts`): service-role throttle/telemetry
writes such as `log_usage_event` and `check_invite_redeem_rate` mutate state
**without** an audit pair — do not add audit rows to them, and don't assume
every mechanism RPC is audit-paired.

## Two privacy exceptions

1. **Private Care Note** (`shepherd_care_private_notes`): AES-256-GCM
   client-side encryption, creator-scoped RLS — hidden even from Super Admin
   (ADR 0003).
2. **Author-private Care Notes / Prayer Requests** (`care_notes`,
   `prayer_requests`): plaintext, sealed to author; admins read only when
   `note_transparency_grants.granted = true` (default false). Super Admin has
   **no** broader bypass — same grant gate. The grant has **two arms**, keyed by
   note shape (`num_nonnulls(subject_profile_id, subject_group_id) = 1`):
   - **subject-grant** — OS notes about a leader (`subject_profile_id` set):
     admin reads when the grant is keyed on that **subject** leader.
   - **author-grant** — leader group notes (`subject_group_id` set, ADR 0020):
     admin reads when the grant is keyed on the **author** (`subject_profile_id
= author_profile_id`), guarded by `subject_group_id is not null` so a stale
     grant about another leader can't leak the group note.

# Relationships

- [/okf/auth/auth-overview.md](/okf/auth/auth-overview.md)
- [/okf/api/index.md](/okf/api/index.md)
- [/okf/architecture/request-lifecycle.md](/okf/architecture/request-lifecycle.md)
- [/okf/glossary/index.md](/okf/glossary/index.md)
- [/okf/decisions/index.md](/okf/decisions/index.md)

# Gotchas

- `member` is **not** in `user_role` — members never log in.
- Two distinct "private note" systems coexist (encrypted vs plaintext+grant) —
  don't conflate. Leader routes must never receive `admin_private_note`.
- `guests` + `multiplication_config` + `life_stage` enum are **retired/frozen**
  but still in the schema; `category_id`/cells are the live segmentation source.
- Migrations are timestamp-ordered and **never auto-applied** on deploy.
- `types/database.ts` is hand-rolled — it can drift from SQL; treat SQL
  migrations as ground truth.

# Citations

- `supabase/migrations/20260517040000_phase2_schema.sql:24-190`
- `supabase/migrations/20260518000000_phase4_rls.sql:17-285`
- `supabase/migrations/20260608090000_phase_pivot9_care_notes.sql`
- `supabase/migrations/20260610000000_phase_groups1_category_catalog_and_matrix.sql`
- `types/database.ts`, `types/enums.ts`
