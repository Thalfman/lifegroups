# Phase 1 Review — `lib/admin/` · `lib/shared/` · `lib/supabase/`

Working notes (not a retained doc). Read-only review against the
`coding-standards` rubric + `/simplify` lens. ~316 source files; tests excluded
(Phase 6).

**Headline:** the write path and reads seam are in strong shape — **zero `any`**,
no `select("*")`, no direct table writes, no service-role usage, no hardcoded
UUIDs/emails, and the Care-Note / `admin_private_note` visibility exclusions are
intact everywhere. Findings are DRY/type-safety polish, not defects. One
sub-reviewer "bug" claim (`multiplication-seed.ts:487` `group.lifeStage`) was
**verified false** and dropped.

---

## (A) Safe auto-fixes — behavior-preserving

Ordered by leverage.

### Validation layer (`lib/admin/validation/`)

1. **`isRecord` early-return guard duplicated 79× across 19 files** — the 2-line
   `if (!isRecord(input)) return { ok: false, errors: ["payload must be an object"] };`.
   Extract `requireRecord(...)` into `validation/shared.ts` (or fold into a
   `makeValidator` helper).
2. **~11 near-identical "single-uuid-id payload" validators** —
   `groups.ts:251`, `people.ts:264/279`, `leader-pipeline.ts:174`,
   `launch-planning.ts:347/690`, `shepherd-care.ts:342/557/995`, prospects.
   Extract `makeIdPayloadValidator(fieldName)` → collapses ~90 lines to ~11.
3. **"optional uuid field" micro-pattern repeated** (`groups.ts:186`,
   `leader-pipeline.ts:56`, `launch-planning.ts:477/502/565/586`). Extract
   `readOptionalUuid(value, errors, message)`.
4. **Redundant `input.x as string` casts after `isUuid` guard (57× / 14 files)**,
   e.g. `super-admin.ts:69`, `people.ts:106`, `groups.ts:244`. Mostly disappear
   once #2/#3 land.

### Shared foundation (`lib/shared/`)

5. **`{ ok: true; value } | { ok: false; errors }` redeclared 6+ times** —
   `shared/action-result.ts:10`, `shared/run-action.ts:28/35`,
   `shared/validation-primitives.ts:9`, `leader/run-action.ts:33`,
   `admin/run-action.ts:43`, `calendar/payload.ts:19`. Import
   `ActionResult`/`ValidationResult` from `action-result.ts` instead of
   re-declaring.

### Decode / projection duplication (`lib/supabase/`, `lib/admin/`)

6. **`decodeScores` (jsonb→`Record<string,number>`) duplicated 3-4×** —
   `care-accordion-reads.ts:34`, `leader-rubric-grade-reads.ts:48`,
   `multiplication-config-reads.ts:384`, ~`maintenance-reads.ts:73`. Extract
   `decodeNumericRecord` into `read-core.ts`.
7. **Profile-name-map projection duplicated** — `care-note-feed-reads.ts:193`
   `fetchProfileNamesByIds` vs inline build in `super-admin-console-reads.ts:85`.
   Reuse the helper.
8. **Per-subject id-projection readers duplicated** —
   `care-accordion-reads.ts:148/167` + `:122`. One
   `fetchSubjectProfileIds(client, table)`.
9. **`asStringArray` decode duplicated** — `audit-summary.ts:274` & `:411`
   (identical `submitted_keys` block). Add alongside `asString`/`asNumber`.
10. **`permanent-deletion.ts` — 22× `(data ?? []) as Array<Row>` read+map
    blocks** (lines 46…703). Extract `mapRows<Row>(data, mapper)` — removes 22
    loose casts. (Named-column reads — safe on `select("*")`.)

### Hoist / dedupe constants & comparators

11. **`master-calendar-view.ts:240/302`** — rebuild label `Map`s from static
    arrays in two functions; hoist to module-level `TYPE_LABELS`/`STATUS_LABELS`.
12. **`group-health.ts:98/154`** — duplicated meeting-week-desc comparator;
    extract `byMeetingWeekDesc`.
13. **`middleware.ts:91/119/134`** — "copy all cookies onto response" loop 3×;
    extract `carryCookies(from, to)`.
14. **`check-in-due.ts`** — church-local ISO day-walking + `(targetDay+6)%7`
    Monday offset repeated 3-5× (lines 148/169/320/497). Extract
    `churchLocalDateFromIso` / `daysFromMondayTo`.

### Type-safety / loose-cast cleanup

15. **`as unknown as string[]` double-cast 3×** — `shepherd-care-reads.ts:705/914/988`
    on `ELIGIBLE_SHEPHERD_ROLES`. Type the const `string[]` once.
16. **`audit-summary.ts:337`** redundant `as boolean` after `typeof` guard;
    **`:295+`** dead `isRecord(before)` re-guards (already coerced at :150).
17. **`group-health-override.ts:39/41`** — drop `override!` non-null assertions by
    guarding on `override` directly.
18. **`multiplication-pillars.ts:335`** local `isRecord` redefined; import shared.
19. **`master-calendar.ts:138`** `Map` value type includes `null`; tighten with
    `NonNullable<…>`.

### Magic numbers

20. `super-admin-usage-model.ts:77` `slice(0,10)` → `RECENT_LOGINS_LIMIT`;
    `check-in-due.ts:590` `hours < 48` → `RELATIVE_HOURS_TO_DAYS_CUTOFF`.

### Immutability (convention-only — all locally-owned arrays)

21. In-place `.sort`/`.push` on fresh locals → `[...arr].sort()`:
    `care-accordion.ts:165`, `leader-pipeline.ts:98/106`,
    `master-calendar.ts:154/192/208`, `check-ins.ts:388`. Low risk; none mutate
    caller-owned inputs.

---

## (B) Needs-judgment — decide before applying

1. **`shepherd-care-dashboard.ts:392/404`** — `buildSummary` re-derives the
   stale-contact / needs-attention predicate on a separate path from the queue's
   `detectReasons`, the exact drift hazard `shepherd-care-attention.ts` exists to
   prevent. Unify (verify with tests). _Highest-value B item._
2. **`private-notes-session.ts:286-628`** — `patch(busy) → try → patch(error) →
finally patch(!busy)` envelope copied ~7×. A `runBusy(async …)` wrapper; must
   preserve `finally` semantics (some flows early-return).
3. **`permanent-deletion.ts` (785 lines)** — 22 entities repeat
   table/columns/order/limit/label builders; candidate for a declarative config +
   one `fetchItems` factory.
4. **`read-models.ts:1656` & `:1443`** hand-roll the gather-and-degrade that
   `read-batch.ts` (`readBatch`) already provides; migrate for consistency.
5. **Long functions (>50 lines):** `audit-summary.ts:143` (~335, switch →
   dispatch map), `read-models.ts:1126` (~175) & `:1412` (~130),
   `care-area.ts:116` (~150), `multiplication-config-reads.ts:507` (~110),
   `launch-planning.ts:471` (~140).
6. **Dead arg:** `multiplication-pillars.ts:155` `computePillars(ministryYear)`
   only `void`s it — YAGNI, drop unless a slice needs it imminently.
7. **`fetchActiveOverShepherds` etc. (`super-admin-console-reads.ts:39/53/70`)**
   swallow errors to `[]` instead of the `ReadResult` envelope — borderline vs
   the "no false zeros" invariant; changing the contract is behavioral.
8. **`maintenance-reads.ts:117`** danger-zone preview fails all-or-nothing on one
   table count error — confirm intended vs per-table degrade.

---

## (C) Invariant-adjacent — DEFER (do not touch in this pass)

- **`as never` RPC/table seams** — `read-models.ts:947`, `care-note-feed-reads.ts:39`,
  `care-accordion-reads.ts:57/91`, `member-care-reads.ts:58-103`,
  `group-health-read.ts:214/271/484`, `shared/rpc.ts`. Deliberate trust boundary
  for tables/RPCs absent from generated types. Real remedy = regenerate
  `types/database.ts` (out of scope). **Never widen types or use `select("*")`.**
- **`care-note-visibility.ts` (whole file)** mirrors the RLS truth table for
  `admin_private_note` / Care Notes — keep a faithful mirror of the migration.
- **`care-accordion.ts:438`, `care-note-feed.ts`, `master-calendar.ts:42/100`** —
  Care-Note visibility contract + leader-route exclusions of `admin_private_note`.
- **`feature-flags.ts:271` frozen-surface `verified` gate** (ADR 0009) — security
  fail-safe branches; do not "simplify".
- **`private-notes-session.ts:260/402`** — idle DEK wipe (ADR 0003).
- **Graceful-degradation flags** — `group-health-read.ts:56/367` (`stale: true`
  last-known-good), `shepherd-care-dashboard.ts:113/524`
  (`coverageAvailable`/`followUpsAvailable`), `check-ins.ts:579` fail-closed
  calendar throw. Preserve — collapsing these reintroduces false zeros.
- **Trust-boundary decoders / SQL escaping** — `cell-readiness.ts:396`,
  `multiplication-pillars.ts:339`, `multiplication-seed.ts:429` (`sqlText`
  quote-doubling), `follow-up-reads.ts:217` OR-builder.
- **`action-result.ts` RPC error token table & `permanent-deletion.ts`
  `INLINE_DELETABLE_ENTITY_TYPES`** mirror SQL allowlists (test-asserted).
- **Parallel grade engines** (`group-health.ts` legacy A–D vs `health-rubric.ts`
  ADR-0018 A–F) — intentional pivot duplication; future consolidation, not now.

---

## Recommended fix set for the Phase 1 PR

Apply **all of (A)** — they are behavior-preserving DRY/type-safety wins with the
biggest payoff in the validation layer (#1–#4) and shared decoders (#5–#10).
From **(B)**, I'd take **#1 (stale-contact unification)** and **#2 (`runBusy`)**
as the two highest-value judgment calls; the rest (large-function splits,
`permanent-deletion` config rewrite, `readBatch` migration) are better as
follow-up issues to keep this PR reviewable. **(C) untouched.**
