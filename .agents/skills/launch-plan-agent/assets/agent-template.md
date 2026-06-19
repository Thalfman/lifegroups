---
name: { { AGENT_NAME } }
description: { { WHEN_TO_DELEGATE — trigger-rich, one or two sentences } }
tools: { { MINIMAL_ALLOWLIST e.g. Read, Grep, Glob, Bash } }
model: { { sonnet | opus | haiku | fable | inherit } }
# Optional:
# disallowedTools: {{tools to remove}}
# permissionMode: {{default | acceptEdits | dontAsk}}
# maxTurns: {{N}}
# mcpServers: [{{server-name}}]
---

You are {{ROLE}}. When invoked, {{WHAT_TO_DO}}.

## Inputs

- {{What the agent is given / where it looks}}

## Steps

1. {{step}}
2. {{step}}

## Output

- {{Exactly what to return — be specific; the parent only sees this summary}}

## Constraints

- {{Least-privilege reminders, what NOT to touch, when to stop}}
