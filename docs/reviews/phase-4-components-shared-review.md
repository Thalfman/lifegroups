# Phase 4 Review — `components/lg/` · `components/ui/` · other component dirs

Working notes. Read-only review against `coding-standards` + `/simplify`
(React lens). ~82 non-test `.ts/.tsx` files: `components/lg` (43, incl. app shell

- dashboard), `components/ui` (10), `pastoral` (5), `calendar` (5), `leader` (5),
  `over-shepherd` (3), `auth`/`dashboard`/`pwa` (2 each), `home`/`layout`/
  `orientation`/`sign-in`/`usage` (1 each). Tests excluded (Phase 6).

**Headline:** strong shared-primitive foundation already in place (`Card`, `Pill`,
`StatusCard`/`EmptyState`, `overview-primitives`, `useEditingDrawer`, the `ui/*`
layer). No `any` of concern, immutable state, nav-gating + graceful-degradation
clean. The dominant smell is an **idiom split**: newer files use Tailwind tokens,
while the dashboard overview cards + `pastoral`/`calendar` + `home`/`layout` use
inline-`style` `P.*` objects whose duplicated fragments have **drifted** (scrim
alpha 0.45 vs shadow 0.20/0.22; eyebrow size 10 vs 11). Most of that convergence
is a larger (B) migration; the safe wins are local extractions and primitive
reuse.

> **Cross-PR note:** a few items want a shared `pluralize` helper — **Phase 3
> (#675) already adds `lib/shared/pluralize.ts`**. Those items are deferred here
> to avoid a duplicate/merge conflict; they can adopt the helper once #675 lands.

---

## (A) Safe auto-fixes — behavior-preserving

### Calendar (`components/calendar`)

1. **`upcoming-events-strip.tsx:31` `formatStart` duplicates `formatClock`** — body
   is a line-for-line copy of `lib/calendar/occurrences.ts:171` (`formatClock` is
   a superset — adds a `normalizeHhMm` guard). Delete `formatStart`, import
   `formatClock`. (Output identical for already-normalized input.)
2. **`statusTone` triplicated byte-identical** — `calendar-event-list.tsx:11`,
   `upcoming-events-strip.tsx:14`, `calendar-month-grid.tsx:24`. Lift one
   `statusTone(status: GroupCalendarEventStatus): PTone` into
   `lib/calendar/payload.ts` (already the shared import in all three).
3. **`formatDate` duplicated** — `calendar-event-list.tsx:17` ≡
   `upcoming-events-strip.tsx:20` (distinct from `occurrences.ts` `dateLabel`).
   Add one exported `weekdayDateLabel` to `lib/calendar/payload.ts` + hoist the
   `Intl.DateTimeFormat` to module scope.

### Dashboard / lg

4. **Extract a `CardNote` muted-paragraph primitive** — the identical
   `{margin:0, fontFamily:fontBody, fontSize:12.5, color:P.ink3}` empty-state
   paragraph repeats in `HealthDistributionCard.tsx:40`,
   `InterestFunnelOverviewCard.tsx:61`, `MultiplyOverviewCard.tsx:55`,
   `LeaderPipelineOverviewCard.tsx:53`, `GuestPipelineFunnelCard.tsx:54`. Add to
   `overview-primitives.tsx`; the per-card availability branch stays (no
   false-zero change).
5. **Extract a `CandidateCountsLine` / `multiplicationCountsText`** —
   `LaunchPlanningOverviewCard.tsx:107` ≈ `MultiplyOverviewCard.tsx:77` duplicate
   the divider row + counts-string builder + the byte-identical
   `MULTIPLICATION_ORDER`/`CANDIDATE_ORDER` consts (~40 lines).

### Leader / over-shepherd

6. **`check-in-form.tsx:441` hand-rolls an error `<ul>`** — `formStatusView`
   already joins errors; swap to `<FormStatus state={state} />` (no success text;
   list↔joined is equivalent). Safe.
7. **`leader-follow-ups-section.tsx:36` local `STATUS_LABEL`** duplicates the
   follow-up label vocabulary `lib/dashboard/labels` already centralizes (type +
   priority imported two lines up). Add `followUpStatusLabel` there, drop the
   local map.
8. **`over-shepherd/log-broad-note-form.tsx:45/48`** uses template-string
   `className` concat instead of the repo-standard `cn(...)`.

### ui / misc

9. **`pastoral/atoms.tsx:125` `PAvatar`** resolves bg/fg via two 4-deep nested
   ternaries → a `Record<PAvatarTone, {bg,fg}>` lookup (the pattern
   `button.tsx`/`badge.tsx` already use). Behavior-identical.
10. **`shell.tsx:49` `LogoutButton className=""`** no-op placeholder — drop it.

---

## (B) Needs-judgment — larger / visible-change risk

1. **Inline-`style` `P.*` → Tailwind convergence** — the dashboard overview cards
   (`LeaderCareOverviewCard`, `LaunchPlanningOverviewCard`, `MultiplyOverviewCard`,
   `InterestFunnelOverviewCard`, `HealthDistributionCard`, `GuestPipelineFunnelCard`),
   plus `home/home-hub.tsx` and `layout/shell.tsx` (whole files, lots of magic
   numbers), render via inline style while the shell uses Tailwind. Deliberate
   migration; dynamic colors must stay `style`. Large — dedicated pass(es).
2. **Centralize drifted style fragments into `lib/pastoral`** — scrim
   `rgba(58,42,26,0.45)` (`confirm-dialog.tsx:85`, `calendar-occurrence-editor.tsx:368`)
   and the modal shadow (alpha **0.22 vs 0.20** — already drifted), and the
   uppercase-eyebrow block (size **10 vs 11**, varying letter-spacing) repeated
   ~6×. Centralizing is good but **forces one value** → a 1px/1-alpha visible
   change on the outlier. Needs a deliberate "which value wins" call.
3. **Shared modal chrome** (`B1`) — `confirm-dialog.tsx` and
   `calendar-occurrence-editor.tsx`'s `EditorModal` re-implement the same centered
   dialog + focus-restore dance. A `CenteredDialogContent`/`useFocusRestore`
   primitive — but the editor's focus-restore backs the a11y suite, so extract
   with test care. (One uses `AlertDialog`, one `Dialog`.)
4. **`FormStatus` styling hook** — `quick-did-not-meet.tsx:48` re-rolls error
   display only because `FormStatus` hard-codes its classes (it needs the clay-band
   tone). Adding an optional `className`/`tone` prop lets both leader forms flow
   through one component — but `action-form.tsx` is consumed by ~48 forms, so it's
   cross-cutting. (Pairs with A6.)
5. **`pluralize` adoption** — `LeaderCareOverviewCard.tsx:33` / `ThisWeekCard.tsx:46`
   count-phrasing ladders. **Deferred: depends on Phase 3's `lib/shared/pluralize`.**
6. **`P*` tone-vocabulary collapse** (`button`/`badge` vs `pastoral` `PButtonTone`/
   `PTone`) — intentional migration wrappers; collapsing ripples to call sites.
   Roadmap item, not in-place.
7. **`VitalSignsBand.tsx:128` (~185 lines, dense inline ternaries)** — hoist each
   tile's value/meta/color into a `buildVitalSign(...)` above the return; structural
   only, the `available`/`degraded` gating must stay byte-identical.
8. **Skeleton dedup** (`DetailPageSkeleton`/`PageSkeleton` share `Bar` + header) and
   **`PAGE_MAX_WIDTH` constant** (`1240` duplicated in 4+ page-chrome files).
9. **`RiskPill` (lg) / `RiskPill` color reconciliation** and **`LeaderCareOverviewCard`
   → `ErrorBanner` reuse** — both touch dynamic/hardcoded colors
   (`ErrorBanner.tsx:13` magic `#7d3621` vs cards' `P.terraTextStrong`); reuse only
   after confirming the token is visually equal, else a color shift.

---

## (C) Invariant-adjacent — DEFER (do not touch)

- **Nav gating** — `Sidebar.tsx` / `MobileSidebar.tsx` / `LgAppShell.tsx`
  `navGroupsForRole(role, hiddenNavAreas)` + `isActiveNavHref` (ADR 0016/0024);
  the `item.icon as IconName` cast lives in this path — flag only.
- **`DashboardClient.tsx` prop contract + `hiddenNavAreas → show*` gating** and
  every per-card `if (!summary.available)` guard + per-tile `"—"` fallback
  (graceful degradation / no false zeros). A4/A5 extractions touch only the
  presentational note/divider, never the availability branch.
- **Leader privacy** — `leader-follow-ups-section.tsx` `LeaderFollowUpItem` (no
  `adminPrivateNote`), `group-note-write-form.tsx`, `over-shepherd/my-care-notes.tsx`
  (author-private + transparency copy), `log-broad-note-form.tsx` RPC/visibility
  wiring (ADR 0020/0002) — only the `cn` cosmetic fix is in scope there.
- **Auth flow** — `sign-in-screen.tsx`, `auth/logout-button.tsx` submit/redirect
  wiring.
- **Confirm/a11y primitives** — `confirm-dialog.tsx` / `alert-dialog.tsx`
  Cancel-default-focus, `role="alertdialog"`, focus-restore back the danger-zone
  confirms + axe suite; keep intact (any B3 extraction must preserve them).

---

## Recommended fix set for the Phase 4 PR

Take the **high-confidence behavior-preserving subset = (A) items 1-10**: the
calendar formatter/tone dedup into `lib/calendar/payload`, the `CardNote` +
`CandidateCountsLine` extractions, the two leader/over-shepherd reuse fixes
(`FormStatus`, `followUpStatusLabel`, `cn`), the `PAvatar` lookup, and the
`LogoutButton` cleanup. Defer **all of (B)** — the inline-style→Tailwind
migrations, the drift-prone token unification (visible change), the cross-cutting
`FormStatus` prop + modal-chrome extraction, the `VitalSignsBand` flatten, and
the `pluralize` adoption (blocked on #675) — to follow-up notes. **(C)** untouched.
This keeps the PR small and free of visible-output risk.
