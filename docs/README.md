# Documentation Index

The documentation maps to **one North Star**: Julian's systems conversation. Everything
live below traces to it; everything else has been archived.

> ⭐ **North Star:** [`julian-inputs/SYSTEMS_CONVERSATION.md`](./julian-inputs/SYSTEMS_CONVERSATION.md)
> — Julian's twelve questions and answers (2026-05-27).
>
> 📌 **THE PRD:** [`PRD.md`](./PRD.md) — product requirements, mapped 1:1 to Q1–Q12.
>
> 🏛️ **THE ADR:** [`adr/0004-systems-conversation-architecture.md`](./adr/0004-systems-conversation-architecture.md)
> — architecture decisions, mapped 1:1 to Q1–Q12 (with deep records in
> [`adr/0001`](./adr/0001-admin-write-action-runner.md)–[`0003`](./adr/0003-private-care-note-encryption.md)).

## The North Star and its sources (`julian-inputs/`)

| Doc | What it is |
|---|---|
| [`julian-inputs/SYSTEMS_CONVERSATION.md`](./julian-inputs/SYSTEMS_CONVERSATION.md) | ⭐ Julian's Q1–Q12, verbatim. The source of truth. |
| [`julian-inputs/MIN_CARE_LIST_TEMPLATE.md`](./julian-inputs/MIN_CARE_LIST_TEMPLATE.md) | The blank care spreadsheet (Q1). |
| [`julian-inputs/LG_MULTIPLICATION_PLAN_2026.md`](./julian-inputs/LG_MULTIPLICATION_PLAN_2026.md) | Julian's multiplication Google Doc (Q11/Q12). |
| [`julian-inputs/FEEDBACK_MAP.md`](./julian-inputs/FEEDBACK_MAP.md) | How his inputs map to decisions. |

## The 1:1 mapping

| Doc | What it is |
|---|---|
| [`PRD.md`](./PRD.md) | 📌 **THE PRD** — requirements per question, with shipped/blocked status. |
| [`adr/0004-systems-conversation-architecture.md`](./adr/0004-systems-conversation-architecture.md) | 🏛️ **THE ADR** — architecture decisions per question. |

## Referenced plans (linked from the conversation)

| Doc | What it is |
|---|---|
| [`plans/SHEPHERD_CARE_TRACKER_PLAN.md`](./plans/SHEPHERD_CARE_TRACKER_PLAN.md) | Shepherd-care detail (Q1–Q8). |
| [`plans/GROUP_HEALTH_RUBRIC_DISCOVERY.md`](./plans/GROUP_HEALTH_RUBRIC_DISCOVERY.md) | Group-health discovery (Q12) — blocked on Julian's rubric. |

## Engineering reference

| Doc | What it is |
|---|---|
| [`architecture/ARCHITECTURE.md`](./architecture/ARCHITECTURE.md) | Stack, routes, auth, RLS, read/write paths. |
| [`architecture/DATABASE_SCHEMA.md`](./architecture/DATABASE_SCHEMA.md) | Tables and the core model. |
| [`architecture/DEPLOYMENT.md`](./architecture/DEPLOYMENT.md) | Hosting, env vars, Edge Function setup. |
| [`architecture/FREE_TIER_NOTES.md`](./architecture/FREE_TIER_NOTES.md) | Vercel Hobby + Supabase Free constraints. |
| [`adr/`](./adr/) | Architecture Decision Records (0001–0004). |
| [`agents/`](./agents/) | Agent/skill config: domain-doc rules, issue tracker, triage labels. |

## Archived

Everything not on the North-Star path — the former blueprint, the old product roadmap,
the feature backlog, per-feature specs, process docs, and historical phase specs — lives
in [`archive/`](./archive/README.md). It is history, not the source of truth for what to
build next.
