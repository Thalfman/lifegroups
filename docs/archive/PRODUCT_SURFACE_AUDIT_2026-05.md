# Product Surface Audit — May 2026

## 1. Why this memo exists

The product pivoted in May 2026 to **Julian's admin operating system**:
shepherd care + launch planning, admin-only (see
[`PRODUCT_ROADMAP.md`](./PRODUCT_ROADMAP.md) §2). The PRD, schema, RPCs,
and read models all moved with the pivot — SC.1A / SC.2 / SC.3 / LP.1 /
LP.2 shipped. The **UI surface had not moved with them**. Julian's
landing page still led with the weekly check-in workflow ("This week"),
and the actual product (`/admin/shepherd-care`, `/admin/launch-planning`)
was buried in the sidebar below guests, follow-ups, and calendar.

This audit captures the gap and records the demotion / reorientation
that closed it. It does not introduce new features.

## 2. Before — what Julian saw

### 2.1 `/admin` landing

| Surface | Position | Framing |
|---|---|---|
| Page title | First | "This week" — weekly cadence, not pastoral |
| Hero card | Full width, above the fold | "Groups needing attention" — `missing_check_in` was priority **20** (#2 reason after open follow-ups) |
| Weekly health card | Full width, below the fold | Hint: "Click a bucket to open that slice in Check-ins" |
| Shepherd care | Not on the page | — |
| Launch planning | Not on the page | — |

Source: pre-pivot `app/(protected)/admin/page.tsx`,
`components/lg/admin/dashboard/DashboardClient.tsx`,
`lib/dashboard/queries.ts`.

### 2.2 Sidebar nav

`adminNavGroups()` returned four groups; the order placed Check-ins
**second** in the "Manage" group, and inside the "Shepherd" group
Shepherd Care + Launch Planning were the **fourth and fifth** items
(below Guests and Follow-ups).

### 2.3 Off-direction features still ship-prominently

- **Guests** (`/admin/guests`) — fully built guest pipeline, but
  `PRODUCT_ROADMAP.md` EXT.1 defers all external / public / comms work
  until Julian + the comms director scope it together. Public signup
  has never been in the new direction.
- **Follow-ups page** — title read "Follow-ups *& care*", conflating
  the leader-visible task queue with the admin-only Shepherd Care
  surface. Care notes live at `/admin/shepherd-care`, not here.
- **Leader surface** — `/leader` led with "Submit this week's check-in
  and follow up well." LDR.1 explicitly defers all leader-facing work,
  but the leader dashboard was still framed as the headline product.

### 2.4 Mapped against the PRD jobs-to-be-done

| PRD JTBD | Where it lived | Where the dashboard pointed |
|---|---|---|
| UJ-1: Know how each shepherd is doing without scanning 63 | `/admin/shepherd-care` | nowhere on `/admin` |
| UJ-2: Log + remember what was discussed | `/admin/shepherd-care/[profileId]` | nowhere on `/admin` |
| UJ-3: Decide if the church needs more groups | `/admin/launch-planning` | nowhere on `/admin` |
| UJ-4: Track multiplication candidates | `/admin/launch-planning` | nowhere on `/admin` |
| UJ-5: Coverage by over-shepherd | `/admin/shepherd-care` | nowhere on `/admin` |

The PRD's five primary user journeys were 0-of-5 represented on the
landing surface. The dashboard pointed only at weekly-cadence work.

## 3. After — the reorientation

Six concrete changes. All reversible; no deletions, no data changes,
no RPC/RLS changes.

### 3.1 Rebuilt `/admin` landing

`app/(protected)/admin/page.tsx`:
- Header eyebrow → "Admin OS"
- Title → "Shepherd care *and launch planning*"
- Lede → "Who needs your attention, and whether the church needs more
  groups soon. Weekly check-in status is below."

`components/lg/admin/dashboard/DashboardClient.tsx`:
- New first row: **Shepherd care triage** card + **Launch planning
  snapshot** card, side by side.
- Second row: existing attention queue + capacity / follow-ups column.
- Third row: weekly health (demoted; hint copy no longer says "Click
  a bucket to open that slice in Check-ins").
- Fourth row: setup gaps.

New components:
- `components/lg/admin/dashboard/ShepherdCareTriageCard.tsx` — wraps
  `buildShepherdCareDashboardModel` from
  `lib/admin/shepherd-care-dashboard.ts`.
- `components/lg/admin/dashboard/LaunchPlanningSnapshotCard.tsx` —
  wraps `computeLaunchPlan` from `lib/admin/launch-planning.ts`.

The new cards never refetch — `lib/dashboard/queries.ts` now fans out
the shepherd-care + launch-planning reads in the same `Promise.all` as
the existing dashboard reads, and the helpers build the summaries from
the same model code the deep pages use, so the dashboard cannot drift
from `/admin/shepherd-care` and `/admin/launch-planning`.

### 3.2 Re-prioritized the attention queue

`lib/dashboard/queries.ts`:
- `missing_check_in` priority lowered from **20 → 65** (now below
  health_watch, above capacity_unknown).
- The fallback dataset in `lib/dashboard/fallback-data.ts` reorders to
  match.

The check-in signal is still surfaced and still actionable; it just
cannot outrank shepherd-care or capacity reasons on the landing page.

### 3.3 Reordered the sidebar

`lib/auth/roles.ts`:
- Group `shepherd` relabeled **"Admin OS"** and now contains only:
  Shepherd care, Launch planning, Follow-ups (in that order).
- Group `manage` contains People, Groups, Calendar, **Check-ins (last)**.
- Guests removed from `adminNavGroups` and from `navItemsForRole`.
- The four group keys (`top`, `manage`, `shepherd`, `system`) are
  preserved so existing tests pass.

### 3.4 Hid Guests from nav

`/admin/guests` still resolves for bookmarks. The page file carries a
top-of-file comment naming the EXT.1 deferral. No code, RPC, or table
change.

### 3.5 Relabeled Follow-ups

`app/(protected)/admin/follow-ups/page.tsx`:
- Title no longer says "& care".
- Lede now reads "Leader-visible task queue — admin-only shepherd-care
  notes live in Shepherd care, not here."

### 3.6 Demoted the leader hero CTA

`app/(protected)/leader/page.tsx`:
- Lede no longer leads with "Submit this week's check-in".
- Top-of-file comment names the LDR.1 deferral.

`app/(protected)/admin/check-ins/page.tsx`:
- Top-of-file comment notes the demotion and links the audit + roadmap
  sections so the next maintainer sees why it isn't featured.

## 4. Files touched

```
app/(protected)/admin/page.tsx
app/(protected)/admin/check-ins/page.tsx
app/(protected)/admin/follow-ups/page.tsx
app/(protected)/admin/guests/page.tsx
app/(protected)/leader/page.tsx
components/lg/admin/dashboard/DashboardClient.tsx
components/lg/admin/dashboard/ShepherdCareTriageCard.tsx        (NEW)
components/lg/admin/dashboard/LaunchPlanningSnapshotCard.tsx    (NEW)
lib/auth/roles.ts
lib/dashboard/queries.ts
lib/dashboard/types.ts
lib/dashboard/fallback-data.ts
docs/PRODUCT_SURFACE_AUDIT_2026-05.md                            (NEW)
docs/PRODUCT_ROADMAP.md                                          (cross-link)
```

No schema migrations. No RPCs added or removed. No RLS changes. The
attendance tables, leader check-in route, and guest pipeline are
intact.

## 5. Reversing this (if needed)

Each move is independently reversible without touching data:

- **Dashboard layout**: revert `DashboardClient.tsx` and `page.tsx`.
- **Attention priority**: change `missing_check_in: 65` back to `20` in
  `lib/dashboard/queries.ts` and reorder the fallback array.
- **Sidebar**: revert `adminNavGroups` and `navItemsForRole` in
  `lib/auth/roles.ts`.
- **Guests in nav**: re-add the entries removed from
  `adminNavGroups`/`navItemsForRole`.
- **Follow-ups title**: re-add `italic="& care"` and prior lede.
- **Leader framing**: restore the prior lede.

The two new cards (`ShepherdCareTriageCard`, `LaunchPlanningSnapshotCard`)
are pure consumers of existing read models, so deleting them does not
strand data or break other surfaces.

## 6. Open follow-ups that this audit did **not** address

- **LDR.1** (leader self-update of care status) and **EXT.1**
  (comms-director surface, guest forms) remain deferred. Neither is
  scoped yet.
- **Group-health rubric** (P5) is in discovery
  ([`GROUP_HEALTH_RUBRIC_DISCOVERY.md`](../plans/GROUP_HEALTH_RUBRIC_DISCOVERY.md)),
  not in this audit.
- The Check-ins page itself still works as the operational review
  surface. If Julian later confirms the weekly check-in workflow is
  truly out of scope, a follow-up audit can decide whether to retire
  the leader check-in route and the `attendance_sessions` /
  `attendance_records` tables.
