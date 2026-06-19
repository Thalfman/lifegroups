# Plan 002: Make Node 22 the single runtime contract

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the next
> step. If anything in the "STOP conditions" section occurs, stop and report -
> do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
> `git diff --stat 976ccb82..HEAD -- package.json package-lock.json .nvmrc .github/workflows README.md CLAUDE.md tests/fitness`
>
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `976ccb82`, 2026-06-19

## Why This Matters

The repo currently advertises Node 20 as the local/runtime contract, while the
RLS integration workflow pins Node 22 because Node 20 cannot run the Supabase
realtime dependency used by the harness. That split makes local reproduction of
the security harness confusing and allows future workflows to pick inconsistent
Node versions. Make Node 22 the single contract across engines, `.nvmrc`, CI,
docs, and a static fitness check.

## Current State

- `package.json` - root engine currently requires Node 20 only.
- `.nvmrc` - currently says `20`.
- `.github/workflows/ci.yml` - default CI jobs use Node 20.
- `.github/workflows/seeded-auth-route-smoke.yml` - route smoke workflow uses
  Node 20.
- `.github/workflows/rls-integration.yml` - RLS harness already uses Node 22
  and documents why.
- `.github/workflows/codex-review-loop.yml` - runs `node scripts/codex-review-loop.mjs`
  with **no `setup-node` step**, so it executes repo JS on the runner's default
  Node, outside any pin. It does not run `npm install`, so the engine range does
  not break it — but an unpinned runtime undercuts the "single contract" claim.
- `.github/workflows/render-diagrams.yml` - uses no Node/npm (diagram render
  only); legitimately **outside** the runtime contract.
- `README.md` and `CLAUDE.md` - command docs do not clearly state Node 22 as
  the canonical runtime.

Current excerpts to confirm before editing:

```json
// package.json:5
"engines": {
  "node": ">=20.19 <21"
}
```

```text
// .nvmrc:1
20
```

```yaml
# .github/workflows/ci.yml:22 and :49
node-version: 20
```

```yaml
# .github/workflows/rls-integration.yml:56
# Node 22+ ships a native global WebSocket, which @supabase/realtime-js
# ... on Node 20 it throws "Node.js 20 detected without native WebSocket support"
node-version: 22
```

Repo conventions to match:

- Keep verification commands npm-based: `npm run typecheck`,
  `npm run test:run`, `npm run test:a11y`.
- Fitness tests under `tests/fitness` are allowed for static repo-contract
  checks and run in default CI.
- Keep docs factual and operational; do not add broad onboarding prose.

## Commands You Will Need

| Purpose                  | Command                                                      | Expected on success                                            |
| ------------------------ | ------------------------------------------------------------ | -------------------------------------------------------------- |
| Update lock root package | `npm install --package-lock-only`                            | exit 0; `package-lock.json` root engine matches `package.json` |
| Targeted test            | `npx vitest run tests/fitness/node-runtime-contract.test.ts` | exit 0                                                         |
| Typecheck                | `npm run typecheck`                                          | exit 0, no TypeScript errors                                   |
| Full unit/fitness lane   | `npm run test:run`                                           | exit 0, all Vitest tests pass                                  |

## Scope

**In scope** (the only files you should modify):

- `package.json`
- `package-lock.json`
- `.nvmrc`
- `.github/workflows/ci.yml`
- `.github/workflows/seeded-auth-route-smoke.yml`
- `.github/workflows/rls-integration.yml` (comment cleanup only if needed)
- `.github/workflows/codex-review-loop.yml` (add a pinned setup-node step, or the
  documented out-of-contract comment)
- `README.md`
- `CLAUDE.md`
- `tests/fitness/node-runtime-contract.test.ts` (create)
- `plans/README.md` status row

**Out of scope** (do NOT touch):

- Dependency upgrades unrelated to the Node contract.
- Supabase migrations, app code, or tests unrelated to static runtime checks.
- Changing the package manager or lockfile format.
- Installing global Node versions or changing machine configuration.

## Git Workflow

- Branch: `claude/node-runtime-contract-<id>`.
- Commit message style from recent history: imperative, concise, e.g.
  `Align runtime contract on Node 22`.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Make Node 22 canonical in package metadata

In `package.json`, change the engine to a Node 22-only range:

```json
"engines": {
  "node": ">=22.12 <23"
}
```

Use `>=22.12 <23` so local and CI environments use a stable Node 22 line while
keeping the same "single major version" posture the repo currently has for
Node 20.

Then update the root package entry in `package-lock.json` by running:

`npm install --package-lock-only`

Do not accept unrelated dependency version changes. If the lockfile changes
anything beyond root package metadata and expected npm bookkeeping, inspect it
carefully; if the change is broad, stop and report.

**Verify**:
`Select-String -Path .\package.json,.\package-lock.json -Pattern '>=22.12 <23'`
-> matches in both files.

### Step 2: Align local and workflow Node versions

- Change `.nvmrc` from `20` to `22`.
- Change both `node-version: 20` entries in `.github/workflows/ci.yml` to
  `node-version: 22`.
- Change `.github/workflows/seeded-auth-route-smoke.yml` to `node-version: 22`.
- Keep `.github/workflows/rls-integration.yml` on Node 22. Adjust comments only
  if they now read like an exception rather than the standard.
- **`.github/workflows/codex-review-loop.yml`** (review caveat): it runs repo JS
  (`node scripts/codex-review-loop.mjs`) with no `setup-node`. To make the
  contract real, add a pinned setup step before that run, e.g.:
  ```yaml
  - uses: actions/setup-node@v4
    with:
      node-version: 22
  ```
  If the team would rather not touch this advisory loop, that is acceptable — but
  then say so explicitly (a one-line comment in the workflow: "intentionally uses
  the runner default Node; not part of the Node 22 contract") so it is a recorded
  exception, not silent drift.
- **`.github/workflows/render-diagrams.yml`**: leave as-is. It runs no Node/npm,
  so there is nothing to pin.

**Verify**:
`rg -n "node-version: 20|>=20.19 <21|^20$" package.json .nvmrc .github/workflows`
-> no matches.
`rg -n "setup-node|node-version" .github/workflows/codex-review-loop.yml`
-> either a `node-version: 22` pin **or** the explicit "not part of the contract"
comment is present.

### Step 3: Document the runtime contract in the operator docs

In `README.md`, add a short prerequisite line in Local development before
installing dependencies, for example:

```md
0. Use Node 22 (`.nvmrc` pins the project runtime).
```

In `CLAUDE.md`, update the Commands or Git / CI section to state:

- Node 22 is the project runtime.
- The live Supabase/RLS harness depends on Node 22's native WebSocket behavior.

Keep this concise. Do not rewrite the docs.

**Verify**:
`rg -n "Node 22|native WebSocket" README.md CLAUDE.md`
-> both docs mention Node 22; `CLAUDE.md` mentions the RLS/native WebSocket
reason.

### Step 4: Add a static contract test

Create `tests/fitness/node-runtime-contract.test.ts`.

The test should read the repo files with Node's `fs` APIs and assert:

- `package.json.engines.node` is `>=22.12 <23`.
- `.nvmrc` is `22`.
- `.github/workflows/ci.yml` contains exactly `node-version: 22` for each
  setup-node step and no `node-version: 20`.
- `.github/workflows/seeded-auth-route-smoke.yml` contains `node-version: 22`.
- `.github/workflows/rls-integration.yml` contains `node-version: 22`.
- `.github/workflows/codex-review-loop.yml` **either** contains `node-version: 22`
  **or** contains the documented "not part of the Node 22 contract" exception
  comment — so the file can't quietly start running repo JS on an unpinned Node.
- Do **not** assert anything about `render-diagrams.yml`; add a one-line comment
  in the test noting it is intentionally excluded (no Node/npm).

Keep the test simple and deterministic. It should fail with a message that
names the mismatched file.

**Verify**:
`npx vitest run tests/fitness/node-runtime-contract.test.ts`
-> exit 0.

## Test Plan

- New static fitness test: `tests/fitness/node-runtime-contract.test.ts`.
- Run:
  - `npx vitest run tests/fitness/node-runtime-contract.test.ts`
  - `npm run typecheck`
  - `npm run test:run`

## Done Criteria

- [ ] `package.json` requires Node `>=22.12 <23`.
- [ ] `package-lock.json` root package metadata matches the engine change.
- [ ] `.nvmrc` says `22`.
- [ ] Default CI, seeded-auth smoke, and RLS integration workflows all use
      `node-version: 22`.
- [ ] `codex-review-loop.yml` is either pinned to `node-version: 22` or carries
      the documented out-of-contract comment; `render-diagrams.yml` (no Node) is left
      alone and noted as excluded in the fitness test.
- [ ] README and CLAUDE mention Node 22 as the project runtime.
- [ ] `tests/fitness/node-runtime-contract.test.ts` exists and passes.
- [ ] `npm run typecheck` exits 0.
- [ ] `npm run test:run` exits 0.
- [ ] No files outside the in-scope list are modified.
- [ ] `plans/README.md` status row for Plan 002 is updated.

## STOP Conditions

Stop and report back if:

- The RLS integration workflow no longer contains the Node 22/WebSocket comment
  and the current reason for Node 22 cannot be confirmed from nearby code.
- `npm install --package-lock-only` tries to rewrite dependency versions broadly
  or requires registry/network access that is unavailable.
- Any installed dependency declares an incompatible Node engine when the target
  engine is Node 22.
- CI or docs have intentionally diverged runtime requirements that are not
  represented in this plan.
- Any verification command fails twice after a reasonable fix attempt.

## Maintenance Notes

- If the project later moves to Node 24, update all files covered by the fitness
  test in one PR.
- Reviewers should reject future workflow-only Node version changes unless the
  package engine and `.nvmrc` move with them.
- This plan does not change application behavior; it makes the existing
  verification contract coherent.
