# PRD — Admin UX Improvement: Scan Speed, IA Clarity & Accessibility

> 📌 **What this PRD is.** A scoped plan for the authenticated admin experience, focused on
> **information architecture, scan speed, admin task flow, and accessibility** — not visual
> polish. It is derived from a read-only audit of the repository at HEAD and a June 2026 live
> UX review, and it is written to be **sliced into PRs**, ordered by risk. It builds **on top
> of** the already-shipped IA consolidation ([`adr/0013`](../adr/0013-six-area-navigation-spine.md)),
> the [Admin Interaction Model PRD](../plans/ADMIN_INTERACTION_MODEL_PRD.md), and the
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
- Needs Attention is already a _ranked imperative queue_ — `lib/dashboard/needs-attention.ts`, `components/lg/admin/dashboard/NeedsAttentionArea.tsx`.
- Mature Playwright a11y suite that **forbids bare control names** and proves record-context uniqueness — `tests/a11y/accessible-names.spec.ts`.
- Master-calendar list/drawer "Open … calendar" links already carry contextual `aria-label`s — `components/admin/admin-master-calendar-list.tsx`, `…-drawer.tsx`.
- Suspense + `PageSkeleton` (`role="status"`, sr-only "Loading…") — `app/(protected)/admin/loading.tsx`, `components/lg/PageSkeleton.tsx`; no ambiguous spinners.
- People already split into Directory / Leaders / Members / Apprentices / Add Person — `components/admin/people-management-shell.tsx`.
- Editing Pattern (right drawer / mobile sheet) — `components/lg/admin/editing-surface.tsx`.

**Confirmed remaining gaps (this plan's target):**

1. **A11y:** sidebar active links have visual styling but **no `aria-current`** (`components/lg/shell/Sidebar.tsx:86-114`); and **calendar/event occurrence triggers** derive their accessible name from concatenated child text rather than a meaningful label — confirmed on the **month-grid cell editor** (`components/calendar/calendar-occurrence-editor.tsx` fed by `components/calendar/calendar-month-grid.tsx`: day # + "Today" + type + clock + status + "Special"), and to be swept across the Planning **list event buttons** and **drawer/list triggers** too.
2. **Home:** Needs Attention rows show _action + count_ but **no "why it matters"** rationale line (the review asks for issue, count, why, next action).
3. **Groups scan speed:** only the six-zone **card view** exists; sort is name-only. No dense, sortable **Ops table / compact mode**.
4. **Care duplication:** `/admin/care` and frozen `/admin/shepherd-care` load near-identical data, so the surfaces feel duplicated.
5. **Planning:** powerful but dense; no opinionated saved admin views (This week / Needs coverage / Cancelled-OFF / By leader); repeated "Open group calendar" link noise in the list.

### Decisions confirmed with owner

- **Deliverable:** the full plan as a PRD (all focus areas), phased.
- **Care dedup:** _Canonicalize, keep deep links_ — make `/admin/care` the canonical entry; the `/admin/shepherd-care` **landing alias-renders the same Care shell (200, not a redirect)** per ADR 0013, while `/admin/shepherd-care/[profileId]` detail and `/over-shepherds` keep their own surfaces (no broken URLs; respects the ADR 0008/0009/0013 freeze).
- **Groups dense view:** add a card/table toggle that **remembers the admin's last choice** (per-user persisted).

### Recommended first implementation PR (summary)

Ship the **Phase 1 a11y bundle** first — small, cross-cutting, low-risk, and it lays the test
hooks later phases reuse: (1) `aria-current="page"` on active sidebar links incl. alias URLs;
(2) meaningful, unique accessible names on **all** calendar occurrence triggers (month-grid
cells, Planning list event buttons, drawer/list triggers); (3) a "why it matters" rationale on
each Needs Attention row; (4) tests for all three. No routing, data, schema, or Super Admin
changes. Full scope in [Recommended first PR](#recommended-first-pr-small-safe) near the end.

### Constraints (carried through every phase)

- Do not remove routes without a redirect/alias. The `shepherd_care_*` schema and `shepherd-care` / `over-shepherd` **paths stay frozen** (ADR 0008/0009) — this is nav/label/redirect work, never a schema rename.
- Preserve role boundaries and **Super Admin** protections (ADR 0002): Super Admin is out of scope for restructuring; any shared-primitive change must preserve its behavior.
- Keep the visual tone calm, pastoral, operational. Prefer admin efficiency over decorative UI.

---

## Diagnosis of current admin UX

- **Strong bones, density tax.** The IA is settled and the dashboard already prioritizes work. The cost the admin pays is in _scanning_: Groups forces card-by-card reading; Planning surfaces every filter and a repeated per-row link; Needs Attention tells you _what_ and _how many_ but not _why now_.
- **IA is 90% there; the last 10% is overlap & dedup.** Labels (Care vs Shepherd Care, Planning vs Launch Planning, Group Health, Leader Pipeline) overlap because the _landing shells_ exist but the _frozen surfaces_ they consolidate still resolve as full peers, so the same data appears in two places.
- **A11y is genuinely good but has named holes.** The repeated-control discipline is enforced by tests, yet two high-traffic spots slip through: nav active-state is visual-only, and dense calendar cells read as concatenated strings.
- **Pastoral tone is a feature, not a blocker.** The warm palette + imperative phrasing already make admin work feel calm. Scan-speed work must preserve that (e.g. a table should still use the `PBadge` tones, not raw red).

---

## Target information architecture

The six-area spine stays. Within it, make each area's _primary entry_ canonical and its
deeper routes feel like **subviews of one mental model**, not peers.

| Area            | Canonical entry      | Subviews (tabs/views)                                                                                                                                                                                                                                          | Frozen paths stay 200-resolvable (alias-render landing)                                                                                                                                      |
| --------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Home**        | `/admin`             | Needs attention · This week · Ministry snapshot · Recent activity                                                                                                                                                                                              | —                                                                                                                                                                                            |
| **Groups**      | `/admin/groups`      | List (card/**table** toggle) · tabs: All / Needs Setup / Needs Health Check / Needs Attention / Archived                                                                                                                                                       | `/admin/group-health` (triage); `/admin/groups/[id]`, `…/calendar`                                                                                                                           |
| **Care**        | `/admin/care`        | **Target:** Dashboard · Directory · Follow-ups · Coverage · Recent interactions _(current `care-shell.tsx` keys are `needs-contact / follow-ups / due-soon / recent-care / completed`; re-keying is a scoped tab migration — see Alias-render contract)_       | `/admin/shepherd-care/[profileId]`, `/admin/shepherd-care/over-shepherds*`; `/admin/shepherd-care` landing **alias-renders** Care; `/admin/follow-ups` resolves + appears as Care/Follow-ups |
| **People**      | `/admin/people`      | Directory · Leaders · Members · **Apprentices (owns the leader-pipeline record surface)** · Add Person                                                                                                                                                         | `/admin/leader-pipeline` (→ People/Apprentices)                                                                                                                                              |
| **Planning**    | `/admin/planning`    | Calendar · Launch Planning · Capacity · Multiplication + **opinionated views**: This week · Needs coverage · Cancelled/OFF · By leader. **Pipeline = read-only launch-capacity context that links to People/Apprentices; it does not own apprentice records.** | `/admin/launch-planning`, `/admin/calendar` (landings **alias-render** Planning)                                                                                                             |
| **Settings**    | `/admin/settings`    | (unchanged)                                                                                                                                                                                                                                                    | —                                                                                                                                                                                            |
| **Super Admin** | `/admin/super-admin` | (unchanged, super_admin only)                                                                                                                                                                                                                                  | —                                                                                                                                                                                            |

**Canonical aliases to add** (ADR 0013-compliant — every frozen path must _still resolve by
direct URL under the admin guard_, so these are **alias-renders, not 302 redirects**):

- `/admin/shepherd-care` (landing) **renders the canonical Care shell** (the same component as `/admin/care`), staying 200-resolvable. Sub-paths (`/[profileId]`, `/over-shepherds*`) keep their own surfaces, untouched.
- `/admin/launch-planning` and `/admin/calendar` (landings) **render the canonical Planning shell** at the relevant tab (`launches` / `calendar`), staying 200-resolvable.
- `/admin/follow-ups` stays directly resolvable and also surfaces as the Care **Follow-ups** subview.
- `/admin/group-health` **keeps its own triage surface** (`app/(protected)/admin/group-health/page.tsx` → `GroupHealthTriage`, which hosts the monthly rating workflow) — it stays 200-resolvable and is **linked from Groups**, **not** alias-rendered into the Groups list shell (`groups-directory.tsx` shows status/list tabs only and does not host the rating workflow). Re-homing the rating workflow _inside_ Groups is a separate, larger task and is out of scope here.

> **No 302 redirects on these paths.** ADR 0013 freezes them as directly resolvable under the
> admin guard. Achieve canonicalization by having the frozen landing render the shared canonical
> shell component (one experience, two URLs) with a 200 response — not by redirecting. This
> removes the duplicate-feeling surface without amending ADR 0013. Reserve `redirect()` /
> `next.config` `redirects()` strictly for genuinely new, non-frozen aliases.

**Alias-render tab-state contract.** Every alias must resolve to the _same_ canonical shell with
the right initial view — never a duplicated page. The contract:

1. **One canonical shell owns the experience.** Planning has a single shell
   (`components/admin/planning/planning-shell.tsx`); Care has one (`components/admin/care/care-shell.tsx`).
   Alias landings do **not** fork their own components or data loaders.
2. **The alias landing passes an initial view key** to that shell — e.g. `calendar`, `launches`,
   `capacity`, `multiplication` for Planning. The canonical entry (`/admin/planning`, `/admin/care`)
   defaults to its first view; `/admin/launch-planning` selects `launches`, `/admin/calendar`
   selects `calendar`. **Care keys — use the existing shell keys.** `care-shell.tsx` currently
   accepts only `needs-contact`, `follow-ups`, `due-soon`, `recent-care`, `completed`, so
   `/admin/follow-ups` selects `follow-ups`. The Care subviews named in the IA table (Dashboard ·
   Directory · Coverage · Recent interactions) are a **target set that differs from today's shell**;
   re-keying to them is a **separate tab migration to scope first** — until then aliases must pass
   only the keys the shell already accepts, never invented ones.
3. **The URL stays 200-resolvable** under the admin guard — no 302 (ADR 0013).
4. **The side nav marks the owning canonical area current** (`aria-current="page"`) via the
   alias→canonical map (Phase 1.1), so `/admin/calendar` highlights Planning, etc.
5. **No duplicated loaders/components.** The alias route is a thin entry that calls the same
   server loader and renders the same shell with a different initial view key.

**Leader Pipeline ownership (resolves the People ⟷ Planning overlap).**

- **People owns the leader pipeline as the record-management surface** — creating/editing apprentices
  and advancing readiness stages lives under People → Apprentices (the `/admin/leader-pipeline`
  surface, aliased into People/Apprentices).
- **Planning may only _summarize or link_ to the pipeline as launch-capacity context** (e.g. "N
  apprentices ready to lead" feeding the launch forecast), linking out to People/Apprentices for any
  edit. Planning never owns or mutates apprentice records.

---

## Phased implementation plan

### Phase 1 — Quick wins & accessibility fixes (low risk, ship first)

1. **`aria-current="page"` on active sidebar links.** Add to the active `<Link>` in `components/lg/shell/Sidebar.tsx`. **Cover every frozen alias:** `isActiveHref` only matches the literal nav hrefs (`/admin/care`, `/admin/planning`, `/admin/people`, `/admin/groups`), so a frozen alias URL gets no active link — add an **alias→canonical map** to the active-state logic covering all of them: `/admin/shepherd-care` → Care; `/admin/launch-planning`, `/admin/calendar` → Planning; `/admin/follow-ups` → Care; `/admin/leader-pipeline` → People; `/admin/group-health` → Groups. Mirror in `MobileSidebar`. Extend `tests/a11y/*` to assert exactly one `aria-current="page"` per nav, **including when on each alias URL**.
2. **Fix concatenated accessible names on all calendar/event triggers.** Give every calendar
   occurrence trigger an explicit `aria-label` that summarizes the occurrence ("Edit Oct 14 —
   Study, 6:30p, Scheduled" / "Add event on Oct 14") instead of inheriting concatenated child
   text. Scope is **all** such controls, not just the month grid:
   - **Month-grid cell editor** — `components/calendar/calendar-occurrence-editor.tsx` (add an
     optional `triggerAriaLabel` prop), labelled from `components/calendar/calendar-month-grid.tsx`.
   - **Planning list event buttons** and **drawer/list triggers** — `components/admin/planning/planning-calendar-panel.tsx`,
     `components/admin/admin-master-calendar-list.tsx`, `components/admin/admin-master-calendar-drawer.tsx`
     (the master list/drawer "Open … calendar" links already carry context; audit the event/occurrence
     _buttons_ beside them for the same).
   - Add these surfaces to the a11y harness.

   **Acceptance criteria:** every calendar/event control (cell, pill, list row button, drawer
   action) exposes a **meaningful, unique accessible name** — not raw concatenated child text —
   and remains unique even when occurrences collide (same group, multiple dates; same date,
   multiple events). Verified by the existing forbidden-bare-name + uniqueness Playwright gates
   extended to these surfaces.

3. **Needs Attention "why it matters".** Add a one-line rationale to each row. Extend `TopNextAction` in `lib/dashboard/needs-attention.ts` with a `why` string (pure, unit-tested) and render it under the action in `NeedsAttentionArea.tsx`. Keep imperative phrasing + count; rationale is calm, pastoral ("Unled groups can't meet or grow").
4. **Audit dialogs/tabs/destructive actions** for keyboard + SR clarity across the surfaces touched (Groups, Care, Planning). Most are already correct (Radix Dialog, WAI-ARIA tabs); fix any gaps found and pin them with the existing harness pattern.
5. **Loading-state sweep.** Confirm no surface traps on a bare "Loading…"; `PageSkeleton` already covers route transitions — verify per-tab/per-widget async states degrade to a labelled empty/skeleton, not ambiguous text.

### Phase 2 — Admin scan-speed improvements

6. **Groups Ops table / compact mode.** Add a **card ⇄ table** toggle to `components/admin/groups-directory.tsx`. Table columns: group, leader/co-leader, setup status, health (grade), capacity, meeting day/time, check-in, actions. **Sortable** column headers. Reuse existing derivation (`statusByGroupId`, `capacityStatus`, `latestCheckinText`, `PBadge` tones). **Check-in column:** reusing `latestSession` shows _latest-week_ status, not a true per-group last check-in (see Data assumptions) — label it accordingly or add a per-group read; decide before building. **Preference persistence:** this is a **local, per-browser** UI preference (not server state). SSR-safe default = **cards** on first paint; hydrate the saved choice client-side. Store under a **profile-scoped localStorage key** — `adminGroupsView:${profileId}` when the authenticated profile id is available (so shared devices don't bleed one admin's choice into another), falling back to a plain `adminGroupsView` key when it isn't. Keep the existing tabs as the work-queue filters (already mapped). Preserve record-context action names (the suite already enforces this).
7. **Home de-crowding.** Keep the four-section hierarchy; verify the deeper overview cards stay behind `CollapsibleOverview` so vital signs lead and urgent work is never buried. (Aligns with the Surface Simplification open question on the weekly-cadence cluster — coordinate, don't duplicate.)
8. **People prominence pass.** Make Add Person, role change, deactivation, and profile navigation visually primary and clearly _safe_ (confirm-on-destructive, plain-language role labels). People is already split; this is emphasis + safety affordances, not restructuring.

### Phase 3 — Navigation / IA consolidation

9. **Canonicalize Care.** Make the `/admin/shepherd-care` landing **render the canonical Care shell** (200, not a redirect — ADR 0013), passing only the **existing** shell keys (`needs-contact / follow-ups / due-soon / recent-care / completed`); keep `[profileId]` and `/over-shepherds` on their own surfaces. `/admin/follow-ups` reads as the `follow-ups` subview while staying directly resolvable. **Re-keying the shell to the target subviews (Dashboard / Directory / Coverage / Recent interactions) is a separate, scoped tab migration** — do it before any alias references those names. Single source of truth for leader care.
10. **Canonicalize Planning entries.** Make `/admin/launch-planning` and `/admin/calendar` landings **render the canonical Planning shell** at the matching tab once those tabs fully host the content (200, not a redirect); both stay directly resolvable throughout.
11. **Label/route reconciliation.** Ensure nav labels and in-page eyebrows no longer present Care/Shepherd Care, Planning/Launch Planning, Group Health, Leader Pipeline as competing destinations — they read as area + subview. Specifically, **Leader Pipeline reads as People → Apprentices** (its record home); any Planning reference to the pipeline reads as launch-capacity context that links back to People, not a second owner. (Vocabulary fixes already largely landed per `CONCEPT_RECONCILIATION.md` §A.)

### Phase 4 — Deeper workflow improvements

12. **Planning opinionated views.** Add saved admin views — **This week**, **Needs coverage**, **Cancelled/OFF**, **By leader** — as primary affordances on `/admin/planning`. Move advanced filters into a collapsible/secondary area (the filter infra + Select-all/Clear-all/chips already exist in `planning-calendar-panel.tsx`). Reduce repeated "Open group calendar" link noise (group by date/leader; one entry point per group rather than per occurrence row).

    **"Needs coverage" predicate (product-level).** This is **calendar/staffing coverage**, never
    shepherd-care coverage. An occurrence appears in "Needs coverage" only when **all** hold:
    - the group's **lifecycle is `active`** (exclude `inactive`, `paused`, `closed`/archived);
    - the occurrence **status is `scheduled`** (exclude `off` and `cancelled`);
    - it is a **real meeting occurrence** (`isMeetingOccurrence` — exclude special/non-meeting rows);
    - the group has **no assigned leader or co-leader** for that occurrence/group context.

    Explicitly **excluded**: OFF weeks, cancelled occurrences, inactive/paused/closed groups, and
    non-meeting rows — none are actionable staffing gaps. Derive from `loadMasterCalendar`
    occurrences + group leaders; do **not** use `fetchActiveShepherdCoverageAssignmentsForAdmin`
    (that is over-shepherd _pastoral_ coverage — see Data assumptions).

13. **Care next-action clarity.** Make the obvious next action explicit on each care item: **log contact**, **assign over-shepherd**, **schedule touchpoint**, **resolve follow-up**. The single-purpose action forms already exist (`components/admin/shepherd-care/care-action-forms.tsx`, RPCs in `lib/admin/rpc.ts`); this is surfacing/ordering, not new write paths. (Coordinate with Surface Simplification C1 — don't double-edit the interaction form.)
14. **Groups → table follow-through.** Saved sort/column preferences; optional density setting. Lower priority.

---

## Specific files / routes / components likely to change

**Nav & a11y (Phase 1):**

- `components/lg/shell/Sidebar.tsx`, `components/lg/shell/MobileSidebar.tsx` — `aria-current` + alias→canonical active-state map.
- Calendar/event triggers — `components/calendar/calendar-occurrence-editor.tsx`, `components/calendar/calendar-month-grid.tsx`, `components/admin/planning/planning-calendar-panel.tsx`, `components/admin/admin-master-calendar-list.tsx`, `components/admin/admin-master-calendar-drawer.tsx` — explicit, unique trigger `aria-label`s.
- `lib/dashboard/needs-attention.ts`, `components/lg/admin/dashboard/NeedsAttentionArea.tsx` — `why` rationale.
- `tests/a11y/accessible-names.spec.ts` (+ harness) — new assertions.

**Groups (Phase 2):**

- `components/admin/groups-directory.tsx` — view toggle + table; reuse `lib/dashboard/group-status.ts`, `lib/dashboard/labels.ts`, `lib/admin/metrics.ts`, `components/pastoral/atoms.tsx` (`PBadge`).

**People (Phase 2):**

- `components/admin/people-management-shell.tsx`, `components/admin/people-directory.tsx` — action prominence + destructive-action safety.

**Care (Phase 3/4):**

- `app/(protected)/admin/shepherd-care/page.tsx` — landing alias-renders the canonical Care shell (stays 200; keep sub-routes).
- `app/(protected)/admin/care/page.tsx`, `components/admin/care/care-shell.tsx`, `components/admin/care/care-item-list.tsx`, `components/admin/shepherd-care/care-actions.tsx`.

**Planning (Phase 3/4):**

- `app/(protected)/admin/launch-planning/page.tsx`, `app/(protected)/admin/calendar/page.tsx` — landings alias-render the canonical Planning shell (stay 200).
- `app/(protected)/admin/planning/page.tsx`, `components/admin/planning/planning-shell.tsx`, `components/admin/planning/planning-calendar-panel.tsx`, `components/admin/admin-master-calendar-list.tsx` — opinionated views, collapsible filters, link de-noise.

**Routing/aliases:** alias-render at the frozen page components (no `next.config` `redirects()` and no in-page `redirect()` on frozen paths — they must stay 200-resolvable); reserve `redirect()` for genuinely new, non-frozen aliases only.

---

## Data / API assumptions to verify

- Groups table view reuses already-loaded data: leader/co-leader (`fetchAllGroupLeaders`), setup/health/capacity (derived in `groups-directory.tsx`), meeting day/time (`GroupsRow`) — all loaded in `app/(protected)/admin/groups/page.tsx`. **One caveat on "last check-in":** the page loads a **single global latest meeting week** then `fetchAttendanceSessions({ meetingWeek: latestWeek })`, so `latestSession` is **this-week's check-in status**, not each group's _true_ last check-in (a group last seen an earlier week reads blank). Decide explicitly before building: label the column **"Latest-week check-in"** (no new data; matches the existing card semantics) **or** add a per-group latest-session read for a true "last check-in."
- Needs Attention `why` strings are static per category — no query change.
- Planning **"Needs coverage" must be defined from calendar data, not care coverage.** `fetchActiveShepherdCoverageAssignmentsForAdmin` is **Leader-Care over-shepherd coverage** (`shepherd_coverage_assignments`) — a different concept; using it would surface leaders missing _pastoral_ coverage, not meetings missing a leader. Derive "Needs coverage" from `loadMasterCalendar` occurrences + group leaders, but **filter first**: `loadMasterCalendar` includes every non-closed group (incl. `inactive`) and each occurrence may be `scheduled` / `off` / `cancelled` (`lib/admin/master-calendar.ts`), so require `lifecycleStatus === "active"` **and** `status === "scheduled"` **and** `isMeetingOccurrence` **before** flagging missing leaders — otherwise OFF/cancelled/inactive rows surface as non-actionable gaps. Add a new read only if those fields are insufficient.
- Planning **"By leader"**: confirm `loadMasterCalendar` leader options are enough to group occurrences by leader without a new read.
- Care canonicalization: confirm `/admin/care` already loads the full set (`fetchShepherdCareDirectoryForAdmin`, coverage, over-shepherds, recent interactions, outstanding/completed care follow-ups) so the aliased shepherd-care landing renders the same content with no loss.
- Alias-renders must run **after** the admin guard (`requireAdmin`) so role boundaries are unchanged.

---

## Risks & migration concerns

- **Frozen-route freeze (ADR 0008/0009/0013).** Frozen landings must **stay directly resolvable (200)** — alias-render the canonical shell, do **not** 302-redirect them, and never touch the `[profileId]`/`/over-shepherds` sub-paths or any `shepherd_care_*` table/route. Add tests asserting every frozen path resolves 200 (not 3xx). _(Raised by Codex review of PR #320 — the earlier redirect framing conflicted with ADR 0013; corrected here.)_
- **Inbound links / bookmarks (ADR 0013).** External docs and Julian's bookmarks point at `/admin/shepherd-care`, `/admin/launch-planning`, `/admin/calendar`. ADR 0013 requires these to **stay directly resolvable** — alias-render the canonical shell at each (200); **never 302-redirect** (violates the freeze) and never delete (breaks links).
- **Super Admin (ADR 0002).** No structural change; any shared primitive (`PageHeader`, field styles, `PBadge`) edited for the table must preserve Super Admin rendering.
- **PR overlap with in-flight PRDs.** Admin Interaction Model + Surface Simplification touch Groups (create form, capacity default), Care (interaction form), People (split), Settings, Launch Planning. **Coordinate ownership**: this plan owns scan-speed (table), nav a11y, Needs-Attention rationale, Care/Planning _canonicalization_ and _opinionated views_ — not the model/vocabulary/form-density work those PRDs own. Sequence after or alongside, never editing the same files in opposite directions.
- **Table vs pastoral tone.** Keep `PBadge` tones, warm lines, tabular-nums; no dense grey grid. Validate the table reads calm, not spreadsheet-cold.
- **Groups view preference (local, profile-scoped).** This is a per-browser UI preference, not server state: default to cards server-side, hydrate the saved choice client-side to avoid flash/mismatch, and key it `adminGroupsView:${profileId}` (fallback `adminGroupsView` when no profile id) so a shared device doesn't carry one admin's view into another's session.

---

## Test plan

**Automated (extend existing suites):**

- Unit (Vitest): `needs-attention` `why` strings per category, empty/degraded behavior; any new Planning view-derivation helper; Groups table sort comparators.
- A11y (Playwright, `tests/a11y/`): exactly one `aria-current="page"` in sidebar **including when on an alias URL** (`/admin/calendar` highlights Planning, etc.); **all** calendar/event triggers (month-grid cells, Planning list event buttons, drawer/list triggers) have meaningful, **unique, non-concatenated** names — including under occurrence collisions; Groups **table** rows keep record-context action names (extend `groups-directory` harness surface for table mode); axe = no critical/serious on every touched surface.
- Alias-resolution tests: the alias landings `/admin/shepherd-care`, `/admin/launch-planning`, `/admin/calendar`, `/admin/follow-ups` all return **200** under the admin guard (none 3xx) and render the **canonical shell** at the right initial view. `/admin/group-health` and `/admin/leader-pipeline` also return **200** but render their **own** surfaces (Group Health → `GroupHealthTriage` rating workflow; Leader Pipeline → the apprentice surface), **not** the canonical Groups/People list shells — assert the rating/pipeline workflow is present, not just a 200. The sub-routes `/admin/shepherd-care/<seeded profileId>` (use a real seeded id, **not** a literal `[profileId]`) and `/admin/shepherd-care/over-shepherds` (the actual admin path — **not** `/over-shepherds`) also still resolve 200.
- Active-nav tests: each alias URL above marks its **owning** canonical area `aria-current="page"` (`/admin/group-health` → Groups, `/admin/leader-pipeline` → People, `/admin/calendar` & `/admin/launch-planning` → Planning, `/admin/shepherd-care` & `/admin/follow-ups` → Care).

**Manual keyboard / screen-reader:**

- Tab through sidebar — active item announces "current page".
- Calendar surfaces — month-grid cells, Planning list event buttons, and drawer/list triggers each announce a meaningful, distinct name (not concatenated child text).
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

**Title:** _A11y + Home command-queue quick wins._

The full scope ships as this PRD; the **first implementation PR** is the Phase 1 a11y bundle
because it is small, cross-cutting, and low-risk:

1. `aria-current="page"` on active sidebar links, incl. the alias→canonical map so alias URLs highlight their owning area (`Sidebar.tsx`, `MobileSidebar.tsx`).
2. Explicit, unique `aria-label`s on **all** calendar/event triggers — month-grid cells (`calendar-occurrence-editor.tsx`, `calendar-month-grid.tsx`) plus Planning list event buttons and drawer/list triggers (`planning-calendar-panel.tsx`, `admin-master-calendar-list.tsx`, `admin-master-calendar-drawer.tsx`) — kills the concatenated-name read.
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
- Confirm every frozen landing alias-renders (200, not 3xx), serves its deep links, and runs the admin guard first.
