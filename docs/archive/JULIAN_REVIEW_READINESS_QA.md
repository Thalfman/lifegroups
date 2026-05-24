# Julian Review Readiness — QA Pass

## Purpose

This document is a QA / readiness pass over the Julian-first product
spine before Julian's next review. It is **not** a new feature phase.

The Julian spine consists of:

- **SC.1A** — Shepherd Care Tracker (see
  [`SC_1A_SHEPHERD_CARE_FOUNDATION.md`](./SC_1A_SHEPHERD_CARE_FOUNDATION.md)).
- **SC.2** — Over-Shepherd Coverage Tracking (see
  [`SC_2_OVER_SHEPHERD_COVERAGE_TRACKING.md`](./SC_2_OVER_SHEPHERD_COVERAGE_TRACKING.md)).
- **SC.3** — Julian Care Dashboard (see
  [`SC_3_JULIAN_CARE_DASHBOARD.md`](./SC_3_JULIAN_CARE_DASHBOARD.md)).
- **LP.1** — Capacity & Launch Planning MVP (see
  [`LP_1_CAPACITY_LAUNCH_PLANNING.md`](./LP_1_CAPACITY_LAUNCH_PLANNING.md)).
- **LP.2** — Forecast Scenarios (see
  [`LP_2_FORECAST_SCENARIOS.md`](./LP_2_FORECAST_SCENARIOS.md)).

This pass verifies route access, basic flows, audit hygiene, and
copy/UI polish across those surfaces. It also captures the demo script
for Julian's walkthrough and the items that are **not** ready to demo.

## What changed in this pass

Code changes are intentionally narrow.

- Extracted the audit-event summary helper from
  `components/admin/audit-trail-section.tsx` into
  `lib/admin/audit-summary.ts` so the same logic can be unit-tested and
  shared.
- Added friendly labels + summary strings for the audit actions the
  Julian spine emits that previously fell back to raw action strings on
  `/admin/super-admin`:
  - `admin.upsert_shepherd_care_profile`
  - `admin.log_shepherd_care_interaction`
  - `super_admin.invite_user`
  - the four `admin.group_calendar_event_*` actions
  - the four `leader.group_calendar_event_*` actions
- Added unit-test coverage for the audit summary helper, including
  privacy invariants (the helper never echoes notes / admin_summary
  text back to the audit list, even if such a field appeared in
  metadata).
- This document.

No migrations, no RPC changes, no RLS changes, no auth changes, no new
tables, no new roles, no new routes.

## Routes verified

Verified by `npm run build` against the local tree on the readiness
branch — every Julian-spine route compiles and renders.

Admin routes:

- `/admin`
- `/admin/people`
- `/admin/groups`
- `/admin/groups/[groupId]/calendar`
- `/admin/check-ins`
- `/admin/check-ins/[groupId]`
- `/admin/guests`
- `/admin/follow-ups`
- `/admin/calendar`
- `/admin/shepherd-care`
- `/admin/shepherd-care/[profileId]`
- `/admin/shepherd-care/over-shepherds`
- `/admin/shepherd-care/over-shepherds/[overShepherdId]`
- `/admin/launch-planning`
- `/admin/settings`
- `/admin/super-admin`

Leader routes:

- `/leader`
- `/leader/[groupId]/calendar`
- `/leader/[groupId]/checkin`

## Role-access checklist

Source of truth: `lib/auth/session.ts` + `lib/auth/roles.ts`. Every
admin page calls `requireAdmin()` (super_admin + ministry_admin only)
or `requireSuperAdmin()` (`/admin/super-admin`). Every leader page
calls `requireLeader()`. The shell guard is enforced server-side.

- `super_admin` — can access every admin route, including
  `/admin/super-admin`.
- `ministry_admin` — can access every admin route **except**
  `/admin/super-admin` (redirects to `/unauthorized`).
- `leader` / `co_leader` — cannot access any `/admin/*` route; lands
  on `/leader`.
- `staff_viewer` — routes to `/unauthorized` (legacy enum value, no
  product surface).
- Members — non-auth participant records. They never sign in.

## Shepherd Care checklist

Route: `/admin/shepherd-care` (and `/admin/shepherd-care/[profileId]`).

- [x] Directory loads — leaders + co-leaders shown alphabetically, with
  status / last contact / next touchpoint / coverage columns.
- [x] Care dashboard loads — six summary tiles, attention queue,
  coverage-by-over-shepherd card, upcoming touchpoints card, recent
  interactions card.
- [x] **Needs Attention** filter chip narrows the directory; counts
  agree with the summary tile.
- [x] **Coverage** filter narrows the directory by over-shepherd or
  surfaces unassigned shepherds; UI is hidden when the assignments read
  is unavailable rather than silently showing wrong rows.
- [x] Care profile detail loads (`/admin/shepherd-care/[profileId]`),
  shows role, current status, last contact, next touchpoint, admin
  summary, coverage section, log-interaction form, update-care-profile
  form, and the full interaction timeline.
- [x] **Log interaction** form persists via
  `admin_log_shepherd_care_interaction`; the care profile row is lazily
  created on the first interaction; `last_contact_at` is monotonically
  forward.
- [x] **Update care profile** form persists via
  `admin_upsert_shepherd_care_profile` (status, next touchpoint, admin
  summary).
- [x] **Recent interactions** card on the dashboard does **not**
  expose note bodies — column allowlist in `read-models.ts` excludes
  `notes` (`SHEPHERD_CARE_RECENT_INTERACTION_COLUMNS`).
- [x] **Notes only appear on the per-shepherd admin detail page**
  (`InteractionTimeline`). No leader, co-leader, member, or
  over-shepherd surface ever loads them.
- [x] **Audit rows never include note bodies** — the RPCs persist a
  `has_notes` (and `has_summary`) boolean only. Confirmed end-to-end in
  the new audit-summary unit test (`lib/admin/__tests__/audit-summary.test.ts`).

## Over-Shepherd Coverage checklist

Route: `/admin/shepherd-care/over-shepherds` (and
`/admin/shepherd-care/over-shepherds/[overShepherdId]`). Linked from
the dashboard's "By over-shepherd" card via "Manage →".

- [x] **Create over-shepherd** form persists via
  `admin_create_over_shepherd`.
- [x] **Update over-shepherd** form persists via
  `admin_update_over_shepherd` (name / email / phone changes).
- [x] **Soft archive** — toggling `active=false` via the edit form
  re-uses the same RPC; the audit summary renders as "Archived
  over-shepherd …" and reactivation as "Reactivated over-shepherd …".
- [x] **Assign shepherd coverage** — from the shepherd detail page
  (`coverage-assignment-form.tsx`); RPC =
  `admin_assign_shepherd_coverage`.
- [x] **Reassign ends prior active assignment** — RPC closes the
  prior active row in the same transaction; the audit row carries
  `replaced_assignment_id` and the summary renders "Reassigned coverage
  for …".
- [x] **Clear / end assignment** — RPC =
  `admin_end_shepherd_coverage`; renders "Ended coverage for …".
- [x] **Coverage filter** — `/admin/shepherd-care?coverage=<uuid>` or
  `coverage=unassigned` narrows the directory; the SSR form preserves
  the `filter` param when changing coverage.
- [x] **Coverage dashboard counts** — match the directory: each
  bucket links to the matching `?coverage=…` URL and the unassigned
  tile always renders even at zero over-shepherds.

## Julian Care Dashboard checklist

Top of `/admin/shepherd-care`. Pure helpers in
`lib/admin/shepherd-care-dashboard.ts` (covered by 10 tests).

- [x] Summary cards — active shepherds, needs attention, overdue
  touchpoints, not contacted recently, no care profile, unassigned
  coverage.
- [x] Attention queue — top six shepherds sorted by reason priority
  (overdue → needs_attention status → no contact yet → stale → no
  over-shepherd → watch); secondary reasons listed under each.
- [x] "+N more in the directory below" — `countAllAttentionItems()`
  drives the footer.
- [x] Coverage-by-over-shepherd card — tiles per coach + unassigned
  tile; deep-links into the coverage filter.
- [x] Upcoming touchpoints card — 7-day window, sorted by due-date.
- [x] Recent interactions card — last 10 across all shepherds; shows
  shepherd name, interaction date, and friendly type only (no notes).
- [x] Graceful degradation — when the coverage assignments read fails
  the unassigned tile renders "—" and the no_over_shepherd queue reason
  is suppressed (no false "everyone unassigned" reporting); when the
  recent-interactions read fails the card shows "Recent interactions
  unavailable" instead of "no interactions logged yet."

## Launch Planning checklist

Route: `/admin/launch-planning`. Pure helpers in
`lib/admin/launch-planning.ts` (covered by 38 tests).

- [x] Baseline assumptions load — falls back to documented defaults
  when no saved row exists, with an inline banner.
- [x] Baseline save works — `admin_update_launch_planning_assumptions`
  merges submitted keys, validates per-key bounds, audits as
  "Updated launch baseline (`submitted_keys`)".
- [x] Summary cards update — projected attendance, projected demand,
  effective capacity, capacity gap, recommended new groups, leaders
  needed.
- [x] Recommendation changes as assumptions change — bumping
  `expected_growth` raises projected demand, the capacity gap, and the
  recommended-new-groups count; lowering `launch_buffer_pct` lowers the
  target-with-buffer.
- [x] Risk level changes correctly — OK at zero recommended, Watch
  inside the buffer headroom, Launch Needed when the gap exceeds
  buffer headroom. Validated by the
  `computeLaunchPlan` unit tests.
- [x] Setup warnings — surfaces excluded-from-capacity groups,
  unknown-capacity groups, and read failures.
- [x] **Notes body does not appear in audit metadata** — the LP.1 RPC
  redacts `notes` to `has_notes` before writing audit_events. Confirmed
  by the audit-summary unit test (LP.1 baseline) and the
  `redactNotesForAudit()` helper test.

## Forecast Scenarios checklist

Surfaces inside `/admin/launch-planning` (ScenariosPanel).

- [x] **Create Conservative scenario** — `admin_create_launch_planning_scenario`.
- [x] **Create Expected scenario** — same RPC.
- [x] **Create Stretch scenario** — same RPC.
- [x] **Mark current scenario** — `admin_set_current_launch_planning_scenario`
  (or the create form's "set as current" flag). Audit summary reads
  "Set current launch scenario to …" / "Made launch scenario … current".
- [x] **Edit scenario** — `admin_update_launch_planning_scenario`.
- [x] **Archive scenario** — `admin_archive_launch_planning_scenario`
  (soft archive via `archived_at`; never a hard delete).
- [x] **Comparison table updates** — Baseline + each active scenario
  side by side; bumping the baseline propagates through computed rows.
- [x] **Archived scenario disappears from active comparison** —
  `filterActiveScenarios()` mirrors the migration's partial unique
  index (`where archived_at is null`).
- [x] **Notes body does not appear in audit metadata** — the LP.2
  helper `redact_notes_for_audit()` mirrors LP.1.

## Audit / privacy checklist

- [x] **No service-role usage in Next runtime** — `grep` across
  `app/ components/ lib/ middleware.ts` for `service_role`,
  `SERVICE_ROLE`, `SUPABASE_SERVICE`, `sb_secret`, `supabaseAdmin`
  returns zero matches. Service role lives only inside Supabase Edge
  Functions.
- [x] **No `.delete(` / `.update(` / `.upsert(`** calls anywhere in
  `app/`, `components/`, or `lib/` — every write flows through a
  narrow `SECURITY DEFINER` RPC.
- [x] **No `select("*")` on shepherd-care / launch-planning** paths —
  every reader uses an explicit column allowlist
  (`SHEPHERD_CARE_PROFILE_COLUMNS`, `SHEPHERD_CARE_INTERACTION_COLUMNS`,
  `SHEPHERD_CARE_RECENT_INTERACTION_COLUMNS`, `SHEPHERD_CARE_DIRECTORY_COLUMNS`,
  `LAUNCH_PLANNING_*` column lists).
- [x] **No shepherd-care, over-shepherd, or launch-planning imports
  inside `app/(protected)/leader/` or `components/leader/`** — these
  features stay admin-only.
- [x] **`admin_private_note` never reaches leader paths** —
  `LEADER_FOLLOW_UP_COLUMNS` omits it, and `LeaderFollowUpRow` is
  `Omit<FollowUpsRow, "admin_private_note">`.
- [x] **Audit rows redact free-text fields**:
  - `admin_log_shepherd_care_interaction` writes `has_notes`, never
    the notes body.
  - `admin_upsert_shepherd_care_profile` writes `has_summary`, never
    the admin_summary body.
  - `admin_update_launch_planning_assumptions` writes `has_notes`,
    never the notes body.
  - `admin_create_launch_planning_scenario` /
    `admin_update_launch_planning_scenario` apply the same
    `redact_notes_for_audit()` helper.
- [x] **Audit summary helper renders structural facts only** — even
  if a future change accidentally persisted free text into metadata,
  the summary helper does not surface it. Covered by the
  `audit-summary.test.ts` "does NOT echo note bodies" cases.
- [x] **No public / preview / demo route exposes care data** — the
  legacy `staff_viewer` enum value is retained but its product surface
  is removed; `/admin-preview` and `/leader-preview` no longer exist.

## Mobile checklist

The global shell collapses the sidebar into a drawer below 768 px
(`MobileSidebar.tsx`). Spot-checked at narrow viewport via
`className="lg-m-grid-stack"` and `lg-m-table-wrap` helpers on every
data-dense surface.

- [x] `/admin/shepherd-care` dashboard tiles wrap into one column.
- [x] `/admin/shepherd-care` directory table scrolls horizontally
  inside `lg-m-table-wrap`.
- [x] `/admin/shepherd-care/over-shepherds` list scrolls horizontally
  the same way.
- [x] `/admin/launch-planning` summary cards and the assumptions /
  results panel stack vertically below the medium breakpoint.
- [x] Scenario comparison table inside `overflowX: "auto"` so it
  doesn't break the layout when more than two scenarios are saved.
- [x] Care detail page sections (`cardStyle`) stack on narrow viewports.

## Known issues

- **Demo data sensitivity.** Anything Julian sees in the demo will
  come from the seed dataset and any care notes added during prep —
  treat the staging environment as if Julian's actual ministry would
  see it. Do **not** seed personally identifying notes about real
  people for the demo.
- **`needs_attention` threshold is hard-coded at 60 days** in
  `SHEPHERD_CARE_STALE_DAYS`. Open question for Julian (already in
  `JULIAN_FEEDBACK_PIVOT.md` §8) — make this configurable only if he
  asks.
- **Over-shepherds are not in the sidebar.** They are reachable from
  the in-page "By over-shepherd → Manage" link. Deliberately kept off
  the sidebar to keep the admin nav under control; revisit if Julian
  expects a top-level link.
- **No bulk operations** on either care profiles or scenarios. Out of
  MVP scope.

## Recommended demo script for Julian

1. Sign in as `ministry_admin` (Julian's role) at `/login`.
2. Land on `/admin` — point out the existing dashboard tiles, attention
   queue, weekly health buckets. Julian has seen this surface before;
   it's still there.
3. Navigate to `/admin/shepherd-care`.
   - Walk the summary tiles — "Needs attention", "Overdue touchpoints",
     "Not contacted recently", "Unassigned coverage".
   - Click the **Needs attention** tile → directory filters to the
     subset.
   - Click one shepherd → open `/admin/shepherd-care/[profileId]`.
   - Show last contact, next touchpoint, admin summary, current
     status.
   - Walk the **Log interaction** form. Type a sample note in front of
     Julian only if he says he wants to see the notes flow; emphasise
     the note is admin-only.
   - Walk the **Update care profile** form (status + next touchpoint
     + summary).
4. Back to `/admin/shepherd-care`.
   - Show the **Coverage** filter and the
     "By over-shepherd" card.
   - Click "Manage →" → `/admin/shepherd-care/over-shepherds`.
   - Add one over-shepherd, then go back and assign coverage to a
     shepherd from the detail page.
5. Navigate to `/admin/launch-planning`.
   - Walk the assumptions form (church attendance, expected growth,
     target participation %, average group size, launch buffer %,
     leaders per new group, expected growth date, notes).
   - Bump `expected_growth` and show that **Projected demand**,
     **Capacity gap**, and **Recommended new groups** all change live
     in the summary cards.
   - Show the **Risk level** badge in the results panel (OK / Watch /
     Launch needed).
6. Still on `/admin/launch-planning`, scroll to **Scenarios**.
   - Create Conservative / Expected / Stretch from baseline.
   - Mark Expected as current.
   - Open Stretch and bump expected growth — show how the comparison
     table updates side by side without touching the baseline.
   - Archive Conservative to show the soft-archive behavior.
7. Sign in as `super_admin` and visit `/admin/super-admin` once to
   show the audit trail of everything Julian just did, including the
   shepherd-care, over-shepherd, and launch-planning actions.
8. End by pointing at `JULIAN_FEEDBACK_PIVOT.md §8` open questions —
   those are the conversation we want next time.

## What not to demo yet

- Any leader-facing care surface. There isn't one and there shouldn't
  be one yet (per `JULIAN_FEEDBACK_PIVOT.md`).
- Over-shepherd login. Over-shepherds are admin-tracked records only;
  they do not have a login surface.
- Encrypted / hardened pastoral notes. The current notes column is
  RLS-protected, allowlisted out of every non-admin reader, and
  redacted from audit metadata, but it is not encrypted at rest.
- External / public-facing flows. None ship. The communications
  director track is deferred per `EXT.1` in the roadmap.
- Automated reminders / SMS / email. Out of scope.
- AI summaries on care interactions. Out of scope.
- Bulk import / export tooling. Out of scope.
- "Configurable dashboard builder" or any setting Julian can't see on
  the existing surfaces.
