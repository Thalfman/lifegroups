# Phase 2 Review — remaining `lib/*` core logic

Working notes. Read-only review against `coding-standards` + `/simplify`. ~95
source files across `lib/dashboard`, `lib/observability`, `lib/usage`,
`lib/auth`, `lib/leader`, `lib/over-shepherd`, `lib/account`, `lib/crypto`,
`lib/security`, `lib/calendar`, `lib/forms`, `lib/nav`, `lib/pwa`, `lib/hooks`,
`lib/support`, `lib/home`. Tests excluded (Phase 6).

**Headline:** even cleaner than Phase 1. No `any`, no `select("*")`, no
service-role usage, no hardcoded UUIDs/emails. The auth/session/guard core is
already an exemplary DRY consolidation and is off-limits (category C). Crypto and
security surfaces are deliberately exempt from cosmetic reflow (hash-pinned /
security-load-bearing). Findings are small.

---

## (A) Safe auto-fixes — behavior-preserving

1. **`lib/leader/group-note-validation.ts:19-27`** — local `isRecord` duplicates
   `@/lib/shared/validation-primitives`; local `trimString` duplicates the admin
   shared one. Import the shared `isRecord` (the sibling `validation.ts:11`
   already does) and drop the copy. Pure helpers, behavior-identical.
2. **`lib/calendar/occurrences.ts:359-380`** — magic `42` (6×7 grid) hardcoded in
   comment + loop bound. Extract `WEEKS_IN_GRID` / `GRID_CELLS`.
3. **`lib/calendar/occurrences.ts:217`** — magic `7` ("first calendar week").
   Name it (`DAYS_IN_FIRST_WEEK`) or comment the literal.
4. **`lib/dashboard/groups-table-sort.ts:280`** — typo "in lockstock" →
   "lockstep" (`:81` spells it right). **`:282`** stray blank `//` splits a doc
   comment mid-sentence; merge.
5. **`lib/dashboard/badge-map.ts:36/43`** — lines >80 cols; Prettier will reflow
   on touch (the pre-commit hook handles it).
6. **`lib/dashboard/groups-table-sort.ts:134-139`** `compareOptionalDimension` —
   `if (verdict !== null) { if (verdict !== 0) return verdict; return 0; }`
   collapses to `if (verdict !== null) return verdict;`. Behavior-preserving.
7. **`lib/calendar/occurrences.ts:325-327`** — drop the `override!` non-null
   assertions in `mergeOverrides` by guarding (`if (!override) continue;`).
   Provably safe today; removes the assertions.
8. **`lib/dashboard/needs-attention.ts:203` & `setup-recovery.ts:36`** — two
   sibling helpers both named `plural` with different signatures/returns. Rename
   to disambiguate (`pluralWord` vs `countWithNoun`) or unify into one shared
   util. Low value; reduces confusion.

---

## (B) Needs-judgment — decide before applying

1. **`lib/leader/validation.ts:96-140` `readAttendance`** — in-place index
   mutation + `findIndex` linear scan (`entries[existing] = …` / `entries.push`).
   A `Map<string, entry>` keyed dedupe → `[...map.values()]` removes the mutation
   and is O(n). Behavior-preserving; cleaner. _Recommended._
2. **`lib/security/rate-limit.ts:29-72`** — `build()` and `buildRedeemLimiter()`
   each re-read/trim/null-check the Upstash env and `new Redis(...)`. Extract
   `getRedis(): Redis | null`. Mechanical dedupe that touches **no** limit/window/
   prefix/fail-open value — but it lives in `lib/security`, so flagging for an
   explicit OK.
3. **`lib/security/rate-limit.ts:27/89/133`** — a single module-level
   `disabledWarned` gates BOTH the invite-redeem and forgot-password
   `rate_limit_disabled` warnings, so the second route's "unprotected" signal can
   be silently dropped. Per-route flags (or a `Set`) restores the signal but
   changes observability behavior in security code — needs a decision.
4. **`lib/leader/validation.ts:52-73`** — `isIsoDate`/`readBool`/`readOptionalString`
   reimplemented vs the shared/admin canonical home, but **intentionally
   divergent** (leader `isIsoDate` adds a real-calendar round-trip; `readBool`
   accepts `"yes"`). The shared module's header already sanctions per-surface
   strictness. Recommend: leave split, keep as a documented decision (no merge).
5. **`lib/forms/action-form-view.ts:29-33`** — `formStatusView` returns `none`
   for a successful action with no `successText`, indistinguishable from "idle".
   Documented as intentional; only change if a caller needs success-vs-idle —
   audit callers first. Defer.
6. **Result-shape vocabularies** — `lib/account/validation.ts` (`error: string`),
   `lib/leader/*` (`errors: string[]`), `lib/over-shepherd/coverage.ts`
   (`{ data; error }`) differ. Each locally coherent; no action unless we want
   the account validators on the shared `ValidationResult`. Defer.

---

## (C) Invariant-adjacent — DEFER (do not touch)

- **Auth/session/guard core** — `lib/auth/session.ts` (`getCurrentSession` ~111
  lines; `resolveGuardVerdict`/`require*` family), `lib/auth/roles.ts`,
  `lib/auth/leader-surface-flag.ts` fail-closed `as never` RPC. Role resolution +
  oversight ladder + leader-surface gate; already optimally DRY. No refactor.
- **`lib/crypto/private-notes.ts` / `encoding.ts`** — DEK/passkey/recovery crypto
  (ADR 0003), hash-pinned verifiable surface. Do not reflow lines or touch the
  `as Uint8Array<ArrayBuffer>` / PRF-extension casts; reformatting changes the
  published source hash.
- **`lib/security/headers.ts`** — CSP `'unsafe-inline'`/report-only is the
  documented v1 posture; do not weaken directive values. `lib/security/edge-...`
  allowlists unchanged.
- **Graceful-degradation branches** — `lib/dashboard/queries.ts` (`?? []` /
  `available:false`), `shepherd-care-summary.ts`, `launch-planning-snapshot.ts`,
  `lib/home/hub-stats.ts` (`allSettled` per-stat degrade),
  `lib/account/orientation.ts`. The two-wave sequential awaits in `queries.ts`
  have a real data dependency — not a missed `Promise.all`.
- **Structured-logging field names** (`lib/observability/*`: `event`/`outcome`/
  `actor_role`/`route_or_action`/`latency_ms`/`request_id`/`error_code`) are a
  contract — no renames.
- **`lib/over-shepherd/read-models.ts:49`** `Omit<…,"admin_summary">` structurally
  enforces the admin-note exclusion — keep.

---

## Recommended fix set for the Phase 2 PR

Apply **all of (A)** (items 1-8 — cosmetic + behavior-preserving micro-fixes) plus
**(B) #1 (`readAttendance` Map rewrite)** and **(B) #2 (`getRedis` dedupe)**. Leave
**(B) #3-#6** as deferred/judgment notes in the PR body (the `disabledWarned`
change in particular alters security-observability behavior — better as a
deliberate follow-up). (C) untouched. This PR is small.
