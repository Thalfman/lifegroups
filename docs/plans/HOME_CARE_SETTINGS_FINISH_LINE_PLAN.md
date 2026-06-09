# Finish-Line Plan — Home · Care · Settings

The app pivoted (ADR 0016, amended by ADR 0022) to a three-area spine —
**Care · Plan · Multiply** — with the old Groups/People/Planning surfaces
hidden behind Super-Admin nav flags (frozen-route discipline: hidden, never
deleted). Home, Care, and Settings were each built across multiple pre- and
post-pivot phases and carry leftovers: Home still frames its snapshot in the
retired launch-planning/capacity model and links to alias/frozen routes;
Care's six tabs slice one dataset four ways and the transparency toggle isn't
reachable from the canonical view; Settings shows dead/frozen fields and
reports read failures as "not configured". This plan defines "done" for each
tab against the current direction and sequences the work as small,
independently shippable slices.

Three deep code audits (Home, Care, Settings) plus a verification pass ground
every claim below; corrected findings are baked in (e.g. the transparency
toggle UI **exists** at
`components/admin/shepherd-care/note-transparency-toggle.tsx`, used on the
per-leader detail page — the gap is that the canonical Care accordion only
shows a read-only "Sealed" line; the needs-attention mute flags **do** have a
Super Admin Console UI; `settings-shell.tsx` already de-underscores enum
labels).

**Hard invariants throughout** (CLAUDE.md): writes only via existing
`SECURITY DEFINER` RPCs with paired `audit_events`; column allowlists on new
reads; no route/table deletions; role-based gating; never expose
`admin_private_note` or widen the Care Note transparency model.

## Tracking — slices → issues

Wave labels group issues that can be executed in parallel; a wave starts when
its blockers from the previous wave are merged. All issues carry
`ready-for-agent` plus their `wave-n` label.

| Slice           | Issue                                                            | Wave   | Blocked by |
| --------------- | ---------------------------------------------------------------- | ------ | ---------- |
| P0.1            | [#467](https://github.com/Thalfman/lifegroups/issues/467)        | wave-1 | —          |
| P0.2            | [#468](https://github.com/Thalfman/lifegroups/issues/468)        | wave-1 | —          |
| P0.3            | [#469](https://github.com/Thalfman/lifegroups/issues/469)        | wave-1 | —          |
| P1.1            | [#470](https://github.com/Thalfman/lifegroups/issues/470)        | wave-1 | —          |
| P1.3            | [#471](https://github.com/Thalfman/lifegroups/issues/471)        | wave-1 | —          |
| P1.6            | [#472](https://github.com/Thalfman/lifegroups/issues/472)        | wave-1 | —          |
| P2.1            | [#473](https://github.com/Thalfman/lifegroups/issues/473)        | wave-1 | —          |
| P2.3            | [#474](https://github.com/Thalfman/lifegroups/issues/474)        | wave-1 | —          |
| P2.5 + P2.6     | [#475](https://github.com/Thalfman/lifegroups/issues/475)        | wave-1 | —          |
| P1.2            | [#476](https://github.com/Thalfman/lifegroups/issues/476)        | wave-2 | #470       |
| P1.4            | [#477](https://github.com/Thalfman/lifegroups/issues/477)        | wave-2 | #468       |
| P1.7 + P2.2     | [#478](https://github.com/Thalfman/lifegroups/issues/478)        | wave-2 | #469, #472 |
| P1.5            | [#479](https://github.com/Thalfman/lifegroups/issues/479)        | wave-3 | #477       |
| P2.4            | [#480](https://github.com/Thalfman/lifegroups/issues/480)        | wave-3 | #476       |

---

## 1. Main gaps by tab

### Home (`/admin`, `components/lg/admin/dashboard/DashboardClient.tsx`)

- **G-H1** Stale link: `LaunchPlanningOverviewCard.tsx:60,81` →
  `/admin/launch-planning` (frozen Planning shell); ADR 0022 re-homed the
  planner to `/admin/multiply?tab=plan`.
- **G-H2** Pivot areas invisible: with default flags, the overview shows only
  Leader Care + Health Distribution + a frozen Guests placeholder. **No card
  for Plan (Interest Funnel) or Multiply (readiness)** — the two newest areas
  are absent from the command center.
- **G-H3** Retired model in Vital Signs: 4 of 6 metrics ("% of church in
  groups", "People in groups", "Capacity used", "Launch outlook") read
  `fetchLaunchPlanningAssumptions` — pre-pivot concepts (ADR 0016/0022:
  headcounts are Julian-fed).
- **G-H4** Stale vocabulary: `GuestPipelineFunnelCard` ("Guests",
  placed/attended) vs Prospect/Interest Funnel; ActivityBand "Guests welcomed"
  counts the frozen `guests` table, not live prospects.
- **G-H5** Non-canonical action links: `buildShepherdCareTriageLink` emits
  `/admin/shepherd-care?…` (alias); `follow_ups` → `/admin/follow-ups`
  (off-nav alias). Worse, `filter=needs_attention` only selects a tab — no row
  filter is applied (documented in `lib/admin/shepherd-care-view.ts:109-113`),
  so "Reach out to N leaders" lands on the full roster.
- **G-H6** When Groups nav is hidden (default), `no_leader`/`setup_gaps` items
  are suppressed and nothing anywhere surfaces an unled group (needs an
  explicit decision — see P2.5).
- **G-H7** No `tests/a11y/home.spec.ts`; no e2e of role-based landing or
  activity reset.

### Care (`/admin/care`, six tabs via `components/admin/care/care-shell.tsx`)

Privacy layer is correct and well-tested (allowlists, `canReadNote` truth
table mirrors RLS, `admin_private_note` never read, group-scoped leader notes
per ADR 0020). Gaps:

- **G-C1** Transparency toggle not in the canonical view: accordion panel
  (`care-leader-panel.tsx:75-91`) renders a read-only "Sealed…" line; the
  working toggle lives two clicks deep on the detail page. CONTEXT.md promises
  it "inline on each person in Care".
- **G-C2** Tab sprawl: Over-Shepherds vs Coverage (both group by
  Over-Shepherd); Dashboard vs All leaders (queue vs roster of the same
  entries). Six tabs, four duplicated slices.
- **G-C3** Follow-ups tab stacks two queues (`shepherd_care_follow_ups`
  buckets + generic `follow_ups` shell) with no at-a-glance "which do I
  work?".
- **G-C4** Stale "shepherd-care" naming in routes/identifiers
  (`/admin/shepherd-care*`, `shepherd_care_*`). Routes/tables stay frozen by
  discipline — only **emitted link targets** should be canonicalized.
- **G-C5** `prayer_requests.status` (open/answered/archived) tracked in DB,
  surfaced nowhere; no status-update RPC exists.
- **G-C6** Member-care foundation (`member_care_*` tables/reads) behind
  never-shipped `care_member_list` flag — undocumented dead weight.
- **G-C7** No spec covering the transparency-toggle flow.

### Settings (`/admin/settings`, five tabs via `components/admin/settings-shell.tsx`)

- **G-S1** Dead settings: `metric_defaults.check_in_due_day_of_week` (never
  read); `multiplication_config.thresholds`/`.trigger` (retired by ADR
  0019/#401). `adminSetMultiplicationConfig`
  (`app/(protected)/admin/settings/actions.ts:328`) is an orphan export —
  defined, imported nowhere.
- **G-S2** Frozen check-in half-CRUD: read-only reference rows in
  `metric-defaults-form.tsx:231-235`; `check_in_due_offset_hours_override`
  round-tripped via hidden field (`group-metric-overrides-form.tsx:119-120`)
  yet consumed by nothing visible.
- **G-S3** Dishonest "Not configured": any read failure renders "isn't
  configured in this environment yet" — reads as data loss. One failed
  `fetchCategoryTypeTargetCells` blanks both Groups and Multiply tabs.
- **G-S4** Unlabeled semantics: cell target counts are tracking-only (never
  feed the trigger) with no hint; Interest threshold not consistently labeled
  as a people-count; "Care stale-contact" vs CONTEXT.md "care cadence"; "By
  type" vs "Audience".
- **G-S5** `decodeReadinessRule` (`lib/admin/cell-readiness.ts`) silently
  falls back to `BUILT_IN_READINESS_RULE` on corrupt JSON — a custom rule can
  be silently lost/overwritten.
- **G-S6** Thresholds tab mixes live-driving fields (care cadence, watch grade
  → Home health distribution) with fields that only drive hidden surfaces
  (capacity trio), with no labeling.
- **G-S7** Validators tested; no save-flow round-trip or error-state rendering
  coverage.

---

## 2. Definition of done by tab

**Home — daily command center.** Done when:
(a) every link lands on a _visible canonical_ surface (`/admin/care`,
`/admin/plan`, `/admin/multiply`) — never an alias/frozen route unless its nav
flag is on;
(b) the Ministry Snapshot reads in Care/Plan/Multiply signals (care attention,
funnel state, cell readiness); the launch-planning metrics render only when
Planning nav is re-shown;
(c) all three pivot areas have an overview card with live counts and a
drill-in;
(d) every card degrades to "—"/unavailable, never a false zero (existing
contract, preserved by tests);
(e) `tests/a11y/home.spec.ts` exists and `dashboard-client-structure.test.tsx`
asserts the new card set.

**Care — canonical leader-care workflow.** Done when:
(a) the full loop works without leaving Care: scan accordion → see who needs
attention → open a leader → log contact / note / prayer → **flip the
transparency toggle inline**;
(b) no two tabs answer the same question (target: **Over-Shepherds · All
leaders · Follow-ups · Recent updates**);
(c) every legacy deep link (`?view=`, `?coverage=`, `/admin/shepherd-care`,
`/admin/follow-ups`) still resolves to a coherent tab (alias-render 200,
asserted in `shepherd-care-view.test.ts`);
(d) privacy truth table unchanged: `care-note-visibility.test.ts` green;
accordion shows counts only, never bodies;
(e) a spec covers the toggle flow.

**Settings — configuration center for the live product.** Done when:
(a) every visible field demonstrably drives a live surface, is labeled with
what it drives, or is removed from the UI (columns/RPCs stay frozen in place);
(b) a read failure says "couldn't load — your saved configuration is
unchanged", never "not configured";
(c) no retired key is accepted from any form payload;
(d) tracking-only vs trigger-driving values are labeled;
(e) vocabulary matches CONTEXT.md (Audience, care cadence, Interest as
people-count);
(f) `tests/a11y/settings.spec.ts` covers the changed panels and error states.

---

## 3. Prioritized implementation slices

### P0 — correctness & privacy-promise gaps

**P0.1 Care: transparency toggle inline in the accordion** _(no new RPC, no
migration)_ — issue #467

- Render the existing `NoteTransparencyToggle` (client component) in
  `CareLeaderPanel`'s Care Notes & Prayer slot, replacing/augmenting the
  read-only sealed line; keep counts when visible. Reuse
  `setNoteTransparencyGrant` server action as-is — its revalidate list already
  covers `/admin/care`.
- Files: `components/admin/care/care-leader-panel.tsx`;
  `lib/admin/care-accordion.ts` (expose the grant boolean + `profileId` to the
  panel if not already).
- Tests: extend `lib/admin/__tests__/care-accordion.test.ts`; toggle
  assertions in `tests/a11y/care-actions.spec.ts`;
  `care-note-visibility.test.ts` stays untouched-green.

**P0.2 Home: canonicalize action links + fix stale planner link** — issue #468

- `lib/admin/shepherd-care-view.ts`: flip `BASE_PATH` → `/admin/care` (the
  canonical page accepts the same params); extend
  `resolveCareInitialTabFromParams` to map `view=follow-ups` → follow-ups tab.
- `lib/dashboard/needs-attention.ts`: `follow_ups.href` →
  `/admin/care?view=follow-ups`; `care_attention` → the attention-actionable
  tab (`view=dashboard` until P1.4, then the merged filtered tab); fix the
  stale "#260 no mute UI" comment (the console UI exists in
  `super-admin-console-shell.tsx`).
- `LaunchPlanningOverviewCard.tsx:60,81`: href → `/admin/multiply?tab=plan`.
- Tests: `lib/admin/__tests__/shepherd-care-view.test.ts` (BASE_PATH + param
  matrix), `lib/dashboard/__tests__/needs-attention.test.ts` (href
  assertions).

**P0.3 Settings: honest "couldn't load" vs "not set up yet"** — issue #469

- Split `NotConfigured` (`settings-shell.tsx:636`) into two states: read error
  → "This section couldn't be loaded right now. Your saved configuration is
  unchanged — refresh to try again." (no editor, preserving overwrite
  protection); genuinely empty → existing empty-seed editor. Per-section error
  copy so Groups vs Multiply name their own failing read.
- Files: `components/admin/settings-shell.tsx`; (`settings-data.ts` error
  strings already flow).
- Tests: new
  `components/admin/settings/__tests__/settings-shell-errors.test.tsx`; extend
  `tests/a11y/settings.spec.ts`.

### P1 — core workflow gaps

**P1.1 Home: Plan + Multiply overview cards** — issue #470

- New `InterestFunnelOverviewCard` (Interested / Matched / Not-at-this-time +
  Joined roll-up; link `/admin/plan`) takes the Guests slot by default;
  `GuestPipelineFunnelCard` renders only when `guestsLive`. New
  `MultiplyOverviewCard` ("X of Y cells ready" + candidate counts; link
  `/admin/multiply`).
- Data: new allowlisted `fetchProspectStateCounts` in
  `lib/supabase/prospect-reads.ts` (columns: `state`, `archived` only;
  existing RLS — don't reuse the full board read); reuse
  `loadMultiplyGridData()` + new pure `buildMultiplyHomeSummary(grid)` in
  `lib/admin/multiply-grid.ts`. Load both in `app/(protected)/admin/page.tsx`'s
  existing `Promise.all`; degrade per-card.
- Reuse `StatusCard`/`StatTileGrid`/`EmptyState` primitives.
- Tests: `dashboard-client-structure.test.tsx` (default card set; flag-gated
  cards stay gated); `multiply-grid` summary cases; prospect-counts read test.

**P1.2 Home: re-found Vital Signs on the pivot** — issue #476

- New six: Active groups · Active leaders · Leaders needing care
  (`shepherdCare.needsAttention`) · Prospects in funnel (P1.1 counts) · Cells
  ready to multiply (P1.1 summary) · Follow-ups due this week (already
  loaded). The four launch-planning metrics render **only when
  `/admin/planning` is not nav-hidden** (same gate the overview cards use) —
  nothing deleted; they return if Tom re-shows Planning.
- Files: `VitalSignsBand.tsx`, `DashboardClient.tsx`,
  `lib/dashboard/types.ts`, `lib/dashboard/fallback-data.ts` (demo seed).
- Tests: structure test; `admin-dashboard-data.test.ts` (failed prospect/grid
  read → "—", never zero); `fallback-data.test.ts`.

**P1.3 Home: activity vocabulary** — issue #471

- Replace "Guests welcomed" with **"Prospects added"** (count
  `prospects.created_at` in the period window — extend
  `fetchOverviewActivityCounts` in `lib/supabase/read-models.ts`); keep the
  guests tile only when `guestsLive`; honor the activity-reset floor
  identically.
- Tests: `admin-dashboard-data.test.ts` (period + reset-floor for the new
  tile).

**P1.4 Care: consolidate six tabs → four** — issue #477

- **Over-Shepherds** (default; absorbs Coverage — unassigned bucket + "Manage
  →" link to `/admin/shepherd-care/over-shepherds` move into the accordion
  region) · **All leaders** (absorbs Dashboard: summary tiles +
  `CareAttentionQueue` above `ShepherdCareDirectoryTable`, plus a
  needs-attention filter chip — restoring the row filter that #328 dropped, so
  Home's `care_attention` link finally lands filtered) · **Follow-ups** ·
  **Recent updates**.
- Deep-link migration: `CareTabKey` accepts legacy keys forever;
  `resolveCareInitialTabFromParams` maps `coverage=*` → over-shepherds,
  `view=dashboard|directory` → all-leaders, `view=follow-ups` → follow-ups;
  `filter=needs_attention` pre-applies the table filter. Aliases unchanged.
- Files: `app/(protected)/admin/care/page.tsx`, `care-shell.tsx`,
  `lib/admin/shepherd-care-view.ts`,
  `components/admin/shepherd-care/directory-table.tsx`,
  `components/admin/care/care-accordion.tsx`.
- Tests: `shepherd-care-view.test.ts` full param→tab matrix; accordion test;
  re-run `tests/a11y/care-actions.spec.ts`.

**P1.5 Care: Follow-ups tab clarity (copy-only, no merge)** — issue #479

- Subject-first headings ("Care follow-ups — about your leaders" / "General
  follow-ups — groups, guests, tasks"), combined open count on the tab badge,
  one-line lede explaining the split. A true single-queue merge = data-model
  work across two tables — out of scope; file a follow-up issue.

**P1.6 Settings: retire dead/frozen fields from the surface** _(no column
drops, no RPC changes, no migration)_ — issue #472

- Remove the two read-only check-in rows from `metric-defaults-form.tsx`;
  remove the hidden `check_in_due_offset_hours_override` field from
  `group-metric-overrides-form.tsx` and drop the key from
  `GROUP_METRIC_FIELDS` in `settings/actions.ts` (RPC still accepts it; stored
  overrides remain clearable).
- Delete the orphan `adminSetMultiplicationConfig` export + its spec (zero
  importers verified); document `check_in_due_day_of_week` +
  `multiplication_config.thresholds/.trigger` as retired in
  `docs/architecture/DATABASE_SCHEMA.md`.
- **Optional, separate, explicitly-scoped later slice (not recommended now):**
  migration dropping the dead columns + trimming RPCs, with its own
  `*-migration.test.ts`.
- Tests: assert retired keys are no longer read from FormData; typecheck
  enforces the dead-export removal.

**P1.7 Settings: label thresholds by live consumer + vocabulary pass** — issue
#478 (also covers P2.2)

- `MetricDefaultsForm`: group into "Drives Care & Home today" (care cadence
  pair — relabel per CONTEXT.md; watch grade + decline margin, noting they
  feed the Home health distribution) vs "Drives hidden surfaces" (capacity
  trio, short note). `GroupsCatalogEditor`: target-count helper "Tracking only
  — never feeds the multiplication trigger." `MultiplyTriggerEditor`: Interest
  threshold labeled as people-count; "By type" → "Audience".
- Tests: `tests/a11y/settings.spec.ts` label assertions.

### P2 — polish & hardening

- **P2.1 Settings corrupt-rule warning** (issue #473):
  `decodeReadinessRuleWithReport` returning `{ rule, fellBack }`; calm notice
  in Settings + Multiply ("stored trigger couldn't be read; built-in default
  shown — saving will overwrite it"). Tests in `cell-readiness.test.ts`.
- **P2.2 Settings canonical status labels** (folded into issue #478): one
  shared health-status label map (reuse the options list in
  `group-metric-overrides-form.tsx:21`) in `settings-shell.tsx`'s override
  summary → "Needs follow-up".
- **P2.3 Care prayer status chips** (issue #474): read-only "Answered" chips
  on the detail page's prayer list (`status` already in the allowlisted read).
  Author-driven status _updates_ need a new RPC + migration + paired audit —
  file as its own issue, not in this slice.
- **P2.4 Home a11y + tone** (issue #480): new `tests/a11y/home.spec.ts`
  (mirror settings spec); empty-state copy tone pass across cards (one calm,
  pastoral voice).
- **P2.5 Decide suppressed Groups-bound gaps (G-H6)** (issue #475): recommend
  **keep suppression** (pivot-consistent — group setup is Julian-managed
  off-app); record rationale in `needs-attention.ts` module comment + ADR 0016
  consequences. Optional follow-up: Super-Admin-console-only "hidden gaps
  exist (N)" line.
- **P2.6 Member-care foundation — keep, documented** (issue #475): no code;
  note in `DATABASE_SCHEMA.md` + Care docs that the backend is complete and
  surfacing is governed solely by `care_member_list`.

---

## 4. Files/areas likely to change

**Home**

- `app/(protected)/admin/page.tsx`;
  `components/lg/admin/dashboard/{DashboardClient,VitalSignsBand,LaunchPlanningOverviewCard,ActivityBand}.tsx`
  + new `InterestFunnelOverviewCard.tsx`, `MultiplyOverviewCard.tsx`
- `lib/dashboard/{needs-attention,types,fallback-data,queries}.ts`
- `lib/supabase/prospect-reads.ts` (new counts read),
  `lib/supabase/read-models.ts` (`fetchOverviewActivityCounts`),
  `lib/admin/multiply-grid.ts`

**Care**

- `components/admin/care/{care-leader-panel,care-shell,care-accordion}.tsx`;
  `app/(protected)/admin/care/page.tsx`
- `lib/admin/{shepherd-care-view,care-accordion}.ts`
- `components/admin/shepherd-care/directory-table.tsx`;
  `coverage-by-over-shepherd-card.tsx` (content folds into accordion)
- **Unchanged by design:** `/admin/shepherd-care*` routes,
  `care-notes-actions.ts`, all RPCs/migrations/RLS

**Settings**

- `components/admin/settings-shell.tsx`;
  `components/admin/settings/{settings-data.ts,groups-catalog-editor.tsx,multiply-trigger-editor.tsx}`
- `components/admin/forms/{metric-defaults-form,group-metric-overrides-form}.tsx`
- `app/(protected)/admin/settings/actions.ts`; `lib/admin/cell-readiness.ts`
- `docs/architecture/DATABASE_SCHEMA.md` (retired-column notes)

---

## 5. Risks

- **Privacy/role.** P0.1 must not widen the grant model: toggle stays behind
  `requireAdminSession` (Ministry Admin + Super Admin parity per the ladder);
  the accordion keeps rendering **counts only**, never note bodies. Never add
  `admin_private_note` to any Care read. Any new column added to
  `care-note-reads.ts`/`shepherd-care-reads.ts` requires re-checking the RLS
  truth table (`care-note-visibility.test.ts` is the guard).
- **Supabase/RLS.** New reads (`fetchProspectStateCounts`, activity prospects
  count) must be column-allowlisted (`state`, `archived`, `created_at`) and
  ride existing admin RLS — **no policy changes or migrations in any P0/P1
  slice**. The only flagged migrations are optional/separate (dead-column
  drop; prayer-status RPC) and would need paired audits + migration tests.
- **Audit completeness.** No new write paths; everything reuses audited RPCs.
  Removing `adminSetMultiplicationConfig` removes no coverage (nothing calls
  it).
- **Stale data / caching.** Metric-defaults changes ride the existing
  `revalidateTag(METRIC_DEFAULTS_CACHE_TAG)`. Once Home consumes
  funnel/readiness counts, verify Plan prospect actions and Multiply-affecting
  settings writes also revalidate `/admin` (check the revalidate lists in
  `app/(protected)/admin/plan/actions.ts` and `settings/actions.ts`; likely
  need `/admin` added).
- **Frozen-surface regression.** The `BASE_PATH` flip changes URLs emitted by
  widgets that also render inside the frozen alias hosts — the alias pages
  keep accepting old params, so old bookmarks survive; test both entries.
  Preserve `GuestPipelineFunnelCard` behavior under a re-enabled `guests` flag
  (`guestsLive=true` path). The planner renders from two hosts (ADR 0022); the
  Home link change doesn't touch it.
- **Care tab-key churn.** Legacy tab keys/params stay accepted inputs forever;
  never 404 a tab key.

---

## 6. Validation plan & acceptance criteria

**Per-slice gates:** `npm run lint` → `npm run typecheck` → `npm run test:run`
(the pre-commit hook enforces these), plus `npm run test:a11y` when UI
structure changes.

**Unit tests (mirror existing files):**

- `lib/dashboard/__tests__/needs-attention.test.ts` — new hrefs; suppression
  rules unchanged
- `lib/dashboard/__tests__/admin-dashboard-data.test.ts` +
  `fallback-data.test.ts` — new fields degrade to unavailable, never zero
- `components/lg/admin/dashboard/__tests__/dashboard-client-structure.test.tsx`
  — default card set = Leader Care + Health + Interest Funnel + Multiply;
  flag-gated cards only when shown
- `lib/admin/__tests__/shepherd-care-view.test.ts` — full param→tab matrix
  incl. `view=follow-ups`, `BASE_PATH=/admin/care`
- `lib/admin/__tests__/care-accordion.test.ts` — toggle state per leader
- `lib/admin/__tests__/cell-readiness.test.ts` — decode-with-report
- `components/admin/settings/__tests__/` — error-state rendering; retired keys
  absent from payloads

**A11y specs:** new `tests/a11y/home.spec.ts`; extend `care-actions.spec.ts`
(toggle) and `settings.spec.ts` (labels, error states); `leader-care.spec.ts`
stays green untouched.

**Manual QA (role-by-role, after P1):**

1. _Ministry Admin:_ Home shows pivot vital signs (no "% of church"); Needs
   Attention links land on `/admin/care` filtered views; flip a leader's
   transparency toggle from the accordion → counts appear → flip off → sealed;
   Plan card → `/admin/plan`; Multiply card → `/admin/multiply`.
2. _Super Admin:_ full parity with the above (sees and can flip the toggle);
   Activity reset visible; toggling `nav_show_planning` ON restores launch
   metrics + Capacity & Launch card (link opens `/admin/multiply?tab=plan`);
   OFF removes them.
3. _Over-Shepherd:_ `/over-shepherd` unchanged; own notes visible regardless
   of grant; cannot reach `/admin/*`.
4. _Leader (flag off):_ lands on `/unauthorized`.
5. _Legacy URLs:_ `/admin/shepherd-care?view=directory&filter=needs_attention`,
   `/admin/follow-ups`, `/admin/shepherd-care/over-shepherds` all 200 on the
   right tab/surface.

**Overall acceptance:** CI green (lint/typecheck/test:run + Playwright a11y
job); zero migrations in P0/P1; `audit_events` pairing untouched; §2
Definition of Done holds per tab.
