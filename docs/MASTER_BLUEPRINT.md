# Master Blueprint — Life Group Operations Dashboard

**The single at-a-glance map of what exists, what stage it's in, and what's
next.** Start here, then follow the links into the detail docs.

_Last reconciled: **2026-05-28** (Julian QA — folded in the verbatim questions
behind the 2026-05-27 answers; see the [change log](#change-log))._

## How to use this doc

- **This blueprint = stage + entry point.** It is authoritative for *what stage
  each workstream is in* and *what to do next*.
- **The detail docs = scope + design.** They remain authoritative for the
  *contents* of each item. If this map and a detail doc disagree on stage,
  trust the detail doc and fix this map.
- Relationship to the other docs:
  - [`PRODUCT_ROADMAP.md`](./PRODUCT_ROADMAP.md) — ordered execution plan +
    reliability/security debt appendix.
  - [`FEATURE_BACKLOG.md`](./FEATURE_BACKLOG.md) — full inventory incl. deferred
    / rejected.
  - [`SHEPHERD_CARE_TRACKER_PLAN.md`](./SHEPHERD_CARE_TRACKER_PLAN.md),
    [`LAUNCH_PLANNING_PLAN.md`](./LAUNCH_PLANNING_PLAN.md),
    [`GROUP_HEALTH_RUBRIC_DISCOVERY.md`](./GROUP_HEALTH_RUBRIC_DISCOVERY.md) —
    per-area plans / discovery.
  - [`julian-inputs/`](./julian-inputs/README.md) — **source of record** for
    Julian's own words (the Q&A, the spreadsheet, the multiplication plan).
  - [`archive/`](./archive/README.md) — as-built specs + verification logs.

## Stage legend

| Mark | Stage | Meaning |
|---|---|---|
| ✅ | **Shipped** | In the repo and working. |
| 🟡 | **Planned** | Specced and endorsed; not built. |
| 🆕 | **New** | Surfaced by reconciliation; needs a decision before it can be specced. |
| 🔬 | **Discovery** | Design exploration only; not ready to build. |
| ⏸️ | **Deferred** | Intentionally not now. |
| ❓ | **Open (Julian)** | Blocked on Julian's input. |

---

## A. Platform & access

| ID | Item | Stage | Detail | Next action |
|---|---|---|---|---|
| INV.1 | Super Admin Invite User | ✅ Shipped (verify-and-polish) | [workflow](./SUPER_ADMIN_INVITE_USER_WORKFLOW.md) | Run one end-to-end invite on the live project; tick the checklist. |
| — | Auth / RLS / roles / audit posture | ✅ Shipped | [README](../README.md), [roadmap §3](./PRODUCT_ROADMAP.md) | Maintain; see debt track (§G). |

## B. Shepherd Care — Julian's admin OS

| ID | Item | Stage | Detail | Next action |
|---|---|---|---|---|
| SC.1A | Care foundation — `shepherd_care_profiles` + `shepherd_care_interactions` | ✅ Shipped | [as-built](./archive/SC_1A_SHEPHERD_CARE_FOUNDATION.md) | — |
| SC.1B | Care follow-ups — `shepherd_care_follow_ups` task list | ✅ Shipped (#107) | [plan](./SHEPHERD_CARE_TRACKER_PLAN.md) | Completes the A1 care model (profiles + interactions + follow-ups). |
| SC.2 | Over-shepherd coverage tracking (3 over-shepherds) | ✅ Shipped | [as-built](./archive/SC_2_OVER_SHEPHERD_COVERAGE_TRACKING.md) | — |
| SC.3 | Julian care dashboard (triage buckets) | ✅ Shipped | [as-built](./archive/SC_3_JULIAN_CARE_DASHBOARD.md) | — |
| SC.4 | Private / encrypted care notes — readable by Julian alone | 🆕 New **(Q8)** | [spec](./SC_4_PRIVATE_CARE_NOTES_SPEC.md) | **Specced.** Decide interpretation (Tier 1 creator-scoped RLS, recommended, vs. Tier 2 encryption — Q1), then build. |
| — | Stale-contact threshold `shepherd_care_stale_days` (default 60) | ✅ Shipped (configurable) | [roadmap §6 P1](./PRODUCT_ROADMAP.md) | Value is Julian's call (see ❓ below). |
| — | Cadence tiering by oversight | ❓ Open (Julian, **Q5**) | [FEEDBACK_MAP](./julian-inputs/FEEDBACK_MAP.md) | Decide: one global threshold vs. per-tier (direct vs. delegated). |
| — | Care-status vocabulary | ❓ Open refinement (**Q2**) | [rubric discovery](./GROUP_HEALTH_RUBRIC_DISCOVERY.md) | Align `healthy/watch/needs_attention` if Julian settles a vocabulary. |

## C. Launch Planning

| ID | Item | Stage | Detail | Next action |
|---|---|---|---|---|
| LP.1 | Capacity & launch-planning MVP | ✅ Shipped | [plan](./LAUNCH_PLANNING_PLAN.md), [as-built](./archive/LP_1_CAPACITY_LAUNCH_PLANNING.md) | — |
| LP.2 | Forecast scenarios (conservative / expected / stretch) | ✅ Shipped | [as-built](./archive/LP_2_FORECAST_SCENARIOS.md) | — |
| P2 | Capacity = 12 + `allow_over_capacity`; church-attendance snapshots (% in a group) | ✅ Shipped | [roadmap §6](./PRODUCT_ROADMAP.md) | — |
| P3 | Seasonality quick-fills (Aug/Jan) + worship-center demand scenario | ✅ Shipped | [roadmap §6](./PRODUCT_ROADMAP.md) | — |
| P4 | Multiplication candidate pipeline — `multiplication_candidates` (audience × life stage, readiness rubric) | ✅ Shipped | [roadmap §6](./PRODUCT_ROADMAP.md), [2026 plan](./julian-inputs/LG_MULTIPLICATION_PLAN_2026.md) | Scope call below. |
| — | Extend in-app pipeline vs. keep Google Doc as system of record | ❓ Open (Julian) | [FEEDBACK_MAP §4](./julian-inputs/FEEDBACK_MAP.md) | Julian's scope decision. |
| — | 2026-vs-2027 multiplication split | ❓ Open (Julian) | [2026 plan](./julian-inputs/LG_MULTIPLICATION_PLAN_2026.md#timeline-buckets) | Set per-candidate `target_year`. |
| — | Reliable church-attendance capture | ❓ Open / data-quality gap | [FEEDBACK_MAP §3.6](./julian-inputs/FEEDBACK_MAP.md) | Manual entry for now. |

## D. Group Health

| ID | Item | Stage | Detail | Next action |
|---|---|---|---|---|
| P5 | Group-health grading rubric (attendance + spiritual growth + TBD) | 🔬 Discovery | [discovery](./GROUP_HEALTH_RUBRIC_DISCOVERY.md) | Settle dimensions & output shape with Julian (his rubric is unfinished). |

## E. Leader tools

| ID | Item | Stage | Detail | Next action |
|---|---|---|---|---|
| LDR.1 | Optional leader tools, incl. leader self-update of care status (**broad notes only**, Q7) | ⏸️ Deferred | [roadmap LDR.1](./PRODUCT_ROADMAP.md) | Only if Julian asks; privacy review required. Never exposes SC.4 private notes. |

## F. External / Comms

| ID | Item | Stage | Detail | Next action |
|---|---|---|---|---|
| EXT.1 | Comms-director read-only views / external surfaces | ⏸️ Deferred | [roadmap EXT.1](./PRODUCT_ROADMAP.md) | Define the internal→external trigger with Julian + comms director; own threat model. |

## G. Reliability / security debt ([roadmap Appendix A](./PRODUCT_ROADMAP.md))

| ID | Item | Stage |
|---|---|---|
| P0.1 | Baseline observability (structured logging on critical paths) | ❓ Owed |
| P0.2 | Harden `getCurrentSession()` (no throw-driven 500s) | ❓ Owed |
| P0.3 | Rate-limit forgot-password | ✅ Shipped |
| P1.4 | Mitigate invite-flow timing side-channel | ❓ Owed |
| P1.5 | Reduce unsafe trust-boundary `as` casts | ❓ Owed |
| P1.6 | Minimum test suite (unit / integration / E2E smoke) | 🟡 Partial (vitest scaffold; coverage owed) |
| P2.7 | Remove / formalize dead modules | ✅ Shipped |
| P2.8 | Refactor oversized components | ❓ Owed |
| P2.9 | Constrain broad `select("*")` | ❓ Owed |
| P2.10 | Validate session caching semantics | ❓ Owed |

---

## What's next (prioritized)

Derived from the 2026-05-28 reconciliation. The first two are the direct
product consequences of the newly-captured questions.

1. **SC.1B — build care follow-ups.** Julian's Q6 ("both") confirms he wants
   the task list alongside the history. Low risk; completes the A1 model. No
   blocker.
2. **SC.4 — private-notes design decision, then spec.** Q8 is a green light, but
   the *interpretation* (visibility flag vs. encryption-at-rest) is Julian's
   call — see ❓ below. Blocked on that decision.
3. **Cadence tiering decision (Q5).** Small: should `shepherd_care_stale_days`
   differ for groups Julian directly covers vs. those an over-shepherd covers?
4. **INV.1 end-to-end verification** on the live Supabase project.
5. **Reliability P0** — observability + `getCurrentSession()` hardening.

## Decisions needed from Julian (blockers)

| # | Question | Source | Blocks |
|---|---|---|---|
| 1 | Private notes: "only you inside the app" (RLS visibility flag) or "only you, period" (encryption)? | Q8 | SC.4 |
| 2 | Cadence: one global stale-contact threshold, or per-oversight-tier? And what value? | Q5 | SC cadence flags |
| 3 | Group-health rubric: which dimensions, what weights, what output shape (letter / score / bucket)? How is "spiritual growth" captured? | Q12 | P5 (group health) |
| 4 | Multiplication pipeline: extend the in-app view, or keep the Google Doc as system of record? And the 2026-vs-2027 split per group. | multiplication plan | P4 scope |
| 5 | Care-status vocabulary: adopt your categories (doing well / needs encouragement / …) or keep `healthy/watch/needs_attention`? | Q2 | care-status refinement |
| 6 | Comms director: when does something cross from internal to external? | early review | EXT.1 |

## Source of record

All product decisions above trace to Julian's own materials in
[`julian-inputs/`](./julian-inputs/README.md):
[the Q&A](./julian-inputs/SYSTEMS_CONVERSATION.md),
[the care-list template](./julian-inputs/MIN_CARE_LIST_TEMPLATE.md),
[the 2026 multiplication plan](./julian-inputs/LG_MULTIPLICATION_PLAN_2026.md),
and [the feedback map](./julian-inputs/FEEDBACK_MAP.md) that synthesizes them.

## Change log

- **2026-05-28 — Julian QA reconciliation.** Folded the verbatim *questions*
  (`Questions.md`) in behind Julian's 2026-05-27 answers, which had been
  captured answers-only. Two conclusions changed and one signal was added:
  - **Q6 "Maybe both!"** → Shepherd Care data model is **A1**; **SC.1B (care
    follow-ups) is endorsed, not optional.**
  - **Q8 "Yes"** → **SC.4**, a new private/encrypted-notes requirement (the
    foundation migration's "if Julian asks" trigger is now met).
  - **Q5** reframed as the cadence question → cadence is **tiered by oversight**.
  - Created this blueprint as the master status map.
