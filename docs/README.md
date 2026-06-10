# Documentation Index

The app is organised as **three areas — Care · Plan · Multiply** (the 2026-06
pivot, now landed). The current direction lives in the pivot ADRs + PRD #371
below; the prior north star (Julian's systems conversation, mapped 1:1 to
Q1–Q12) is kept as the historical record it grew from. Everything off that path
has been archived.

> ✅ **Current direction (the landed pivot):** **ADR
> [0016](./adr/0016-pivot-to-care-plan-multiply.md)–[0021](./adr/0021-three-tier-multiplication-trigger.md)**
> and **PRD [#371](https://github.com/Thalfman/lifegroups/issues/371)** (closed;
> delivered across #372–#382). Glossary: [`../CONTEXT.md`](../CONTEXT.md).
>
> ⭐ **Original North Star:** [`julian-inputs/SYSTEMS_CONVERSATION.md`](./julian-inputs/SYSTEMS_CONVERSATION.md)
> — Julian's twelve questions (2026-05-27); re-shaped into Care/Plan/Multiply by the pivot.
>
> 📌 **Prior PRD:** [`PRD.md`](./PRD.md) — requirements mapped 1:1 to Q1–Q12; superseded in framing by PRD #371.
>
> 🏛️ **Prior ADR:** [`adr/0004-systems-conversation-architecture.md`](./adr/0004-systems-conversation-architecture.md)
> — pre-pivot architecture decisions mapped to Q1–Q12 (deep records in
> [`adr/0001`](./adr/0001-admin-write-action-runner.md)–[`0003`](./adr/0003-private-care-note-encryption.md)).

## The North Star and its sources (`julian-inputs/`)

| Doc                                                                                              | What it is                                         |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| [`julian-inputs/SYSTEMS_CONVERSATION.md`](./julian-inputs/SYSTEMS_CONVERSATION.md)               | ⭐ Julian's Q1–Q12, verbatim. The source of truth. |
| [`julian-inputs/MIN_CARE_LIST_TEMPLATE.md`](./julian-inputs/MIN_CARE_LIST_TEMPLATE.md)           | The blank care spreadsheet (Q1).                   |
| [`julian-inputs/LG_MULTIPLICATION_PLAN_2026.md`](./julian-inputs/LG_MULTIPLICATION_PLAN_2026.md) | Julian's multiplication Google Doc (Q11/Q12).      |
| [`julian-inputs/FEEDBACK_MAP.md`](./julian-inputs/FEEDBACK_MAP.md)                               | How his inputs map to decisions.                   |

## The 1:1 mapping

| Doc                                                                                                | What it is                                                               |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [`PRD.md`](./PRD.md)                                                                               | 📌 **THE PRD** — requirements per question, with shipped/blocked status. |
| [`adr/0004-systems-conversation-architecture.md`](./adr/0004-systems-conversation-architecture.md) | 🏛️ **THE ADR** — architecture decisions per question.                    |

## Referenced plans (linked from the conversation)

| Doc                                                                                          | What it is                                                                                                                    |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| [`plans/SHEPHERD_CARE_TRACKER_PLAN.md`](./plans/SHEPHERD_CARE_TRACKER_PLAN.md)               | Shepherd-care detail (Q1–Q8).                                                                                                 |
| [`plans/GROUP_HEALTH_RUBRIC_DISCOVERY.md`](./plans/GROUP_HEALTH_RUBRIC_DISCOVERY.md)         | Group-health rubric (Q12) — locked; ships with placeholder labels (ADR 0007).                                                 |
| [`plans/CAPACITY_AND_MULTIPLICATION_PRD.md`](./plans/CAPACITY_AND_MULTIPLICATION_PRD.md)     | 📌 Capacity + leader-pipeline + multiplication, as one integrated workspace (Q9–Q11). Supersedes the planner spec below.      |
| [`plans/ADMIN_INTERACTION_MODEL_PRD.md`](./plans/ADMIN_INTERACTION_MODEL_PRD.md)             | Admin interaction model for progressive disclosure, density reduction, and accessible list-to-detail editing across `/admin`. |
| [`plans/CONCEPT_RECONCILIATION.md`](./plans/CONCEPT_RECONCILIATION.md)                       | 🧹 Backlog/audit of where the pre-pivot "broad platform" concept still lingers in code, schema, and copy. Not a build spec.   |
| [`plans/FRESH_SLATE_AND_ADMIN_COCKPIT_PRD.md`](./plans/FRESH_SLATE_AND_ADMIN_COCKPIT_PRD.md) | Proposed (design-only) — Super-Admin "Danger Zone" power tools + admin landing-page ergonomics. Not yet built.                |

## Engineering reference

| Doc                                                                    | What it is                                                                                                                                                                              |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`architecture/ARCHITECTURE.md`](./architecture/ARCHITECTURE.md)       | Stack, routes, auth, RLS, read/write paths.                                                                                                                                             |
| [`architecture/DATABASE_SCHEMA.md`](./architecture/DATABASE_SCHEMA.md) | Tables and the core model.                                                                                                                                                              |
| [`architecture/RLS_VISIBILITY.md`](./architecture/RLS_VISIBILITY.md)   | The read-visibility matrix — what each tier can/can't `SELECT`.                                                                                                                         |
| [`architecture/DEPLOYMENT.md`](./architecture/DEPLOYMENT.md)           | Hosting, env vars, Edge Function setup.                                                                                                                                                 |
| [`architecture/FREE_TIER_NOTES.md`](./architecture/FREE_TIER_NOTES.md) | Tier posture (Vercel Hobby + Supabase Pro) and cost constraints.                                                                                                                        |
| [`adr/`](./adr/)                                                       | Architecture Decision Records (0001–0024; the pivot is 0016–0022, amended by 0023–0024).                                                                                                |
| [`agents/`](./agents/)                                                 | Agent/skill config: domain-doc rules, issue tracker, triage labels.                                                                                                                     |
| [`runbooks/`](./runbooks/)                                             | Operator how-tos: [release process](./runbooks/RELEASE.md), [backup & restore](./runbooks/BACKUP_AND_RESTORE.md), [launch checklist](./runbooks/LAUNCH_RUNBOOK.md), live-surface setup. |

## Archived

Everything not on the North-Star path — the former blueprint, the old product roadmap,
the feature backlog, per-feature specs, process docs, and historical phase specs — lives
in [`archive/`](./archive/README.md). It is history, not the source of truth for what to
build next.
