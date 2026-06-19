# Plan 006: Characterize untested live write-action files

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the next
> step. If anything in the "STOP conditions" section occurs, stop and report -
> do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
> `git diff --stat 976ccb82..HEAD -- "app/(protected)/admin/follow-ups" "app/(protected)/admin/group-health" "app/(protected)/admin/super-admin" "app/(protected)/leader" "app/(protected)/over-shepherd" lib/admin/run-action.ts`
>
> If a target file changed since this plan was written, re-read it before writing
> its test (the RPC names and guards below are leads, confirm against live code).

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `976ccb82`, 2026-06-19

## Why this matters

The write pipeline (validate -> guard -> RPC -> revalidatePath -> log) is the
trust boundary for every mutation. Many live server-action files have a
colocated `__tests__` sibling; several **do not** - including destructive
Super-Admin danger-zone actions (permanent delete, feature-flag flips) and live
Care/Plan actions. A regression in an untested action - a dropped guard, a wrong
RPC arg, a missing revalidate - ships unnoticed until a user hits it.

These tests are pure characterization: cheap, additive, no behavior change. They
lock in the current contract (guard required, correct RPC + args, correct
revalidate paths) so future edits can't silently break it.

## Current state

Untested **live** write-action files (no `*action*` test in their `__tests__/`),
in priority order. Frozen pre-pivot surfaces are deliberately excluded (see
Out of scope).

Batch A - destructive Super-Admin danger zone (highest value):

- `app/(protected)/admin/super-admin/permanent-delete-actions.ts` - exports
  `superAdminPermanentDeletePreflight`, `superAdminPermanentDelete`,
  `superAdminInlineDelete`, `superAdminRestoreTombstone`.
- `app/(protected)/admin/super-admin/feature-flag-actions.ts` - toggles surface
  flags (e.g. the leader surface, check-ins).

Batch B - live admin/role write actions (verified to use the admin runner):

- `app/(protected)/admin/follow-ups/actions.ts` - `adminCreateFollowUp`,
  `adminUpdateFollowUpStatus` (both call `runAdminWriteAction`).
- `app/(protected)/admin/group-health/actions.ts` and `grade-actions.ts`.
- `app/(protected)/leader/[groupId]/calendar/actions.ts` - live leader surface.
- `app/(protected)/over-shepherd/[profileId]/actions.ts` - live over-shepherd
  surface.

The exemplar to copy - `app/(protected)/admin/groups/__tests__/actions.test.ts`.
Its structure (the runner calls the guard internally, so you mock the guard, the
server client's `.rpc`, `revalidatePath`, and the logger):

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireAdminSession,
  mockCreateClient,
  mockRevalidatePath,
  mockRpc,
} = vi.hoisted(() => ({
  mockRequireAdminSession: vi.fn(),
  mockCreateClient: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockRpc: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireAdminSession: mockRequireAdminSession, // <- swap to the guard the target file uses
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateClient,
}));
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));
vi.mock("@/lib/observability/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {} from /* the actions */ "../actions";

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdminSession.mockResolvedValue({
    ok: true,
    session: { profile: { id: ADMIN_ID, role: "ministry_admin" } },
  });
  mockRpc.mockResolvedValue({ data: NEW_ID, error: null });
  mockCreateClient.mockResolvedValue({ rpc: mockRpc });
});
```

Repo conventions to match:

- Tests are colocated under `**/__tests__/**/*.test.ts`. Name the new file
  `actions.test.ts` (or `<file-stem>.test.ts` to match the action file).
- Vitest with the reads/RPC seam mocked - **no live Supabase**. The exemplar is
  the canonical pattern; do not invent a new mocking style.
- `npm run test:run` is what CI runs and what the pre-commit hook runs.

## Per-file discovery (do this before writing each test)

Each action file declares which guard/runner it uses at the top. Read the first
~30 lines and confirm:

1. **Guard/runner**: which of `runAdminWriteAction` / a super-admin runner /
   `requireAdminSession` / `requireSuperAdminSession` / `requireOverShepherd*` /
   `requireLeader*` it imports. Mock **that** symbol (swap it into the skeleton).
2. **RPC name(s)** passed to `adminRpc`/the runner (e.g. `admin_create_follow_up`).
3. **Revalidate paths** the spec returns.

You now know exactly what to assert. If the file's guard/runner pattern is not
one of the above and is not discoverable from the file plus `lib/admin/run-action.ts`,
that file goes to **STOP** (report it; don't guess).

## Commands you will need

| Purpose                | Command                             | Expected on success           |
| ---------------------- | ----------------------------------- | ----------------------------- |
| Single test file       | `npx vitest run <path-to-new-test>` | exit 0                        |
| Typecheck              | `npm run typecheck`                 | exit 0                        |
| Full unit/fitness lane | `npm run test:run`                  | exit 0, all Vitest tests pass |

## Scope

**In scope** (create these test files; do not modify the action source):

- `app/(protected)/admin/super-admin/__tests__/permanent-delete-actions.test.ts`
- `app/(protected)/admin/super-admin/__tests__/feature-flag-actions.test.ts`
- `app/(protected)/admin/follow-ups/__tests__/actions.test.ts`
- `app/(protected)/admin/group-health/__tests__/actions.test.ts`
- `app/(protected)/admin/group-health/__tests__/grade-actions.test.ts`
- `app/(protected)/leader/[groupId]/calendar/__tests__/actions.test.ts`
- `app/(protected)/over-shepherd/[profileId]/__tests__/actions.test.ts`
- `plans/README.md` status row

**Out of scope** (do NOT touch):

- The action source files themselves - this plan only **adds tests**. If a test
  reveals a real bug, STOP and report it; do not fix it here.
- Frozen pre-pivot surfaces: `admin/guests`, `admin/launch-planning`,
  `admin/leader-pipeline` - they are nav-hidden/frozen (CLAUDE.md), low value to
  characterize now.
- The other already-tested action files (e.g. `admin/settings/actions.ts` has a
  test - leave it).
- Any change to test infrastructure or the shared runner.

## Git workflow

- Branch: `claude/test-untested-write-actions-<id>`.
- Commit per file or per batch; message style: imperative, e.g.
  `Characterize super-admin permanent-delete actions`.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Batch A - the destructive Super-Admin actions first

For `permanent-delete-actions.ts` and `feature-flag-actions.ts`, run the
Per-file discovery, then write, for each exported action, at minimum:

- **Happy path**: guard returns an authorized super-admin session; assert the
  correct RPC is called with the expected args, and the expected revalidate
  path(s) fire.
- **Guard rejection**: guard returns an unauthorized/failed result; assert the
  action returns the failure shape and **the RPC is NOT called** (`expect(mockRpc).not.toHaveBeenCalled()`).
  For destructive actions this is the load-bearing assertion - prove a
  non-super-admin cannot reach the delete RPC.

**Verify**: `npx vitest run "app/(protected)/admin/super-admin/__tests__/permanent-delete-actions.test.ts" "app/(protected)/admin/super-admin/__tests__/feature-flag-actions.test.ts"`
-> exit 0.

### Step 2: Batch B - live admin/role write actions

Repeat the pattern for the Batch B files. Use `follow-ups/actions.ts` as the
easiest starting point - it plainly calls `runAdminWriteAction(SPEC, prev, input)`
with RPCs `admin_create_follow_up` and `admin_update_follow_up_status`, and
revalidates `/admin/follow-ups`, `/admin/care`, `/admin/guests`, `/admin`,
`/leader`.

For each action: one happy-path test (RPC + args + revalidate) and one
guard-rejection test (RPC not called).

**Verify**: `npx vitest run` on each new Batch B test file -> exit 0.

### Step 3: Run the full lane

`npm run typecheck && npm run test:run`

**Verify**: both exit 0; the run includes your new tests (the count goes up).

## Test plan

- New test files listed in Scope, each covering happy-path + guard-rejection per
  exported action, modeled on
  `app/(protected)/admin/groups/__tests__/actions.test.ts`.
- For destructive Batch A actions, the guard-rejection "RPC not called" assertion
  is mandatory.
- Verification: `npm run test:run` -> all pass, including the N new tests.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] Each in-scope test file exists and passes `npx vitest run <file>`.
- [ ] Every Batch A destructive action has a "guard rejects -> RPC not called" test.
- [ ] `npm run typecheck` exits 0.
- [ ] `npm run test:run` exits 0 with a higher test count than before.
- [ ] No action **source** file was modified (`git status` shows only new test
      files + the README row).
- [ ] `plans/README.md` status row for Plan 006 is updated. If any file hit a
      STOP, the row notes it as BLOCKED with the file name and reason.

## STOP conditions

Stop and report back if:

- A target file's guard/runner pattern is not discoverable from the file plus
  `lib/admin/run-action.ts` - characterize the rest and report this one.
- A test you write **fails on the real action's behavior** (i.e. the action has a
  bug, e.g. a missing guard or wrong RPC arg) - do not "fix" the test to pass and
  do not edit the action; report the discrepancy. This is a finding, not a chore.
- Writing a test would require a live Supabase connection or a new test harness -
  the seam-mock pattern should suffice; if it doesn't, report why.
- Any verification command fails twice after a reasonable fix attempt.

## Maintenance notes

- This is a first batch. Remaining untested live `super-admin/*-actions.ts`
  files (`clean-slate-actions.ts`, `reset-all-actions.ts`, the `*-reset-actions.ts`
  family, `coverage-actions.ts`, `invite-*-actions.ts`, etc.) are a documented
  backlog - extend the same pattern in follow-up PRs, prioritizing destructive
  ones.
- Consider a fitness test asserting every `app/(protected)/**/actions.ts` (minus
  a frozen allowlist) has a colocated test, so this gap can't silently reopen.
  That is a separate plan.
- A reviewer should confirm the tests assert real RPC args/revalidate paths, not
  just that the function returns - a test that only checks `ok: true` without
  asserting the RPC call tests almost nothing.
