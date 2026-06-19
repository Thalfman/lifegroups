---
description: Watch an open PR's CI and push the smallest fix until checks are green
---

Watch and autofix CI for PR **#$ARGUMENTS**.

> **Prefer `subscribe_pr_activity`** for watching PRs — it is event-driven and
> wakes the session on CI/review activity. Use this command under `/loop` only as
> a timer fallback (e.g. `/loop 10m /watch-pr-ci $ARGUMENTS`), and never poll with
> Bash `sleep`.

Each iteration:

1. Check the latest CI for the PR — `ci.yml` (lint / typecheck / build /
   test:run) and the `a11y` job.
2. If all required checks pass, report **"CI GREEN"** and stop scheduling further
   iterations.
3. If a check failed, fetch the failing job log, reproduce locally with the
   matching repo command (`npm run lint` / `npm run typecheck` / `npm run build` /
   `npm run test:run`; a11y repro needs `npm run test:a11y`, which may be
   unavailable without a local build), push the **smallest** fix to the PR branch,
   and update the status checklist.

Hard rules (from `AGENTS.md` — the Codex review loop is advisory only):

- Never enable auto-merge, merge, or delete the branch.
- Never trigger the Codex or Gemini loops.
- Merge is always a human action.
- For any ambiguous review comment, ask the human via `AskUserQuestion` rather
  than guessing.

Stop conditions: CI green; 3 fix cycles with no progress (report where you're
stuck); PR merged or closed; the user says stop. The 3-cycle cap mirrors
`CODEX_MAX_FIX_CYCLES` in `.github/workflows/codex-review-loop.yml`.
