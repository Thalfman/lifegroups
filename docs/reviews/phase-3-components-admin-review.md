# Phase 3 Review — `components/admin/`

Working notes. Read-only review against `coding-standards` + `/simplify`
(React lens). ~199 non-test `.ts/.tsx` files across the admin feature UI; tests
excluded (Phase 6).

**Headline:** the foundations are strong — no `any`, no in-place state mutation
(functional `setState` throughout), no false-zero read handling, and the form
primitives (`useActionForm`/`FormStatus`, the `ConfirmActionButton` family) and
confirm/danger-zone flows are exemplary. Findings are overwhelmingly **DRY**:
presentation helpers (date/time formatters, tone/badge maps, card scaffolding)
re-implemented per file instead of shared, plus several files that re-roll an
existing shared primitive. A handful of legacy inline-`style` files are out of
step with the Tailwind house style.

---

## (A) Safe auto-fixes — behavior-preserving

### Centralize duplicated formatters (highest leverage)

1. **UTC timestamp formatter duplicated 4×** (byte-identical, each comment admits
   drift risk) — `permanent-delete-card.tsx:45`, `clean-slate-card.tsx:59`,
   `attention-reset-card.tsx:51`, `history-reset-card.tsx:46`. Add
   `formatIsoDateTimeUtc(iso)` to `lib/shared/date.ts`; replace all four. (Keep
   the distinct local-TZ `audit-trail-section.tsx:13` formatter separate.)
2. **`formatMeetingTime`/`meetingLine` duplicated 3×** — `check-in-detail-shell.tsx:14`,
   `check-in-review-shell.tsx:19`, `groups/groups-helpers.ts:63`. Lift to one
   module (the `((hour+11)%12)+1` math lives once).
3. **`fmtNumber` duplicated** — `launch-planning/results-panel.tsx:9` ≡
   `scenarios-panel.tsx:49`.
4. **No shared pluralize** — hand-rolled in `care/care-accordion.tsx:31`,
   `care-leader-panel.tsx:72`, `notes-feed-shell.tsx:161` (the "N care note · M
   prayer request" string built twice). Add `pluralize(count, singular, plural?)`
   to `lib/shared/`.

### Reuse existing shared primitives

5. **Hand-rolled error-`<ul>` instead of `<FormStatus>`** (behavior-preserving —
   `formStatusView` joins all errors, never truncates) — forms:
   `assign-leader-form.tsx:108`, `assign-member-form.tsx:89`,
   `change-leader-role-form.tsx:164`; care: `person-group-assign.tsx:117`,
   `group-roster-manager.tsx:455`. Swap to `<FormStatus state successText … />`
   (touch the status block only — **not** the confirm gates).
6. **Local `ErrorBanner`/`Empty` duplicating `components/ui/empty-state.tsx` /
   `components/lg/ErrorBanner`** — `audit-trail-section.tsx:93/104`,
   `check-in-detail-shell.tsx:122`, `check-in-review-shell.tsx:126/137`,
   care `notes-feed-shell.tsx:29` / `care-leader-panel.tsx:85` /
   `care-workspace.tsx:233`.
7. **Capacity-board reimplements `Badge`** — `capacity-board/capacity-board.tsx:40`
   (`StatusPill`/`ReadyToMultiplyBadge` via inline style; `Badge` already has the
   tones). Replace with `Badge` + a `CapacityStatus → BadgeTone` record (~40 lines
   - only hardcoded hex gone).
8. **Duplicate label map** — `multiply/multiply-grid.tsx:31` `TYPE_LABEL` is a
   copy of exported `MULTIPLY_TYPE_LABEL` in same-folder `multiply-data.ts:20`.

### Hoist duplicated tone/style switches

9. **`statusTone()` (occurrence status) copy-pasted 4×** — `admin-master-calendar-grid.tsx:24`,
   `-list.tsx:19`, `-drawer.tsx:23`, `planning/planning-by-leader-list.tsx:23`.
   Hoist `occurrenceStatusTone` into `admin-master-calendar-status.ts`.
10. **`riskTone` duplicated 3× (incl. magic `#923220`)** — launch-planning
    `results-panel.tsx:22`, `scenarios-panel.tsx:35`, `summary-cards.tsx:26`.
    Extract into `lib/admin/launch-planning.ts` (relabeling identical — respects
    the threshold constraint).
11. **`SectionEyebrow`/eyebrow + section-card style consts duplicated ~9×/~6×**
    across launch-planning — promote the existing `SectionEyebrow`
    (`launch-planning-panels.tsx:45`) and one shared style module.
12. **`ROW_LINK` constant + card-row markup duplicated** —
    shepherd-care `recent-interactions-card.tsx:7` ≡ `upcoming-touchpoints-card.tsx:6`.
    Extract a `CareRowLink` primitive.

### Small mechanical cleanups

13. **Dead code:** `leader-health-grade.tsx:104` impossible `0-08-01` sentinel
    (guarded by the off-season early return); unused `Link` import
    `admin-master-calendar-drawer.tsx:3`; `import type` below executable code in
    `scenarios-panel.tsx:26`. Possibly-dead `super-admin-section-anchors.tsx`
    (superseded by the console's own hash handling — verify it's still mounted).
14. **`anyError` OR-chains** → `Object.values(errors).some(Boolean)` —
    `check-in-detail-shell.tsx:140`, `check-in-review-shell.tsx:271`,
    `group-management-shell.tsx:92`.
15. **Magic numbers:** `group-actions-menu.tsx:34` menu geometry (also referenced
    in `min-w-[190px]`); `care/care-data.ts:144` read `limit: 30/50`; apprentice
    `maxLength` 120/2000 + group-health `min/max 1..5` → named constants
    co-located with validators.
16. **Type tightening (drops loose casts):** `leader-health-grade.tsx:79` state
    `LeaderHealthLetter | ""` etc. (removes the `as` at :110/:111);
    `capacity-board.tsx:219/341` state `CapacityStatus | "all"`.
17. **Misc shared extractions:** `SessionStatusBadge` (check-in shells
    `:34`/`:39`), `AttendanceSummary` (`:222`/`:230`), `toOpts` in
    `multiply-plan-data.ts:93`, `SuggestionCardBody`
    (`multiplication-planner.tsx:837` ≈ `capacity-board.tsx:170`).

---

## (B) Needs-judgment — larger refactors

1. **`useDrawerForm` hook / `DrawerFormFooter`** — the `onSaved`/`onDirty`/
   `onCancel`/`onPendingChange` quartet + two byte-identical effects + footer is
   copied across `group-create-form`, `group-edit-form`, `member-form`,
   `leader-profile-form` (forms) and the follow-up/care create-forms. Biggest
   single DRY win; cross-cutting, so its own change. Preserves prop shapes.
2. **Cross-cluster follow-up dedup** — `follow-ups/` vs `shepherd-care/`
   create-forms (B1) and status-controls (`FollowUpTransitionButtons`).
3. **Shared `GroupRoleAssignFields` + `RosterRow/RosterList`** —
   `group-roster-manager.tsx:357/96/162` ≈ `person-group-assign.tsx:40` (~70+
   lines).
4. **Two coexisting `EmptyState` components** — `@/components/dashboard/cards`
   vs `@/components/ui/empty-state`, used side-by-side in the same feature folder.
   Consolidate on `ui/empty-state` after visual-parity check (design call).
5. **`churchTodayIso` reuse** — `care-action-forms.tsx:50` /
   `coverage-assignment-form.tsx:26` hand-roll a **browser-zone** today; the
   shared `churchTodayIso()` is church-zone. Deduping is good but switching the
   zone is a behavior change for off-zone users — needs a deliberate call +
   verify the server day-cap. (Dedupe-without-zone-change is the safe half.)
6. **Oversized files (cohesive, >150 lines)** — `multiplication-planner.tsx`
   (~954), `settings/groups-catalog-editor.tsx` (~1030), `people-directory.tsx`
   (~700), `settings-shell.tsx` (~660), `scenarios-panel.tsx` (608),
   `scenario-form.tsx` (590, repeated number-field blocks → `<NumberField>`),
   `leader-pipeline.tsx` (463), `group-roster-manager.tsx` (469),
   `person-detail-shell.tsx` (372). Split into siblings; no behavior change.
7. **Legacy inline-`style` migration to Tailwind** — `guests/` (still on the
   deprecated `*Style` exports `field-styles.ts:90`; migrating lets them be
   deleted), `capacity-board.tsx`, `group-assignments-manager.tsx` (~430,
   hardcoded hex + local primitive re-rolls), `week-selector.tsx`,
   `workspace-section-nav.tsx`. Large, touchy — best as dedicated passes.
8. **Naming:** `statusStripeColor`/`STATUS_STRIPE_OFF` now render a full border,
   not a stripe — rename to `statusAccentColor` across grid + legend.

---

## (C) Invariant-adjacent — DEFER (do not touch)

- **Private/sealed Care Notes & visibility** — `shepherd-care/private-notes-section.tsx`
  (encrypted, ministry-admin-only; the deep ternary stays),
  `note-transparency-toggle.tsx` (RLS grant), `care/notes-feed-shell.tsx` /
  `care-notes-section.tsx` / `care-note-write-form.tsx` (sealed-note summary,
  "Unknown person" degraded labeling, `granted` gating). Any note-card
  consolidation must be **presentational only**.
- **`admin_private_note` field** — `follow-ups/follow-up-create-form.tsx:226`
  ("leaders never see this"). Any shared follow-up component stays admin-only.
- **Danger-zone / reset confirm-phrase UX** — `attention-reset-card.tsx`,
  `history-reset-card.tsx`, `clean-slate-card.tsx`, `permanent-delete-card.tsx`,
  `reset-all-card.tsx`, `super-admin/inline-delete.tsx`,
  `test-accounts-panel.tsx` (service-role panel). Type-to-confirm gating +
  hidden scope/snapshot inputs + action wiring are protected.
- **Domain thresholds/labels** — launch `recommendation()`, multiply
  `ReadinessBadge`/`BLOCKER_LABEL`, multiplication `ReadinessChips`/`CRITERIA_ORDER`,
  capacity "meets N/5". Keep output byte-identical when centralizing formatters.
- **Data→shell contracts & computation seams** — all `*-data.ts` loader shapes,
  `readBatch` error precedence, `multiply-grid-data.ts` decode/roll-up, the
  master-calendar admin-notes exclusion, and the justified `exhaustive-deps`
  disables (`group-health-editor.tsx:131`, `admin-master-calendar-shell.tsx`,
  `people-directory.tsx:195/201`). Do not restructure.

---

## Recommended fix set for the Phase 3 PR

Given the size, take the **high-confidence, behavior-preserving DRY subset** =
**all of (A)** (centralize formatters → `lib/shared/date`/`lib/admin`, reuse
`FormStatus`/`EmptyState`/`Badge`, hoist tone maps, dead code, magic numbers,
type tightening). Defer the **(B)** larger refactors — `useDrawerForm`, the
cross-cluster + assign-field extractions, oversized-file splits, the Tailwind
migrations, and the zone-sensitive `churchTodayIso` change — to follow-up issues
noted in the PR body, so this PR stays reviewable. **(C)** untouched.
