# Plan-billed primitives map

The plan-billed replacements for Claude Managed Agent (CMA) primitives. Every
item here runs on the user's **subscription** (Pro/Max/Team/Enterprise), not an
API key.

| CMA primitive (launch-your-agent) | Plan-billed equivalent (this skill)                   |
| --------------------------------- | ----------------------------------------------------- |
| 🤖 agent (Console, API)           | **Subagent** — `.claude/agents/<name>.md`             |
| ▶️ session kickoff (API)          | **Headless run** — `claude -p "…"`                    |
| 🗓️ scheduled deployment           | **Routine** (native cloud) _or_ cron / GitHub Actions |
| 🔐 API key in `.env`              | **None** — OAuth subscription login                   |
| 📦 environment                    | Routine **cloud environment** _or_ local machine      |

---

## 🤖 Subagent — `.claude/agents/<name>.md`

A specialized worker with its own context window, system prompt, and tool
allowlist. Invoked in-session via the Agent/Task tool (auto-delegated by
`description`, or "use the <name> agent to …"). **Runs on plan.**

Markdown file: YAML frontmatter + body (the body **is** the system prompt).
Only `name` and `description` are required.

| Field             | Notes                                                                         |
| ----------------- | ----------------------------------------------------------------------------- |
| `name`            | lowercase + hyphens, unique. (filename need not match)                        |
| `description`     | when Claude should delegate to it — be trigger-rich                           |
| `tools`           | comma-separated allowlist, e.g. `Read, Grep, Glob, Bash`. Omit = inherit all  |
| `disallowedTools` | tools to remove from the inherited/specified set                              |
| `model`           | `sonnet` / `opus` / `haiku` / `fable` / full ID / `inherit` (default)         |
| `permissionMode`  | `default` / `acceptEdits` / `auto` / `dontAsk` / `bypassPermissions` / `plan` |
| `maxTurns`        | cap agentic turns                                                             |
| `skills`          | skills to preload into context at startup                                     |
| `mcpServers`      | MCP servers available to the subagent                                         |

Example:

```markdown
---
name: pr-triage
description: Triages new pull requests — labels, summarizes risk, flags missing tests.
tools: Read, Grep, Glob, Bash
model: sonnet
---

You are a PR triage assistant. When invoked, read the diff, classify risk,
suggest labels, and flag any change that lacks a corresponding test.
```

Scopes (highest priority wins): `--agents` JSON flag → `.claude/agents/`
(project, check into git) → `~/.claude/agents/` (personal) → plugin. Subagents
load at **session start** — restart after editing a file on disk, or create via
`/agents` for immediate effect.

> In this repo, prefer `.claude/agents/<name>.md` so the agent is
> version-controlled and reviewable in PRs.

## ▶️ Headless run — `claude -p`

Runs Claude Code non-interactively; returns a result and exits. **On plan** when
run against a logged-in OAuth session.

```bash
claude -p "<task>" --allowedTools "Read,Grep,Glob,Bash" --output-format json
```

Key flags:

| Flag                                      | Purpose                                                 |
| ----------------------------------------- | ------------------------------------------------------- |
| `-p` / `--print`                          | non-interactive                                         |
| `--allowedTools "A,B"`                    | auto-approve tools (permission-rule syntax)             |
| `--permission-mode dontAsk\|acceptEdits`  | session-wide baseline                                   |
| `--output-format text\|json\|stream-json` | `json` adds `.result`, `.session_id`, `.total_cost_usd` |
| `--json-schema '<schema>'`                | structured output in `.structured_output`               |
| `--append-system-prompt "…"`              | add instructions, keep defaults                         |
| `--model <id>`                            | model override                                          |
| `--agents '<json>'`                       | define ephemeral subagents for the run                  |
| `--continue` / `--resume <id>`            | continue the last / a specific session                  |

User-invoked skills work in `-p`: include `/skill-name` in the prompt string.

> **Plan-billed rule (critical).** Stay on the subscription by running plain
> `claude -p` against an interactive OAuth login. Do **not** pass `--bare` and do
> **not** set `ANTHROPIC_API_KEY` — `--bare` skips OAuth and requires an API key,
> and a set `ANTHROPIC_API_KEY` takes precedence over the plan login. Both route
> to per-token API billing.

## 🗓️ Routine — native scheduled agent (research preview)

A saved Claude Code config (prompt + repos + connectors) that runs on
**Anthropic-managed cloud infra** so it works with the laptop closed.
**Subscription-billed, no API key.** Available on Pro/Max/Team/Enterprise with
Claude Code on the web enabled. Manage at
[claude.ai/code/routines](https://claude.ai/code/routines) or via `/schedule`.

Triggers (combinable): **Schedule** (hourly/daily/weekdays/weekly or one-off;
min interval 1 hour; custom cron via `/schedule update`), **API** (POST to a
per-routine `/fire` endpoint with a bearer token + beta header), **GitHub**
(`pull_request.*` / `release.*` with filters; requires the Claude GitHub App).

CLI: `/schedule daily PR review at 9am`, `/schedule in 2 weeks, …`,
`/schedule list | update | run`. `/schedule` creates **scheduled** routines only;
add API/GitHub triggers from the web.

Caveats: `/schedule` is hidden if you're authenticated with an API key
(`ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN`/`apiKeyHelper`), if telemetry-off
env vars are set, or if you're inside a web session — manage from the web UI
then. Routines draw down subscription usage **and** a per-account **daily routine
run cap** (one-off runs are exempt from the cap). Routines run autonomously: no
permission prompts, so scope repos/connectors/network tightly.

## ⏰ cron / GitHub Actions — self-hosted scheduling

Wrap `claude -p` in cron, launchd, or a CI workflow on a machine the user
controls. Runs on plan **only** if that machine has an interactive `claude`
OAuth login and no `ANTHROPIC_API_KEY` — otherwise it falls back to API billing.
Prefer Routines for unattended plan-billed work; use this when the job must run
in the user's own environment.

## What we deliberately do NOT use

- **Claude Agent SDK app** — API-key billed; out of scope.
- **CMA / Console deployment** — that's `launch-your-agent`.
- **`--bare` mode** — forces API-key auth; never use it for plan-billed runs.
