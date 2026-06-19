# Plan 001: Keep leader group reads off admin-private columns

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the next
> step. If anything in the "STOP conditions" section occurs, stop and report -
> do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
> `git diff --stat 976ccb82..HEAD -- "app/(protected)/leader" lib/dashboard/queries.ts lib/supabase/read-models.ts lib/supabase/__tests__/leader-group-notes-read-models.test.ts tests/fitness`
>
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none — but **coordinate with Plan 004** (see the note below;
  Plan 004 supersedes this plan's Steps 2-3)
- **Category**: security
- **Planned at**: commit `976ccb82`, 2026-06-19

## Why This Matters

The repo treats `groups.admin_notes` as admin-private. The leader-safe group
reader exists specifically to keep that column out of leader request paths, but
two leader-oriented paths still reference the full group reader. The live
`/leader/[groupId]/checkin` route is frozen before it reads group details today,
but if `check_ins` is later re-enabled it will fetch `admin_notes` unless this is
fixed first. The older exported leader dashboard path is not currently used by
the live route, but leaving it unsafe makes future reuse risky.

## Coordinate with Plan 004 (read before starting)

A later audit (still at commit `976ccb82`) confirmed the "older exported leader
dashboard path" — `getLeaderDashboardData` / `buildLeaderGroupDashboard` in
`lib/dashboard/queries.ts` — has **no live caller at all** (only its own
definition, one fallback test, and docs). Plan 004 deletes it outright, which
removes the only `fetchGroupsByIds` call in `queries.ts` and is the stronger fix
for the dashboard half of this plan.

Therefore:

- If **Plan 004 has already landed**, the drift check will show `queries.ts` no
  longer imports `fetchGroupsByIds`. In that case **skip Steps 2 and 3 entirely**
  — there is no legacy dashboard path left to make safe. Do only Step 1 (the live
  `checkin` route) and Step 4 (the fitness guard).
- If Plan 004 has **not** landed and you are not running it, do Steps 2-3 as
  written.
- Preferred order: run **Plan 004 first**, then this plan reduces to Step 1 +
  Step 4.

## Current State

- `lib/supabase/read-models.ts` - owns the full admin group reader and the
  leader-safe group projection.
- `app/(protected)/leader/[groupId]/checkin/page.tsx` - frozen leader check-in
  route; currently imports and calls the full group reader after the frozen
  gate.
- `lib/dashboard/queries.ts` - contains a legacy exported
  `getLeaderDashboardData` path that currently calls the full group reader.
- `lib/supabase/__tests__/leader-group-notes-read-models.test.ts` - already
  tests that `fetchLeaderGroupsByIds` never selects `admin_notes`.
- `tests/fitness` - existing static invariant tests live here and are run by
  `npm run test:run`.

Current excerpts to confirm before editing:

```ts
// lib/supabase/read-models.ts:86
// ... GROUP_COLUMNS ... future groups column ... no longer flows ...
// Leader routes must keep using LEADER_SAFE_GROUP_COLUMNS.
export const GROUP_COLUMNS = [
  // ...
  "admin_notes",
  // ...
] as const satisfies readonly (keyof GroupsRow)[];
```

```ts
// lib/supabase/read-models.ts:168
// Leader-safe group read: an ALLOWLISTED projection that excludes admin-only
// columns (notably `admin_notes`, see AGENTS.md - admin notes must never reach a
// leader route).
export type LeaderSafeGroupRow = Pick<
  GroupsRow,
  | "id"
  | "name"
  | "lifecycle_status"
  | "meeting_day"
  | "meeting_time"
  | "meeting_frequency"
  | "meeting_week_parity"
>;
```

```ts
// app/(protected)/leader/[groupId]/checkin/page.tsx:11
import {
  fetchActiveMemberships,
  fetchAttendanceRecordsForSessions,
  fetchAttendanceSessions,
  fetchGroupCalendarEvents,
  fetchGroupsByIds,
  fetchLatestHealthUpdates,
  fetchMembersByIds,
} from "@/lib/supabase/read-models";

// app/(protected)/leader/[groupId]/checkin/page.tsx:82
const checkInsLive = await readFrozenSurfaceFlagForLeader("check_ins");
if (!checkInsLive) {
  return <FrozenSurfaceNotice surfaceLabel="Weekly check-ins" />;
}

// app/(protected)/leader/[groupId]/checkin/page.tsx:109
fetchGroupsByIds(client, [groupId]),
```

```ts
// lib/dashboard/queries.ts:809
export async function getLeaderDashboardData(
  client: AppSupabaseClient | null,
  options: { assignedGroupIds: readonly string[] }
): Promise<DashboardResult<LeaderDashboardData>> {
  // ...
  const [groupsResult, calendarEventsResult] = await Promise.all([
    fetchGroupsByIds(client, [...options.assignedGroupIds]),
    fetchGroupCalendarEvents(client, {
      groupIds: [...options.assignedGroupIds],
      fromDate: todayIso,
      toDate: horizonEnd,
      includeArchived: false,
    }),
  ]);
}
```

Repo conventions to match:

- Read helpers live in `lib/supabase/read-models.ts` or focused `*-reads.ts`
  modules and use explicit column allowlists.
- Leader routes must not receive admin-private columns. The existing pattern is
  `fetchLeaderGroupsByIds`; model new leader-safe projections after it.
- Fitness tests under `tests/fitness` are static, conservative, and run in the
  default CI lane via `npm run test:run`.

## Commands You Will Need

| Purpose                | Command                                                                                                                                     | Expected on success           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Targeted tests         | `npx vitest run lib/supabase/__tests__/leader-group-notes-read-models.test.ts tests/fitness/no-full-group-reader-in-leader-context.test.ts` | exit 0, all tests pass        |
| Typecheck              | `npm run typecheck`                                                                                                                         | exit 0, no TypeScript errors  |
| Full unit/fitness lane | `npm run test:run`                                                                                                                          | exit 0, all Vitest tests pass |
| Static check           | `rg -n "fetchGroupsByIds" "app/(protected)/leader" lib/dashboard/queries.ts`                                                                | no matches after the fix      |

## Scope

**In scope** (the only files you should modify):

- `app/(protected)/leader/[groupId]/checkin/page.tsx`
- `lib/dashboard/queries.ts`
- `lib/supabase/read-models.ts`
- `lib/supabase/__tests__/leader-group-notes-read-models.test.ts`
- `tests/fitness/no-full-group-reader-in-leader-context.test.ts` (create)
- `plans/README.md` status row

**Out of scope** (do NOT touch):

- Supabase migrations or RLS policies.
- Admin route readers that legitimately need full `GroupsRow` data.
- Reopening the frozen `check_ins` surface.
- Changing leader UI behavior, labels, or route contracts.
- Changing the classification of `groups.admin_notes`.

## Git Workflow

- Branch: `claude/leader-safe-group-reads-<id>`.
- Commit message style from recent history: imperative, concise, e.g.
  `Keep leader group reads off admin notes`.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Switch the frozen leader check-in route to the existing safe reader

In `app/(protected)/leader/[groupId]/checkin/page.tsx`:

- Replace the `fetchGroupsByIds` import with `fetchLeaderGroupsByIds`.
- Replace the `GroupsRow` type usage for `group` with `LeaderSafeGroupRow`.
- Keep the frozen gate exactly where it is. The route must still return
  `FrozenSurfaceNotice` before membership/session/health reads when
  `check_ins` is not live.
- Change the `Promise.all` group read from `fetchGroupsByIds(client, [groupId])`
  to `fetchLeaderGroupsByIds(client, [groupId])`.

**Verify**:
`rg -n "fetchGroupsByIds|GroupsRow" "app/(protected)/leader/[groupId]/checkin/page.tsx"`
-> no `fetchGroupsByIds` match; `GroupsRow` appears only if another use is
still genuinely needed. If `GroupsRow` remains, explain why in the PR.

### Step 2: Make the legacy leader dashboard path safe without changing its shape

> **Skip this step (and Step 3) if Plan 004 has landed.** Plan 004 deletes
> `getLeaderDashboardData`; there is then nothing here to make safe. Confirm with
> `rg -n "fetchGroupsByIds" lib/dashboard/queries.ts` → no matches means Plan 004
> already removed it; go straight to Step 4.

In `lib/supabase/read-models.ts`, add a second leader-safe projection only if
the legacy dashboard still needs fields not present in `LeaderSafeGroupRow`.
Name it clearly, for example:

```ts
export type LeaderDashboardGroupRow = Pick<
  GroupsRow,
  | "id"
  | "name"
  | "lifecycle_status"
  | "health_status"
  | "capacity"
  | "meeting_day"
  | "meeting_time"
  | "meeting_frequency"
  | "meeting_week_parity"
>;

const LEADER_DASHBOARD_GROUP_COLUMNS =
  "id, name, lifecycle_status, health_status, capacity, meeting_day, meeting_time, meeting_frequency, meeting_week_parity";
```

Then add `fetchLeaderDashboardGroupsByIds(client, ids)` beside
`fetchLeaderGroupsByIds`. It must:

- Return `ReadResult<LeaderDashboardGroupRow[]>`.
- Short-circuit `ids.length === 0` to `{ data: [], error: null }`.
- Select only `LEADER_DASHBOARD_GROUP_COLUMNS`.
- Never select `admin_notes`.

In `lib/dashboard/queries.ts`:

- Import `fetchLeaderDashboardGroupsByIds` and `type LeaderDashboardGroupRow`.
- Remove the `fetchGroupsByIds` import if no longer used.
- Change `buildLeaderGroupDashboard` to accept `LeaderDashboardGroupRow`.
- Change `getLeaderDashboardData` to call `fetchLeaderDashboardGroupsByIds`.
- Keep the returned `LeaderDashboardData` shape unchanged.

**Verify**:
`rg -n "fetchGroupsByIds" lib/dashboard/queries.ts`
-> no matches.

### Step 3: Add regression tests for safe leader group projections

In `lib/supabase/__tests__/leader-group-notes-read-models.test.ts`:

- Keep the existing `fetchLeaderGroupsByIds` test.
- Add a test for the new dashboard-safe reader if you created one.
- Assert the selected columns include fields the dashboard needs
  (`health_status`, `capacity`) and exclude `admin_notes` and `*`.

**Verify**:
`npx vitest run lib/supabase/__tests__/leader-group-notes-read-models.test.ts`
-> exit 0.

### Step 4: Add a fitness test that blocks full group readers in leader contexts

Create `tests/fitness/no-full-group-reader-in-leader-context.test.ts`.
Model it after `tests/fitness/no-direct-table-writes.test.ts`: use
`readSourceFiles` and `stripCommentsAndStrings` from `tests/fitness/support`.

The test should scan these files/roots:

- `app/(protected)/leader`
- `lib/dashboard/queries.ts`

Assert that stripped runtime source does not contain `fetchGroupsByIds`.
The failure message should explain that leader contexts must use
`fetchLeaderGroupsByIds` or another leader-safe projection that excludes
`groups.admin_notes`.

**Scope the assertion deliberately** (review caveat): banning `fetchGroupsByIds`
across the _entire_ `lib/dashboard/queries.ts` file is safe **today** because that
file's only `fetchGroupsByIds` use is the leader path (verified at `976ccb82`),
but it would also block a future _admin_ dashboard in the same file that
legitimately needs the full group reader. Prefer scoping the scan to the leader
builder/function region rather than the whole file; if you do keep it file-wide,
add a comment in the test saying so, so a future admin use isn't a mystery
failure. Also note this test **complements** the existing
`tests/fitness/leader-allowlist-no-admin-private.test.ts` (which bans the
`admin_private_note` _column_ in leader allowlists) — this one bans the full
_reader function_ in leader contexts. Keep both; they catch different mistakes.

**Verify**:
`npx vitest run tests/fitness/no-full-group-reader-in-leader-context.test.ts`
-> exit 0.

## Test Plan

- Update `lib/supabase/__tests__/leader-group-notes-read-models.test.ts` to
  cover every leader-safe group projection.
- Add `tests/fitness/no-full-group-reader-in-leader-context.test.ts` so future
  leader routes cannot import the full group reader by accident.
- Run:
  - `npx vitest run lib/supabase/__tests__/leader-group-notes-read-models.test.ts tests/fitness/no-full-group-reader-in-leader-context.test.ts`
  - `npm run typecheck`
  - `npm run test:run`

## Done Criteria

- [ ] No `fetchGroupsByIds` references remain under `app/(protected)/leader`.
- [ ] No `fetchGroupsByIds` reference remains in `lib/dashboard/queries.ts`.
- [ ] Every leader-context group projection excludes `admin_notes`.
- [ ] The new/updated tests pass.
- [ ] `npm run typecheck` exits 0.
- [ ] `npm run test:run` exits 0.
- [ ] No files outside the in-scope list are modified.
- [ ] `plans/README.md` status row for Plan 001 is updated.

## STOP Conditions

Stop and report back if:

- The code at the locations in "Current state" no longer matches the excerpts.
- `getLeaderDashboardData` has active route callsites beyond docs/tests and the
  safe projection cannot preserve its return shape.
- The fix appears to require changing RLS, exposing `admin_notes`, or reopening
  the frozen check-in flow.
- Typecheck indicates the dashboard needs a group field that is admin-private.
- Any verification command fails twice after a reasonable fix attempt.

## Maintenance Notes

- Future leader surfaces should use `fetchLeaderGroupsByIds` or a named
  leader-safe projection. Do not import `fetchGroupsByIds` into leader contexts.
- Reviewers should scrutinize any new `groups` reader that includes
  `admin_notes`, `address_optional`, or other admin-private fields.
- This plan deliberately does not remove the legacy `getLeaderDashboardData`
  export. If the team wants to retire it, do that as a separate cleanup plan.
