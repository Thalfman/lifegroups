# Plan 005: Clear or formally accept the dev-only npm audit advisories

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the next
> step. If anything in the "STOP conditions" section occurs, stop and report -
> do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
> `git diff --stat 976ccb82..HEAD -- package.json package-lock.json`
>
> Also re-run `npm audit --json` first: advisory databases change over time, so
> the exact advisory set below may have grown or shrunk since this plan was
> written. Treat the _approach_ as the deliverable, not the specific version
> numbers.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (independent of the Node bump in Plan 002, but if both run,
  do Plan 002 first so the audit runs under Node 22)
- **Category**: dependencies
- **Planned at**: commit `976ccb82`, 2026-06-19

## Why this matters

At commit `976ccb82`, `npm audit` reports **3 moderate advisories, 0 high, 0
critical**. A prior planning pass recorded "0 vulnerabilities" and rejected
dependency work - that was honest at the time; the advisory DB has since
published these. All three are **dev/build-time only** (confirmed via
`npm why`), so the deployed runtime is not exposed - but a clean `npm audit` is
worth keeping, and silent drift from "0" to "3 moderate" should be resolved or
explicitly accepted, not ignored.

The point of this plan is an honest disposition: clear what a non-breaking update
clears, and **document** what only a major bump or an upstream release would
clear, rather than forcing breaking changes.

## Current state

`npm audit --json` at `976ccb82` (re-verify with the drift check):

| Package   | Severity | Direct?             | Path / why                                                                                    | Advisory                                                             |
| --------- | -------- | ------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `postcss` | moderate | no                  | dev: rides inside the `next` dependency tree (the root `postcss` is already patched at 8.5.x) | XSS via unescaped `</style>` in CSS stringify (GHSA-qx2v-qp2m-jg93)  |
| `next`    | moderate | **yes** (`^16.2.9`) | flagged only because it depends on the vulnerable `postcss` above                             | (inherited)                                                          |
| `js-yaml` | moderate | no                  | dev: `@eslint/eslintrc` -> `eslint`                                                           | Quadratic-complexity DoS in merge-key handling (GHSA-h67p-54hq-rp68) |

Reachability (verified with `npm why postcss` and `npm why js-yaml`):

- `postcss` is a **dev/build-time** CSS tool (tailwindcss / autoprefixer /
  postcss-import). It processes the project's own CSS at build time, not
  attacker-controlled input at runtime.
- `js-yaml` is pulled by **eslint** only - a dev-time linter. Not in the runtime
  bundle.
- Therefore the practical runtime exposure of all three is effectively nil. This
  is hygiene, not an incident.

Repo conventions to match:

- Package manager is **npm**; the lockfile is `package-lock.json`. Do not switch
  managers or lockfile format.
- The global guardrail and `CLAUDE.md` forbid breaking changes done casually.
  **Do not run `npm audit fix --force`** - it would bump `next` across a
  range that includes major/canary lines and can break the build.

## Commands you will need

| Purpose                                   | Command             | Expected on success                            |
| ----------------------------------------- | ------------------- | ---------------------------------------------- |
| Re-audit (baseline)                       | `npm audit`         | prints the current advisory set                |
| Safe auto-fix                             | `npm audit fix`     | applies only non-breaking (in-range) updates   |
| Update next in-range                      | `npm update next`   | bumps `next` within `^16.2.9`, no major change |
| Re-audit (json)                           | `npm audit --json`  | machine-readable result to compare             |
| Typecheck                                 | `npm run typecheck` | exit 0                                         |
| Lint                                      | `npm run lint`      | exit 0                                         |
| Build (catches PostCSS/Tailwind breakage) | `npm run build`     | exit 0, completes                              |
| Full unit/fitness lane                    | `npm run test:run`  | exit 0, all Vitest tests pass                  |

## Scope

**In scope** (the only files you should modify):

- `package.json` (only if a dependency version moves)
- `package-lock.json`
- `plans/README.md` status row
- This plan's "Residual advisories accepted" note (append at the bottom) if any
  advisory cannot be cleared without a breaking change.

**Out of scope** (do NOT touch):

- Application/source code, migrations, tests (other than what `npm` rewrites in
  the lockfile).
- A `next` **major** upgrade, or any `--force` fix - that is a separate, larger
  plan with its own testing burden.
- Switching ESLint/Tailwind/PostCSS major versions to chase a transitive fix.

## Git workflow

- Branch: `claude/clear-dev-audit-advisories-<id>`.
- Commit message style from recent history: imperative, concise, e.g.
  `Bump next within range to clear postcss advisory`.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Re-establish the baseline

Run `npm audit` and record the exact current advisory list. If it already shows
`found 0 vulnerabilities`, mark this plan REJECTED in `plans/README.md` with
"advisories cleared upstream since planning" and stop - nothing to do.

**Verify**: you have a written before-state advisory list.

### Step 2: Apply only non-breaking fixes

Run, in order:

```
npm audit fix
npm update next
```

`npm audit fix` (without `--force`) applies only semver-in-range updates.
`npm update next` moves `next` to the newest release allowed by `^16.2.9`, which
may carry a patched `postcss`. Inspect the resulting `package-lock.json` diff: it
should change only dependency resolutions and npm bookkeeping. If it rewrites
versions broadly or changes a major version, **STOP**.

**Verify**: `git diff --stat package.json package-lock.json` shows a bounded
dependency-only diff; no source files changed.

### Step 3: Confirm nothing broke

Run the build and the verification lane (a `postcss`/Tailwind bump can break CSS
processing; the build is the gate that catches it):

```
npm run build
npm run typecheck
npm run lint
npm run test:run
```

All must exit 0.

**Verify**: all four commands exit 0.

### Step 4: Re-audit and dispose of the result

Run `npm audit` again.

- **If it now reports 0 vulnerabilities**: done. Update `plans/README.md` to DONE.
- **If moderate advisories remain** (likely for `js-yaml` via eslint, and
  possibly the `next`/`postcss` pair if no in-range patch exists): do **not**
  force them. Instead append a short "Residual advisories accepted" section to
  the bottom of _this plan file_ listing each remaining advisory, its dev-only
  reachability, and why clearing it needs a major/upstream bump deferred to a
  separate plan. This converts silent drift into a recorded, reviewed decision.

**Verify**: `npm audit` output matches what the plan's final status claims (0
vulns, or a documented residual list).

## Test plan

- No new tests. The safety net is `npm run build` + `npm run test:run` after the
  dependency move.
- If `next` moved, sanity-check that the dev server still boots is optional but
  recommended: `npm run dev` then stop it.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run build` exits 0.
- [ ] `npm run typecheck` exits 0.
- [ ] `npm run lint` exits 0.
- [ ] `npm run test:run` exits 0.
- [ ] `npm audit` reports either 0 vulnerabilities **or** only advisories that
      this plan's appended "Residual advisories accepted" section explains.
- [ ] Only `package.json` / `package-lock.json` changed (plus this plan's note
      and the README row).
- [ ] `plans/README.md` status row for Plan 005 is updated.

## STOP conditions

Stop and report back if:

- `npm audit fix` or `npm update` wants to change a **major** version, or rewrite
  the lockfile broadly.
- `npm run build` fails after a `postcss`/Tailwind resolution change - report the
  failure; do not chase it with a Tailwind/PostCSS major bump here.
- An advisory escalates to **high/critical** on re-audit - that is a different,
  higher-priority plan; report it.
- Clearing an advisory would require `npm audit fix --force` - stop and record it
  as residual instead.
- Any verification command fails twice after a reasonable fix attempt.

## Maintenance notes

- Re-run `npm audit` on a regular cadence; advisory sets drift even when the
  lockfile is frozen.
- The durable fix for the `next` -> `postcss` advisory is a `next` upgrade that
  ships a patched `postcss`; track it and fold it into the next planned framework
  bump rather than forcing it here.
- A reviewer should confirm the diff is lockfile-only and the build still passes;
  the risk in this plan is a silent CSS-pipeline regression, not a code change.
