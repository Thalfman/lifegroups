# Domain Lenses

The review lenses the orchestrator fans out across, plus the logic for choosing which ones apply. The point of selection is restraint: pick the few lenses that actually bear on this work, and name the ones you're setting aside. A plan reviewed through every lens is as useless as one reviewed through none — it signals you didn't think about which mattered.

## Signal → domain routing

Match the request's signals to likely domains. Treat this as a prior, not a rule — adjust when the specifics push back.

| Signal in the request                     | Likely domains                                            |
| ----------------------------------------- | --------------------------------------------------------- |
| User flow, screens, forms, layout         | Product, UX, Technical (frontend), Testing                |
| APIs, services, jobs, integrations        | Technical (backend), Security, Testing                    |
| Schema, records, migrations, permissions  | Database, Technical, Security, Testing                    |
| Login, roles, permissions, sensitive data | Security, Database, Technical (backend), Testing          |
| Deploys, env vars, CI, infrastructure     | DevOps, Security, Testing                                 |
| Metrics, funnels, dashboards              | Product, Data, Technical (frontend), Testing              |
| LLMs, prompts, retrieval, evaluations     | AI, Data, Technical (backend), Testing, Security          |
| Payments, billing, accounts               | Product, Technical (backend), Database, Security, Testing |
| Support burden, confusion, churn          | Product, UX, Data, Documentation                          |

**Testing earns its place on almost everything** — if work changes behavior, acceptance criteria and regression risk apply. Exclude it only when the work genuinely ships no behavior change (e.g. a pure docs edit).

## The lenses

Each lens is a short checklist: the questions to ask while fanning out. You're hunting for implications, risks, dependencies, and acceptance criteria — not writing an essay per lens.

### Product

Goal, user problem, success metric, prioritization, scope.

- What outcome are we actually moving, and for whom?
- How would we _know_ it worked — what's the success metric?
- Is this the highest-leverage version of the problem, or a symptom of a deeper one?
- What's explicitly out of scope?
- What's the cost of doing nothing?

### UX

User flow, friction, information architecture, usability.

- What's the current flow end-to-end, and where's the friction?
- What's the smallest number of steps to the value?
- Where will users get confused, stuck, or drop off?
- Does this fit the existing mental model and navigation, or fight it?
- Accessibility implications?

### Technical

Architecture, APIs, state, services, dependencies, constraints.

- What's the cleanest seam to make this change at? What existing patterns should it mirror?
- What state and data flow does it touch? Server vs client boundaries?
- What does it depend on, and what depends on it?
- What constraints (framework conventions, existing invariants) shape the approach?
- Where's the complexity, and can the interface hide it?

### Database

Data model, migrations, permissions, indexes, data integrity.

- Does this need a schema change? Is the migration reversible / safe to roll out?
- Row-level access and permissions implications?
- Indexes / query-shape / performance implications at scale?
- Integrity: constraints, cascades, orphan risk, soft-delete vs hard-delete?
- Backfill or data-migration needs?

### Security

Auth, authorization, privacy, secrets, abuse risk, access control.

- Who's allowed to do this, and is authorization enforced server-side, not just hidden in UI?
- Any sensitive data exposed, logged, or widened in scope?
- Secrets / keys handling — anything leaving its trusted boundary?
- Abuse, injection, or escalation paths opened?
- Does it preserve existing audit / access invariants?

### Testing

Acceptance criteria, regression risks, test strategy, edge cases.

- What are the concrete acceptance criteria (observable, checkable)?
- What existing behavior could regress?
- What edge cases and failure modes need coverage?
- Unit / integration / e2e — what level catches the real risk cheapest?
- How do we test the unhappy paths, not just the golden one?

### DevOps

Deployment, environments, CI, observability, rollback.

- How does this ship, and to which environments?
- New env vars, secrets, or infra? CI changes?
- How do we observe it in production — logs, metrics, alerts?
- What's the rollback plan if it goes wrong?
- Feature-flag or staged-rollout needs?

### Data

Analytics, metrics, event tracking, dashboards, reporting.

- What do we need to measure to know this worked?
- What events/properties must be tracked, and are they already?
- Where does the evidence live (funnels, logs, tickets, recordings)?
- Reporting / dashboard changes downstream?
- Data quality and definition consistency?

### AI

Prompts, retrieval, evals, model behavior, guardrails.

- What's the task the model is doing, and how do we evaluate it?
- Prompt / context design and failure modes (hallucination, refusal, drift)?
- Retrieval / grounding sources and their freshness?
- Guardrails, safety, and abuse handling?
- Cost, latency, and model-choice tradeoffs?

### Compliance

Regulated data, auditability, records, policy constraints.

- Any regulated or sensitive data class involved?
- Auditability and record-keeping requirements?
- Retention / deletion obligations?
- Policy or contractual constraints that gate the design?

### Documentation

Handoff clarity, runbooks, user-facing docs, internal notes.

- What must be documented for this to be maintainable / handoff-able?
- Runbook or operational docs needed?
- User-facing docs or in-product copy?
- Decisions worth recording so they aren't re-litigated later?

## Splitting lenses

Keep lenses broad by default. Only split one — e.g. Technical into Frontend/Backend, or Product into Activation/Retention — when a single lens is producing analysis too shallow to act on. Premature splitting just multiplies checklists without adding insight.
