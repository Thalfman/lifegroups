# Shepherd Care Tracker — Plan

Implementation plan for SC.1 / SC.2 / SC.3 / SC.4 in
[`PRODUCT_ROADMAP.md`](../PRODUCT_ROADMAP.md). SC.1A, SC.1B, SC.2, and SC.3
have shipped; this plan remains the forward-looking reference for **SC.4**
(private / encrypted notes — new, from Q8), plus any later care work.

**SC.1B shipped (issue #107):** the care follow-up task list (the "both" half
of Julian's Q6) is built — `shepherd_care_follow_ups` table + enum, the
`admin_create_shepherd_care_follow_up` / `admin_update_shepherd_care_follow_up_status`
/ `admin_update_shepherd_care_follow_up` RPCs, admin-only RLS, the pure helper
module `lib/admin/shepherd-care-follow-ups.ts`, SC.3 dashboard integration
(overdue follow-ups feed the attention queue + summary), and the care-profile
detail UI. Over-shepherd write of care follow-ups (#104) remains out of scope.

## Shipped — as-built summary

The detailed as-built specs are archived under
[`docs/archive/`](../archive/README.md) as
`SC_1A_SHEPHERD_CARE_FOUNDATION.md`,
`SC_2_OVER_SHEPHERD_COVERAGE_TRACKING.md`, and
`SC_3_JULIAN_CARE_DASHBOARD.md`.

**Route.** `/admin/shepherd-care` (directory + dashboard summary above)
and `/admin/shepherd-care/[profileId]` (detail page; `profileId` is the
leader's `profiles.id`).

**Tables.** `shepherd_care_profiles`, `shepherd_care_interactions`,
`over_shepherds`, `shepherd_coverage_assignments`. Admin-only SELECT;
no table-level write policies. `shepherd_care_follow_ups` (the **SC.1B**
feature) is not yet shipped; a **private-to-Julian notes tier (SC.4)** is not
yet built.

**RPCs.**
- `admin_upsert_shepherd_care_profile`
- `admin_log_shepherd_care_interaction` (also updates parent
  `last_contact_at` in the same transaction)
- `admin_create_over_shepherd`, `admin_update_over_shepherd`
- `admin_assign_shepherd_to_over_shepherd`,
  `admin_end_shepherd_coverage_assignment`

Each writes a paired `audit_events` row in the same transaction.

**Read-model column allowlists** added to `lib/supabase/read-models.ts`:
`SHEPHERD_CARE_PROFILE_COLUMNS`, `SHEPHERD_CARE_INTERACTION_COLUMNS`,
`OVER_SHEPHERD_COLUMNS`, `COVERAGE_ASSIGNMENT_COLUMNS`. No leader read
paths.

**Dashboard (SC.3).** Six summary cards + attention queue + coverage by
over-shepherd + upcoming touchpoints + recent interactions, all rendered
above the directory at `/admin/shepherd-care`. Pure helpers for recency
/ status bucketing live alongside the read-model.

---

## Forward-looking plan (SC.1B + later)

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

**Decided: A1.** Both inputs are now in hand. The spreadsheet
([template](../julian-inputs/MIN_CARE_LIST_TEMPLATE.md)) is note/date-oriented,
but Julian's answer to **Q6** ("history log, a follow-up/task list, or both?")
was **"Maybe both!"** — an explicit ask for the task/follow-up list as well as
the history. That settles the earlier A1-vs-A2 question in favor of **A1**:

- **A1 (target):** `shepherd_care_profiles` + `shepherd_care_interactions` +
  `shepherd_care_follow_ups`.
- **A2 (shipped subset):** SC.1A shipped profiles + interactions only;
  `shepherd_care_follow_ups` was intentionally deferred. **SC.1B completes A1**
  by adding the follow-ups table — now endorsed by Julian, not optional.

(Earlier guidance here read "if it's mostly notes and dates, A2 is fine." That
predated the Q6 answer; "both" supersedes it.)

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

### Planned: a private-to-Julian tier (SC.4, from Q8)

Julian asked for notes "that should only be readable by you" — readable by
**Julian alone**, excluding even `super_admin`. The full buildable design now
lives in its own spec: [`SC_4_PRIVATE_CARE_NOTES_SPEC.md`](../specs/SC_4_PRIVATE_CARE_NOTES_SPEC.md).

In brief: a separate **fenced table** (following the OS.5 `admin_summary`
precedent) whose RLS is **creator-scoped** so only the creating admin can SELECT
— excluding other admins and `super_admin` through the app. The one open
decision (blueprint Q1) is Tier 1 (creator-scoped RLS, **recommended**) vs.
Tier 2 (encryption against raw-DB access). No `leader` / `co_leader` /
over-shepherd path may ever reach private-tier notes.

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

> **Label note.** The `SC.1A`–`SC.1D` headings below are the *as-built*
> decomposition of the shipped SC.1 foundation (migration → RPCs → read models
> → UI). They are **all shipped.** Two forward-looking items remain and are
> spelled out at the end of this section: the **care-follow-ups feature**
> (roadmap/backlog **SC.1B**, the `shepherd_care_follow_ups` table — now
> endorsed by Q6) and **SC.4** (private / encrypted notes — new, from Q8).

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
  interaction_type, notes)` — inserts the interaction row **and**
  updates `last_contact_at` on the parent `shepherd_care_profiles` row in
  the same transaction, so the denormalized field used by the directory
  and dashboard (§ 7, § 8) stays accurate without per-read aggregation.
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

---

### SC.1B (feature) — Care follow-ups — NOT BUILT
- Add the `shepherd_care_follow_ups` table deferred by SC.1A (see § 7).
- Admin-only RLS SELECT; writes via `admin_create_care_follow_up` /
  `admin_update_care_follow_up_status` with paired audit rows.
- Read-model column allowlist; no leader path.
- Surface the task list in the care profile drawer (§ 13) and feed overdue
  items into the SC.3 dashboard buckets.
- **Endorsed by Julian's Q6 ("both"); A1 is the target model (§ 6).**

### SC.4 — Private / encrypted care notes — NEW (from Q8) — SPECCED
- Full design: [`SC_4_PRIVATE_CARE_NOTES_SPEC.md`](../specs/SC_4_PRIVATE_CARE_NOTES_SPEC.md).
- **Decide the interpretation first** (spec §2 / blueprint Q1): Tier 1 —
  creator-scoped RLS on a separate fenced table (recommended) vs. Tier 2 —
  encryption-at-rest with a Julian-held key.
- Tier 1 build: new `shepherd_care_private_notes` fenced table, RLS gated on
  `auth_is_admin() AND created_by_profile_id = auth_profile_id()`,
  `admin_upsert_shepherd_care_private_note` SECURITY DEFINER RPC with
  presence-only audit, a creator-scoped read model, and a "Private notes (only
  you)" section on the care detail page.
- Never expose to leaders / over-shepherds; requires a privacy review before
  build.
