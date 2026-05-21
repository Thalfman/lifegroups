# SC.2 — Over-Shepherd Coverage Tracking

## Purpose

Julian needs to track which of his ~3 over-shepherds / coaches is
responsible for which of the ~63 Life or Co-Life Shepherds. This slice
extends the SC.1A Shepherd Care Tracker with coverage records so the
admin directory shows assigned over-shepherd per shepherd and supports
assign / reassign / clear flows.

This is admin coverage tracking, not over-shepherd login or coach
collaboration. Over-shepherds do not log in to the app in this phase.

## Route

All UI lives under the existing `/admin/shepherd-care` surface:

- `/admin/shepherd-care` — directory: existing care directory with a new
  Over-shepherd column, a coverage filter, and a summary card listing
  over-shepherds with shepherd counts.
- `/admin/shepherd-care/over-shepherds` — list of all over-shepherds
  (active + archived) with an inline create form.
- `/admin/shepherd-care/over-shepherds/[overShepherdId]` — edit form
  for one over-shepherd plus a read-only "Currently covers" list.
- `/admin/shepherd-care/[profileId]` — per-shepherd detail: new
  Coverage card between the care summary and the Log Interaction form,
  exposing assign / reassign / clear.

No new top-level admin nav entry. The shepherd-care nav item already
links to the directory.

## Role access

Allowed:

- `super_admin`
- `ministry_admin`

Denied (with 404 / route guard via `requireAdmin()`):

- `leader`
- `co_leader`
- `staff_viewer` (legacy / no-access role)
- Unauthenticated visitors

No new auth role is introduced. Over-shepherds remain non-auth records.

## Data model

Migration:
`supabase/migrations/20260518170000_phase5d1_over_shepherd_coverage.sql`.

### `public.over_shepherds`

Non-auth roster of coaches Julian manages. Soft-archivable.

| column        | type        | notes                                        |
| ------------- | ----------- | -------------------------------------------- |
| `id`          | uuid pk     | `gen_random_uuid()`                          |
| `full_name`   | text        | 1..200 chars, trimmed; required              |
| `email`       | text null   | format validated in TS layer                 |
| `phone`       | text null   | format validated in TS layer                 |
| `active`      | boolean     | default `true`; soft-archive via `false`     |
| `notes`       | text null   | ≤ 2000 chars; NEVER written to audit metadata |
| `created_at`  | timestamptz | default `now()`                              |
| `updated_at`  | timestamptz | default `now()`                              |
| `archived_at` | timestamptz | set when `active` flips `true → false`       |

Index: `idx_over_shepherds_active_full_name (active, full_name)` for
the active-first directory listing.

### `public.shepherd_coverage_assignments`

Active + historical coverage links.

| column                | type        | notes                              |
| --------------------- | ----------- | ---------------------------------- |
| `id`                  | uuid pk     | `gen_random_uuid()`                |
| `shepherd_profile_id` | uuid        | fk `profiles(id) on delete restrict` |
| `over_shepherd_id`    | uuid        | fk `over_shepherds(id) on delete restrict` |
| `active`              | boolean     | default `true`                     |
| `assigned_at`         | date        | default `current_date`             |
| `ended_at`            | date null   | set when `active` flips to false   |
| `created_at`          | timestamptz | default `now()`                    |
| `updated_at`          | timestamptz | default `now()`                    |

Indexes:

- `idx_shepherd_coverage_assignments_shepherd_active (shepherd_profile_id, active)`
- `idx_shepherd_coverage_assignments_over_shepherd_active (over_shepherd_id, active)`
- **Partial unique** `shepherd_coverage_assignments_one_active_per_shepherd (shepherd_profile_id) where active = true`

The partial unique enforces at most one active coverage row per
shepherd. Soft-ended rows (`active = false`) are excluded, so the same
shepherd can be reassigned after their prior assignment is closed. This
mirrors the soft-delete pattern in
`20260518140000_phase5a6_group_calendar.sql`.

## Privacy model

- RLS is enabled on both new tables.
- Only `auth_is_admin()` (super_admin / ministry_admin) can SELECT —
  `staff_viewer` is excluded by design, matching SC.1A.
- There are no INSERT / UPDATE / DELETE table policies. Writes happen
  through SECURITY DEFINER RPCs that re-check `auth_is_admin()` in the
  function body.
- `over_shepherds.notes` text is **never** written to `audit_events`
  metadata. Only a presence flag (`has_notes`) appears in the audit row.
- Read helpers (`fetchOverShepherdsForAdmin`,
  `fetchActiveShepherdCoverageAssignmentsForAdmin`) use explicit column
  allowlists (`OVER_SHEPHERD_LIST_COLUMNS`,
  `SHEPHERD_COVERAGE_ASSIGNMENT_COLUMNS`). Notes are loaded only by
  `fetchOverShepherdByIdForAdmin` for the edit form.
- No leader-facing surface exposes any of this data. Over-shepherds
  have no app login in this phase.

## RPCs

All SECURITY DEFINER, `search_path = public, pg_temp`. All begin with
`auth_is_admin()` and `auth_profile_id()` checks; all write
`audit_events` in the same transaction as the data change.

### 1. `admin_create_over_shepherd(p_full_name, p_email, p_phone, p_notes) returns uuid`

- Validates full_name length and notes length in the function body.
- Inserts an `over_shepherds` row.
- Audit `action='admin.create_over_shepherd'` with metadata
  `{ after: { full_name, has_email, has_phone, has_notes, active: true } }`.

### 2. `admin_update_over_shepherd(p_over_shepherd_id, p_full_name, p_email, p_phone, p_notes, p_active) returns uuid`

- Locks the row with `SELECT ... FOR UPDATE`.
- Soft archive: setting `p_active = false` while currently active sets
  `archived_at = now()`. Reactivation clears `archived_at`.
- Never hard-deletes.
- Audit `action='admin.update_over_shepherd'` with `before`/`after`
  presence flags. No note bodies.

### 3. `admin_assign_shepherd_to_over_shepherd(p_shepherd_profile_id, p_over_shepherd_id, p_assigned_at) returns uuid`

- Validates the shepherd target is an active `leader` / `co_leader`
  (raises `missing_profile` otherwise — same gate as SC.1A).
- Validates the over-shepherd exists and is active (`missing_over_shepherd`
  / `inactive_over_shepherd`).
- Atomically ends any existing active assignment for the shepherd, then
  inserts the new active row. The partial unique index protects against
  concurrent races.
- Audit `action='admin.assign_shepherd_coverage'` includes
  `replaced_assignment_id` / `replaced_over_shepherd_id` when a prior
  assignment was ended.

### 4. `admin_end_shepherd_coverage_assignment(p_assignment_id, p_ended_at) returns uuid`

- Locks the assignment row; raises `missing_assignment` if not active
  (idempotent guard so the UI can refresh on stale state).
- Sets `active = false`, `ended_at = coalesce(p_ended_at, current_date)`.
- Audit `action='admin.end_shepherd_coverage'` includes the
  `shepherd_profile_id` and `over_shepherd_id` for the friendly summary.

### Error tokens

Added to `lib/admin/action-result.ts:RPC_ERROR_MESSAGES`:

- `missing_over_shepherd` — "We couldn't find that over-shepherd."
- `inactive_over_shepherd` — "That over-shepherd is inactive."
- `missing_assignment` — "That assignment isn't active."

Plus existing SC.1A tokens (`insufficient_privilege`, `invalid_input`,
`missing_profile`).

## Audit behavior

Friendly labels added to `components/admin/audit-trail-section.tsx`:

```
"admin.create_over_shepherd": "Added over-shepherd"
"admin.update_over_shepherd": "Updated over-shepherd"
"admin.assign_shepherd_coverage": "Assigned coverage"
"admin.end_shepherd_coverage": "Ended coverage"
```

The `summarize()` function renders distinct strings for assign vs.
reassign (detected via `replaced_assignment_id`) and for archive vs.
reactivate vs. rename (detected via the before/after presence flags +
full_name diff). No note bodies are read or rendered.

## Why this is not over-shepherd login access

This slice intentionally avoids adding any login path for
over-shepherds. The goals here are coverage tracking for Julian and the
ability to filter the admin directory by coverage. Giving over-shepherds
their own dashboard requires:

- A new auth identity flow (account creation, role assignment).
- A pastoral view that surfaces care state without exposing notes that
  shepherds haven't consented to.
- Decisions about whether over-shepherds can edit care records.

Each of those is a substantial slice on its own. Doing them
incrementally — starting with admin-only coverage tracking — keeps the
audit boundary clean and avoids deciding policy questions before Julian
has used the workflow.

## Intentionally deferred

- Over-shepherd login / dashboard.
- Leader-facing care views.
- Encrypted private care notes.
- A separate care-specific follow-up table (already deferred in SC.1A).
- SMS / email notifications when coverage changes.
- CSV exports of coverage history.
- AI-generated coverage summaries.
- Public guest forms tied to over-shepherds.
- Auth role changes.
- Global shell / design changes.

## Manual verification checklist

Account checks (one admin and one leader account in the dev DB):

- [ ] `super_admin` can reach `/admin/shepherd-care` and sees the
      Over-shepherds card + the new Over-shepherd column.
- [ ] `ministry_admin` can reach `/admin/shepherd-care` and the
      `/admin/shepherd-care/over-shepherds` subroute.
- [ ] `leader` cannot reach `/admin/shepherd-care` (redirected by
      `requireAdmin()`).
- [ ] `co_leader` cannot reach `/admin/shepherd-care`.
- [ ] `staff_viewer` cannot reach `/admin/shepherd-care`.
- [ ] Unauthenticated request is redirected to sign in.

Workflow checks (as an admin):

- [ ] Create an over-shepherd from the manage page. Confirm it appears
      in the summary card on `/admin/shepherd-care`.
- [ ] Update an over-shepherd (name, email, notes). Confirm the change
      persists; confirm the audit row reads "Updated over-shepherd …".
- [ ] Soft-archive an over-shepherd by unchecking active. Confirm the
      coverage filter dropdown stops listing them in the active set,
      but the manage page still shows them as Archived.
- [ ] Reactivate an over-shepherd. Confirm they reappear in the filter.
- [ ] Assign a leader/co_leader to an over-shepherd from the per-shepherd
      detail page. Confirm the directory shows the assignment.
- [ ] Reassign the same leader to a different over-shepherd. Confirm
      the new assignment is active, the prior one shows up with
      `ended_at` in the audit trail, and the partial unique index is
      respected.
- [ ] Clear coverage. Confirm the directory shows `—`.
- [ ] Verify the audit trail row for each action renders a friendly
      summary (no note bodies, no email/phone leakage).
- [ ] Existing Needs Attention filter still works on the directory and
      composes with the coverage filter.
- [ ] Existing SC.1A flows (log interaction, update care profile) still
      work.

UI / mobile:

- [ ] At 390px and 430px viewport widths, no horizontal page overflow.
      The directory table scrolls horizontally inside its wrapper.

Greps (run before commit):

- `service_role|SERVICE_ROLE|SUPABASE_SERVICE|sb_secret|supabaseAdmin`
  across `app`, `components`, `lib`, `middleware.ts` → no occurrences
  in changed files.
- `shepherd_care|shepherdCare|ShepherdCare|over_shepherd|overShepherd|OverShepherd`
  across `app/(protected)/leader`, `components/leader`, `lib/leader` →
  no occurrences.
- `admin_private_note` across leader paths → no occurrences.
- `Staff View|staff viewer|Staff Viewer` in changed files → only
  existing references.
- `admin-preview|leader-preview|preview|demo` in changed files → none.
- `.delete(` in changed files → none on the new tables.
- `select("*")` in changed shepherd-care / over-shepherd files → none.

## Future follow-ups

- Over-shepherd login (separate slice — requires auth/identity design).
- Coverage history view (timeline of past assignments per shepherd /
  per over-shepherd).
- Workload balancing hints in the summary card (e.g., red badge if one
  over-shepherd is covering significantly more than peers).
- Optional 1:N coverage if Julian's workflow grows beyond one active
  over-shepherd per shepherd. Would require relaxing the partial unique
  to a (shepherd, over_shepherd) tuple.
- Notification when a shepherd's care status flips while their
  over-shepherd hasn't logged contact recently (still admin-only;
  surfaces in the directory rather than via email/SMS).
