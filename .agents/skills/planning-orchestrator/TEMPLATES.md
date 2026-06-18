# Planning Artifact Templates

Five artifacts, plus the handoff wrapper. Pick by the readiness routing table in [SKILL.md](SKILL.md). Use the section headings as written — consistency is what lets a future session (or the user) skim straight to what they need. Fill every section; if one genuinely doesn't apply, write "None" and why, rather than dropping it silently.

These are scaffolds, not cages. If the work needs a section the template lacks, add it. The headings exist to guarantee the load-bearing parts — goal, non-goals, acceptance criteria, risks, handoff — never get skipped under time pressure.

---

## 1. Discovery Brief

Use when the problem is vague or the real target is unclear. The goal is to identify _what to plan next_, not to plan a solution.

```markdown
# Discovery Brief: <topic>

## Stated request

<what the user literally asked for>

## Possible underlying goals

<the real outcomes that might be driving the request — usually several>

## Assumptions

<what the request silently takes as true; label each>

## Unknowns

<what we'd need to know to be confident, and don't>

## Evidence needed

<the specific data/observations that would resolve the unknowns>

## Suggested investigation

<concrete, cheap steps to gather that evidence>

## Recommended next planning target

<the one thing most worth planning once evidence is in>

## Questions that would materially change direction

<at most a few — only the ones whose answers flip the recommendation>
```

---

## 2. Decision Memo

Use when multiple paths are genuinely plausible and the user needs to choose.

```markdown
# Decision Memo: <decision>

## Context

<the situation and what forces the choice now>

## Options

<each option, described concretely>

## Tradeoffs

<what each option buys and costs, side by side>

## Risks

<per-option risks and their likelihood/impact>

## Cost of delay

<what it costs to not decide yet>

## Recommended path

<the recommendation and the reasoning that makes it best>

## Rejected alternatives

<what we're not doing and why — so it isn't re-litigated>

## Decision criteria

<what would change the recommendation; how we'll know we chose right>
```

---

## 3. Implementation Handoff Plan

Use when the target is clear enough to build. This is the richest artifact, and it must be self-contained enough to hand to a fresh session.

```markdown
# Implementation Plan: <feature/change>

## Goal

<the outcome, in one or two sentences>

## Scope

<what's in>

## Non-goals

<what's deliberately out — protect these from scope creep>

## Assumptions

<labeled; flag which are load-bearing>

## Relevant files / systems

<actual paths, modules, services, patterns to mirror — grounded in the repo>

## Proposed approach

<the design, and why this seam over alternatives>

## Execution phases

<ordered phases, each a coherent, reviewable unit of work>

## Acceptance criteria

<observable, checkable conditions for "done and correct">

## Test plan

<what to test, at what level, including the unhappy paths>

## Rollout plan

<how it ships: flags, stages, env, migration order>

## Risks and mitigations

<what could go wrong and the guard for each>

## Open questions

<unresolved items that don't block starting>

## Ordered checklist

<the concrete step-by-step a builder can follow top to bottom>

## Definition of done

<the single bar that, when met, ends the work>
```

Always follow this with the **Final handoff contract** wrapper below.

---

## 4. Review Plan

Use when blast radius is high — auth, data integrity, money, irreversible actions, or anything touching a security invariant. The point is to make the gates explicit _before_ code exists.

```markdown
# Review Plan: <change>

## Risk areas

<where the danger concentrates>

## Required review domains

<which lenses must sign off — e.g. Security, Database>

## Required evidence

<what must be shown to pass each gate>

## Approval gates

<the ordered checkpoints; nothing proceeds past a failed gate>

## Failure modes

<the specific bad outcomes we're guarding against>

## Test strategy

<how each risk is proven handled>

## Rollback plan

<how to undo safely, and how fast>

## Implementation constraints

<hard rules the build must respect>
```

---

## 5. Scope-Narrowing Brief

Use when the goal is real but far too big for one plan. The job is to find the highest-leverage first slice.

```markdown
# Scope-Narrowing Brief: <broad goal>

## Broad goal

<the full ambition>

## Candidate workstreams

<the distinct chunks the goal breaks into>

## Highest-leverage first slice

<the one slice that delivers the most learning/value earliest>

## Deferred slices

<everything consciously pushed to later>

## Recommended first milestone

<the concrete target for the first slice>

## Why this slice first

<the reasoning: dependency order, risk retirement, or value>
```

---

## Final handoff contract

End every full planning run with this wrapper around the chosen plan, so a fresh implementation session can pick it up cold:

```text
Fresh implementation session prompt:

You are implementing the plan below. Follow the execution order. Do not
re-scope unless blocked. Preserve the stated non-goals. Validate against the
acceptance criteria and test plan. Surface blockers before making
architectural changes.

[Insert the full plan here]
```

The test for a good handoff: could a new agent with no memory of this conversation execute it without having to rediscover the goal, the constraints, or which files to touch? If not, the plan is under-specified — add what's missing before handing off.
