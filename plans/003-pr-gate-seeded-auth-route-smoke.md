# Plan 003: Gate seeded-auth route smoke on relevant PRs

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the next
> step. If anything in the "STOP conditions" section occurs, stop and report -
> do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
> `git diff --stat 976ccb82..HEAD -- .github/workflows/seeded-auth-route-smoke.yml scripts/seeded-auth-route-smoke.sh tests/a11y tests/fitness`
>
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/002-node-runtime-contract.md`
- **Category**: tests
- **Planned at**: commit `976ccb82`, 2026-06-19

## Why This Matters

The seeded-auth route smoke is the only automated browser lane that signs in as
real seeded Ministry Admin, Over-Shepherd, and Leader users against a local
Supabase stack. The tests correctly skip in normal credential-free CI, and the
dedicated workflow currently runs only by manual dispatch or weekly schedule.
That means a PR can break authenticated role routing and still pass the default
PR checks. Add a selective PR trigger so changes to auth, route gates, RLS,
seeded auth tooling, and the seeded smoke tests exercise the workflow before
merge.

**What "gate" means here (review caveat — set expectations honestly):** adding a
`pull_request` trigger makes this lane **run** on matching PRs and report
red/green. It does **not** by itself **block** merge — that requires marking the
job a _required status check_ in the repo's branch-protection settings, which is a
GitHub repo setting this workflow file cannot change. This plan delivers the
"runs on relevant PRs" half; making it merge-blocking is a separate, operator-only
step (note it in the PR description so a maintainer can flip it on if desired).
Also be aware this is a **heavy** lane (boots a local Supabase stack + Playwright)
and the path filter below is deliberately broad (`app/(protected)/**`,
`lib/supabase/**`), so it will fire on a large share of PRs. That trade-off is
intentional for coverage; if it proves too slow/noisy, narrow the paths (see
Maintenance notes) rather than dropping the lane.

## Current State

- `.github/workflows/seeded-auth-route-smoke.yml` - says the lane is
  "OPT-IN / SCHEDULED ONLY" and has no PR trigger.
- `tests/a11y/role-routing.spec.ts` - signs in as seeded admin, over-shepherd,
  and leader users, but skips when credentials are absent.
- `tests/a11y/leader-routes.spec.ts` - signs in as a seeded leader and checks
  live leader routes, but skips in normal CI.
- `tests/a11y/mobile-smoke.spec.ts` - has seeded admin/leader mobile checks
  that skip without `A11Y_*` credentials.
- `scripts/seeded-auth-route-smoke.sh` - stands up the app against the local
  Supabase stack and passes seeded credentials to the Playwright specs.

Current excerpts to confirm before editing:

```yaml
# .github/workflows/seeded-auth-route-smoke.yml:17
# Triggers: manual dispatch and a weekly cron. No push/pull_request trigger, so
# it never gates a PR.

on:
  workflow_dispatch:
  schedule:
    - cron: "0 7 * * 1"
```

```ts
// tests/a11y/role-routing.spec.ts:12
// Like every seeded-auth spec, it SKIPS cleanly when creds are absent (the
// default in normal CI, which has no Supabase), so `npm run test:a11y` stays
// green.

test.beforeEach(async ({ page }) => {
  test.skip(!ADMIN.present, ADMIN_SKIP);
  await signIn(page, ADMIN.email!, ADMIN.password!);
});
```

```ts
// tests/a11y/leader-routes.spec.ts:22
// When those creds are absent - the default in CI, which has no Supabase - the
// suite SKIPS rather than failing, so `npm run test:a11y` stays green.
```

Repo conventions to match:

- Keep the default PR lane deterministic and credential-free.
- Live Supabase stack workflows are acceptable when path-filtered to relevant
  changes; see `.github/workflows/rls-integration.yml`.
- Do not use production secrets. The route smoke must keep using local Supabase
  CLI credentials only.

## Commands You Will Need

| Purpose                   | Command                                                                 | Expected on success           |
| ------------------------- | ----------------------------------------------------------------------- | ----------------------------- |
| Targeted static test      | `npx vitest run tests/fitness/seeded-auth-route-smoke-workflow.test.ts` | exit 0                        |
| Full unit/fitness lane    | `npm run test:run`                                                      | exit 0, all Vitest tests pass |
| Optional local live smoke | `supabase start` then `./scripts/seeded-auth-route-smoke.sh`            | exits 0 against local stack   |

The optional live smoke requires Supabase CLI, Docker, `psql`, and Playwright
browsers. If those are unavailable locally, do not fake the run; rely on the
static test plus the GitHub workflow run.

## Scope

**In scope** (the only files you should modify):

- `.github/workflows/seeded-auth-route-smoke.yml`
- `tests/fitness/seeded-auth-route-smoke-workflow.test.ts` (create)
- `plans/README.md` status row

**Out of scope** (do NOT touch):

- The default `.github/workflows/ci.yml` lane.
- Production secrets, repository secrets, or remote Supabase projects.
- The seeded-auth test semantics unless a path-trigger change requires a
  narrow test update.
- RLS integration workflow triggers; that is a separate workflow.

## Git Workflow

- Branch: `claude/pr-gate-seeded-auth-route-smoke-<id>`.
- Commit message style from recent history: imperative, concise, e.g.
  `Gate seeded auth smoke on auth-route PRs`.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a selective pull_request trigger

In `.github/workflows/seeded-auth-route-smoke.yml`, keep
`workflow_dispatch` and `schedule`, then add `pull_request` with path filters.

Use a path list that covers changes likely to break authenticated routing:

```yaml
pull_request:
  paths:
    - "proxy.ts"
    - "app/(protected)/**"
    - "app/login/**"
    - "app/invite/**"
    - "app/welcome/**"
    - "lib/auth/**"
    - "lib/account/**"
    - "lib/nav/**"
    - "lib/security/**"
    - "lib/supabase/**"
    - "supabase/migrations/**"
    - "supabase/seed/**"
    - "supabase/functions/**"
    - "scripts/seeded-auth-route-smoke.sh"
    - "scripts/seed-test-auth-users.ts"
    - "scripts/test-auth-shared.ts"
    - "tests/a11y/role-routing.spec.ts"
    - "tests/a11y/leader-routes.spec.ts"
    - "tests/a11y/mobile-smoke.spec.ts"
    - "tests/a11y/harness.ts"
    - ".github/workflows/seeded-auth-route-smoke.yml"
```

Note on `proxy.ts`: the root `proxy.ts` (Next 16's renamed middleware) runs on
every matched request and delegates to `updateSupabaseSession`, so it controls
the Supabase session cookie and the password-setup / read-path RLS gates — the
exact authenticated role-routing surface this lane exercises. A PR that touches
only `proxy.ts` must trip this trigger, so it leads the list.

Note on glob style: the parenthesized filter `app/(protected)/**` is valid —
GitHub path filters treat `(` and `)` as literal characters, so it matches the
real `app/(protected)/` route-group directory. It does diverge from the cited
model `rls-integration.yml`, which filters by file-suffix globs
(`app/**/*actions.ts`); either style works, this one is just broader. If you
prefer to match that model's surgical style, suffix globs are fine too — keep
whichever, but don't assume the parens need escaping.

Adjust the header comment so it no longer says "No push/pull_request trigger."
It should say this is a manual/scheduled and path-filtered PR lane, still not
part of the broad default PR lane.

Do not add repository secrets. The workflow must continue to read only local
Supabase CLI stack credentials.

**Verify**:
`Select-String -Path .\.github\workflows\seeded-auth-route-smoke.yml -Pattern "pull_request|app/\\(protected\\)|lib/auth|supabase/migrations"`
-> all key trigger/path strings are present.

### Step 2: Keep Node aligned with Plan 002

Confirm the workflow uses `node-version: 22` after Plan 002. If it still uses
Node 20, stop and complete Plan 002 first rather than making this workflow a
new exception.

**Verify**:
`Select-String -Path .\.github\workflows\seeded-auth-route-smoke.yml -Pattern "node-version: 22"`
-> one match.

### Step 3: Add a static workflow contract test

Create `tests/fitness/seeded-auth-route-smoke-workflow.test.ts`.

The test should read `.github/workflows/seeded-auth-route-smoke.yml` and assert:

- The workflow has `workflow_dispatch`, `schedule`, and `pull_request`.
- The `pull_request` block contains `paths:`.
- The path filters include at least:
  - `proxy.ts`
  - `app/(protected)/**`
  - `lib/auth/**`
  - `lib/supabase/**`
  - `supabase/migrations/**`
  - `tests/a11y/role-routing.spec.ts`
  - `tests/a11y/leader-routes.spec.ts`
  - `scripts/seeded-auth-route-smoke.sh`
  - `.github/workflows/seeded-auth-route-smoke.yml`
- The stale phrase `No push/pull_request trigger` is absent.
- The workflow uses `node-version: 22`.

Keep this as a plain text contract test. Do not add a YAML parser dependency.

**Verify**:
`npx vitest run tests/fitness/seeded-auth-route-smoke-workflow.test.ts`
-> exit 0.

### Step 4: Run the deterministic verification lane

Run the default Vitest lane so the new fitness test is included with the rest of
the repo's static checks:

`npm run test:run`

Expected: exit 0.

If Supabase CLI, Docker, and `psql` are available, optionally run the live route
smoke:

```bash
supabase start
./scripts/seeded-auth-route-smoke.sh
supabase stop --no-backup
```

Expected: the smoke exits 0 and the workflow's Playwright specs pass. If the
tools are not available, document that this optional check was not run.

## Test Plan

- New static fitness test:
  `tests/fitness/seeded-auth-route-smoke-workflow.test.ts`.
- Required verification:
  - `npx vitest run tests/fitness/seeded-auth-route-smoke-workflow.test.ts`
  - `npm run test:run`
- Optional live verification when local stack tooling is available:
  - `supabase start`
  - `./scripts/seeded-auth-route-smoke.sh`
  - `supabase stop --no-backup`

## Done Criteria

- [ ] `.github/workflows/seeded-auth-route-smoke.yml` has a path-filtered
      `pull_request` trigger.
- [ ] The workflow still has `workflow_dispatch` and weekly `schedule`.
- [ ] The workflow uses Node 22, matching Plan 002.
- [ ] The workflow still uses no production secrets.
- [ ] The new workflow-contract fitness test exists and passes.
- [ ] `npm run test:run` exits 0.
- [ ] Optional live smoke result is recorded in the executor's final note.
- [ ] No files outside the in-scope list are modified.
- [ ] `plans/README.md` status row for Plan 003 is updated.

## STOP Conditions

Stop and report back if:

- Plan 002 has not landed and the workflow still uses Node 20.
- The workflow would require production secrets or a remote Supabase project to
  run on PRs.
- Adding the PR trigger would run the live-stack smoke for docs-only changes
  outside the path list.
- The static test requires a YAML parser or dependency install.
- Any verification command fails twice after a reasonable fix attempt.

## Maintenance Notes

- Keep this lane path-filtered. If it becomes too slow or noisy, narrow paths or
  split smoke specs; do not remove authenticated route coverage entirely.
- Reviewers should watch for new auth-relevant route trees that are not included
  in the path filters.
- This plan does not replace the RLS integration workflow. The two lanes catch
  different failure modes: browser role routing versus database/RPC policy
  behavior.
