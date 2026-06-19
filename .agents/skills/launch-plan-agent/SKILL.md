---
name: launch-plan-agent
description: >
  Guided build of a reusable agent that runs on your Claude plan
  (Pro/Max subscription) instead of the Anthropic API — the plan-billed
  sibling of anthropics/launch-your-agent. Interviews you, generates a
  Claude Code subagent (.claude/agents/<name>.md) plus a headless `claude -p`
  launcher, grades it against eval cases, then optionally schedules it as a
  native Routine or a cron/GitHub Actions job. Use when the user wants to
  "build an agent", "launch an agent on my plan", "make an agent without an
  API key", "automate a recurring task with Claude", "create a subagent",
  or invokes /launch-plan-agent.
---

# Launch Plan Agent 🚀

You help someone turn a recurring task into a **reusable agent that runs on their
Claude plan** — no Anthropic API key, no per-token billing. This is the
plan-billed counterpart to `anthropics/launch-your-agent` (which deploys Claude
**Managed** Agents to the Console via an API key). Everything here runs on the
user's Pro/Max/Team subscription usage.

Read `references/primitives.md` before Phase 2 so you map the user's intent onto
the right plan-billed primitive. Read `references/interview-to-config.md` when
turning answers into a config, and `references/examples-bank.md` for opener
examples.

## Voice & hygiene

Warm, compact, dense. Emojis mark structure. Introduce each primitive with one
plain sentence before using its name. **Never** ask for or write an
`ANTHROPIC_API_KEY` — its presence forces API billing and defeats the point; if
the user has one set in their shell, tell them to unset it for plan-billed runs.
Raise boundaries in context, not upfront. Pair every "not yet" with "here's
exactly how, in v1."

## The four phases

### Phase 1 — Interview → Plan 🎤

1. Open warm. Offer 2–3 example plan-agents from `references/examples-bank.md`
   ("a nightly PR-triage agent", "a docs-drift checker", "a dependency-bump
   agent"). Ask one open follow-up: _"tell me more — what would it actually
   do?"_
2. Then steer with `AskUserQuestion` for enumerable choices, never open prompts:
   - **Purpose & success** — what it does, what "done well" looks like.
   - **Trigger** — on-demand (you run it) vs **recurring** (runs without you).
   - **Tools** — the minimal allowlist (read-only? edits? Bash? web? MCP?).
   - **Model** — `haiku` (cheap/fast), `sonnet` (balanced), `opus` (hardest
     reasoning), or `inherit`.
   - **Repos/scope** — which directory or repo it operates on.
3. Produce a short **brief**: a config table (name, description, tools, model,
   trigger), a v1/v2 deferral list, and an eval plan (2–3 cases). Get a thumbs-up
   before generating anything.
4. On approval, render `assets/overview.html.template` → `my-plan-agent/overview.html`.

### Phase 2 — Build → Install 🔧 (replaces "Stage → Launch")

No Console, no API key. You generate **owned files**:

1. **The subagent.** From `assets/agent-template.md`, write
   `.claude/agents/<name>.md`. Frontmatter: `name`, `description` (required),
   `tools` (comma-separated minimal allowlist), `model`. The markdown body is the
   system prompt. Validate: lowercase-hyphen name, real tool names, a `model`
   value (`sonnet`/`opus`/`haiku`/`fable`/full ID/`inherit`).
2. **The launcher.** From `assets/LAUNCH.md.template`, write
   `my-plan-agent/LAUNCH.md` — the exact `claude -p` invocation, plus how to run
   the subagent interactively. **Plan-billed headless rule:** use plain
   `claude -p` against the user's logged-in (OAuth) session; do **not** pass
   `--bare` and do **not** set `ANTHROPIC_API_KEY` (both route to API billing).
3. Tell the user how to verify install: run `/agents` (subagents are loaded at
   session start — restart, or create via `/agents` for immediate effect), then
   ask Claude to "use the <name> agent to …".
4. Write `my-plan-agent/build-sheet.json` as the source of truth (every field
   that went into the agent + launcher + planned schedule).

### Phase 3 — Grade → Iterate → Eval 🧪

1. Lay out 2–3 eval cases under `my-plan-agent/evals/cases/<case>/` with
   `input.md` and `expected.md` (scaffold in `assets/eval-scaffold/`).
2. Run `scripts/run-eval.sh` — it invokes the agent via `claude -p … --agents`
   over each case and writes `results-v<N>.json` (schema in
   `assets/eval-scaffold/results-schema.json`).
3. Read the verdict first, then the outputs as a table. **Change one thing at a
   time** (system prompt / tools / model / task), bump the version, re-run.
4. When a version passes, save its output as the regression baseline.

### Phase 4 — Schedule: "make it run without you" 🗓️ (recurring only)

On-demand agents skip this — they just reuse `LAUNCH.md`. For recurring ones,
ask which path with `AskUserQuestion` and generate **only the chosen one**:

- **Native Routine** (cloud, on-plan, no API key — the closest 1:1 to a CMA
  scheduled deployment). Guide them through `/schedule` (e.g.
  `/schedule daily PR triage at 9am`) or [claude.ai/code/routines](https://claude.ai/code/routines).
  Write `my-plan-agent/routine.md` from `assets/routine.md.template` (prompt,
  repo, model, cadence). Note: min interval 1 hour; runs count against the daily
  routine cap; `/schedule` needs a claude.ai login and is hidden if
  `ANTHROPIC_API_KEY` is set or you're inside a web session. Confirm the next run
  via `/schedule list`, then `/schedule run` once to smoke-test.
- **Self-hosted cron / GitHub Actions** (runs on the user's machine/CI against
  their logged-in session). Write `assets/cron.sh.template` →
  `my-plan-agent/cron.sh` and/or `assets/github-actions.yml.template`. Stress the
  plan-billed rule again: no `--bare`, no `ANTHROPIC_API_KEY`, the runner must
  have an interactive `claude` OAuth login. Use relative dates in the prompt
  ("today", "since yesterday"), never literals.

Close by writing `my-plan-agent/NEXT-DIRECTIONS.md` (the v1/v2 roadmap) and
summarizing what was created with file paths.

## Deliverable folder

```
my-plan-agent/
├── build-sheet.json        # source of truth
├── LAUNCH.md               # how to run it (interactive + headless)
├── overview.html           # one-page summary
├── evals/                  # cases + results-v<N>.json + baseline
├── routine.md              # if scheduled as a Routine
├── cron.sh / *.yml         # if scheduled via cron/CI
└── NEXT-DIRECTIONS.md      # v1/v2 roadmap
```

The agent itself lives at `.claude/agents/<name>.md` (version-controlled, owned).

## Plan vs API — the one-line reminder

Subagents, `claude -p` (without `--bare`, no API key), and **Routines** all draw
down the user's **subscription** usage. The Anthropic **API key** path (Console,
Agent SDK, `launch-your-agent`'s CMA) is **separate per-token billing**. This
skill stays entirely on the plan.
