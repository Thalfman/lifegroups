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
  `status`, `full_name_pending` ADR 0025), `invitations`, `members` (non-auth
  participants), `group_leaders` (profile↔group, `active` flag),
  `group_memberships` (member↔group, `role_in_group`, `ended_at`).
- **Groups/cells:** `groups` (`lifecycle_status`, `health_status`,
  `audience_category`, `category_id`, `closed_at`), `group_categories` (catalog),
  `category_type_targets` (the **cell** = audience × category, `active`,
  `target_count`, `trigger_overrides` jsonb), `group_calendar_events`,
  `group_status_history`, `group_metric_settings`.
- **Care:** `shepherd_care_profiles` (admin-only leader tracker, `archived_at`),
  `shepherd_care_admin_notes`, `shepherd_care_interactions` (append-only),
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
- **Audit/compliance:** `audit_events` (admin-only, immutable), `audit_events_archive`,
  `tombstones` (permanent-deletion snapshots), `clean_slate_snapshots`,
  `history_reset_snapshots`, `account_deletion_requests`.
- **Attendance:** `attendance_sessions`, `attendance_records`.
- **Tasks:** `follow_ups` (carries `leader_visible_note` + `admin_private_note`).
- **Settings/platform:** `app_settings` (admin-only), `platform_config`
  (super-admin-only), `usage_events`, reset baselines, `invite_redeem_throttle`.

## Key enums

`user_role` (super_admin, ministry_admin, leader, co_leader, staff_viewer
[deprecated]; **no member**), `profile_status` (active/inactive/invited),
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
`auth_over_shepherd_covers(profile_id)`. Visibility is a downward ladder:
admins read everything; leaders read only rows scoped to their active groups;
over-shepherds read only covered leaders' data; `audit_events` and
shepherd-care tables are admin-only (no leader path). **Write policies are
deliberately absent at table level** — all writes go through RPCs.

## Soft-delete / archive conventions

Never hard-delete operational rows. Mechanisms: `archived_at` timestamp
(candidates, pipeline, categories, calendar events, care profiles, scenarios,
over_shepherds), `status` enum transition (profiles, members, memberships),
boolean flag (`group_leaders.active`, `coverage.active`,
`category_type_targets.active`), nullable end date (`ended_at`, `closed_at`).
Permanent deletion is super-admin-only, writes a **tombstone** (full row JSON
snapshot, recoverable), refuses rather than cascading.

## Audit-pairing invariant

Every data-change RPC writes exactly one `audit_events` row in the same
transaction; if the audit insert fails, the data change rolls back. Metadata
holds presence flags / diffs, never sensitive plaintext bodies. `actor_name` /
`actor_email` are denormalized so the audit row survives actor deletion
(ADR 0014).

## Two privacy exceptions

1. **Private Care Note** (`shepherd_care_private_notes`): AES-256-GCM
   client-side encryption, creator-scoped RLS — hidden even from Super Admin
   (ADR 0003).
2. **Author-private Care Notes / Prayer Requests** (`care_notes`,
   `prayer_requests`): plaintext, sealed to author; ministry_admin + super_admin
   read only when `note_transparency_grants.granted = true` for that subject
   (default false). Super Admin has **no** broader bypass — same grant gate.

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
