# Interview answers → config

Map each interview answer onto a concrete field. Keep the allowlist **minimal** —
fewer tools is safer and cheaper.

| You learn…                             | It sets…                                                              |
| -------------------------------------- | --------------------------------------------------------------------- |
| What it does + when to delegate        | subagent `description` (trigger-rich) + system-prompt body            |
| "Just look / report" vs "make changes" | `tools` — read-only (`Read, Grep, Glob`) vs +`Edit, Write, Bash`      |
| Needs the web / external services      | add `WebSearch, WebFetch` / `mcpServers`                              |
| How hard the reasoning is              | `model`: `haiku` (cheap/fast) · `sonnet` (default) · `opus` (hardest) |
| Cost/safety ceiling                    | `maxTurns`, `permissionMode`                                          |
| On-demand vs recurring                 | Phase 4 path (skip vs Routine/cron)                                   |
| How often (recurring)                  | Routine cadence (min 1 hour) or cron expression                       |
| Which repo/dir                         | subagent scope + Routine repositories / cron `cd`                     |

## Choosing the tool allowlist (default to least privilege)

- **Reporter / reviewer** → `Read, Grep, Glob` (optionally `Bash` for read-only
  commands, `WebFetch`).
- **Fixer** → add `Edit, Write, Bash`.
- **Researcher** → add `WebSearch, WebFetch`.
- **Connected** (Slack/Linear/GitHub/etc.) → add the relevant `mcpServers`; for
  Routines these come from claude.ai connectors.

## Choosing the schedule path (Phase 4)

| If the user…                                       | Use                                              |
| -------------------------------------------------- | ------------------------------------------------ |
| wants it fully unattended, laptop-closed, no infra | **Routine** (schedule trigger)                   |
| wants it to react to PRs/releases                  | **Routine** (GitHub trigger)                     |
| wants an alerting tool / pipeline to fire it       | **Routine** (API trigger)                        |
| already has cron/CI and wants it there             | **cron / GitHub Actions**                        |
| is API-key-authenticated and can't use `/schedule` | web UI Routine, or cron with a fresh OAuth login |

## Naming

`name`: lowercase-hyphen, verb-or-noun phrase tied to the job
(`pr-triage`, `docs-drift`, `dep-bump`, `standup-digest`). Reuse it for the
deliverable folder reference and the Routine name so everything lines up.
