# Coding-standards review — 2026-06-16

A whole-repo review against a generic coding-standards rubric (naming,
readability, immutability, KISS/DRY/YAGNI, error handling, code smells), run on
top of — not in place of — the repo's own hard invariants in
[`CLAUDE.md`](../../CLAUDE.md) and [`AGENTS.md`](../../AGENTS.md). The repo
invariants (named-column reads, RPC-only writes, paired `audit_events`,
role-based auth, soft-delete) were treated as correct and not re-litigated.

**Scope:** `lib/`, `components/`, `app/` (~150k LOC, ~950 TS/TSX files).
**Method:** mechanical scan for objective signals + three parallel deep
qualitative passes.

## Headline

The repo is in unusually good shape. Mechanical hygiene is effectively perfect,
and the deep passes turned up only a handful of minor, optional cleanups. **No
high-severity findings.** The single finding above "polish" severity is one
genuine DRY issue (a duplicated date helper).

## Mechanical hygiene — clean

| Signal                       | Result                                                                      |
| ---------------------------- | --------------------------------------------------------------------------- |
| `select("*")` call sites     | **0** (all 25 matches are comments documenting the ban)                     |
| `: any` / `as any` types     | **0** (all 8 matches are the English word "any" in comments)                |
| `console.*` calls            | **7, all legitimate** — the logger sink, env-config error, error boundaries |
| `@ts-ignore` / `@ts-nocheck` | **0**                                                                       |
| TODO/FIXME/HACK              | **1**                                                                       |

The hard invariants from `CLAUDE.md` / `AGENTS.md` genuinely hold.

## `lib/` findings

1. **DRY — duplicated date helper (med).** An identical "add N days to a
   `YYYY-MM-DD` string" helper is reimplemented near-verbatim in 5+ modules —
   `dashboard/queries.ts:93`, `calendar/occurrences.ts:126`,
   `dashboard/fallback-data.ts:30`, `admin/overview-period.ts:71`,
   `admin/check-ins.ts:337` — with close variants in `launch-planning.ts:328`
   (`subtractDaysIso`) and `validation/shepherd-care.ts:61` (`addDaysToIsoDate`).
   `lib/shared/church-time.ts` is already the shared home for date helpers
   (`isoWeekStart`, `churchTodayIso`). **Fix:** export one `addDaysIso` /
   `subtractDaysIso` there and import everywhere. _This is the one finding worth
   acting on with confidence._
2. **Long function (low-med).** `lib/supabase/read-models.ts:1052`
   `fetchMultiplicationCandidatesForAdmin` (~225 lines) — extract a
   `firstError([...])` guard helper and the index-builders.
3. **Long function (low-med).** `lib/admin/check-ins.ts:417`
   `fetchAdminWeeklyCheckInReview` (~200 lines) — extract `buildGroupReviewRow(...)`
   and `summarizeReview(rows)`.

Everything else in `lib/` (magic numbers, nesting, naming, error handling,
`permanent-deletion.ts`'s ~22 entity entries) was verified clean/intentional.

## `components/` findings

1. **DRY — planner forms (med).**
   `components/admin/multiplication/multiplication-planner.tsx:342-735` —
   `CandidateEditForm` and `AddCandidateForm` duplicate ~6 near-identical field
   blocks. **Fix:** extract shared field components (the file already does this
   for `TypeField` / `WillingGroupField`).
2. **Long component (low-med).**
   `components/calendar/calendar-occurrence-editor.tsx:152` `EditorModal`
   (~330 lines) — split out the dialog header and the field grid.
3. **Scoped ids (low).**
   `components/admin/settings/multiply-trigger-editor.tsx:623` `PillarInputs`
   hardcodes element ids that work only because one form renders at a time;
   derive from a prefix.
4. **Inline ternary logic (low).** `components/admin/people-directory.tsx:235` —
   extract an `emptyProfileMessage(...)` helper out of the JSX.

State/memoization discipline (functional updaters, `[...arr].sort` copies,
sentinel-stable memo deps) was verified clean throughout.

## `app/` findings (all low)

1. **DRY (low).**
   `app/(protected)/admin/super-admin/invite-user-actions.ts:223` — the two
   error branches build near-identical `buildErrorLines({...})` objects; extract
   `errorLinesFrom(source, status)`.
2. **Nit (low).** `invite-user-actions.ts:98` — inline JWT-redaction regex could
   be a named `JWT_PATTERN` constant.
3. **Borderline (low).** `invite-user-actions.ts:187` — `runInvite` (~90 lines)
   is long but flat/sequential; only split if it grows.

Verified clean: pipeline conformance (every write routes through the shared
`runAdminWriteAction` / `runLeaderWriteAction` runner), zero real `any`/casts
(only legitimate RPC-boundary coercions), thin page loaders, hoisted constants,
graceful read-failure handling. One suspicious `revalidatePath` was confirmed
correct (`[kind]/[personId]` where `kind` is `"profile" | "member"`).

## Recommended action

Consolidate the duplicated `addDaysIso` / `subtractDaysIso` date helper into
`lib/shared/church-time.ts` (lib finding #1). The remaining items are optional
readability extractions, not defects.

## Resolved — 2026-06-16

All findings above were implemented on branch
`claude/coding-standards-docs-review`:

- **`lib` #1 (DRY date helper):** `addDaysIso` / `subtractDaysIso` now live in
  `lib/shared/church-time.ts` and are imported everywhere; `launch-planning.ts`
  keeps its guarded null-returning wrapper as a deliberate stronger-contract
  exception. Covered by new unit tests.
- **`lib` #2/#3 (long functions):** `fetchAdminWeeklyCheckInReview` split into
  `buildGroupReviewRow` + `summarizeReview`; `fetchMultiplicationCandidatesForAdmin`
  split into a `firstReadError([...])` guard and named index-builders.
- **`components` #1 (planner forms):** the add/edit candidate forms now share
  one set of field components keyed by an id prefix.
- **`components` #2/#3/#4:** calendar `EditorModal` split into `EditorHeader` +
  `EditorStatusTypeFields`; `PillarInputs` derives its checkbox id from
  `useId()`; `people-directory` empty-state ternaries lifted into
  `emptyProfileMessage` / `emptyMemberMessage`.
- **`app` #1/#2:** the two invite-error branches share an
  `errorLinesFrom(source, status)` helper; the JWT-redaction regex is now a
  named `JWT_PATTERN` constant. (`#3 runInvite` left as-is per the note.)

Verified green: `lint`, `typecheck`, and `test:run` (full unit suite).
