# Example plan-agents (openers)

Use 2–3 of these to open the interview, then steer to the user's real task.
Each is fully plan-billed (subagent + headless + optional Routine).

## 🌙 Nightly PR triage

- **Does:** reads PRs opened since last run, suggests labels, flags risk and
  missing tests, posts a summary.
- **Tools:** `Read, Grep, Glob, Bash` (+ GitHub/Slack MCP for posting).
- **Model:** `sonnet`. **Trigger:** Routine, weekdays 9am (or GitHub
  `pull_request.opened`).

## 📚 Docs-drift checker

- **Does:** scans merged PRs weekly, flags docs that reference changed APIs,
  drafts update PRs.
- **Tools:** `Read, Grep, Glob, Edit, Write, Bash`.
- **Model:** `sonnet`. **Trigger:** Routine, weekly.

## ⬆️ Dependency-bump agent

- **Does:** checks for outdated deps, opens a PR with a safe bump + changelog
  notes, runs the test suite.
- **Tools:** `Read, Edit, Write, Bash`.
- **Model:** `haiku` for the scan, `sonnet` if it has to reason about breakages.
- **Trigger:** Routine, weekly; or cron on a build box.

## 🗣️ Standup digest

- **Does:** summarizes yesterday's merged PRs + open issues into a short digest.
- **Tools:** `Read, Grep, Glob, Bash` (+ Slack MCP).
- **Model:** `haiku`. **Trigger:** Routine, weekdays 8:45am.

## 🔎 On-demand code reviewer (no schedule)

- **Does:** reviews the current diff for a fixed checklist; you run it when you
  want it.
- **Tools:** `Read, Grep, Glob, Bash`.
- **Model:** `sonnet`. **Trigger:** on-demand — `LAUNCH.md` only, no Phase 4.

---

These mirror `anthropics/launch-your-agent`'s example bank, re-pointed at
plan-billed primitives instead of Claude Managed Agents.
