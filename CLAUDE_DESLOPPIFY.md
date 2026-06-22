# CLAUDE_DESLOPPIFY.md

A practical cleanup backlog from a full-codebase "desloppify" scan (2026-06-22).
Five parallel reviewers swept the write path, the read/data layer, auth ·
security · migrations, the `components/` tree, and route/config/doc hygiene.
Each finding was cross-checked against source; several reviewer "criticals" were
demoted or discarded after verification (see _Notes_ at the bottom).

**Headline:** the repo is in genuinely good shape. The security invariants hold
— no service-role key in Next runtime, no hardcoded identity, every mutating RPC
pairs an `audit_events` row, 0 broad write-RLS policies, no `select("*")`. There
are **no security CRITICALs**. The real debt is **correctness traps from
inconsistent handling of the same concept in multiple places**, **duplicated
form/confirmation UI**, and **parallel/orphaned documentation**.

This overlaps with the existing top-level `plans/` (001–007) backlog — that one
is older and narrower; reconcile, don't double-track.

> **Revision (PR #798 review):** the Codex reviewer correctly challenged three
> of the original "Critical" findings. After re-verifying against source, **C2,
> C3, and C4 were downgraded** (the danger-zone confirm/error handling and the
> grade-resolver numeric guard already exist). The genuine Criticals are now
> **C1, C5, C6**. M14 and M18 were also corrected. Details inline and in _Notes_.

## How to use this

Pick a task by its ID. Each task lists **where · why it matters · recommended
change · safe now / wait**. After completing one, the backlog is redisplayed for
the next selection.

---

## Backlog at a glance

| ID  | Tier     | Task                                                                                               | Safe now?            |
| --- | -------- | -------------------------------------------------------------------------------------------------- | -------------------- |
| C1  | Critical | `ProspectsRow` type is missing `desired_group_type` (trust-boundary lie)                           | ✅ now               |
| C2  | Medium ↓ | Group rubric read skips the `decodeNumericRecord` its siblings run (consistency, not a NaN bug)    | ✅ now               |
| C3  | Medium ↓ | Danger-zone typed-confirmation UI hand-rolled across cards (extract a primitive)                   | ✅ now               |
| C4  | Nice ↓   | `test-accounts-panel` `run()` has no catch for a thrown/rejected action                            | ✅ now               |
| C5  | Critical | Boolean-flag parser drift — `"yes"` = true on leader, false on admin                               | ✅ now               |
| C6  | Critical | Password-reset audit RPC: unvalidated `profile_id` + swallowed result → possible missing audit row | ✅ now               |
| M1  | Medium   | Silent fallback on invalid follow-up `priority`                                                    | ✅ now               |
| M2  | Medium   | Two divergent `isIsoDate` implementations                                                          | ✅ now               |
| M3  | Medium   | Missing `full_name` length bound in people validators                                              | ✅ now               |
| M4  | Medium   | `group_health` action fabricates an error token, discards the real read error                      | ✅ now               |
| M5  | Medium   | Calendar action silently revalidates nothing on missing `group_id`                                 | ✅ now               |
| M6  | Medium   | Duplicated FormData-extraction idiom across ~8 action files                                        | ✅ now (plain cases) |
| M7  | Medium   | `*_PAGE_LIMIT = 10000` / `range(0, 9999)` duplicated 7 ways                                        | ✅ now               |
| M8  | Medium   | Three diverging rubric-grade read paths + needless `as never` casts                                | ⏳ wait              |
| M9  | Medium   | Three column-allowlist idioms across `*-reads` files                                               | ⏳ wait              |
| M10 | Medium   | Copy-pasted embed-projector boilerplate (4 near-clones)                                            | ⏳ wait              |
| M11 | Medium   | Dead read exports + unused `member-care-reads.ts`                                                  | mixed                |
| M12 | Medium   | `okf/` is an orphaned parallel doc tree (and ADR range is stale)                                   | mixed                |
| M13 | Medium   | Top-level `plans/` collides with `docs/plans/` and is stale                                        | ⏳ wait              |
| M14 | Medium   | `/admin/plan` vs `/admin/planning` — confusing pair; document distinction (ADR 0033 keeps it)      | ⏳ wait              |
| M15 | Medium   | Over-Shepherd test user is unprovisionable; `findAuthUserByEmail` duped 3×                         | ✅ now (test)        |
| M16 | Medium   | Form field-clusters duplicated across 3 forms; no shared `FormField` primitive                     | ✅ now               |
| M17 | Medium   | Number inputs coerce empty → 0; enum fallback masks bad data; weak error predicate                 | ✅ now               |
| M18 | Medium   | `follow-ups-shell` assumes `data` is always present (no skeleton/error state)                      | ⏳ wait              |
| N1  | Nice     | Inline-style sprawl + dual `pastoral`→`ui` styling systems                                         | ⏳ wait (large)      |
| N2  | Nice     | Small UX/a11y polish bundle (dialog desc, aria-labels, empty states, keys)                         | ✅ now               |
| N3  | Nice     | Duplicated small helpers (`formatDate`, `todayLocalIso`, tab→URL)                                  | ✅ now               |
| N4  | Nice     | Redundant `as` casts / loose RPC arg types                                                         | ✅ now               |
| N5  | Nice     | Dead props, magic numbers, raw `<button>` vs `Button`                                              | ✅ now               |
| N6  | Nice     | Edge-fn debug `console.log` + lingering `staff_viewer` helper reference                            | mixed                |
| N7  | Nice     | Reader convention drift (`readBatch`, `ReadResult`, `server-only`, naming)                         | ✅ now               |
| N8  | Nice     | Migrate hand-rolled pages onto the `adminPage()` runner                                            | ✅ now               |

---

## 1. Critical issues

> The genuine Criticals are **C1, C5, C6**. **C2, C3, and C4 remain here under
> their original IDs but are downgraded** (Medium/Nice) after the PR #798 review —
> each is marked "↓ corrected" with the verification details.

### C1 — `ProspectsRow` type is missing `desired_group_type` (trust-boundary lie)

- **Where:** `lib/supabase/prospect-reads.ts:24-58` pins `PROSPECT_BOARD_COLUMNS = columns<ProspectBoardEntry>()(…"desired_group_type")` to a hand-written local type; `types/database.ts:678-692` (`ProspectsRow`) has **no** `desired_group_type` field. The column exists in the DB (migration `20260710000000`).
- **Why it matters:** `columns<Row>()` exists so the allowlist is pinned to the _typed row_ — widening becomes a compile error. By pinning to a local type instead of `ProspectsRow`, the board's column set can silently drift from the real table with no typecheck catching it. The file comment even admits the row type "is not regenerated in this slice." This is the one safety property of the reads seam being bypassed.
- **Recommend:** add `desired_group_type: string | null` to `ProspectsRow`, then change `ProspectBoardEntry`/`ProspectRawRow` to `Pick<ProspectsRow, …>` so the pin is real.
- **Safe now?** ✅ Additive type field + `Pick`; no runtime change.

### C2 — Group rubric read skips the `decodeNumericRecord` its siblings run _(Medium ↓ — corrected after PR #798 review)_

> **Correction:** the original "latent NaN / wrong-letter production bug" rationale was **not accurate** and has been removed. `computeGrade` (`lib/admin/health-rubric.ts:252`) already filters to `typeof scores[c.key] === "number" && Number.isFinite(scores[c.key])`, so a malformed jsonb value (`"42"`, `null`) is **dropped at compute time**, not fed into the resolver as `NaN`. This is a **consistency / defense-in-depth** gap, not a Critical correctness bug — downgraded to Medium.

- **Where:** `lib/supabase/group-rubric-grade-reads.ts:24-62` casts raw jsonb `criterion_scores` straight through `.maybeSingle<GroupRubricGradeRow>()` with **no decode**. The leader sibling (`leader-rubric-grade-reads.ts:62-90`) and the accordion reads (`care-accordion-reads.ts:67,104`) **do** call `decodeNumericRecord` for the identical column.
- **Why it matters:** three readers of the same jsonb shape handle it two different ways. The downstream `computeGrade` guard saves correctness today, but the divergence is a maintenance trap — a future reader of this code can't tell whether the decode is load-bearing, and a refactor of `computeGrade` could remove the only thing currently dropping bad values.
- **Recommend:** type the raw row's `criterion_scores` as `unknown` and run `decodeNumericRecord` in `fetchGroupRubricGradeRow`, mirroring the leader reader, so the trust-boundary decode is consistent across all three. (Fold into **M8**, which already groups the three rubric read paths.)
- **Safe now?** ✅ Behavior-preserving.

### C3 — Danger-zone typed-confirmation UI hand-rolled across cards _(Medium ↓ — corrected after PR #798 review)_

> **Correction:** the original "tombstone restore reuses stale confirm across rows" claim was **false** and has been removed. `permanent-delete-card.tsx:300-324` renders each row as `<TombstoneRow key={t.id}>`, and `TombstoneRow` owns its own `useState("")` plus a `useValueChange` that clears the field on success — confirm state cannot leak between tombstones. With the (real but minor) duplication being the only remaining concern, this is a dedup item, not a Critical destructive-flow bug.

- **Where:** the typed-confirmation pattern (a `useState("")` + phrase-match + label + bounded-width input) is re-declared in `permanent-delete-card.tsx`, `clean-slate-card.tsx`, and `attention-reset-card.tsx`.
- **Why it matters:** a future UX/aria change to the confirm affordance has to be made in several places, and the copies have already drifted in input width.
- **Recommend:** extract a `<ConfirmPhraseInput phrase value onChange />` primitive and reuse it across the danger-zone cards.
- **Safe now?** ✅ Pure refactor; each card already has working confirm + `FormStatus` wiring.

### C4 — `test-accounts-panel` `run()` has no catch for a thrown action _(Nice ↓ — corrected after PR #798 review)_

> **Correction:** the original "swallow errors & allow double-submit" framing was **mostly inaccurate** and has been narrowed. Both `TestAccountsPanel` triggers already pass `disabled={pending !== null}` (no double-submit), and `capacity-board.tsx`'s `TargetEditor` already renders `<FormStatus state={state} />` with `disabled={pending}` (errors are surfaced). The capacity-board example was dropped entirely. Only one minor gap remains.

- **Where:** `components/admin/test-accounts-panel.tsx:107-124`. `run()` awaits the action inside `startTransition` and handles the returned `{ok}`/`{errors}` result, but has **no try/catch** — if the action itself _throws/rejects_ (unexpected/network error, not the normal discriminated result), the user gets no feedback and `pending` is never cleared (`setPending(null)` is skipped), leaving the buttons stuck disabled.
- **Why it matters:** a rare but real dead-end — on a thrown action the panel locks up with no error shown. Low severity because the server actions normally return a result object rather than throwing.
- **Recommend:** wrap the `await` in try/catch; on catch, set an error and `setPending(null)` in a `finally`.
- **Safe now?** ✅ Small, localized.

### C5 — Boolean-flag parser drift: `"yes"` = true on leader, false on admin

- **Where:** three copies of the same parser — `lib/admin/validation/shared.ts:113` (`readBooleanFlag`, the canonical export), `lib/leader/validation.ts:59` (`readBool`), `app/(protected)/admin/super-admin/feature-flag-actions.ts:27` (`readBool`). The leader copy also treats `"yes"` as `true`; the others don't.
- **Why it matters:** a form value of `"yes"` means `true` on the leader surface and `false` on admin — a latent correctness trap that depends on which copy runs.
- **Recommend:** import `readBooleanFlag` everywhere; delete the two local copies (or deliberately document the `"yes"` divergence).
- **Safe now?** ✅

### C6 — Password-reset audit RPC: unvalidated `profile_id` + swallowed result

- **Where:** `app/(protected)/admin/super-admin/account-actions.ts:92-95, 128-132`. `profile_id` is accepted on a `length > 0` check only (never uuid-validated), passed to `normalizeUuid` + `super_admin_log_password_reset`, and the RPC **result is ignored** (no `if (error)` / log).
- **Why it matters:** a malformed/missing `profile_id` can silently produce a password reset with **no paired audit row** and no log line — the one place the audit-pairing invariant can quietly fail from app code. (The reset email already sent, so hard-failing the action would be wrong; but the swallowed result must at least be logged.)
- **Recommend:** `isUuid`-check `profile_id` before the RPC; log the RPC failure via the existing `ctx`/`startActionLog` pattern instead of discarding it.
- **Safe now?** ✅

---

## 2. Medium cleanup items

### M1 — Silent fallback on invalid follow-up `priority`

- **Where:** `lib/admin/validation/follow-ups.ts:97-99`. Invalid `priority` silently collapses to `"normal"`; the sibling `type` field (line 96) correctly errors on a bad value.
- **Why it matters:** a typo'd/forged priority is accepted and persisted as `normal` — inconsistent with every other enum field in the layer, and a quiet data-quality loss.
- **Recommend:** push `"Priority must be low, normal, or high."` on guard failure.
- **Safe now?** ✅

### M2 — Two divergent `isIsoDate` implementations

- **Where:** `lib/admin/validation/shared.ts:106` (regex-only) vs `lib/leader/validation.ts:52` (regex + real calendar validation rejecting `2026-13-40`).
- **Why it matters:** admin date validators accept structurally-valid-but-impossible dates the leader validator rejects — different pre-RPC error UX for the same bad input (the DB cast ultimately rejects, but later and less clearly).
- **Recommend:** promote the stricter leader version into `shared.ts` and reuse it on both surfaces.
- **Safe now?** ✅

### M3 — Missing `full_name` length bound in people validators

- **Where:** `lib/admin/validation/people.ts:28, 49`. `validateCreateMinistryAdminPayload` / `validateCreateLeaderProfilePayload` check only `length === 0`, while guest/prospect/group validators cap names at 120 chars.
- **Why it matters:** an unbounded name reaches the RPC — inconsistent with every sibling validator.
- **Recommend:** add a `> 120` check for parity.
- **Safe now?** ✅

### M4 — `group_health` action fabricates an error token, discards the real read error

- **Where:** `app/(protected)/admin/group-health/actions.ts:99-100`. On a ratings pre-read failure it returns `{ error: { message: "ratings_read_failed" } }` — a synthetic token that matches no RPC-error-table entry, so the user sees the generic fallback and the **real** error is dropped (only `rpc_token: "ratings_read_failed"` is logged).
- **Why it matters:** diagnosability loss on a real failure path.
- **Recommend:** thread the real error message through, or register `ratings_read_failed` in the error-message table.
- **Safe now?** ✅

### M5 — Calendar action silently revalidates nothing on missing `group_id`

- **Where:** `app/(protected)/admin/groups/[groupId]/calendar/actions.ts:110-113` (and the archive/restore specs). `groupIdFromRaw` returns `null` for a non-string `group_id`, and the revalidate callback then returns `[]` — the write succeeds but **nothing is revalidated**, leaving stale calendar/check-in pages until a full reload. (Not a security issue: `group_id` here only drives `revalidatePath`; the validated `event_id` is the real target.)
- **Recommend:** validate `group_id` presence up front, or fall back to the static path set rather than `[]`.
- **Safe now?** ✅

### M6 — Duplicated FormData-extraction idiom across ~8 action files

- **Where:** `app/(protected)/admin/launch-planning/actions.ts:72-100`, `leader-pipeline/actions.ts:48`, `leader/actions.ts:48-65`, `leader/follow-up-actions.ts:16-27`, `admin/settings/actions.ts:82-132`, `scenario-actions.ts:85-111`, others. The `input instanceof FormData ? {…} : (input as Record<…>)` branch is hand-rolled even though `lib/shared/form-data.ts` exports `readFormPayload` / `readFormPayloadStringified`.
- **Why it matters:** the shared helper already exists; the copies invite drift.
- **Recommend:** route the plain cases through the shared readers; extract the object-vs-FormData branch into one helper. Leave bespoke per-key coercion (blankable fields, JSON attendance) custom.
- **Safe now?** ✅ for plain cases; ⏳ wait for the bespoke ones.

### M7 — `*_PAGE_LIMIT = 10000` / `range(0, 9999)` duplicated 7 ways

- **Where:** `GUEST_PAGE_LIMIT` (`guest-reads.ts:9`), `MEMBER_PAGE_LIMIT` (`membership-reads.ts:64`), `CALENDAR_EVENTS_PAGE_LIMIT` (`calendar-reads.ts:28`), `PROSPECT_PAGE_LIMIT` (`prospect-reads.ts:62`) are four copies of `10000`; `range(0, 9999)` is hardcoded in `attendance-reads.ts:83`, `follow-up-reads.ts:127`, `shepherd-care-reads.ts:524`.
- **Why it matters:** one concept copy-pasted seven ways; raising the cap means finding all seven, and the `9999` literals won't grep against `PAGE_LIMIT`.
- **Recommend:** one exported `READ_PAGE_LIMIT` (or a `rangeAllRows(query)` helper) in `read-core.ts`; replace all sites.
- **Safe now?** ✅

### M8 — Three diverging rubric-grade read paths + needless `as never` casts

- **Where:** typed+decode-free (`group-rubric-grade-reads.ts`), typed+decode (`leader-rubric-grade-reads.ts`), and `as never`-cast+decode+inline column-string (`care-accordion-reads.ts:48-112`). The accordion versions hand-spell the select string and cast `as never` even though `leader_rubric_grades`/`group_rubric_grades` **are** in the typed schema (`types/database.ts:1165-1182`). Four near-identical `Persisted{Leader,Group}Grade` shapes.
- **Why it matters:** two select strings + four shapes for one table each, able to drift independently; unnecessary `as never` casts hide schema drift.
- **Recommend:** have the accordion `*ForYear` readers reuse the exported `*_RUBRIC_GRADE_COLUMNS`, drop the `as never`, and consolidate the `Persisted*` shapes. (Resolve **C2** first.)
- **Safe now?** ⏳ Wait — privacy-sensitive surface; do under test coverage.

### M9 — Three column-allowlist idioms across `*-reads` files

- **Where:** old `[...] as const satisfies readonly (keyof Row)[]` + `.join(", ")` (`group-reads.ts`, `membership-reads.ts`, `attendance-reads.ts`, `health-reads.ts`, `calendar-reads.ts`, `settings-reads.ts`, `follow-up-reads.ts`); the documented `columns<Row>()` primitive (`care-note-reads.ts`, `shepherd-care-reads.ts`, `prospect-reads.ts`, rubric readers, …); and raw inline strings (`guest-reads.ts:33-36`, `multiplication-reads.ts:15-21`, `settings-reads.ts:106`, `care-note-feed-reads.ts:118-123`).
- **Why it matters:** the old form pins column _names_ to `keyof Row` but doesn't derive the row type from the list (loses half the `columns<>` guarantee); the raw-string form pins nothing. Three idioms for one job make the layer inconsistently safe and hard to navigate.
- **Recommend:** migrate the `as const satisfies` and raw-string allowlists to `columns<Row>()`, file-by-file, each backed by the existing pinning tests.
- **Safe now?** ⏳ Wait — broad; do incrementally.

### M10 — Copy-pasted embed-projector boilerplate (4 near-clones)

- **Where:** `shepherd-care-reads.ts:678-720`, `:904-933`, `:1049-1075`, and `care-note-feed-reads.ts:127-186` all repeat a hand-written `{ x: T | T[] | null }` join type + `for` loop + `unwrapEmbed` + null-skip + push. The broad-note select string is a literal fork of the recent-interaction select.
- **Why it matters:** `unwrapEmbed` killed part of this duplication, but the surrounding projector boilerplate and `T | T[] | null` literals remain; the forked select strings will drift.
- **Recommend:** add an `EmbeddedToOne<T> = T | T[] | null` alias + a `projectJoinRows(rows, project)` helper; share the join-select fragments.
- **Safe now?** ⏳ Wait.

### M11 — Dead read exports + unused `member-care-reads.ts`

- **Where:** `GROUP_COLUMNS` (`group-reads.ts:11`) and `GUEST_COLUMNS` (`guest-reads.ts:54`) are consumed only by their own `*_SELECT` derivation and the pinning tests (the live reads use `GROUP_SELECT` / `GUEST_DIRECTORY_COLUMNS`). All three reads in `member-care-reads.ts` are unused — ~130 lines of `as never`-cast code against tables not in the typed schema, behind a deferred flag, with no caller.
- **Why it matters:** orphaned surface kept green and read during audits; the `as never` casts hide schema drift and it looks live when it isn't.
- **Recommend:** drop the unused `GROUP_COLUMNS`/`GUEST_COLUMNS` exports; for `member-care-reads.ts` either retire to git history or add a clear "intentionally parked, flag-gated" marker.
- **Safe now?** ✅ for the two unused exports; ⏳ wait for `member-care-reads.ts` (confirm flag roadmap with owner).

### M12 — `okf/` is an orphaned parallel doc tree (and its ADR range is stale)

- **Where:** `okf/` (17 files: index.md, log.md, app/, architecture/, auth/, config/, data/, decisions/, glossary/, api/, integrations/, routes/, runbooks/, workflows/). Referenced by **nothing** — not `docs/README.md`, `package.json`, CI, or `.gitignore` (only one mention in `docs/adr/0025`). It's currently accurate but already drifting: `okf/decisions/index.md:13-18`, `okf/log.md`, `okf/app/app-structure.md:48` say the ADR record runs **0001→0027** while the repo has **0001–0033**. `docs/README.md:75-81` claims "everything else is in git history," which `okf/` contradicts.
- **Why it matters:** a full second doc tree an agent may trust as canonical, drifting against the maintained `docs/`.
- **Recommend:** decide ownership — retire `okf/` to git history, **or** link it from `docs/README.md` and bump the `0001→0027` range to `0001→0033`. Then reconcile the `docs/README.md` "all in git history" claim.
- **Safe now?** ✅ for the ADR-range fix; ⏳ wait for retire-vs-keep (owner decision).

### M13 — Top-level `plans/` collides with `docs/plans/` and is stale

- **Where:** `plans/001-…007-*.md` + `plans/README.md` (an "improve-skill" TODO checklist pinned to commit `976ccb82`, 2026-06-19, all rows still `TODO`, referenced by nothing) vs `docs/plans/*` (the durable PRDs `docs/README.md` actually links).
- **Why it matters:** two systems share the name `plans/`, inviting "which is canonical?" confusion; and several of its 001–007 items overlap this backlog.
- **Recommend:** verify 001–007 status; if done/abandoned, retire top-level `plans/` to git history, else rename (e.g. `worklog/`). Keep `docs/plans/` canonical. Fold any still-live items into this file.
- **Safe now?** ⏳ Wait — confirm 001–007 status first.

### M14 — `/admin/plan` vs `/admin/planning` — confusing route pair

- **Where:** `app/(protected)/admin/plan/page.tsx` (Interest Funnel, active spine, ADR 0016) vs `app/(protected)/admin/planning/page.tsx` (Job-2 launch/calendar entry, off-nav, ADR 0013). `lib/nav/route-registry.ts` carries a "candidate to retire into Multiply" product-review note, **but the accepted decision `docs/adr/0033-keep-off-nav-pre-pivot-surfaces.md` explicitly keeps `/admin/planning`** (it's the canonical Planning host / shared loader for its aliases) and makes no route deletions.
- **Why it matters:** one letter apart, completely different surfaces — the single most confusing pair in the route tree. The confusion is a documentation/naming problem, **not** a license to delete: a future agent acting on a "retire" instruction would violate ADR 0033.
- **Recommend (corrected after PR #798 review):** do **not** retire `/admin/planning` against ADR 0033. Instead, **document the `plan` vs `planning` distinction loudly** (in the route registry and/or a short note), and if consolidation is genuinely wanted, raise a **new ADR superseding 0033** rather than acting on the stale registry comment.
- **Safe now?** ⏳ Wait — documentation change is safe; any consolidation needs a new ADR first.

### M15 — Over-Shepherd test user unprovisionable; `findAuthUserByEmail` duped 3×

- **Where:** `supabase/functions/manage-test-auth-users/index.ts` — `TEST_USER_SPECS` includes `overshepherd` (`passwordVar: "TEST_OVERSHEPHERD_PASSWORD"`) and `KNOWN_TEST_EMAILS` lists the OS email, but the `passwords` record (661-666), `listMissingEnv` (115-125), `buildEnvPresence` (171-181), and `REMOVABLE_ROLES` (line 85, `over_shepherd` absent) never handle it, so `enable`/`disable` silently skip the OS user. Separately, `findAuthUserByEmail` is copied in `invite-user/index.ts:211-235` (cap 500, throws), `redeem-invite/index.ts:72-92` (cap 500, throws), and `manage-test-auth-users/index.ts:222-239` (cap **50**, silent `return null`).
- **Why it matters:** the OS test account can't be seeded; the divergent cap/behavior on a shared lookup is a silent false-negative risk on a large tenant.
- **Recommend:** wire `TEST_OVERSHEPHERD_PASSWORD` through the four spots + add `over_shepherd` to `REMOVABLE_ROLES`. Extract one `findAuthUserByEmail` into `functions/_shared/` with a single cap + throw-on-overflow.
- **Safe now?** ✅ for the test-auth fixes; ⏳ wait for unifying the prod-function copies (verify invite-path parity).

### M16 — Form field-clusters duplicated across forms; no shared `FormField`

- **Where:** `forms/group-create-form.tsx` (119-341), `forms/group-edit-form.tsx` (100-304), `launch-planning/scenario-form.tsx` repeat the meeting-schedule cluster (day/time/frequency/week-parity, "show parity only when biweekly") and the conditional capacity field verbatim (~200 LOC). `forms/field-styles.ts` exports class _strings_ but no `FormField` component, so label+input+error is wired by hand everywhere (and hardcodes hex `#923220`/`#3e4f29` at lines 61/71 instead of `P.terra`/`P.sageDeep`).
- **Why it matters:** the single biggest form-side duplication; a field-layout or a11y change touches many call sites.
- **Recommend:** extract `<MeetingScheduleFields>`, `<CapacityField>`, and a `<FormField>` wrapper; swap the hex literals for palette tokens. Adopt incrementally.
- **Safe now?** ✅

### M17 — Input coercion / enum-fallback / error-predicate traps

- **Where:** `settings/multiply-trigger-editor.tsx` (96-111, 145-146) — `parseInt(v) || 0`, no `required`, empty silently becomes 0. `calendar/calendar-occurrence-editor.tsx` (269-274) — unknown `eventType` silently mapped to `"study"`. `check-in-review-shell.tsx:211` — `Object.values(errors).some(Boolean)` misses falsy-but-present error values.
- **Why it matters:** each silently accepts/masks bad data instead of surfacing it.
- **Recommend:** add `required`/client validation on the number inputs; type-guard + log on the enum fallback; use `.some(e => e != null)` for the error check.
- **Safe now?** ✅

### M18 — `follow-ups-shell` assumes `data` is always present _(corrected after PR #798 review)_

> **Correction:** the original `attention-reset-card.tsx` example was **removed** — it already handles the failure case, rendering "Impact preview unavailable — the reset state couldn't be loaded." and disabling resets when its `state` prop is `null` (`attention-reset-card.tsx:95-97`). Only the follow-ups shell remains.

- **Where:** `follow-ups/follow-ups-shell.tsx` assumes its `data` prop is always present (no skeleton/error branch), unlike the recovery cards which distinguish "nothing to show" from "read failed."
- **Why it matters:** if the upstream read degrades, a failed read is indistinguishable from "no follow-ups" — the false-zero trap the read layer is designed to avoid, surfacing in the UI.
- **Recommend:** thread an `errors.*` prop and render the `CouldNotLoad`/`ErrorBanner` pattern used elsewhere.
- **Safe now?** ⏳ Wait — needs data-layer context to thread the error through.

---

## 3. Nice-to-have polish

### N1 — Inline-style sprawl + dual `pastoral`→`ui` styling systems _(large; wait)_

- **Where:** two parallel styling systems coexist — `components/pastoral/*` + `@/lib/pastoral` (legacy `style={{}}`/`CSSProperties`) imported by **126 files**; `PButton` in **70** vs `@/components/ui/button` in **46**; **422 inline `style={{}}` across 69 files**. Worst offenders: `guests/guests-shell.tsx`, `capacity-board.tsx`, `launch-planning/scenarios-panel.tsx`, `planning-by-leader-list.tsx`, `group-assignments-manager.tsx`, `calendar/calendar-occurrence-editor.tsx`.
- **Why it matters:** the largest single source of style duplication/inconsistency; defeats theming and the design system.
- **Recommend:** converge on `@/components/ui` + Tailwind tokens, component-by-component. Strategic, coordinate as one effort.
- **Safe now?** ⏳ Wait — large; sequence after the dedup primitives land.

### N2 — Small UX / a11y polish bundle

- **Where:** `admin-master-calendar-drawer.tsx:50` (`aria-describedby={undefined}` disables the dialog description — remove it / supply a real id); `forms/invite-workflow-form.tsx` copy button (~434) and `planning-by-leader-list.tsx` (185-203) missing `aria-label`s on icon-only controls; `guests-shell.tsx` / `follow-ups-shell.tsx` hand-roll near-identical empty-state text while `EmptyState` is already imported; index-as-key in `lg/DetailPageSkeleton.tsx:56` and `scenarios-panel.tsx:494`.
- **Why it matters:** small but real accessibility + consistency gaps.
- **Recommend:** remove the description-disabling prop, add the aria-labels, standardize on the `EmptyState` primitive, use stable keys.
- **Safe now?** ✅

### N3 — Duplicated small helpers

- **Where:** `guests/guest-card.tsx` (352-360) reimplements `formatDate` while the app uses `formatIsoDateOr` (`care/care-leader-panel.tsx:271`, `care/notes-feed-shell.tsx:137`); `shepherd-care/care-action-forms.tsx` (50-56) has a local `todayLocalIso()`; tab→URL `history.replaceState` logic is duplicated in `person-detail-shell.tsx` (80-85) and `people-management-shell.tsx` (98-112).
- **Recommend:** delete the local `formatDate`/`todayLocalIso`; move the date helper to `@/lib/shared/date`; extract a `useTabUrlState()` hook.
- **Safe now?** ✅

### N4 — Redundant `as` casts / loose RPC arg types

- **Where:** `leader/follow-up-actions.ts:45` (`value.status as LeaderUpdateFollowUpStatus` — already narrowed); `admin/settings/actions.ts:265, 373` (`as unknown as …` bridging a typed value to a loose `Record<string,unknown>` RPC arg).
- **Why it matters:** the casts are safe but signal the RPC arg-map types are looser than the validator outputs.
- **Recommend:** tighten the RPC arg shapes to the validated types and drop the casts.
- **Safe now?** ✅

### N5 — Dead props, magic numbers, raw `<button>` vs `Button`

- **Where:** unused props — `group-health-editor.tsx:45` (`onRequestClose` never called), `settings-shell.tsx:202` (`isSuperAdmin` to `SystemPanel`); magic numbers — `maxLength={2000}` hardcoded in `scenario-form.tsx` & `multiplication-planner.tsx`, spacing literals in `group-assignments-manager.tsx`, `NOTES_PREVIEW_CHARS=140` local to `guest-card.tsx`; **39 files** still use raw `<button>` instead of the `Button` primitive (e.g. `group-assignments-manager.tsx:438` raw vs `:441` helper).
- **Recommend:** remove/wire dead props; hoist magic numbers to constants/validation modules; converge raw `<button>` on `Button` per-file.
- **Safe now?** ✅

### N6 — Edge-fn debug logs + lingering `staff_viewer` reference

- **Where:** `manage-test-auth-users/index.ts` (679, 732-737, 816-823, 842-852) ships `auth.header`/`auth.jwt`/`auth.diagnose` troubleshooting `console.log`s (no secrets, but noisy/unstructured vs the `log.*` convention). `supabase/migrations/20260518000000_phase4_rls.sql:62,72` (`auth_is_admin_or_staff()`) still names the deprecated `staff_viewer` role retired by `20260531140000` — confirm no live policy still admits a `staff_viewer` session.
- **Recommend:** drop the debug logs (or move to structured `log.*`); add a verification task confirming no live `staff_viewer` policy (don't edit applied migrations).
- **Safe now?** ✅ for the logs; ⏳ wait / verify-only for the migration note.

### N7 — Reader convention drift

- **Where:** ad-hoc error-precedence chains (`overview-reads.ts:72-76`, `settings-reads.ts:356-361`, `care-accordion-reads.ts:301-309`, `multiplication-reads.ts:56-63` defines a _local_ `firstReadError`) instead of `readBatch`/`firstError`; `fetchCapacityBoardExtras` (`multiplication-reads.ts:312-390`) returns a bespoke object with an inline `error` field instead of `ReadResult<T>`; mixed `import "server-only"` presence, mixed `ReadClient` vs `AppSupabaseClient` alias, mixed `./read-core` vs `@/lib/supabase/read-core`, mixed `data === null || data === undefined` vs `data == null`.
- **Why it matters:** the consolidation the seam advertises isn't applied uniformly; no single trap, but it raises the cost of every edit.
- **Recommend:** route the chains through `readBatch`; return `ReadResult` from `fetchCapacityBoardExtras`; normalize the client alias / import style / null check. Do alongside M9.
- **Safe now?** ✅ (mostly mechanical; the `ReadResult` signature change is caller-facing — ⏳ wait that one).

### N8 — Migrate hand-rolled pages onto the `adminPage()` runner

- **Where:** `care`, `group-health`, `calendar`, `launch-planning`, `planning` hand-roll guards/banners and miss the standardized `measureReadBundle` read-timing; `plan`, `multiply`, `leader-pipeline`, `guests`, `check-ins`, `groups`, `people` use the ADR-0028 `adminPage()` runner.
- **Why it matters:** five surfaces drift from the standardized page construction (`frozenBanner`, header streaming, read-timing).
- **Recommend:** migrate the manual pages onto `adminPage()` where they fit; document the intentional exceptions otherwise. Incremental.
- **Safe now?** ✅

---

## Notes — reviewer claims verified false / demoted (not in backlog)

### Corrections from the PR #798 (Codex) review — verified against source

The PR review caught four inaccuracies in the original draft. Each was
re-checked against the code and the backlog corrected:

- **C2 latent-NaN rationale — removed.** `computeGrade` (`lib/admin/health-rubric.ts:252`)
  already filters to `typeof === "number" && Number.isFinite`, so malformed jsonb is
  dropped, not fed as `NaN`. C2 downgraded Critical → Medium (consistency only).
- **C3 stale-confirm restore bug — removed.** `permanent-delete-card.tsx:300-324`
  keys each `TombstoneRow` by id with its own `useState` + `useValueChange` reset;
  confirm state can't leak between rows. C3 downgraded to a Medium dedup item.
- **C4 swallow-errors / double-submit — narrowed.** Both `TestAccountsPanel`
  triggers already use `disabled={pending !== null}`, and `capacity-board.tsx`
  already renders `<FormStatus>`. C4 downgraded to Nice and narrowed to the one
  real gap (no try/catch around the thrown-action path).
- **M14 retire `/admin/planning` — reframed.** Retirement contradicts the accepted
  ADR 0033 ("keep, off-nav"); changed to "document the distinction / raise a new ADR."
- **M18 attention-reset example — removed.** It already renders "Impact preview
  unavailable…" on `state === null` (`attention-reset-card.tsx:95-97`); only the
  follow-ups shell remains.

### From the original scan

These were flagged by a sub-reviewer and **discarded after checking source**,
recorded so they aren't re-raised:

- **"Missing `okFields` breaks the audit trail"** — false. `okFields` adds _log_
  fields only; the paired `audit_events` row is written inside the RPC regardless.
- **"Orientation/account hand-rolled actions break audit pairing"** — false. They
  log via `startActionLog`/`ctx.finish` and call RPCs that write their own audit rows.
- **"Calendar revalidate path injection (CRITICAL)"** — overstated; recharacterized
  as the benign M5 (the create path uses the uuid-validated `group_id`; a bogus
  `revalidatePath` is a no-op).
- **"`ARCHIVE_PROSPECT_SPEC` missing `fields`"** / **"`welcome` duplicates `account`"**
  — both false (verified the code).
- **check-in-form "stale attendance race"** — false; `attendance` is `useMemo`-derived
  and submitted via a hidden input, consistent at submit time.
- **`useValueChange` "non-standard pattern"** — it's an established repo pattern
  (14 files), intentional; not a defect.
- **Validator "unguarded `as` casts"** — all follow a preceding enum guard (the
  standard safe pattern); sound.
- **Rate-limit fail-open** (`lib/security/rate-limit.ts`) — deliberate & documented
  (don't take down password-reset on a Redis hiccup); an accepted risk, not a bug.

---

_Generated by a five-agent desloppify scan. No source files were modified._
