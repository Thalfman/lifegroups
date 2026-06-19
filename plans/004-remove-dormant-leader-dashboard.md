# Plan 004: Remove the dormant leader-dashboard orchestrator

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the next
> step. If anything in the "STOP conditions" section occurs, stop and report -
> do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
> `git diff --stat 976ccb82..HEAD -- lib/dashboard/queries.ts lib/dashboard/types.ts lib/dashboard/fallback-data.ts lib/dashboard/__tests__/fallback-data.test.ts lib/supabase/read-models.ts docs/architecture/ARCHITECTURE.md`
>
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: MED
- **Depends on**: none (but this plan **supersedes** Plan 001's Steps 2-3; run
  this one first)
- **Category**: tech-debt
- **Planned at**: commit `976ccb82`, 2026-06-19

## Why this matters

`lib/dashboard/queries.ts` exports `getLeaderDashboardData` (and its private
helper `buildLeaderGroupDashboard`), a ~240-line per-group leader dashboard
orchestrator. **No live route calls it.** The only references are its own
definition, one fallback unit test, and documentation. The live leader landing
page (`app/(protected)/leader/page.tsx`) loads no dashboard data through it.

This dormant path is the _only_ place in the repo where a leader-context read
pulls the full `groups` row through `fetchGroupsByIds` (which includes the
admin-private `admin_notes` column). Plan 001 exists to make that read
leader-safe. Deleting the dead path removes the exposure by subtraction, drops
~240 lines from an 800-line god-module, and makes Plan 001 Step 2 unnecessary.

Do this **only** if the team does not intend to wire the leader dashboard to
this function imminently. If they do, run Plan 001 instead and close this one as
REJECTED.

## Current state

- `lib/dashboard/queries.ts` - the god-module for dashboard read orchestration.
  Contains the dead leader path:
  - `getLeaderDashboardData(client, { assignedGroupIds })` - exported, **no live
    caller**.
  - `buildLeaderGroupDashboard(client, group, calendarEvents)` - private; called
    only by `getLeaderDashboardData`.
  - `computeAttendanceRhythm(...)` - private helper; called only by
    `buildLeaderGroupDashboard`.
- `lib/dashboard/__tests__/fallback-data.test.ts` - imports `getLeaderDashboardData`
  and `LEADER_FALLBACK` and has one leader-path test case (lines 34-38).
- `lib/dashboard/types.ts` - defines `LeaderCurrentWeek`, `LeaderGroupDashboard`,
  `LeaderDashboardData` (and the leader-only sub-types they reference).
- `lib/dashboard/fallback-data.ts` - defines `LEADER_FALLBACK: LeaderDashboardData`.
- `lib/supabase/read-models.ts:~435` and `docs/architecture/ARCHITECTURE.md:~107`
  - documentation that names the deleted symbols.

Proof the path is dead (run this first, before any edit):

```
rg -n "getLeaderDashboardData|buildLeaderGroupDashboard" app components lib --glob '!**/__tests__/**'
```

Expected: matches **only** in `lib/dashboard/queries.ts` (the definitions) and
`lib/supabase/read-models.ts` (a doc comment). If any `app/**` or non-test
`components/**`/`lib/**` file calls `getLeaderDashboardData`, **STOP** - the path
is live and this plan does not apply.

Current excerpts to confirm before editing:

```ts
// lib/dashboard/queries.ts:809
export async function getLeaderDashboardData(
  client: AppSupabaseClient | null,
  options: { assignedGroupIds: readonly string[] }
): Promise<DashboardResult<LeaderDashboardData>> {
  if (!client) return fallback(LEADER_FALLBACK);
  // ... calls buildLeaderGroupDashboard per group ...
}
```

```ts
// lib/dashboard/__tests__/fallback-data.test.ts:34
it("leader read returns the fallback shape, tagged as fallback", async () => {
  const result = await getLeaderDashboardData(null, { assignedGroupIds: [] });
  expect(result.source).toBe("fallback");
  expect(result.data).toEqual(LEADER_FALLBACK);
});
```

Repo conventions to match:

- `tsconfig.json` does **not** set `noUnusedLocals`, so orphaned imports will
  **not** fail `npm run typecheck`. They are caught by `npm run lint`. Run lint.
- `toFollowUpItem` and the `FollowUpItem` type are **shared** with the live admin
  dashboard (`lib/dashboard/admin-group-model.ts`). Do **not** delete them.

## Commands you will need

| Purpose                       | Command                                                                                                  | Expected on success                                 |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Dead-path proof               | `rg -n "getLeaderDashboardData\|buildLeaderGroupDashboard" app components lib --glob '!**/__tests__/**'` | matches only in queries.ts + read-models.ts comment |
| Lint (catches orphan imports) | `npm run lint`                                                                                           | exit 0, no errors                                   |
| Typecheck                     | `npm run typecheck`                                                                                      | exit 0, no TypeScript errors                        |
| Full unit/fitness lane        | `npm run test:run`                                                                                       | exit 0, all Vitest tests pass                       |

## Scope

**In scope** (the only files you should modify):

- `lib/dashboard/queries.ts`
- `lib/dashboard/__tests__/fallback-data.test.ts`
- `lib/dashboard/types.ts` (only the leader-only types proven unreferenced)
- `lib/dashboard/fallback-data.ts` (only `LEADER_FALLBACK`, if proven unreferenced)
- `lib/supabase/read-models.ts` (doc comment wording only)
- `docs/architecture/ARCHITECTURE.md` (doc wording only)
- `plans/README.md` status row

**Out of scope** (do NOT touch):

- `toFollowUpItem` and the `FollowUpItem` type - shared with the admin path.
- `getAdminDashboardData` / `buildAdminGroupModel` and anything they use.
- The live leader routes under `app/(protected)/leader/**`.
- Any read-model `fetch*` helper whose definition lives in
  `lib/supabase/read-models.ts` - this plan only removes _imports_ of them from
  `queries.ts`, never the helpers themselves (other surfaces use them).

## Git workflow

- Branch: `claude/remove-dormant-leader-dashboard-<id>`.
- Commit message style from recent history: imperative, concise, e.g.
  `Remove dormant leader dashboard orchestrator`.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Delete the two functions and their private helper

In `lib/dashboard/queries.ts`, delete:

- `export async function getLeaderDashboardData(...)` (the whole function).
- `async function buildLeaderGroupDashboard(...)` (the whole function).
- `function computeAttendanceRhythm(...)` (the whole function) - **only after**
  confirming it has no other caller:
  `rg -n "computeAttendanceRhythm" lib` -> matches only its definition once you
  remove `buildLeaderGroupDashboard`.

Do not touch `getAdminDashboardData` or anything above the
`// Leader dashboard (...)` banner comment that the admin path uses.

**Verify**: `rg -n "getLeaderDashboardData|buildLeaderGroupDashboard|computeAttendanceRhythm" lib/dashboard/queries.ts`
-> no matches.

### Step 2: Remove the broken leader test case

In `lib/dashboard/__tests__/fallback-data.test.ts`:

- Delete the `it("leader read returns the fallback shape ...")` test (lines
  ~34-38).
- Remove `getLeaderDashboardData` from the `@/lib/dashboard/queries` import.
- Leave `getAdminDashboardData` and all admin-path tests untouched.
- Leave the `LEADER_FALLBACK` import for now (Step 4 decides its fate).

**Verify**: `npx vitest run lib/dashboard/__tests__/fallback-data.test.ts`
-> exit 0 (the remaining admin tests pass).

### Step 3: Clean up orphaned imports in queries.ts

Run `npm run lint`. It will report unused imports in `lib/dashboard/queries.ts`.
Remove **only** the imports it flags. Expected candidates (confirm each is truly
unused elsewhere in the file with `rg -n "<name>" lib/dashboard/queries.ts`
before deleting):

- From `@/lib/supabase/read-models`: `fetchGroupsByIds`, `fetchActiveMemberships`,
  `fetchAttendanceSessions`, `fetchLatestHealthUpdates`, `fetchOpenFollowUps`,
  `fetchNewGuestsForGroupSince`, `fetchMembersByIds`,
  `fetchAttendanceRecordsForSessions`, `fetchGroupCalendarEvents`, and the
  `type LeaderFollowUpRow`.
- The `toFollowUpItem` name in the `./admin-group-model` import (the function
  stays defined there; only this file's import of it may be unused now).
- The leader-only type imports `LeaderCurrentWeek`, `LeaderDashboardData`,
  `LeaderGroupDashboard`.

Do **not** remove an import that lint does not flag - the admin path may still
use it (e.g. `fetchGroupCalendarEvents` could be admin-shared; trust lint).

**Verify**: `npm run lint` -> exit 0, no unused-import errors in queries.ts.

### Step 4: Remove the now-orphaned fallback constant and leader-only types

For each symbol below, run the listed grep. Delete the symbol **only if** the
grep shows it is referenced solely by its own definition. If any symbol is still
referenced by other live code, **leave it** and note it in the PR.

- `LEADER_FALLBACK` in `lib/dashboard/fallback-data.ts`:
  `rg -n "LEADER_FALLBACK" --glob '!plans/**'` -> after Steps 1-3, only the
  definition in `fallback-data.ts` remains. Remove the export and its now-unused
  type import there.
- `LeaderDashboardData`, `LeaderGroupDashboard`, `LeaderCurrentWeek` in
  `lib/dashboard/types.ts`: `rg -n "<TypeName>" --glob '!plans/**'` for each ->
  remove only those with no remaining reference.
- **Do NOT delete** `FollowUpItem`, `LeaderGroupSummary`, `LeaderHealthPulse`,
  `LeaderSessionStatusRow`, or `UpcomingCalendarEvent` unless its own grep proves
  zero references - some are shared. When in doubt, leave it and list it as a
  follow-up.

**Verify**: `npm run typecheck && npm run lint` -> both exit 0.

### Step 5: Fix the stale documentation references

- `lib/supabase/read-models.ts`: the doc comment near line 435 names
  `buildLeaderGroupDashboard` as a consumer of the open-follow-ups helper. Reword
  it to drop the deleted symbol (the helper is still used by the admin dashboard;
  keep that half).
- `docs/architecture/ARCHITECTURE.md` (~line 107): remove the
  `getLeaderDashboardData(client, { assignedGroupIds })` clause from the read-path
  description, leaving `getAdminDashboardData(client)`.

**Verify**: `rg -n "getLeaderDashboardData|buildLeaderGroupDashboard" lib docs`
-> no matches.

## Test plan

- No new tests. This is a deletion; the safety net is the existing full suite
  plus lint/typecheck.
- The removed leader fallback test is intentional - the function it covered no
  longer exists.
- Run, in order: `npm run lint`, `npm run typecheck`, `npm run test:run`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `rg -n "getLeaderDashboardData|buildLeaderGroupDashboard" lib app components docs` returns no matches.
- [ ] `npm run lint` exits 0.
- [ ] `npm run typecheck` exits 0.
- [ ] `npm run test:run` exits 0.
- [ ] `toFollowUpItem` / `FollowUpItem` still exist and the admin dashboard tests pass.
- [ ] No files outside the in-scope list are modified (`git status`).
- [ ] `plans/README.md` status row for Plan 004 is updated; Plan 001's row is
      noted as superseded for Steps 2-3 (or marked REJECTED if you chose to keep the
      dead path instead).

## STOP conditions

Stop and report back if:

- The dead-path proof grep (Current state) shows a live `app/**` caller of
  `getLeaderDashboardData` - the path is not dead; do Plan 001 instead.
- Deleting a type or `LEADER_FALLBACK` causes a typecheck/lint failure pointing
  at a file outside this plan's scope - something shares it; leave it.
- `npm run test:run` fails on an admin-dashboard test - you removed something
  shared; revert and narrow the deletion.
- Any verification command fails twice after a reasonable fix attempt.

## Maintenance notes

- This deletes the per-group leader dashboard model. If the team later builds a
  live leader dashboard, rebuild it against a **leader-safe** group reader
  (`fetchLeaderGroupsByIds`), never `fetchGroupsByIds` - see Plan 001's
  rationale, which this plan makes the structural guarantee for by removing the
  only offending call site.
- A reviewer should confirm the diff only removes the leader path and orphaned
  imports/types, and touches no admin code.
- Plan 001 Steps 2-3 (a leader-safe projection for the dashboard) become moot
  once this lands; Plan 001 Step 1 (the live `checkin` route) and its fitness
  guard still apply.
