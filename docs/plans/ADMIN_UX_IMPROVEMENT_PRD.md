# PRD — Admin UX Improvement: Scan Speed, IA Clarity & Accessibility

> 📌 **What this PRD is.** A scoped plan for the authenticated admin experience, focused on
> **information architecture, scan speed, admin task flow, and accessibility** — not visual
> polish. It is derived from a read-only audit of the repository at HEAD and a June 2026 live
> UX review, and it is written to be **sliced into PRs**, ordered by risk. It builds **on top
> of** the already-shipped IA consolidation ([`adr/0013`](../adr/0013-six-area-navigation-spine.md)),
> the [Admin Interaction Model PRD](./ADMIN_INTERACTION_MODEL_PRD.md), and the
> [Surface Simplification PRD](./SURFACE_SIMPLIFICATION_PRD.md) — it does not re-litigate them.
>
> **Scope boundary.** In scope: nav accessibility, admin scan-speed (a dense Groups view),
> Care/Planning canonicalization and opinionated views, and the Home command queue. Out of
> scope: the model-simplicity and form-density work owned by the two PRDs above; the
> `shepherd_care_*` schema and frozen route paths (ADR 0008/0009); and the entire **Super
> Admin** area (ADR 0002). Vocabulary follows [`CONTEXT.md`](../../CONTEXT.md).

---

## Context — why this change

The admin app is already a credible ministry operations tool. The strongest remaining
opportunities are **not** visual polish; they are **IA, scan speed, admin task flow, and
accessibility**. An audit confirmed the codebase is mature and much of the surrounding
structure is already in place, so this plan avoids re-proposing solved problems and targets
the **genuine remaining gaps**.

**Already shipped (do not redo):**
- Six-area nav spine — Home, Groups, Care, People, Planning, Settings (+ Super Admin) — `lib/auth/roles.ts` (`ADMIN_AREAS`), ADR 0013.
- `/admin/care` and `/admin/planning` landing shells, each with 5 tabs; Group Health folded under Groups.
- Needs Attention is already a *ranked imperative queue* — `lib/dashboard/needs-attention.ts`, `components/lg/admin/dashboard/NeedsAttentionArea.tsx`.
- Mature Playwright a11y suite that **forbids bare control names** and proves record-context uniqueness — `tests/a11y/accessible-names.spec.ts`.
- Master-calendar list/drawer "Open … calendar" links already carry contextual `aria-label`s — `components/admin/admin-master-calendar-list.tsx`, `…-drawer.tsx`.
- Suspense + `PageSkeleton` (`role="status"`, sr-only "Loading…") — `app/(protected)/admin/loading.tsx`, `components/lg/PageSkeleton.tsx`; no ambiguous spinners.
- People already split into Directory / Leaders / Members / Apprentices / Add Person — `components/admin/people-management-shell.tsx`.
- Editing Pattern (right drawer / mobile sheet) — `components/lg/admin/editing-surface.tsx`.

**Confirmed remaining gaps (this plan's target):**
1. **A11y:** sidebar active links have visual styling but **no `aria-current`** (`components/lg/shell/Sidebar.tsx:86-114`); the **month-grid calendar cell editor** derives its accessible name from concatenated cell text (day # + "Today" + type + clock + status + "Special") — `components/calendar/calendar-occurrence-editor.tsx` trigger fed by `components/calendar/calendar-month-grid.tsx`.
2. **Home:** Needs Attention rows show *action + count* but **no "why it matters"** rationale line (the review asks for issue, count, why, next action).
3. **Groups scan speed:** only the six-zone **card view** exists; sort is name-only. No dense, sortable **Ops table / compact mode**.
4. **Care duplication:** `/admin/care` and frozen `/admin/shepherd-care` load near-identical data, so the surfaces feel duplicated.
5. **Planning:** powerful but dense; no opinionated saved admin views (This week / Needs coverage / Cancelled-OFF / By leader); repeated "Open group calendar" link noise in the list.

### Decisions confirmed with owner
- **Deliverable:** the full plan as a PRD (all focus areas), phased.
- **Care dedup:** *Canonicalize, keep deep links* — make `/admin/care` the single entry; redirect the `/admin/shepherd-care` **landing** to `/admin/care`, but preserve `/admin/shepherd-care/[profileId]` detail and `/over-shepherds` deep links (no broken URLs; respects the ADR 0008/0009 freeze).
- **Groups dense view:** add a card/table toggle that **remembers the admin's last choice** (per-user persisted).

### Constraints (carried through every phase)
- Do not remove routes without a redirect/alias. The `shepherd_care_*` schema and `shepherd-care` / `over-shepherd` **paths stay frozen** (ADR 0008/0009) — this is nav/label/redirect work, never a schema rename.
- Preserve role boundaries and **Super Admin** protections (ADR 0002): Super Admin is out of scope for restructuring; any shared-primitive change must preserve its behavior.
- Keep the visual tone calm, pastoral, operational. Prefer admin efficiency over decorative UI.

---

## Diagnosis of current admin UX

- **Strong bones, density tax.** The IA is settled and the dashboard already prioritizes work. The cost the admin pays is in *scanning*: Groups forces card-by-card reading; Planning surfaces every filter and a repeated per-row link; Needs Attention tells you *what* and *how many* but not *why now*.
- **IA is 90% there; the last 10% is overlap & dedup.** Labels (Care vs Shepherd Care, Planning vs Launch Planning, Group Health, Leader Pipeline) overlap because the *landing shells* exist but the *frozen surfaces* they consolidate still resolve as full peers, so the same data appears in two places.
- **A11y is genuinely good but has named holes.** The repeated-control discipline is enforced by tests, yet two high-traffic spots slip through: nav active-state is visual-only, and dense calendar cells read as concatenated strings.
- **Pastoral tone is a feature, not a blocker.** The warm palette + imperative phrasing already make admin work feel calm. Scan-speed work must preserve that (e.g. a table should still use the `PBadge` tones, not raw red).

---

## Target information architecture

The six-area spine stays. Within it, make each area's *primary entry* canonical and its
deeper routes feel like **subviews of one mental model**, not peers.

| Area | Canonical entry | Subviews (tabs/views) | Frozen deep links preserved (redirect landing only) |
| --- | --- | --- | --- |
| **Home** | `/admin` | Needs attention · This week · Ministry snapshot · Recent activity | — |
| **Groups** | `/admin/groups` | List (card/**table** toggle) · tabs: All / Needs Setup / Needs Health Check / Needs Attention / Archived | `/admin/group-health` (triage); `/admin/groups/[id]`, `…/calendar` |
| **Care** | `/admin/care` | Dashboard · Directory · Follow-ups · Coverage · Recent interactions | `/admin/shepherd-care/[profileId]`, `/admin/shepherd-care/over-shepherds*`; **landing** `/admin/shepherd-care` → `/admin/care`; `/admin/follow-ups` → Care/Follow-ups |
| **People** | `/admin/people` | Directory · Leaders · Members · Apprentices · Add Person | `/admin/leader-pipeline` (→ People/Apprentices) |
| **Planning** | `/admin/planning` | Calendar · Launch Planning · Capacity · Pipeline/Multiplication + **opinionated views**: This week · Needs coverage · Cancelled/OFF · By leader | `/admin/launch-planning`, `/admin/calendar` (landing → Planning) |
| **Settings** | `/admin/settings` | (unchanged) | — |
| **Super Admin** | `/admin/super-admin` | (unchanged, super_admin only) | — |

**Aliases/redirects to add** (all preserve existing inbound links):
- `/admin/shepherd-care` (exact, landing) → `/admin/care` (server redirect). Sub-paths untouched.
- `/admin/launch-planning` (exact) → `/admin/planning?tab=launches`; `/admin/calendar` (exact) → `/admin/planning?tab=calendar`. (Phase 3; keep direct resolution until the tabs fully host them.)
- Confirm `/admin/follow-ups` and `/admin/group-health` either redirect into their host area or stay as documented deep links — they remain reachable either way.

> Redirect via Next.js `redirect()` inside the existing page (cheapest, keeps the guard) or
> `next.config` `redirects()` for exact paths. Use **exact-match** so `[profileId]` and
> `/over-shepherds` deep links never get swallowed.

---

## Phased implementation plan

### Phase 1 — Quick wins & accessibility fixes (low risk, ship first)

1. **`aria-current="page"` on active sidebar links.** Add to the active `<Link>` in `components/lg/shell/Sidebar.tsx` (reuse `isActiveHref`). Mirror in `MobileSidebar`. Extend `tests/a11y/*` to assert exactly one `aria-current="page"` per nav.
2. **Fix concatenated accessible names on calendar cells.** Give `CalendarOccurrenceEditor`'s trigger an explicit `aria-label` summarizing the cell ("Edit Oct 14 — Study, 6:30p, Scheduled" / "Add event on Oct 14") instead of inheriting concatenated children. Source the label in `components/calendar/calendar-month-grid.tsx`; add an optional `triggerAriaLabel` prop to `calendar-occurrence-editor.tsx`. Add the month grid to the a11y harness + a spec asserting unique, non-concatenated names.
3. **Needs Attention "why it matters".** Add a one-line rationale to each row. Extend `TopNextAction` in `lib/dashboard/needs-attention.ts` with a `why` string (pure, unit-tested) and render it under the action in `NeedsAttentionArea.tsx`. Keep imperative phrasing + count; rationale is calm, pastoral ("Unled groups can't meet or grow").
4. **Audit dialogs/tabs/destructive actions** for keyboard + SR clarity across the surfaces touched (Groups, Care, Planning). Most are already correct (Radix Dialog, WAI-ARIA tabs); fix any gaps found and pin them with the existing harness pattern.
5. **Loading-state sweep.** Confirm no surface traps on a bare "Loading…"; `PageSkeleton` already covers route transitions — verify per-tab/per-widget async states degrade to a labelled empty/skeleton, not ambiguous text.

### Phase 2 — Admin scan-speed improvements

6. **Groups Ops table / compact mode.** Add a **card ⇄ table** toggle to `components/admin/groups-directory.tsx`. Table columns: group, leader/co-leader, setup status, health (grade), capacity, meeting day/time, last check-in, actions. **Sortable** column headers. Reuse all existing derivation (`statusByGroupId`, `capacityStatus`, `latestCheckinText`, `PBadge` tones) — no new data. Persist the toggle per user (localStorage; SSR-safe default = cards on first load). Keep the existing tabs as the work-queue filters (already mapped). Preserve record-context action names (the suite already enforces this).
7. **Home de-crowding.** Keep the four-section hierarchy; verify the deeper overview cards stay behind `CollapsibleOverview` so vital signs lead and urgent work is never buried. (Aligns with the Surface Simplification open question on the weekly-cadence cluster — coordinate, don't duplicate.)
8. **People prominence pass.** Make Add Person, role change, deactivation, and profile navigation visually primary and clearly *safe* (confirm-on-destructive, plain-language role labels). People is already split; this is emphasis + safety affordances, not restructuring.

### Phase 3 — Navigation / IA consolidation

9. **Canonicalize Care.** Redirect the `/admin/shepherd-care` landing → `/admin/care`; keep `[profileId]` and `/over-shepherds` deep links. Ensure `/admin/care` exposes the five intended subviews (Dashboard, Directory, Follow-ups, Coverage, Recent interactions) and that `/admin/follow-ups` reads as the Follow-ups subview (redirect landing or cross-link). Single source of truth for leader care.
10. **Canonicalize Planning entries.** Redirect `/admin/launch-planning` and `/admin/calendar` landings into Planning tabs once those tabs fully host the content; keep deep resolution until then.
11. **Label/route reconciliation.** Ensure nav labels and in-page eyebrows no longer present Care/Shepherd Care, Planning/Launch Planning, Group Health, Leader Pipeline as competing destinations — they read as area + subview. (Vocabulary fixes already largely landed per `CONCEPT_RECONCILIATION.md` §A.)

### Phase 4 — Deeper workflow improvements

12. **Planning opinionated views.** Add saved admin views — **This week**, **Needs coverage**, **Cancelled/OFF**, **By leader** — as primary affordances on `/admin/planning`. Move advanced filters into a collapsible/secondary area (the filter infra + Select-all/Clear-all/chips already exist in `planning-calendar-panel.tsx`). Reduce repeated "Open group calendar" link noise (group by date/leader; one entry point per group rather than per occurrence row).
13. **Care next-action clarity.** Make the obvious next action explicit on each care item: **log contact**, **assign over-shepherd**, **schedule touchpoint**, **resolve follow-up**. The single-purpose action forms already exist (`components/admin/shepherd-care/care-action-forms.tsx`, RPCs in `lib/admin/rpc.ts`); this is surfacing/ordering, not new write paths. (Coordinate with Surface Simplification C1 — don't double-edit the interaction form.)
14. **Groups → table follow-through.** Saved sort/column preferences; optional density setting. Lower priority.

---

## Specific files / routes / components likely to change

**Nav & a11y (Phase 1):**
- `components/lg/shell/Sidebar.tsx`, `components/lg/shell/MobileSidebar.tsx` — `aria-current`.
- `components/calendar/calendar-occurrence-editor.tsx`, `components/calendar/calendar-month-grid.tsx` — explicit trigger `aria-label`.
- `lib/dashboard/needs-attention.ts`, `components/lg/admin/dashboard/NeedsAttentionArea.tsx` — `why` rationale.
- `tests/a11y/accessible-names.spec.ts` (+ harness) — new assertions.

**Groups (Phase 2):**
- `components/admin/groups-directory.tsx` — view toggle + table; reuse `lib/dashboard/group-status.ts`, `lib/dashboard/labels.ts`, `lib/admin/metrics.ts`, `components/pastoral/atoms.tsx` (`PBadge`).

**People (Phase 2):**
- `components/admin/people-management-shell.tsx`, `components/admin/people-directory.tsx` — action prominence + destructive-action safety.

**Care (Phase 3/4):**
- `app/(protected)/admin/shepherd-care/page.tsx` — landing redirect to `/admin/care` (keep sub-routes).
- `app/(protected)/admin/care/page.tsx`, `components/admin/care/care-shell.tsx`, `components/admin/care/care-item-list.tsx`, `components/admin/shepherd-care/care-actions.tsx`.

**Planning (Phase 3/4):**
- `app/(protected)/admin/launch-planning/page.tsx`, `app/(protected)/admin/calendar/page.tsx` — landing redirects.
- `app/(protected)/admin/planning/page.tsx`, `components/admin/planning/planning-shell.tsx`, `components/admin/planning/planning-calendar-panel.tsx`, `components/admin/admin-master-calendar-list.tsx` — opinionated views, collapsible filters, link de-noise.

**Routing/aliases:** `next.config.*` `redirects()` for exact landing paths, or in-page `redirect()`.

---

## Data / API assumptions to verify

- Groups table view needs **no new data**: leader/co-leader (`fetchAllGroupLeaders`), setup/health/capacity (derived in `groups-directory.tsx`), meeting day/time (`GroupsRow`), last check-in (`fetchAttendanceSessions` / `latestSession`) are all already loaded in `app/(protected)/admin/groups/page.tsx`.
- Needs Attention `why` strings are static per category — no query change.
- Planning "By leader" / "Needs coverage" views: confirm the master-calendar load already exposes leader + coverage fields (`loadMasterCalendar` returns leader options; coverage from `fetchActiveShepherdCoverageAssignmentsForAdmin`). Verify "Needs coverage" can be derived without a new read.
- Care canonicalization: confirm `/admin/care` already loads the full set (`fetchShepherdCareDirectoryForAdmin`, coverage, over-shepherds, recent interactions, outstanding/completed care follow-ups) so redirecting the shepherd-care landing loses nothing.
- Redirects must run **after** the admin guard (`requireAdmin`) so role boundaries are unchanged.

---

## Risks & migration concerns

- **Frozen-route freeze (ADR 0008/0009).** Only redirect **exact landing paths**; never the `[profileId]`/`/over-shepherds` sub-paths or any `shepherd_care_*` table/route. Add tests asserting deep links still resolve 200.
- **Inbound links / bookmarks.** External docs and Julian's bookmarks may point at `/admin/shepherd-care`, `/admin/launch-planning`, `/admin/calendar`. Redirects (not deletions) keep them working; announce the canonical URLs.
- **Super Admin (ADR 0002).** No structural change; any shared primitive (`PageHeader`, field styles, `PBadge`) edited for the table must preserve Super Admin rendering.
- **PR overlap with in-flight PRDs.** Admin Interaction Model + Surface Simplification touch Groups (create form, capacity default), Care (interaction form), People (split), Settings, Launch Planning. **Coordinate ownership**: this plan owns scan-speed (table), nav a11y, Needs-Attention rationale, Care/Planning *canonicalization* and *opinionated views* — not the model/vocabulary/form-density work those PRDs own. Sequence after or alongside, never editing the same files in opposite directions.
- **Table vs pastoral tone.** Keep `PBadge` tones, warm lines, tabular-nums; no dense grey grid. Validate the table reads calm, not spreadsheet-cold.
- **localStorage toggle + SSR.** Default to cards server-side; hydrate the saved preference client-side to avoid flash/mismatch.

---

## Test plan

**Automated (extend existing suites):**
- Unit (Vitest): `needs-attention` `why` strings per category, empty/degraded behavior; any new Planning view-derivation helper; Groups table sort comparators.
- A11y (Playwright, `tests/a11y/`): exactly one `aria-current="page"` in sidebar; calendar month-grid cell triggers have unique, non-concatenated names; Groups **table** rows keep record-context action names (extend `groups-directory` harness surface for table mode); axe = no critical/serious on every touched surface.
- Redirect tests: `/admin/shepherd-care` → `/admin/care`; `/admin/launch-planning` / `/admin/calendar` → Planning tabs; `/admin/shepherd-care/[id]` and `/over-shepherds` still 200.

**Manual keyboard / screen-reader:**
- Tab through sidebar — active item announces "current page".
- Calendar month grid — each cell button announces a meaningful, distinct name.
- Groups — toggle card/table by keyboard; sort headers operable; Edit/Calendar/View name their group; toggle preference persists across reload.
- Care — from `/admin/care`, complete log-contact / assign-over-shepherd / schedule-touchpoint / resolve-follow-up via keyboard; focus returns to trigger on drawer close.
- Planning — switch opinionated views, expand/collapse advanced filters, confirm reduced link noise; SR reads view names not raw filter state.

**Key admin workflows (regression):**
- Weekly triage from Home → Needs Attention → land on filtered surface and act.
- Group setup/health scan via table tabs.
- Leader care round: who needs contact → log → schedule.
- Launch planning glance + "Needs coverage" review.
- Verify Super Admin unchanged.

---

## Recommended first PR (small, safe)

**Title:** *A11y + Home command-queue quick wins.*

The full scope ships as this PRD; the **first implementation PR** is the Phase 1 a11y bundle
because it is small, cross-cutting, and low-risk:

1. `aria-current="page"` on active sidebar links (`Sidebar.tsx`, `MobileSidebar.tsx`).
2. Explicit `aria-label` on calendar month-grid cell editor triggers (`calendar-occurrence-editor.tsx`, `calendar-month-grid.tsx`) — kills the concatenated-name read.
3. "Why it matters" rationale line in Needs Attention (`needs-attention.ts` + `NeedsAttentionArea.tsx`).
4. Test coverage for all three in `tests/a11y/` + a `needs-attention` unit test.

No routing changes, no data changes, no schema risk, no Super Admin surface touched — a clean,
reviewable PR that delivers visible value on Home, Planning, and global nav, and establishes the
test hooks the later phases reuse.

---

## Verification

- `npm run test` (Vitest) — unit specs green, including new `needs-attention` rationale tests.
- `npm run test:a11y` (Playwright) — axe clean + new aria-current / calendar-name / table-name assertions pass.
- `npm run build` / typecheck — no type regressions from the `TopNextAction` and toggle changes.
- Manual pass with keyboard + VoiceOver/NVDA on Home, Groups (both views), Care, Planning per the test plan.
- Confirm every redirected landing still serves deep links (200) and the admin guard runs first.
