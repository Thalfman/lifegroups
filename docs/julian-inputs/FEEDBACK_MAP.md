# Feedback map — Julian's 2026-05-27 inputs → roadmap

Synthesis of the three captures in this folder against
[`../PRODUCT_ROADMAP.md`](../PRODUCT_ROADMAP.md). The roadmap's §2 listed nine
"Open questions for future Julian sync." The 2026-05-27 materials answer most of
them. This file records the answers, the gaps that remain, and the new product
signals these materials surface.

## 1. Roadmap open questions — now answered

| Roadmap open question (§2) | Answer from 2026-05-27 inputs | Status |
|---|---|---|
| What fields does Julian's spreadsheet contain? | Name, Issue, Date of first communication, Next step, Update of communication, Misc. note ([template](./MIN_CARE_LIST_TEMPLATE.md)). Note/date-oriented, not task-heavy. | **Answered** |
| "Doing well" vs. "needs attention"? | No fixed rubric yet. Julian is "still working on an evaluation system of how we would grade them" — signals are consistent attendance and spiritual growth (answers 2, 12). | **Partial** — rubric is WIP |
| Care cadence — weekly / monthly / custom? | Ad hoc per leader: "broad breast strokes or specific concerns," with conversation-driven follow-up dates (answers 2, 3). No standing cadence. | **Partial** |
| Should over-shepherds see assigned shepherds / notes? | Men's & women's groups have an over-shepherd (coach); mixed/couples groups report to Julian directly, where he wants "to be a little more in the weeds" (answer 5). No request for over-shepherd **login**. | **Partial** — MVP coverage-only stance holds |
| Should leaders see / update their own care status? | Yes, eventually: "have them update the system too, but broad notes given simplicity and confidentiality… would also like something for leaders at some point" (answer 7). | **Partial** — future scope |
| Private pastoral content, or out of the app? | Keep notes **broad** and confidential (answer 7). Supports the admin-only, broad-notes design already shipped. | **Answered** |
| Capacity demand model? | Primary signal = people in groups (leader-updated); church attendance is "extremely important" as the denominator (% in a group; ~60% now). Still "figuring out best method to capture church numbers" (answer 9). Matches LP.1's manual-input model. | **Answered** |
| Auto-flag "no contact in N weeks"? Threshold? | Not addressed. Julian wants follow-up timing captured (answer 3) but named no threshold. | **Open** |
| When to loop in the communications director? | Not addressed in these materials. | **Open** |

## 2. Confirmations against shipped work

- **Shepherd Care (SC.\*)** — the care-list columns confirm the shipped
  `shepherd_care_profiles` / `shepherd_care_interactions` shape and point to the
  **A2** model (profiles + interactions) as sufficient; care follow-ups stay
  optional (`../SHEPHERD_CARE_TRACKER_PLAN.md §6`).
- **Launch Planning (LP.\*)** — answers 9–11 validate the manual-input forecast:
  church attendance is admin-entered, group participation % is the headline
  metric, and August is the planning anchor.
- **Over-shepherd coverage (SC.2)** — answer 5 confirms coverage-tracking (not
  over-shepherd login) is the right MVP scope.

## 3. New signals not yet on the roadmap

1. **Group-health grading system.** Julian explicitly wants to "grade" group
   health (consistent attendance, spiritual growth happening) and admits he is
   still designing it (answer 12). This is a **new feature area** — a group
   health score/rubric — distinct from shepherd care and launch planning.
2. **Multiplication candidate pipeline.** The
   [multiplication plan](./LG_MULTIPLICATION_PLAN_2026.md) is a named pipeline
   (group → stage-of-life segment → readiness → target year) that LP.\* does not
   model. LP does aggregate capacity math; it does not track *which named
   groups* are slated to multiply and when.
3. **Two-options-per-person goal.** "Offer all people at least two life group
   options of their choosing" is a coverage/variety target, not just a seat
   count — relevant to how launch planning recommends *which kinds* of groups to
   launch (by stage of life), not only how many.
4. **Group-full = 12 with opt-to-stay-open.** Answer 10 sets the capacity
   default and an explicit "leaders may keep it open" exception. Verify the
   app's `default_group_capacity` is 12 and that the opt-open case is
   representable.
5. **New worship center → demand spike.** Answer 11 names a concrete future
   demand driver to model as expected growth in LP scenarios.
6. **Church-number capture is unsolved.** Julian has no reliable method to
   capture church attendance yet (answer 9); LP.1 leaving it manual is correct
   for now, but this is a known data-quality gap.

## 4. Recommended next actions

These are **proposals**, not commitments — to be sequenced into
`PRODUCT_ROADMAP.md` after review.

1. **Close the roadmap's answered questions.** Update `PRODUCT_ROADMAP.md §2` to
   mark the six answered/partial items resolved, citing this folder.
2. **Spec a group-health rubric (new).** Capture the grading dimensions
   (attendance consistency, spiritual growth, others TBD) before building, since
   Julian's own rubric is unfinished — a short discovery, not a build.
3. **Decide whether LP gains a candidate-pipeline view.** Either extend launch
   planning to track named multiplication candidates with target years, or keep
   the Google Doc as the system of record and only feed aggregate counts into
   LP. This is a scope call for Julian.
4. **Settle the two open questions** still unanswered: a default no-contact
   auto-flag threshold for SC, and the comms-director trigger.
5. **Verify `default_group_capacity = 12`** and that "kept open past 12" is
   representable in capacity metrics.

## 5. Still open for Julian

- Default "haven't connected in N weeks" auto-flag threshold (or none).
- When/whether to involve the communications director.
- The 2026-vs-2027 multiplication split, which the source does not pin down
  ([fidelity note](./LG_MULTIPLICATION_PLAN_2026.md#timeline-buckets)).
- The group-health grading rubric Julian is still designing.
