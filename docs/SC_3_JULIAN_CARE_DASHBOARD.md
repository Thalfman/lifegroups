# SC.3 — Julian Care Dashboard

## Purpose

SC.1A delivered the shepherd care directory and per-shepherd detail.
SC.2 layered on the over-shepherd roster and coverage assignments. Both
slices left Julian with a directory of 63+ rows to scan when he opened
`/admin/shepherd-care` — fine for browsing, slow for triage.

SC.3 turns the same page into a command center. A dashboard summary
section sits above the directory and answers, in one glance:

- How many shepherds need attention this week?
- Who, specifically, should I reach out to first?
- Where is coverage thin?
- What's coming up in the next 7 days?
- What's the latest activity across all shepherds?

The directory and its filters stay below, unchanged, so existing flows
(needs-attention chip, coverage filter, log-interaction form,
coverage assignment) keep working exactly as before.

No new tables, no new migrations, no new RPCs, no encrypted notes, no
leader-facing surface, no over-shepherd login.

## Route

All UI lives on the existing `/admin/shepherd-care` server component:

- `app/(protected)/admin/shepherd-care/page.tsx`

The page now composes one additional read
(`fetchRecentShepherdCareInteractionsForAdmin`) alongside the three SC.2
reads, builds a pure dashboard model, and renders the new sections
above the existing filter row and directory table.

## Role access

Allowed:

- `super_admin`
- `ministry_admin`

Denied (via `requireAdmin()`):

- `leader`
- `co_leader`
- `staff_viewer`
- Unauthenticated visitors

No new auth role is introduced. Access matches SC.1A / SC.2.

## Data sources

The dashboard reuses the SC.1A / SC.2 read models and adds one new
read for cross-shepherd recent interactions.

### Reused (no changes to projection or policy)

- `fetchShepherdCareDirectoryForAdmin` — leader + co_leader profiles
  joined with `shepherd_care_profiles` projection (omits
  `admin_summary`).
- `fetchOverShepherdsForAdmin` — over-shepherd list using
  `OVER_SHEPHERD_LIST_COLUMNS` (omits `notes`).
- `fetchActiveShepherdCoverageAssignmentsForAdmin` — active coverage
  assignments with embedded over-shepherd `{ id, full_name, active }`.

### Added

- `fetchRecentShepherdCareInteractionsForAdmin(client, { limit })` in
  `lib/supabase/read-models.ts`. Selects from
  `shepherd_care_interactions` ordered `interaction_at desc, created_at
  desc, limit N (default 10)`, with an embedded join through
  `shepherd_care_profiles → profiles` so the dashboard can render
  shepherd names. Uses
  `SHEPHERD_CARE_RECENT_INTERACTION_COLUMNS` which **omits `notes`**.
- Two file-private helpers (`differenceInDaysIso`, `computeNeedsAttention`)
  in the same module are now exported so the dashboard builder reuses
  the same staleness logic as the directory.

All reads run inside a single `Promise.all` in the page so TTFB is
bounded by the slowest query.

## Dashboard model

Pure, side-effect-free builder in
`lib/admin/shepherd-care-dashboard.ts`:

```ts
buildShepherdCareDashboardModel({
  entries,                  // ShepherdCareDirectoryEntry[]
  assignments,              // ActiveShepherdCoverageAssignmentSummary[]
  overShepherds,            // OverShepherdListRow[]    (no notes)
  recentInteractions,       // ShepherdCareRecentInteractionRow[]  (no notes)
  todayIso,                 // injected so tests are deterministic
  limits?,                  // attention | upcoming | recent | upcomingWindowDays
}) → ShepherdCareDashboardModel
```

The returned model has five sections:

### 1. Summary cards (6)

| Card                  | How it counts                                                                |
| --------------------- | ---------------------------------------------------------------------------- |
| Active shepherds      | `entries.length` (active `leader` + `co_leader` profiles)                    |
| Needs attention       | `entries[].needs_attention` (same predicate as the directory chip)           |
| Overdue touchpoints   | `care.next_touchpoint_due < todayIso`                                        |
| Not contacted recently| `last_contact_at` more than `SHEPHERD_CARE_STALE_DAYS` (60) days ago         |
| No care profile       | `entry.care === null`                                                        |
| Unassigned coverage   | shepherd id not in the active assignments set                                |

Each card is independent — a shepherd may count in multiple cards.

### 2. Attention queue

Prioritized triage list. Each entry that triggers ≥1 reason becomes
one item; the highest-priority reason drives the sort and the badge,
the rest move to `secondaryReasons`. Items sort by `(priority asc,
shepherdName asc)`. The top 6 render inline; the footer links to
`?filter=needs_attention` with a "+N more" link when there is overflow.

### 3. Coverage by over-shepherd

One tile per active over-shepherd plus an "Unassigned" tile. Each tile
shows the shepherd count and links to
`/admin/shepherd-care?coverage=<uuid>` (or `?coverage=unassigned`) so a
click narrows the directory below to that coverage.

### 4. Upcoming touchpoints

Derived from `entries[].care.next_touchpoint_due` — includes overdue
items as well as anything due in the next 7 days, sorted by due date
ascending. No additional database round-trip.

### 5. Recent interactions

The latest 10 interactions across all shepherds, with shepherd name,
date, type, and the day they were logged. **No notes** — clicking a row
opens the per-shepherd detail page, which has the full timeline.

## Priority rules

Attention queue priorities (lowest number = highest):

1. `overdue_touchpoint` — `care.next_touchpoint_due` is before today
2. `needs_attention_status` — `care.current_status === "needs_attention"`
3. `no_contact_yet` — `care === null` OR `last_contact_at === null`
4. `stale_last_contact` — last contact more than 60 days ago
5. `no_over_shepherd` — no active coverage assignment
6. `watch_status` — `care.current_status === "watch"`

A shepherd that matches several reasons appears once: the
highest-priority reason wins for the badge and sort, and the remainder
render as secondary chips.

## Privacy model

- The page is gated by `requireAdmin()`.
- All four read models are restricted by existing admin-only RLS on
  the source tables (`shepherd_care_profiles`,
  `shepherd_care_interactions`, `over_shepherds`,
  `shepherd_coverage_assignments`).
- Explicit column allowlists everywhere:
  - `ShepherdCareDirectorySummary` already omits `admin_summary`.
  - `SHEPHERD_CARE_RECENT_INTERACTION_COLUMNS` omits `notes`. The TS
    row type has no `notes` field, so the dashboard cards have no
    field to render even if RLS opened up.
  - `OVER_SHEPHERD_LIST_COLUMNS` omits over-shepherd `notes`.
- The dashboard model's `detail` strings are constructed from dates
  and counts only — never from `notes` or `admin_summary` bodies. A
  test asserts this by serializing the model and grep-matching for the
  sensitive field names.
- No `select("*")` in any shepherd-care or over-shepherd path.
- No service-role usage anywhere in the Next runtime.
- No imports of shepherd-care or over-shepherd code from leader paths.
- No new writes (no `.update`, `.upsert`, `.delete`) introduced. The
  dashboard is read-only composition.

## What is intentionally not shown

- Full care notes, interaction notes, or `admin_summary` text — link
  to the per-shepherd detail page instead.
- Over-shepherd `notes` text — admin-only field, surfaced only by the
  over-shepherd edit form loader.
- Archived / inactive shepherd profiles — the directory read-model
  already filters to active `leader` / `co_leader` roles.
- Historical (ended) coverage assignments — only currently active
  rows feed the coverage tiles.
- AI summaries, exports, SMS/email, public guest forms, encrypted
  notes — deferred (see Future follow-ups).

## Manual verification checklist

- [ ] Sign in as `super_admin` → `/admin/shepherd-care` shows the
      dashboard above the directory.
- [ ] Sign in as `ministry_admin` → same.
- [ ] `leader`, `co_leader`, `staff_viewer` are denied at the route
      (`requireAdmin()` redirects).
- [ ] Summary cards match a hand-computed snapshot of seed data.
- [ ] Attention queue ordering follows the priority rules above.
- [ ] Clicking a coverage tile filters the directory to
      `?coverage=<uuid>`.
- [ ] Clicking the Unassigned tile filters to `?coverage=unassigned`.
- [ ] Clicking the Needs attention summary card filters the directory
      to `?filter=needs_attention`.
- [ ] Clicking the Unassigned coverage summary card filters to
      `?coverage=unassigned`.
- [ ] Recent interactions list shows expected rows; notes never appear.
- [ ] Upcoming touchpoints includes overdue items and through +7 days.
- [ ] Existing needs-attention filter chip continues to work.
- [ ] Existing coverage dropdown continues to work.
- [ ] SC.1A log-interaction flow unchanged on detail pages.
- [ ] SC.2 coverage assign / end flows unchanged on detail pages.
- [ ] Leader routes unchanged. No shepherd-care strings appear in
      leader page source.
- [ ] No horizontal overflow at 390px / 430px viewports on the
      dashboard sections or the directory below.

## Future follow-ups

- Make `SHEPHERD_CARE_STALE_DAYS` configurable per-tenant via
  `app_settings` once Julian has tried the workflow.
- Encrypted notes (deferred from SC.1A).
- Over-shepherd login (deferred — coverage records remain non-auth).
- CSV / PDF exports of the attention queue.
- Optional AI-generated weekly summary card.
- Click-through filters keyed to the other summary cards (e.g.
  "Overdue touchpoints" linking to a dedicated filter once the
  directory supports it).
- A leader-facing surface remains intentionally out of scope; if it
  ever ships, the SC.1A/SC.2/SC.3 column allowlists must continue to
  guard note bodies.
