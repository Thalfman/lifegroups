# AI Review Orchestration (Manual Merge Readiness)

This repository uses GitHub Actions + `GITHUB_TOKEN` + GitHub REST API + installed GitHub integrations to automate AI review cycles.

## Important safety guarantee

**This system does not auto-merge and does not delete branches.**

- It never calls the GitHub merge API.
- It never enables GitHub auto-merge.
- It never deletes branches.
- Ready notification is a single deduped `@Thalfman` (or `READY_NOTIFY_LOGIN`) PR comment plus the `ai/ready-to-merge` label — never an automated merge.

## Trigger model

**Event-driven plus scheduled fallback.** Both workflows react to repository activity in near-real-time; the 10-minute cron is a backup, not the primary trigger.

Event triggers wired into both workflows:

- `pull_request` (opened, reopened, synchronize, ready_for_review; readiness also: converted_to_draft)
- `pull_request_review` (submitted)
- `pull_request_review_comment` (created; readiness also: edited)
- `issue_comment` (created; readiness also: edited)
- `check_suite` (completed)
- `status`

`pull_request_target` is intentionally not used — running workflows with write access against untrusted fork code is an attack surface this repo does not need. Fork PR events are skipped at the job level; same-repo branches (e.g. `claude/...`) get full event coverage.

Self-trigger loops from `github-actions[bot]` comments are filtered at the workflow `if:` boundary, and dedupe markers (see below) prevent duplicate posts even if a run slips through. Concurrency groups serialize bursts so an in-flight scan finishes processing every open PR before the next event-driven run starts.

## Automated flow

Each step now fires as soon as the prior signal arrives instead of waiting for the next cron tick.

1. PR opens → `pull_request.opened` triggers the orchestrator.
2. Orchestrator requests Codex/Gemini review when missing.
3. Codex/Gemini review → `pull_request_review.submitted` or `issue_comment.created` triggers the orchestrator.
4. Orchestrator waits until both complete for current head SHA.
5. If actionable feedback exists, orchestrator tags Claude.
6. Claude posts response and/or pushes fixes (push fires `pull_request.synchronize`).
7. New commit resets the cycle for the new head SHA.
8. Readiness workflow applies deterministic gates after each relevant event (PR update, review, comment, check completion, commit status).
9. When ready, readiness workflow mentions `@Thalfman` (or `READY_NOTIFY_LOGIN`) with manual-merge-ready notice and applies `ai/ready-to-merge`.
10. Human reviews and clicks **Merge** manually.

## Workflows and scripts

- `.github/workflows/ai-review-orchestrator.yml`
- `scripts/ai-review-orchestrator.mjs`
- `.github/workflows/ai-merge-readiness.yml`
- `scripts/ai-merge-readiness.mjs`

## Variables (all optional)

Unset values keep automation enabled by default.

- `AI_REVIEW_AUTOMATION_ENABLED` (default: `true`)
  - exactly `false` disables scheduled review requests and Claude triggers.
- `AI_REVIEW_REQUEST_REVIEWS` (default: `true`)
  - exactly `false` disables automated `@codex review` and `/gemini review` requests.
- `AI_REVIEW_READY_NOTIFY_ENABLED` (default: `true`)
  - exactly `false` disables ready @mention notification.
- `CODEX_ACTOR_LOGIN` (optional exact actor)
  - unset: heuristic login contains `codex` (case-insensitive).
- `GEMINI_ACTOR_LOGIN` (default: `gemini-code-assist[bot]`)
- `CLAUDE_TRIGGER` (default: `@claude`)
- `READY_NOTIFY_LOGIN` (default: `Thalfman`)
- `ALLOWED_PR_AUTHORS` (optional comma-separated allowlist)

## Kill switches

- Set `AI_REVIEW_AUTOMATION_ENABLED=false` to stop review requests and Claude triggers.
- Set `AI_REVIEW_REQUEST_REVIEWS=false` to stop automated Codex/Gemini review requests.
- Set `AI_REVIEW_READY_NOTIFY_ENABLED=false` to stop ready @mentions.

## Completion signals

- **Codex complete**: issue/review/review-comment after head commit timestamp, or Codex +1 reaction.
- **Gemini complete**: issue/review/review-comment after head commit timestamp.
- 👀 eyes is treated as seen/in-progress only.
- Gemini thumbs-up is **not required** because integration behavior varies and comment/review output is the durable signal.


## Visual reaction states

Inline PR review comments authored by Codex/Gemini get additive reactions from `github-actions[bot]` as visual progress indicators:

- 👀 `eyes` = detected / queued
- 🚀 `rocket` = Claude triggered / processing
- 👍 `+1` = handled / completed
- 😕 `confused` = manual review required

These reactions are status hints only. Deterministic merge readiness still comes from repository state and comment/check evaluation, not reactions alone. Reactions are added by `github-actions[bot]`, not necessarily by Claude directly.

## Sensitive-path and sensitive-term blocking

If sensitive paths or terms are detected, automation blocks Claude triggering and readiness and posts manual-review-required state for that head SHA.

Sensitive paths include:
- `.github/workflows/**`
- `.env*`
- `supabase/migrations/**`
- `supabase/functions/**`
- `middleware.*`
- `auth/**`
- `rls/**`
- lockfiles

Sensitive terms include:
- `admin_private_note`
- `SECURITY DEFINER`
- `audit_events`
- `role checks`
- `leader-facing read models`
- `RLS`

## Max cycle limits

- Claude trigger max: 2 per head SHA.
- Claude trigger max: 3 total per PR.
- When exceeded, orchestrator posts a max-cycles-reached marker and stops Claude triggering.

## Deterministic readiness (not LLM-decided)

Readiness script only uses deterministic repository state:
- PR status (not draft, mergeable, safe mergeable_state)
- same-repo/non-fork rules
- checks passing
- current-head Codex + Gemini completion
- no unresolved actionable AI feedback
- no pending Claude response (if Claude was triggered)
- no manual-review-required / max-cycles markers
- no sensitive path/term blockers
- no head-SHA race during evaluation

## Readiness notification behavior

When ready, workflow posts a deduplicated comment with:
- `@READY_NOTIFY_LOGIN AI review complete. This PR appears ready to merge manually.`
- head SHA, completion statuses, checks, next step.

Also maintains labels:
- ready: `ai/ready-to-merge`
- blocked: `ai/blocked`

## Integration requirement for no-key operation

Installed Codex/Gemini/Claude integrations must respond to trigger comments authored by `github-actions[bot]` for this no-key setup to work.

## Branch cleanup

- Use GitHub native automatic head-branch deletion after merge, if desired.
- Or delete branches manually after merge.
- This automation does not delete branches.
