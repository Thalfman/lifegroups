# Shepherd Care Tracker — Plan

Implementation plan for SC.1 / SC.2 / SC.3 in
[`PRODUCT_ROADMAP.md`](./PRODUCT_ROADMAP.md). This document is a **plan**,
not a built feature — the route and tables described below do not exist
yet in the repo.

## 1. Purpose

Replace Julian's informal Excel "caring" spreadsheet. Track care per
shepherd / leader, including:

- How each shepherd is doing right now (status).
- When Julian last connected with them.
- What Julian owes them next (next touchpoint).
- A history of past interactions.

This is for **Julian's admin workflow first** — not for leaders, not for
over-shepherds, not for public surfaces.

## 2. Why this is separate from generic follow-ups

The existing `follow_ups` table already powers `/admin/follow-ups` and
`/leader` follow-up cards. We are deliberately **not** reusing it for
shepherd care because:

- **Care notes are admin-only.** `follow_ups` has reachable leader read
  paths (`fetchOpenFollowUps`, `LEADER_FOLLOW_UP_COLUMNS`). Even with a
  column allowlist, building care-grade privacy on top of a leader-
  reachable table is fragile.
- **Care notes are more sensitive** than ordinary follow-ups. Pastoral
  content about a shepherd's wellbeing is qualitatively different from a
  task like "call back the new guest from Sunday".
- **Care cadence is relational, not task-shaped.** A care record is a
  history of touchpoints with a person; a follow-up is a discrete task.
  Modeling them as the same shape blurs both.
- **Leakage risk.** If `follow_ups` ever gets a column added or a read
  path widened, leader-facing surfaces could accidentally inherit care
  content. A separate table eliminates that class of bug.

## 3. Suggested route

`/admin/shepherd-care`

## 4. Audience and access

- **Initial audience:** Julian (`ministry_admin`).
- **Backup:** `super_admin` for ownership / support.
- **`leader` and `co_leader` do not see this module in the MVP.** No
  route access, no read-model exposure, no UI affordance.
- Julian mentioned that leaders and over-shepherds may be considered
  later, but that is **future scope** and should not drive the next
  build.
- **Over-shepherd access is not part of the MVP** and should not be
  assumed in any code path. SC.2 tracks coverage for Julian's view; it
  does not give over-shepherds login.
- `staff_viewer` has no access (role is deprecated anyway).

## 5. Data model options

### Option A — New `shepherd_care_*` tables (RECOMMENDED)

- Dedicated tables: `shepherd_care_profiles`,
  `shepherd_care_interactions`, optionally `shepherd_care_follow_ups`.
- Admin-only RLS: SELECT only for `super_admin` and `ministry_admin`;
  writes through `SECURITY DEFINER` RPCs.
- Pros: cleanest privacy boundary; queryable interaction history;
  schema can evolve independently of `follow_ups`.
- Cons: more migration work; needs new read models and RPCs.

### Option B — Reuse `follow_ups`

- Encode care interactions as follow-up rows with a "care" type.
- **Rejected for the MVP** because leader-visible read paths to
  `follow_ups` already exist and the sensitivity gap is real.

### Option C — JSONB blob per profile

- Store care state as a JSONB column on `profiles` or a sibling table.
- **Rejected.** Not queryable enough for the dashboard buckets in SC.3,
  and audit trails on JSON edits are messy.

## 6. Recommended MVP data model

**Option A, preferred.** Subject to review after Julian shares his
current spreadsheet columns. The implementation phase should confirm the
schema against that spreadsheet **before** the migration is written.

Two acceptable variants of Option A:

- **A1 (preferred):** ship `shepherd_care_profiles`,
  `shepherd_care_interactions`, and `shepherd_care_follow_ups` together.
- **A2:** ship `shepherd_care_profiles` + `shepherd_care_interactions`
  only. Defer `shepherd_care_follow_ups` until the interaction log proves
  the workflow.

If Julian's spreadsheet column list reveals heavy use of tasks /
reminders, prefer A1. If it's mostly notes and dates, A2 is fine.

## 7. Suggested table concepts

These are **plan-level sketches**, not finalized schemas. Final columns
and types will be set in the migration phase against Julian's actual
needs.

### `shepherd_care_profiles`

| Column | Notes |
|---|---|
| `id` | uuid pk |
| `shepherd_profile_id` | fk → `profiles.id` (the shepherd / leader) |
| `current_status` | enum, e.g. `healthy` / `watch` / `needs_attention` |
| `last_contact_at` | timestamptz; derived or denormalized for sort |
| `next_touchpoint_due` | date or timestamptz |
| `admin_summary` | text; Julian's running summary |
| `created_at` | timestamptz |
| `updated_at` | timestamptz |
| `archived_at` | timestamptz, nullable (soft-archive) |

One row per shepherd profile.

### `shepherd_care_interactions`

| Column | Notes |
|---|---|
| `id` | uuid pk |
| `care_profile_id` | fk → `shepherd_care_profiles.id` |
| `interaction_at` | timestamptz; when the touchpoint happened |
| `interaction_type` | enum, e.g. `call` / `text` / `in_person` / `meeting` / `other` |
| `notes` | text |
| `created_by_profile_id` | fk → `profiles.id` (Julian) |
| `created_at` | timestamptz |

Append-only. Normal workflow does not edit or hard-delete history.

### `shepherd_care_follow_ups` (optional, A1 only)

| Column | Notes |
|---|---|
| `id` | uuid pk |
| `care_profile_id` | fk → `shepherd_care_profiles.id` |
| `title` | text |
| `due_date` | date |
| `status` | enum, e.g. `open` / `in_progress` / `done` |
| `notes` | text |
| `created_by_profile_id` | fk → `profiles.id` |
| `created_at` | timestamptz |
| `updated_at` | timestamptz |
| `completed_at` | timestamptz, nullable |

Care-specific task list. **Never** exposed to leaders. Separate from
`follow_ups`.

## 8. Care profile concept

- One row per shepherd profile.
- Holds the latest care status, summary, last-contact, and next-
  touchpoint.
- `last_contact_at` and `current_status` are intended to drive the
  needs-attention view in SC.3.

## 9. Care interaction log concept

- Append-only history per care profile.
- Logs when Julian connected, the method (call / text / meeting /
  other), and free-text notes.
- The normal product flow does **not** allow editing or hard-deleting
  past interactions. Corrections are a separate appended interaction.

## 10. Care follow-up concept

- Admin-only task list parallel to the existing `follow_ups` table.
- Never exposed to leaders.
- Status transitions mirror the existing follow-up workflow (open →
  in_progress → done), enforced by a dedicated RPC.

## 11. Over-shepherd / coach coverage concept

- Handled in SC.2.
- Recommended approach: a `shepherd_assignments` (or equivalent) table
  linking an over-shepherd profile to one or more shepherd profiles
  Julian wants them to cover.
- Surfaces inside `/admin/shepherd-care` as filtering / grouping in the
  directory.
- **No over-shepherd login access in the MVP.** The table is for
  Julian's view of coverage, not for over-shepherds to sign in and use.

## 12. Privacy model

- Care tables hold the most sensitive in-app content.
- **RLS SELECT** is granted **only to `super_admin` and `ministry_admin`**.
- **No table-level INSERT / UPDATE / DELETE policies.** Writes flow
  exclusively through `SECURITY DEFINER` RPCs (`admin_*`) that perform
  their own role checks and write paired `audit_events` rows in the
  same transaction.
- **No leader / `co_leader` / `staff_viewer` read paths exist** in
  `lib/supabase/read-models.ts` or in any component.
- All reads use **explicit column allowlists** — no `select("*")` on
  care tables, ever.
- Every write is audited (`admin.care.upsert_profile`,
  `admin.care.log_interaction`, `admin.care.set_next_touchpoint`,
  `admin.care.assign_over_shepherd`, etc.).
- **No exports** in the MVP.
- **No public API.**
- **No external / comms visibility** — these tables are deliberately
  excluded from any future EXT.1 work unless explicitly added with a
  separate privacy review.

## 13. Suggested UI

At `/admin/shepherd-care`:

- A directory of shepherds with current care status, last contact, and
  next touchpoint at a glance.
- A care profile detail drawer (or sub-route) showing the interaction
  log, the running summary, the next touchpoint, and an add-
  interaction form.
- A follow-up queue (if A1 ships).
- Filters:
  - Needs attention
  - Not contacted recently
  - Next touchpoint overdue
  - Assigned over-shepherd
  - Care status (`healthy` / `watch` / `needs_attention`)

The SC.3 dashboard surfaces the buckets above in summary cards.

## 14. Integration points

- `profiles` rows where `role` is `leader` or `co_leader` — the
  candidates for a care profile.
- `groups` for context ("which group does this shepherd lead").
- `group_leaders` active assignments — to know who currently leads what
  and to filter the care directory.
- Optionally, a read-only indicator that this shepherd has open generic
  `follow_ups` assigned to them. **Do not let generic follow-ups read
  care notes.** The cross-link is one-way: care UI may glance at the
  count of generic follow-ups; generic follow-up UI never touches care
  tables.

## 15. What not to build yet

- Leader access of any kind.
- Leader-facing care dashboard.
- Over-shepherd dashboard.
- Over-shepherd login views.
- Care alerts / SMS.
- Email reminders.
- Bulk import (a one-shot manual seed is fine; an ongoing import
  pipeline is not).
- Exports.
- Analytics dashboards beyond SC.3 buckets.
- AI summaries.
- Mobile app.

## 16. Suggested phased implementation prompts

Each item below is a self-contained prompt outline for a subsequent
implementation PR.

### SC.1A — Migration plan
- Confirm schema with Julian's spreadsheet columns.
- Write the migration for `shepherd_care_profiles` and
  `shepherd_care_interactions` (A2) or all three tables (A1).
- Add admin-only RLS SELECT policies; no write policies.
- Add status enum if used.

### SC.1B — RPCs and audit
- `admin_upsert_care_profile(shepherd_profile_id, summary, status,
  next_touchpoint_due)`.
- `admin_log_care_interaction(care_profile_id, interaction_at,
  interaction_type, notes)`.
- `admin_set_next_touchpoint(care_profile_id, next_touchpoint_due)`.
- (A1 only) `admin_create_care_follow_up`, `admin_update_care_follow_up_status`.
- Each RPC writes a matching `audit_events` row in the same
  transaction.

### SC.1C — Read models
- Add `SHEPHERD_CARE_PROFILE_COLUMNS`, `SHEPHERD_CARE_INTERACTION_COLUMNS`
  to `lib/supabase/read-models.ts` with JSDoc privacy contracts.
- No leader read paths added.
- Explicit `select(<columns>)` only.

### SC.1D — UI directory and drawer
- Build `/admin/shepherd-care` route with directory + detail drawer.
- Add-interaction form, status / next-touchpoint update form.
- Filters listed in § 13.

### SC.3 — Dashboard
- Build SC.3 summary cards (stale contact, active concerns, recent
  connections, overdue touchpoints).
- Pure helper functions for recency / status bucketing, unit-tested.

SC.2 (over-shepherd coverage) is a separate prompt outline:

### SC.2 — Coverage tracking
- Migration for `shepherd_assignments` (or equivalent).
- RPCs `admin_assign_over_shepherd` / `admin_unassign_over_shepherd`
  with audit.
- Directory filter / grouping in `/admin/shepherd-care`.
- No over-shepherd login views.
