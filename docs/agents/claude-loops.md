# Claude Code loops for this repo

Reusable, repo-specific loop workflows for Claude Code. These are **not** a
generic catalogue — each one is justified by a pass/fail signal this repo already
has (the local gate, the fitness suite, CI) and carries an explicit stop
condition. If a workflow doesn't have a clear binary signal and a safe way to
stop, it isn't here (see [Loops we deliberately don't run](#loops-we-deliberately-dont-run)).

Three loops are supported, each wired to a saved slash command:

| Loop                                                   | Command          | Primitive                   |
| ------------------------------------------------------ | ---------------- | --------------------------- |
| [Green gate](#loop-1--green-gate)                      | `/green-gate`    | agentic / `/goal` (iterate) |
| [Fitness inner-loop](#loop-2--fitness-inner-loop)      | `/fitness-check` | agentic (fast, narrow)      |
| [PR CI watch + autofix](#loop-3--pr-ci-watch--autofix) | `/watch-pr-ci`   | `/loop` timer (fallback)    |

## Choosing the right primitive

"Loop" is overloaded. Pick by what triggers the next iteration:

| You want to…                      | Use                                 | Why                                                                 |
| --------------------------------- | ----------------------------------- | ------------------------------------------------------------------- |
| Iterate edit→test until green     | **agentic in-turn loop** or `/goal` | Tight fix-test cycles; no timer latency, no fresh-context restarts. |
| Wait/poll for an external event   | **`/loop`** (timer)                 | Session-scoped recurring task; goes idle between fires.             |
| Watch a PR for CI/review activity | **`subscribe_pr_activity`** first   | Event-driven and harness-native; `/loop` is the fallback.           |

`/goal` sets a completion condition evaluated after **every turn** and re-runs
until met (or `/goal clear`); bound it with "…or stop after N turns." `/loop` is
a timer — see the [cheat-sheet](#loop-limits-cheat-sheet) for its hard limits.

## The repo's pass/fail signals

Everything below leans on these. Commands are from `package.json` `scripts`.

- **The gate trio** — `npm run lint`, `npm run typecheck`, `npm run test:run`.
  This is exactly what `.husky/pre-commit` runs (after `lint-staged`) and what
  `.github/workflows/ci.yml` job `ci` runs (plus `npm run build`). A commit is
  rejected unless typecheck + the full unit suite pass.
- **The fitness suite** — `npx vitest run tests/fitness`. Static scans (no DB)
  that machine-check P0 security invariants: no service-role key, no `select("*")`,
  no direct table writes, no hardcoded identity, run-action routing, and
  `SECURITY DEFINER` `search_path` pinning. Part of `test:run`; fast to run alone.
- **The a11y gate** — `npm run test:a11y` (Playwright + axe). Requires a full
  `next build` with `NEXT_PUBLIC_A11Y_HARNESS=1` inlined, so it is expensive and
  may not run in a plain web session.

> **Assumption:** the gate trio and fitness suite are the binding, always-runnable
> signals. The a11y and integration suites need local capability (a build, or
> `supabase start`) that a remote web session may not have.

## Loop 1 — Green gate

Iterate until the gate trio passes, so commits don't bounce off the pre-commit
hook. **Primitive: agentic in-turn loop** (or `/goal` across turns). Not `/loop`.

- **When to use:** after any change to `app/`, `lib/`, `components/`, `proxy.ts`,
  or colocated `**/__tests__/**`, before commit/push.
- **When not to use:** pure docs / `.drawio` / markdown edits (no JS gate);
  when the failure is environmental — a missing toolchain shim means run `npm ci`
  (per `scripts/verify-toolchain.mjs` remediation), not loop.
- **Command:** `/green-gate`
- **Success:** `lint`, `typecheck`, and `test:run` all exit 0 → report
  "GREEN GATE PASSED" and stop.
- **Stop conditions:** green; or 5 iterations with no progress; or the fix would
  need a migration/schema change (→ human); or a toolchain/network error.
- **Safety:** read/build/test only. No commit or push inside the loop. Never edit
  a test expectation to force a pass, weaken a fitness/security check, or touch
  `supabase/migrations/**` — those go through human review.

## Loop 2 — Fitness inner-loop

A fast, narrow loop for security-sensitive changes. The fitness scans are static
(no DB) and quick, so iterate against them **before** paying for the full gate.
**Primitive: agentic in-turn loop.**

- **When to use:** editing the write path — `app/**/actions.ts`, `lib/**/*rpc*.ts`,
  `lib/admin/run-action.ts`, `lib/auth/**`, or `supabase/migrations/**`. These are
  the same paths `.github/workflows/rls-integration.yml` filters on.
- **When not to use:** pure UI/presentational work with no write or RLS surface.
- **Command:** `/fitness-check`
- **Success:** `npx vitest run tests/fitness` exits 0 → report "FITNESS GREEN".
  While iterating, target one file, e.g.
  `npx vitest run tests/fitness/security-definer-search-path.test.ts`.
- **Stop conditions:** green; the migration content needs human review; or the
  only way to "pass" would be to alter a fitness test.
- **Safety:** fix the **source** so the invariant holds (route the write through
  the correct `SECURITY DEFINER` RPC, pin `search_path`, use `run-action`, drop any
  `select("*")` / service-role / direct table write). Never weaken or skip the
  fitness test. **Every** migration diff and any new RLS policy/grant is a human
  checkpoint — propose the SQL, never auto-apply it.

## Loop 3 — PR CI watch + autofix

Keep a freshly-pushed PR's CI green. **Prefer `subscribe_pr_activity`** (the
harness subscribes to PR events and wakes the session — do not poll with `sleep`).
Use `/loop` only as a timer fallback when event subscription isn't available.

- **When to use:** a PR is open and you've been asked to watch/babysit it, and
  `subscribe_pr_activity` is not in use.
- **When not to use:** as the primary watcher; to `sleep`-poll; to force-merge;
  on `main`.
- **Command:** `/watch-pr-ci <number>`, e.g. `/loop 10m /watch-pr-ci 1234`.
- **Success:** all required checks (`ci.yml` lint/typecheck/build/test:run + the
  a11y job) green → report "CI GREEN" and stop scheduling.
- **Stop conditions:** green; 3 fix cycles with no progress; PR merged/closed;
  user says stop (`unsubscribe_pr_activity` / `Esc`); `/loop`'s 7-day expiry.
- **Safety:** never enable auto-merge, merge, delete the branch, or trigger the
  Codex/Gemini loops — the Codex review loop is **advisory only** (see `AGENTS.md`).
  Merge is always a human action; ambiguous review comments go to the human via
  `AskUserQuestion`. The 3-cycle cap mirrors `CODEX_MAX_FIX_CYCLES` in
  `.github/workflows/codex-review-loop.yml`.

## A11y iterate variant (conditional)

When working on UI accessibility, the a11y suite is a real pass/fail signal —
`tests/a11y/accessible-names.spec.ts` forbids bare control names ("Edit", "Open",
…) and axe flags contrast/role issues. Treat it as an **iterate-until-green
agentic loop**, not a timer, and **scope it to a single spec** to keep it cheap:

```
npx playwright test tests/a11y/accessible-names.spec.ts
```

This is a conditional variant, not a core loop: `test:a11y` needs a full
`next build`, so it may be unavailable in a remote web session. CI's `a11y` job
covers the full matrix on every PR regardless.

## Loops we deliberately don't run

- **Auto-merge / "make it mergeable then merge."** `AGENTS.md` forbids
  auto-merge, enabling auto-merge, and branch deletion. Merge is a human action.
- **Auto-apply migrations.** Writes go through reviewed `SECURITY DEFINER` RPCs;
  migration SQL needs human review. A loop proposes SQL, it never applies it.
- **`rls-integration` locally.** Needs `supabase start`; the weekly cron +
  path-filtered PR job (`rls-integration.yml`) already covers it. Trigger it, don't
  loop it.
- **Seeded-auth route smoke.** Same local-stack dependency;
  `seeded-auth-route-smoke.yml` is `workflow_dispatch`/weekly by design and
  `scripts/seeded-auth-route-smoke.sh` refuses remote stacks.
- **Full `test:a11y` on a timer.** Strong signal but build-expensive; use the
  single-spec variant above, and let CI run the full matrix.
- **Bundle-size / perf watch.** `npm run analyze` and the perf-harness are
  measurement-only with no threshold gate — no binary signal, so nothing to loop on.
- **Recurring doc-sweep.** The `doc-sweep` skill is on-demand by nature; recurring
  auto-sweeps add noise without a pass/fail. Run it by hand.
- **"Run tests forever."** No stop condition — the canonical unsafe loop.
- **Re-implementing `codex-review-loop.mjs`.** Duplicates existing advisory
  automation and risks auto-triggering Claude (`AGENTS.md`).

## Hard safety rules

These apply to every loop here and override convenience:

1. **No auto-merge, no enable-auto-merge, no branch deletion** (`AGENTS.md`).
2. **No auto-applied migrations** — propose SQL diffs for human review.
3. **Never weaken or skip a fitness/security test** to make a loop pass.
4. **No service-role key in runtime code; no direct table writes; no `select("*")`**
   — the fitness suite enforces these and a loop must respect, not route around,
   them.
5. **Bounded iterations** — every loop has an explicit cap and stop condition.
6. **Human checkpoints** on migrations, new RLS policies/grants, and merges.

## `/loop` limits cheat-sheet

Verified from the Claude Code scheduled-tasks docs (behavior may shift with CLI
version — rely on the contract, not exact keystrokes):

- **1-minute floor** (`30s` rounds up to `1m`); jitter up to ~30 min.
- **Auto-expires 7 days** after creation (a safety net, not a feature).
- **Session-bound** — stops when the session/terminal closes; `--resume` restores
  unexpired loops.
- **No catch-up** — if a fire time passes while busy, it fires once when idle.
- **Stop it** with `Esc` (clears the pending wakeup), natural-language
  `/loop clear|off|stop`, or by ending the session. Dynamic loops can self-stop by
  not scheduling the next wakeup once provably done.
- For truly hands-off recurring work, use GitHub Actions or cloud Routines — not
  `/loop`.
