# SC.1A — Shepherd Care Tracker Foundation

## Purpose

Replace the informal spreadsheet that Julian uses to track "caring" for
his leaders / co-leaders. The first slice gives the admin team a durable
place to record care interactions, see who hasn't been contacted
recently, and capture a current care status per leader. It is
intentionally **scoped to Julian's own workflow** — there is no
leader-facing surface, no over-shepherd login, and no encrypted notes
yet.

## Route

- `/admin/shepherd-care` — directory of every active leader / co-leader,
  filterable by "needs attention".
- `/admin/shepherd-care/[profileId]` — detail page for one leader where
  the admin can log a care interaction, update care state, and view the
  append-only interaction history. `profileId` is the leader's
  `profiles.id`, not the care row id.

## Role access

| Role            | Access                                                  |
|-----------------|---------------------------------------------------------|
| super_admin     | Full read + write.                                      |
| ministry_admin  | Full read + write.                                      |
| staff_viewer    | **No access.** Route redirects to `/unauthorized`.      |
| leader          | **No access.** Route redirects to `/leader`.            |
| co_leader       | **No access.** Route redirects to `/leader`.            |
| unauthenticated | Redirects to `/login`.                                  |

`requireAdmin()` is the page-level guard. RLS SELECT on both tables
uses `public.auth_is_admin()` (NOT `auth_is_admin_or_staff()`) so
staff_viewer can never read pastoral care data even if a query bypasses
the page guard.

## Data model

Two tables. No third "follow ups" table in this slice — that is
intentionally deferred until Julian uses the basic logger for a while
and tells us whether his workflow needs it.

### `shepherd_care_profiles`

| Column                | Type                              | Notes                                |
|-----------------------|-----------------------------------|--------------------------------------|
| `id`                  | uuid pk                           |                                      |
| `shepherd_profile_id` | uuid fk `profiles(id)`, **unique**| One care row per leader profile.     |
| `current_status`      | `shepherd_care_status` enum       | `healthy` / `watch` / `needs_attention`. Default `healthy`. |
| `last_contact_at`     | date, nullable                    | Updated via `greatest()` from the latest interaction. |
| `next_touchpoint_due` | date, nullable                    | Optional touchpoint target.          |
| `admin_summary`       | text, nullable                    | Admin-only plain text (≤ 2000 chars).|
| `archived_at`         | timestamptz, nullable             | Reserved for future soft-archive.    |
| `created_at`          | timestamptz                       |                                      |
| `updated_at`          | timestamptz                       |                                      |

### `shepherd_care_interactions`

Append-only. No edits, no deletes.

| Column                  | Type                                       | Notes                          |
|-------------------------|--------------------------------------------|--------------------------------|
| `id`                    | uuid pk                                    |                                |
| `care_profile_id`       | uuid fk `shepherd_care_profiles(id)`       |                                |
| `interaction_at`        | date, not null                             | Must be ≤ today.               |
| `interaction_type`      | `shepherd_care_interaction_type` enum      | `call` / `text` / `in_person` / `meeting` / `other`. |
| `notes`                 | text, nullable                             | Admin-only plain text (≤ 2000 chars). |
| `created_by_profile_id` | uuid fk `profiles(id)`, not null           |                                |
| `created_at`            | timestamptz                                |                                |

### Indexes

- `idx_shepherd_care_profiles_current_status (current_status)`
- `idx_shepherd_care_profiles_next_touchpoint_due (next_touchpoint_due)`
- `idx_shepherd_care_interactions_care_profile_at (care_profile_id, interaction_at desc, created_at desc)`
- Unique on `shepherd_care_profiles(shepherd_profile_id)` — at most one care row per leader.

## RPCs

Both are `SECURITY DEFINER`, gate on `public.auth_is_admin()` + an
`auth_profile_id()` actor, and write the matching `audit_events` row in
the same transaction. Note and summary bodies are **never** stored in
the audit metadata — only presence flags.

### `admin_upsert_shepherd_care_profile(p_shepherd_profile_id, p_current_status, p_set_current_status, p_next_touchpoint_due, p_set_next_touchpoint_due, p_admin_summary, p_set_admin_summary) → uuid`

Edits the care profile without logging an interaction. Tri-state
`_set_` flags let the admin update one field without clobbering others.
Validates that the target is a leader / co_leader with `status='active'`.
Rejects calls with all `_set_` flags false (`invalid_input`) so a direct
RPC caller can't bypass form validation to create empty rows or noisy
audit events.

The `ON CONFLICT ... DO UPDATE` branches each field on its `_set_`
flag (writing `excluded.<col>` when set, otherwise preserving
`public.shepherd_care_profiles.<col>`). This keeps a concurrent
first-time write from a second admin from clobbering the first admin's
field with the second transaction's stale fallback value.

Error tokens: `insufficient_privilege`, `invalid_input`, `missing_profile`.
Audit action: `admin.upsert_shepherd_care_profile`.

### `admin_log_shepherd_care_interaction(p_shepherd_profile_id, p_interaction_at, p_interaction_type, p_notes, p_set_next_touchpoint_due, p_next_touchpoint_due, p_set_current_status, p_current_status) → uuid`

Appends a `shepherd_care_interactions` row and **lazy-creates** the
matching `shepherd_care_profiles` row if it doesn't exist yet (same
transaction). Updates `last_contact_at` via
`greatest(coalesce(last_contact_at, '1900-01-01'), p_interaction_at)` so
an out-of-order backfill of an older date never regresses the current
last_contact value.

Rejects future-dated interactions
(`p_interaction_at > current_date + 1`). The one-day buffer past
`current_date` accommodates callers in time zones ahead of UTC, where
local "today" can already be tomorrow on the server clock. The
TS validator and the client form's `max` attribute mirror this with
`UTC today + 1 day`.

Error tokens: `insufficient_privilege`, `invalid_input`, `missing_profile`.
Audit action: `admin.log_shepherd_care_interaction`.

## Privacy model

- **Care notes are admin-only in this MVP.** They never leave the
  `/admin/shepherd-care` route. No leader prop, no leader serialized
  payload, no leader page source references them.
- Reads at the database layer are constrained by RLS to `super_admin` +
  `ministry_admin` only — `staff_viewer` is excluded by design.
- Reads in the application layer use an explicit column allowlist
  (`SHEPHERD_CARE_PROFILE_COLUMNS`, `SHEPHERD_CARE_INTERACTION_COLUMNS`).
  No `select("*")` against either care table.
- **Encrypted private notes are intentionally deferred** until Julian
  confirms whether he needs complete privacy for specific notes. If he
  asks for it later, the path is a new column (or sibling table) plus an
  app-layer encryption wrapper; the existing `admin_summary` / `notes`
  text columns stay as the "less-private" tier.

## Audit behavior

Every write writes one `audit_events` row in the same transaction. The
audit metadata records:

- `admin.upsert_shepherd_care_profile` — before/after of
  `current_status`, `next_touchpoint_due`, and a `has_summary` presence
  flag (NOT the summary body), plus the target `shepherd_profile_id` and
  the `_set_` flags that were active.
- `admin.log_shepherd_care_interaction` — `interaction_type`,
  `interaction_at`, `has_notes` flag (NOT the notes body), the resolved
  `care_profile_id`, the target `shepherd_profile_id`, and which
  optional flags were set.

Audit rows are visible under `/admin/super-admin` to super_admin users.

## What is intentionally deferred

- **Encrypted / private notes.** Defer until Julian confirms whether he
  needs complete privacy for specific notes.
- **`shepherd_care_follow_ups` table.** Held back until the basic logger
  proves out the workflow.
- **Over-shepherd login flow.** Not in scope. Julian is super_admin /
  ministry_admin in this MVP.
- **Leader-facing care views.** Out of scope by design.
- **SMS / email reminders, exports, AI summaries, mobile app, launch
  planning, generic follow-up redesign, public guest forms, invite-user
  changes.** Out of scope.

## Manual verification checklist

- [ ] super_admin loads `/admin/shepherd-care` and `/admin/shepherd-care/[profileId]`.
- [ ] ministry_admin loads same routes.
- [ ] staff_viewer is redirected to `/unauthorized` on the route, and
      the sidebar entry is not rendered.
- [ ] leader / co_leader are redirected to `/leader` on the route, and
      no `shepherd_care` strings appear in any leader page source.
- [ ] Directory shows leader + co_leader profiles only (no members, no
      guests, no admins).
- [ ] Logging an interaction creates an interaction row and updates the
      profile's `last_contact_at` to the interaction date.
- [ ] Logging an older-dated interaction does NOT regress
      `last_contact_at`.
- [ ] Logging an interaction with the "Update next touchpoint" or
      "Update care status" checkbox ticked updates the profile.
- [ ] The "Update care profile" form changes status / next touchpoint /
      summary without logging an interaction.
- [ ] Interaction history displays append-only with no edit / delete
      affordance.
- [ ] Audit rows for `admin.upsert_shepherd_care_profile` and
      `admin.log_shepherd_care_interaction` appear under
      `/admin/super-admin`. Audit metadata contains no notes / summary
      text.
- [ ] Needs-attention filter surfaces leaders with no care row,
      `next_touchpoint_due` overdue (< today), `last_contact_at` null,
      or `last_contact_at` older than 60 days.
- [ ] Mobile widths 390 px and 430 px have no horizontal overflow on
      the directory or detail page.
- [ ] Existing leader and admin routes still work end-to-end.

## Future follow-ups

- **Over-shepherd coverage tracking** so multiple admins can split care
  load.
- **Care dashboard** that rolls up needs-attention counts on the admin
  home / weekly view.
- **Encrypted private notes** if Julian wants complete privacy for
  specific notes.
- **Care-specific follow-ups** (the deferred third table) once the
  workflow is proven.
- **Configurable staleness threshold** — the 60-day "not contacted
  recently" rule is hard-coded for SC.1A.
