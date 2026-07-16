# Documentation Index

The app is organised as **three areas — Care · Plan · Multiply** (the 2026-06
pivot, now landed). The current direction lives in the pivot ADRs + PRD #371
below. Documentation here is deliberately limited to what the code cannot
express: **decision records** (`adr/`), the **domain glossary**
([`../CONTEXT.md`](../CONTEXT.md)), and thin **navigation/reference maps**.
Point-in-time artifacts (plans, audits, reviews, retros, synthesis docs) are
retired to git history once their work ships — the code is the source of truth
for what exists.

> ✅ **Current direction (the landed pivot):** **ADR
> [0016](./adr/0016-pivot-to-care-plan-multiply.md)–[0021](./adr/0021-three-tier-multiplication-trigger.md)**
> and **PRD [#371](https://github.com/Thalfman/lifegroups/issues/371)** (closed;
> delivered across #372–#382); the multiplication unit was later collapsed to
> free-text group types by
> [ADR 0034](./adr/0034-collapse-cells-to-group-type-list.md). Glossary:
> [`../CONTEXT.md`](../CONTEXT.md).
>
> ⭐ **Original North Star:** [`julian-inputs/SYSTEMS_CONVERSATION.md`](./julian-inputs/SYSTEMS_CONVERSATION.md)
> — Julian's twelve questions (2026-05-27); re-shaped into Care/Plan/Multiply by the pivot.

## Decision records (`adr/`)

Architecture Decision Records — which alternatives were evaluated and why the
chosen one won. Start at the [ADR index](./adr/README.md) — one row per
decision with status and the supersession/amendment chain (the pivot is
0016–0022, amended onward; trace a decision's currency there before citing it).

## Engineering reference

| Doc                                                                            | What it is                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`architecture/ARCHITECTURE.md`](./architecture/ARCHITECTURE.md)               | Stack, routes, auth, RLS, read/write paths.                                                                                                                                                                                                                                                                                                                                          |
| [`architecture/DATABASE_SCHEMA.md`](./architecture/DATABASE_SCHEMA.md)         | Tables and the core model.                                                                                                                                                                                                                                                                                                                                                           |
| [`architecture/RLS_VISIBILITY.md`](./architecture/RLS_VISIBILITY.md)           | The read-visibility matrix — what each tier can/can't `SELECT`.                                                                                                                                                                                                                                                                                                                      |
| [`architecture/DATA_CLASSIFICATION.md`](./architecture/DATA_CLASSIFICATION.md) | Sensitivity taxonomy + the typed classification manifest (`lib/security/data-classification.ts`).                                                                                                                                                                                                                                                                                    |
| [`architecture/diagrams.md`](./architecture/diagrams.md)                       | 🖼️ Rendered architecture diagrams (inline SVG + diagrams.net viewer links) — the **oversight ladder** (downward-visibility + the two privacy exceptions) and the **Care · Plan · Multiply nav spine**. Auto-rendered from the `*.drawio` sources by CI.                                                                                                                              |
| [`architecture/DEPLOYMENT.md`](./architecture/DEPLOYMENT.md)                   | Hosting, env vars, Edge Function setup.                                                                                                                                                                                                                                                                                                                                              |
| [`architecture/EMAIL_DELIVERY.md`](./architecture/EMAIL_DELIVERY.md)           | Email delivery configuration and posture.                                                                                                                                                                                                                                                                                                                                            |
| [`architecture/FREE_TIER_NOTES.md`](./architecture/FREE_TIER_NOTES.md)         | Tier posture (Vercel Hobby + Supabase Pro) and cost constraints.                                                                                                                                                                                                                                                                                                                     |
| [`store/data-inventory.md`](./store/data-inventory.md)                         | Mobile-store data inventory & processor disclosure — data categories, sub-processors, permissions/push posture, for the Apple/Google data forms.                                                                                                                                                                                                                                     |
| [`store/reviewer-demo-seed.md`](./store/reviewer-demo-seed.md)                 | The synthetic reviewer/demo dataset + idempotent seed routine that fills the role surfaces for app-store reviewers.                                                                                                                                                                                                                                                                  |
| [`agents/`](./agents/)                                                         | Agent/skill config: domain-doc rules, issue tracker, triage labels.                                                                                                                                                                                                                                                                                                                  |
| [`runbooks/`](./runbooks/)                                                     | Operator how-tos: [release process](./runbooks/RELEASE.md), [backup & restore + restore drill](./runbooks/BACKUP_AND_RESTORE.md), [incident response](./runbooks/INCIDENT_RESPONSE.md), [observability & SLOs](./runbooks/OBSERVABILITY.md), [launch checklist](./runbooks/LAUNCH_RUNBOOK.md), [seeded-auth route smoke](./runbooks/SEEDED_AUTH_ROUTE_SMOKE.md), live-surface setup. |

## The North Star and its sources (`julian-inputs/`)

[`julian-inputs/SYSTEMS_CONVERSATION.md`](./julian-inputs/SYSTEMS_CONVERSATION.md)
is Julian's Q1–Q12, verbatim — the source of his words, kept read-only. The
folder's [README](./julian-inputs/README.md) records provenance. The other
source artifacts that once lived alongside it (the care-list template, the
2026 multiplication plan, the feedback map) shipped into the product and were
retired to git history (`git log -- docs/julian-inputs`).

## Archived

Everything off the North-Star path — the former blueprint, old roadmaps,
shipped plans/PRDs (`git log -- docs/plans`), point-in-time audits
(`git log -- docs/audits`), code reviews (`git log -- docs/reviews`), retros,
doc-sweep reports, the prior 1:1 PRD (`git log -- docs/PRD.md`), and the
`PRODUCT_DEFINITION.md` synthesis doc — has been removed from the tree and
lives in git history (`git log --diff-filter=D --name-only -- docs` to list
deletions, `git show <commit>:<path>` to read one). It is history, not the
source of truth for what to build next.
