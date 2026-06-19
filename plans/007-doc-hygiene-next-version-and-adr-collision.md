# Plan 007: Fix the Next.js version docs and the duplicate ADR 0022 number

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the next
> step. If anything in the "STOP conditions" section occurs, stop and report -
> do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
> `git diff --stat 976ccb82..HEAD -- CLAUDE.md docs/architecture docs/adr supabase/migrations`

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `976ccb82`, 2026-06-19

## Why this matters

Two documentation defects, both cheap, both with a real "actively wrong" cost:

1. **Stale runtime version.** `package.json` pins `next: "^16.2.9"` and the app
   uses Next 16 conventions (the renamed `proxy.ts` middleware, Turbopack build),
   but several docs still say "Next.js 15". A reader trusting the docs gets the
   wrong major version.
2. **Duplicate ADR number.** Two different decisions share the number 0022:
   `0022-multiply-unifies-plan-readiness-leaders.md` and
   `0022-admin-jsonb-write-reguard-and-audit-locks.md`. Searching "ADR 0022"
   returns two unrelated records, and code comments citing "ADR 0022" are
   ambiguous about which they mean.

## Current state

Stale "Next.js 15" references (the body of these same docs already says
"Next 16" elsewhere, so this is an internal contradiction):

- `CLAUDE.md:19-20` - "Next.js\n15 (App Router)" (wrapped across two lines).
- `docs/architecture/ARCHITECTURE.md:28` - "Next.js 15 App Router".
- `docs/architecture/system-architecture.drawio:10` and `:31` - "Next.js 15" in
  diagram cell text.
- (`README.md` had no "Next 15" match at planning time - confirm with the grep
  below in case of drift.)

The ADR 0022 collision:

- `docs/adr/0022-multiply-unifies-plan-readiness-leaders.md` - part of the
  2026-06 pivot ADR narrative (0016 -> 0024). `CLAUDE.md:223` indexes **this** as
  0022, and ~10 code comments cite "ADR 0022" for the multiply / Julian-fed
  headcount feature (`components/admin/multiply/*`, `lib/admin/multiplication*.ts`,
  `lib/admin/rpc.ts`, `lib/admin/validation/launch-planning.ts`,
  `components/lg/admin/dashboard/LaunchPlanningOverviewCard.tsx`, and two
  `lib/admin/__tests__/multiplication*.test.ts` describe strings).
- `docs/adr/0022-admin-jsonb-write-reguard-and-audit-locks.md` - an orthogonal
  infrastructure decision (DB re-guards jsonb writes + serialises the audit
  snapshot). Its "ADR 0022" citations are narrow: the regression test
  `lib/admin/__tests__/audit-before-advisory-locks-migration.test.ts` (which
  asserts the migration's documentary header cites "ADR 0022"), plus that
  migration's header comment under `supabase/migrations/`.

Next free ADR number: **0025** (0024 is the highest in `docs/adr/`).

Recommended resolution: renumber the **jsonb-write** ADR to **0025**. It is the
one outside the pivot narrative and has the fewest, most-contained citations, so
the multiply citations (the majority) stay correct on 0022 and need no edits.

## Commands you will need

| Purpose                  | Command                                                                                                             | Expected on success                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Find stale Next 15       | `rg -n "Next\.?js? ?15\|Next 15" CLAUDE.md README.md docs`                                                          | lists every stale ref                                 |
| Find jsonb-ADR citations | `rg -n "ADR ?0022\|adr/0022" supabase/migrations lib/admin/__tests__/audit-before-advisory-locks-migration.test.ts` | the citations to renumber                             |
| Confirm no broken links  | `rg -n "0022-admin-jsonb-write-reguard-and-audit-locks" .`                                                          | only the renamed file + updated refs                  |
| Markdown/lint sanity     | `npm run lint`                                                                                                      | exit 0                                                |
| Full unit/fitness lane   | `npm run test:run`                                                                                                  | exit 0 (the audit-locks regression test still passes) |

## Scope

**In scope**:

- `CLAUDE.md`, `docs/architecture/ARCHITECTURE.md`,
  `docs/architecture/system-architecture.drawio` (Next version text only)
- `README.md` (only if the grep finds a stale ref)
- `docs/adr/0022-admin-jsonb-write-reguard-and-audit-locks.md` -> renamed to
  `docs/adr/0025-admin-jsonb-write-reguard-and-audit-locks.md`
- `lib/admin/__tests__/audit-before-advisory-locks-migration.test.ts` (its
  "ADR 0022" assertions/comments)
- the one migration under `supabase/migrations/` whose **header comment** cites
  "ADR 0022" for the audit-locks decision (comment text only - **never** the SQL)
- a `docs/adr/` index/README, if one lists the renamed file
- `plans/README.md` status row

**Out of scope** (do NOT touch):

- The ~10 multiply "ADR 0022" citations - they correctly refer to the file that
  keeps 0022. Leave every one.
- Any migration **SQL** (only a header comment may change, and only if it cites
  the renumbered decision).
- The content/decisions of either ADR - this is renumbering, not rewriting.

## Git workflow

- Branch: `claude/doc-hygiene-next-and-adr-<id>`.
- Use `git mv` for the ADR rename so history is preserved.
- Commit Step 1 and Step 2 separately (they are independent).
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Correct the Next.js version in docs (mechanical, safe)

Run `rg -n "Next\.?js? ?15|Next 15" CLAUDE.md README.md docs` and change each
"Next.js 15" / "Next 15" to "Next.js 16" / "Next 16". Note `CLAUDE.md:19-20`
wraps the version across a line break ("Next.js" then "15") - fix the "15".

**Verify**: `rg -n "Next\.?js? ?15|Next 15" CLAUDE.md README.md docs` -> no
matches.

### Step 2: Resolve the ADR 0022 collision (renumber the jsonb ADR to 0025)

> Decision gate: the default below renumbers the **jsonb-write** ADR to 0025,
> which keeps `0022 = multiply` (what the docs already assume) and touches the
> fewest files. If the operator instead wants the _multiply_ ADR renumbered,
> STOP - that is a larger change (~12 code-comment sites) and needs their
> explicit say-so.

1. Rename the file:
   `git mv docs/adr/0022-admin-jsonb-write-reguard-and-audit-locks.md docs/adr/0025-admin-jsonb-write-reguard-and-audit-locks.md`
2. Update that ADR's own internal cross-references to its number if any ("This ADR
   0022..." style) to 0025.
3. Update the **jsonb-decision** citations only (found via the command above):
   - In `lib/admin/__tests__/audit-before-advisory-locks-migration.test.ts`,
     change the "ADR 0022" strings (and the assertion's expected substring) to
     "ADR 0025", and update the migration header it checks.
   - In the corresponding migration file under `supabase/migrations/`, update the
     **header comment** "ADR 0022" -> "ADR 0025". Do not touch the SQL.
4. Update any `docs/adr` index/README entry for the renamed file.
5. Leave every multiply "ADR 0022" citation untouched.

**Verify**:

- `rg -n "0022-admin-jsonb-write-reguard-and-audit-locks" .` -> no matches (old
  filename fully gone).
- `npx vitest run lib/admin/__tests__/audit-before-advisory-locks-migration.test.ts`
  -> exit 0 (the regression test now expects ADR 0025 and the migration header
  matches).
- `rg -n "ADR ?0022" docs/adr` -> only the multiply ADR file remains on 0022.

### Step 3: Run the lane

`npm run lint && npm run test:run`

**Verify**: both exit 0.

## Test plan

- No new tests. The existing `audit-before-advisory-locks-migration.test.ts` is
  the regression guard; it must still pass after the number changes in lockstep.
- Verification: `npm run test:run` -> all pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `rg -n "Next\.?js? ?15|Next 15" CLAUDE.md README.md docs` returns no matches.
- [ ] `docs/adr/0025-admin-jsonb-write-reguard-and-audit-locks.md` exists; the
      `0022-admin-*` filename is gone.
- [ ] `rg -n "0022-admin-jsonb-write-reguard-and-audit-locks" .` returns no matches.
- [ ] The multiply ADR is still `0022` and its ~10 code citations are unchanged.
- [ ] `npm run lint` exits 0.
- [ ] `npm run test:run` exits 0 (audit-locks regression test green).
- [ ] No migration SQL changed (`git diff supabase/migrations` shows only a
      comment line, if anything).
- [ ] `plans/README.md` status row for Plan 007 is updated.

## STOP conditions

Stop and report back if:

- The operator wants the _multiply_ ADR renumbered instead - different, larger
  change.
- Renumbering would require editing migration **SQL** (not just a comment) - it
  should not; if it seems to, you have the wrong migration.
- `rg` finds "ADR 0022" jsonb citations outside the test + one migration header
  (i.e. the blast radius is larger than documented) - report the extra sites
  before proceeding.
- Any verification command fails twice after a reasonable fix attempt.

## Maintenance notes

- ADR numbers are a sequential ledger; the collision happened because two ADRs
  were authored against the same number. When adding an ADR, take the next free
  number and grep `docs/adr/` first.
- Step 1 (version docs) is independent and safe to land alone if Step 2 stalls on
  the decision gate.
- A reviewer should confirm only jsonb-decision citations moved and the build/test
  lane is green.
