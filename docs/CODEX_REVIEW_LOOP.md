# Codex Review Loop

The old custom multi-agent PR orchestration has been removed. The repository now uses a Codex-only review loop driven by GitHub Actions, `GITHUB_TOKEN`, the GitHub REST API, and the installed Codex GitHub integration.

Claude may still be used manually as a builder, but this workflow does not auto-trigger Claude. Gemini is not part of the automation.

The workflow checks out the repository default branch before running `scripts/codex-review-loop.mjs`. That keeps the write-token automation from executing a modified review-loop script from the PR branch being evaluated. During the bootstrap PR that first adds the script, the workflow skips if the script is not present on the default branch yet.

## Workflow

1. A PR opens or receives a new commit.
2. CI runs normally.
3. `Codex review loop` evaluates open PRs.
4. If Codex has not reviewed the current head SHA, the workflow posts:

   ```text
   @codex review
   ```

5. If Codex leaves current-head review findings, the workflow posts one deduplicated top-level fix request for that PR head SHA:

   ```text
   @codex fix the unresolved Codex review findings for the current head SHA.
   ```

6. Codex pushes the smallest safe fix commit to the PR branch.
7. Every new commit resets the cycle because markers, review comments, reactions, and ready notifications are valid only for the current head SHA.
8. Codex reviews the latest commit again.
9. The loop repeats until the latest head SHA is ready.

## Ready Conditions

A PR is ready only when all of these are true for the latest head SHA:

- The PR is open and not draft.
- The PR head repo is this repository, not a fork.
- GitHub reports the PR as mergeable.
- Checks/statuses for the current head SHA are present and passing.
- Codex left a `+1` reaction on the parent PR after the latest GitHub-observed head commit event.
- No unresolved current-head Codex review findings remain.
- No newer commit exists after the Codex `+1` approval signal.
- The quiet window has elapsed after the latest relevant Codex activity.

The ready notification is:

```text
@Thalfman ✅ Codex approved the latest commit. This PR appears ready to merge manually.
```

The workflow also adds `ai/ready-to-merge`, removes `ai/blocked`, and attempts to add a `+1` reaction from `github-actions[bot]` to the parent PR as a visual breadcrumb.

## Manual Merge Only

This workflow does not auto-merge. It does not enable GitHub auto-merge. It does not delete branches.

The final merge remains manual: review the PR and click Merge yourself.

## Waiting And Blocked State

When a PR is not ready, the workflow maintains one status comment per head SHA using:

```text
<!-- codex-review-loop:blocked:<pr-number>:<head-sha> -->
```

Blocked or waiting comments do not mention `@Thalfman`. The workflow adds `ai/blocked` and removes `ai/ready-to-merge` while a PR is waiting.

Loop markers only count when they were posted by `github-actions[bot]`. User-authored comments containing marker text are ignored for deduplication and max-cycle limits.

## Sensitive Changes

Sensitive paths and terms are warnings, not hard blockers. They do not stop Codex review requests, Codex fix requests, or ready notification solely because they changed.

Warning labels:

- `.github/workflows/**` -> `ai/workflow-sensitive`
- `supabase/migrations/**` and `supabase/functions/**` -> `ai/db-sensitive`
- `middleware.*`, `auth/**`, `rls/**`, and sensitive review text terms -> `ai/security-sensitive`
- `package-lock.json` and `pnpm-lock.yaml` -> `ai/dependency-sensitive`

Sensitive review text terms include `RLS`, `SECURITY DEFINER`, `audit_events`, `admin_private_note`, `role checks`, and `leader-facing read models`.

## Configuration

Optional repository variables:

- `CODEX_REVIEW_LOOP_ENABLED=false` disables loop actions.
- `CODEX_FIX_ENABLED=false` disables Codex fix requests.
- `CODEX_READY_NOTIFY_ENABLED=false` disables ready notification comments.
- `CODEX_QUIET_WINDOW_MINUTES` controls the quiet window. Default: `5`.
- `CODEX_MAX_FIX_CYCLES` controls total fix requests per PR. Default: `3`.
- `CODEX_MAX_FIX_CYCLES_PER_SHA` controls fix requests per head SHA. Default: `1`.
- `CODEX_ACTOR_LOGIN` sets the exact Codex actor login.
- `READY_NOTIFY_LOGIN` controls the ready mention. Default: `Thalfman`.

When `CODEX_ACTOR_LOGIN` is unset, the workflow trusts the installed Codex connector identities `chatgpt-codex-connector[bot]`, `chatgpt-codex-connector`, `codex[bot]`, and `codex`. It explicitly excludes Claude, Gemini, Vercel, Supabase, and `github-actions` actors.

Completed check runs with `success`, `neutral`, or `skipped` conclusions count as passing, matching GitHub required-check semantics. Pending or failed checks still block ready notification.

Only the latest check run per check/app identity is evaluated. Historical failed reruns for the same head SHA do not block readiness after GitHub reports a newer passing run.

Review submissions are treated as history. For review-level change-request state, the loop considers the latest current-head review state per Codex actor so superseded or dismissed older `CHANGES_REQUESTED` reviews do not keep the PR blocked after a later Codex approval.

## Markers

Markers are scoped by PR number and head SHA:

- `codex-review-loop:review-request`
- `codex-review-loop:fix-request`
- `codex-review-loop:max-cycles`
- `codex-review-loop:blocked`
- `codex-review-loop:ready`

Old comments remain on the PR, but a new commit creates a new head SHA and invalidates older markers.

Before posting a ready notification, the workflow re-fetches the PR and confirms the head SHA, draft state, open state, and mergeability are still current.

## Known Limitations

The workflow intentionally uses GitHub REST API only. REST does not expose the resolved state of PR review threads, so the loop treats current-head Codex review comments as unresolved findings. A new fix commit makes those comments stale for the next head SHA and restarts the cycle.

The workflow ignores PRs from forks and PRs whose head repo is not this repository.
