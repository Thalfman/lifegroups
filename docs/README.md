# Documentation Index

Everything in `docs/` at a glance. **New here? Start with
[`MASTER_BLUEPRINT.md`](./MASTER_BLUEPRINT.md)** (the live status map), then read
the PRD.

> 📌 **THE PRD:** [`PRODUCT_ROADMAP.md`](./PRODUCT_ROADMAP.md) — the single
> product requirements / ordered execution plan. (Kept under this filename
> intentionally; it *is* the PRD.)
>
> 🏛️ **Architecture decisions (ADRs):** live in [`adr/`](./adr/) —
> [0001](./adr/0001-admin-write-action-runner.md),
> [0002](./adr/0002-oversight-ladder-and-leader-gating.md),
> [0003](./adr/0003-private-care-note-encryption.md).
>
> ✅ **Where do we stand / what's left?** →
> [`STATUS_CHECKLIST.md`](./STATUS_CHECKLIST.md).

## Canonical triad — `docs/` root, source of truth

| Doc | What it is |
|---|---|
| [`MASTER_BLUEPRINT.md`](./MASTER_BLUEPRINT.md) | The at-a-glance stage map: every workstream, its stage, what's next. **Start here.** |
| [`PRODUCT_ROADMAP.md`](./PRODUCT_ROADMAP.md) | 📌 **THE PRD** — ordered execution plan + reliability/security debt appendix. |
| [`FEATURE_BACKLOG.md`](./FEATURE_BACKLOG.md) | Full feature inventory, including deferred and rejected items. |
| [`STATUS_CHECKLIST.md`](./STATUS_CHECKLIST.md) | ✅ Plain checklist: what's shipped, what's left, what's waiting on Julian. |

## `plans/` — forward-looking area plans & discovery

| Doc | What it is |
|---|---|
| [`plans/SHEPHERD_CARE_TRACKER_PLAN.md`](./plans/SHEPHERD_CARE_TRACKER_PLAN.md) | Shepherd-care tracker plan (the SC.* track). |
| [`plans/LAUNCH_PLANNING_PLAN.md`](./plans/LAUNCH_PLANNING_PLAN.md) | Capacity & launch-planning plan (the LP.* track). |
| [`plans/GROUP_HEALTH_RUBRIC_DISCOVERY.md`](./plans/GROUP_HEALTH_RUBRIC_DISCOVERY.md) | Group-health rubric — discovery only, pre-spec (blocked on Julian). |

## `specs/` — feature specs & build contracts

| Doc | What it is |
|---|---|
| [`specs/SC_4_PRIVATE_CARE_NOTES_SPEC.md`](./specs/SC_4_PRIVATE_CARE_NOTES_SPEC.md) | Zero-knowledge private care notes spec (see ADR 0003). |
| [`specs/SC_4_HANDOFF_CONTRACT.md`](./specs/SC_4_HANDOFF_CONTRACT.md) | SC.4 build handoff contract (the stable surface). |
| [`specs/SUPER_ADMIN_INVITE_USER_WORKFLOW.md`](./specs/SUPER_ADMIN_INVITE_USER_WORKFLOW.md) | Super-admin invite-user workflow (RPC + Edge Function). |

## `architecture/` — how the system is built & run

| Doc | What it is |
|---|---|
| [`architecture/ARCHITECTURE.md`](./architecture/ARCHITECTURE.md) | Stack, routes, auth, RLS, read/write paths. |
| [`architecture/DATABASE_SCHEMA.md`](./architecture/DATABASE_SCHEMA.md) | Tables, the core model, auth vs. participant identity. |
| [`architecture/DEPLOYMENT.md`](./architecture/DEPLOYMENT.md) | Hosting, env vars, Edge Function setup. |
| [`architecture/FREE_TIER_NOTES.md`](./architecture/FREE_TIER_NOTES.md) | Vercel Hobby + Supabase Free constraints. |

## `process/` — repeatable team workflows

| Doc | What it is |
|---|---|
| [`process/CODEX_REVIEW_LOOP.md`](./process/CODEX_REVIEW_LOOP.md) | The Codex PR-review automation loop. |
| [`process/TEST_AUTH_USERS.md`](./process/TEST_AUTH_USERS.md) | Test auth users — setup and runbook. |

## Reference folders

| Folder | What it is |
|---|---|
| [`adr/`](./adr/) | 🏛️ **Architecture Decision Records** — why a load-bearing decision was made (0001–0003). |
| [`agents/`](./agents/) | Agent/skill config: domain-doc rules, issue tracker, triage labels. |
| [`julian-inputs/`](./julian-inputs/README.md) | **Source of record** — Julian's own words (Q&A, care spreadsheet, multiplication plan). |
| [`archive/`](./archive/README.md) | Closed/historical specs & verification logs. Not the source of truth for what to build next. |

## Folder legend

- **root triad** — always-current source of truth (blueprint, PRD, backlog, checklist).
- **`plans/`** — not-yet-built or in-discovery work.
- **`specs/`** — detailed contracts for specific features.
- **`architecture/`** — how the system is built and deployed.
- **`process/`** — repeatable team workflows.
- **`adr/`** — why a decision was made (immutable record).
- **`julian-inputs/`** — raw product inputs from Julian (source of record).
- **`archive/`** — built/closed; history only.
