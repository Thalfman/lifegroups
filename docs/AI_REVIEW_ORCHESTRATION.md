# AI Review Orchestration

## Architecture overview

This implementation provides a phased orchestration harness using only GitHub Actions, `GITHUB_TOKEN`, GitHub REST API, and comment-based triggers for installed integrations (`@claude`, `@codex review`, `/gemini review`).

Components:
- **Smoke test**: `.github/workflows/ai-review-smoke-test.yml`
- **Orchestrator**: `.github/workflows/ai-review-orchestrator.yml` + `scripts/ai-review-orchestrator.mjs`
- **Merge gate**: `.github/workflows/ai-merge-gate.yml` + `scripts/ai-merge-gate.mjs`

## State machine

Per PR head SHA:
1. Review requests are posted (manual/smoke-test phase).
2. Codex/Gemini review completion is detected.
3. If both complete and actionable comments exist, orchestrator triggers Claude.
4. Claude pushes fixes, PR head SHA changes.
5. Previous markers become stale; cycle restarts for new SHA.
6. Merge gate evaluates deterministic rules and reports blockers or eligibility.

State and dedupe markers used in PR comments:
- `<!-- ai-review-orchestrator:state:{pr_number}:{head_sha}:{state_name} -->`
- `<!-- ai-review-orchestrator:claude-trigger:{pr_number}:{head_sha} -->`
- `<!-- ai-review-orchestrator:dry-run:{pr_number}:{head_sha}:{run_id} -->`

## What eyes means for Codex and Gemini

- 👀 is treated as **seen/in-progress only**.
- It is **not** treated as completion for Gemini.
- For Codex, thumbs-up and/or review output can indicate completion.

## Why Gemini thumbs-up is not used

Gemini integrations can post comments/review summaries/inline comments without reliably using thumbs-up semantics. Completion is therefore inferred from Gemini-authored issue/review comments after current head SHA.

## Why GitHub workflow is the merge judge, not an LLM

Merging is deterministic and policy-driven. The merge gate script checks objective repository state (head SHA stability, check-run status, sensitive paths, markers, actionable comments) and only merges when all rules pass.

## Required repository settings

- Keep Codex, Gemini, Claude integrations installed and permitted on repository PRs.
- Ensure GitHub Actions has permissions to write PR comments.
- Enable native **automatic head branch deletion** in repository settings (no custom branch deletion automation needed).

## Manual smoke test steps

1. Open a test PR.
2. Run **AI Review Smoke Test** (`ai-review-smoke-test`) with `pr_number`.
3. Confirm Claude responds to `github-actions[bot]` comment.
4. Confirm Codex responds.
5. Confirm Gemini responds.
6. If any integration ignores bot-created comments, fallback is to have a human maintainer post equivalent trigger comments manually.

## Run orchestrator in dry-run

Run workflow **AI Review Orchestrator** with:
- `dry_run=true` (default)
- optional `pr_number`

Dry-run posts what would happen but does not tag Claude.

## Enable real Claude trigger later

When ready, run orchestrator with `dry_run=false` (manual dispatch first).

## Run merge gate in dry-run

Run workflow **AI Merge Gate** with:
- `pr_number`
- `dry_run=true` (default)

The workflow comments either blockers or:
`AI merge gate passed in dry-run. This PR appears eligible for merge.`

## Known limitations

- Integration actor logins can vary by installation; configure repository variables (`CODEX_ACTOR_LOGIN`, `GEMINI_ACTOR_LOGIN`) if defaults do not match.
- Actionable-comment detection is keyword based and intentionally conservative.
- Unresolved comment detection currently relies on latest-head review comments matching actionable keywords.
- Merge gate is manual dispatch only in this phase.

## Manual verification before enabling real automation

- Verify all integrations respond to bot-authored comments.
- Verify Codex and Gemini identity mapping (`CODEX_ACTOR_LOGIN`, `GEMINI_ACTOR_LOGIN`).
- Verify sensitive-path and sensitive-term policy behavior on representative PRs.
- Verify dry-run output quality and marker deduplication on multiple head SHA updates.
- Verify check-run policy aligns with branch protection expectations.
