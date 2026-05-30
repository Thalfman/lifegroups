# Feedback map — Julian's 2026-05-27 inputs → roadmap

Synthesis of the captures in this folder against
[`../PRD.md`](../PRD.md). The roadmap's §2 listed nine
"Open questions for future Julian sync." The 2026-05-27 materials answer most of
them. This file records the answers, the gaps that remain, and the new product
signals these materials surface.

## 0. Update — questions now captured (2026-05-28)

The earlier version of this map was built from Julian's **answers** only; the
**questions** Tom sent by text were not yet in hand, so two answers ("Maybe
both!" and "Yes, that would be helpful.") were unattributable and the cadence
question was mislabeled. The questions are now captured verbatim in
[`SYSTEMS_CONVERSATION.md`](./SYSTEMS_CONVERSATION.md). Folding them in changed
two conclusions and added one signal:

1. **Q6 → A1, not A2.** "Do you want the care tracker to be more like a history
   log, a follow-up/task list, or **both**?" → **"Maybe both!"** This is a
   direct ask for the task-list side. SC.1B (`shepherd_care_follow_ups`) is
   **wanted, not optional** — see §2.
2. **Q8 → a new privacy tier.** "A complete privacy/encryption option for notes
   that should only be readable by you?" → **"Yes, that would be helpful."**
   This is *not* the same as Q7's broad shared notes and is *not* satisfied by
   the shipped admin-only RLS. New requirement (SC.4) — see §3.7.
3. **Q5 is the cadence question**, answered as cadence tiered by oversight — see
   the cadence row in §1.

## 1. Roadmap open questions — now answered

| Roadmap open question (§2) | Answer from 2026-05-27 inputs | Status |
|---|---|---|
| What fields does Julian's spreadsheet contain? | Name, Issue, Date of first communication, Next step, Update of communication, Misc. note ([template](./MIN_CARE_LIST_TEMPLATE.md)). | **Answered** |
| History log, task list, or both? (Q6) | **"Maybe both!"** — Julian wants the history log **and** a follow-up/task list. Points to the **A1** model; SC.1B is wanted. | **Answered** |
| "Doing well" vs. "needs attention"? | No fixed rubric yet. Julian is "still working on an evaluation system of how we would grade them" — signals are consistent attendance and spiritual growth (Q2, Q12). Q2 floated a candidate vocabulary (doing well / needs encouragement / needs follow-up / concern / inactive) he did not adopt verbatim. | **Partial** — rubric is WIP |
| Care cadence — weekly / monthly / custom? (Q5) | **Tiered by oversight**, not a single interval: Julian is "more in the weeds" on the mixed/couples groups he directly over-shepherds, and delegates cadence to the over-shepherds for men's/women's groups (Q5). Follow-up dates are conversation-driven (Q3). | **Partial** |
| Should over-shepherds see assigned shepherds / notes / update? (Q7) | Men's & women's groups have an over-shepherd (coach); mixed/couples groups report to Julian directly (Q5). Eventually have over-shepherds "update the system too, but broad notes given simplicity and confidentiality" (Q7). No request for over-shepherd **login**. | **Partial** — MVP coverage-only stance holds; write access is future scope |
| Should leaders see / update their own care status? (Q7) | Yes, eventually: "would also like something for leaders at some point too," limited to **broad** notes (Q7). | **Partial** — future scope (LDR.1) |
| Private pastoral content, or out of the app? (Q7 + Q8) | **Two tiers.** Q7: broad, shareable notes — admin-only design already shipped covers this. Q8: a **private-to-Julian / encrypted** tier readable by him alone — **requested but not built**. | **Q7 answered; Q8 is a new requirement (SC.4)** |
| Capacity demand model? (Q9) | Primary signal = people in groups (leader-updated); church attendance is "extremely important" as the denominator (% in a group; ~60% now). Still "figuring out best method to capture church numbers." Matches LP.1's manual-input model. | **Answered** |
| Auto-flag "no contact in N weeks"? Threshold? | The *knob* now exists (`shepherd_care_stale_days`, default 60). Julian named no specific value, and per Q5 the right value may differ by oversight tier. | **Partial — value still Julian's call** |
| When to loop in the communications director? | Not addressed in these materials. | **Open** |

## 2. Confirmations against shipped work

- **Shepherd Care (SC.\*)** — the care-list columns confirm the shipped
  `shepherd_care_profiles` / `shepherd_care_interactions` shape. Julian's Q6
  answer ("both") confirms the **A1** model is what he wants: profiles +
  interactions **plus** `shepherd_care_follow_ups`. SC.1B is therefore an
  endorsed next build, not an optional add-on (`../SHEPHERD_CARE_TRACKER_PLAN.md
  §6`).
- **Launch Planning (LP.\*)** — Q9–Q11 validate the manual-input forecast:
  church attendance is admin-entered, group participation % is the headline
  metric, and August is the planning anchor.
- **Over-shepherd coverage (SC.2)** — Q5/Q7 confirm coverage-tracking (not
  over-shepherd login) is the right MVP scope; over-shepherd *write* access is a
  later, broad-notes-only possibility.

## 3. New signals not yet (fully) on the roadmap

1. **Group-health grading system.** Julian explicitly wants to "grade" group
   health (consistent attendance, spiritual growth happening) and admits he is
   still designing it (Q12). A **new feature area** — discovery only — distinct
   from shepherd care and launch planning. See
   [`../GROUP_HEALTH_RUBRIC_DISCOVERY.md`](../plans/GROUP_HEALTH_RUBRIC_DISCOVERY.md).
2. **Multiplication candidate pipeline.** The
   [multiplication plan](./LG_MULTIPLICATION_PLAN_2026.md) is a named pipeline
   (group → stage-of-life segment → readiness → target year) that LP.\* did not
   originally model. (A `multiplication_candidates` pipeline now ships on the
   launch-planning page — see roadmap §6 P4.)
3. **Two-options-per-person goal.** "Offer all people at least two life group
   options of their choosing" is a coverage/variety target, not just a seat
   count — relevant to *which kinds* of groups launch planning recommends.
4. **Group-full = 12 with opt-to-stay-open.** Q10 sets the capacity default and
   an explicit "leaders may keep it open" exception. (Now: capacity default 12 +
   per-group `allow_over_capacity` — roadmap §6 P2.)
5. **New worship center → demand spike.** Q11 names a concrete future demand
   driver to model as expected growth in LP scenarios.
6. **Church-number capture is unsolved.** Julian has no reliable method to
   capture church attendance yet (Q9); LP leaving it manual is correct for now,
   but this is a known data-quality gap.
7. **Private / encrypted care notes (NEW — SC.4).** Q8: Julian wants notes
   "that should only be readable by you." This is a privacy tier *above* the
   shipped admin-only model — even `super_admin` should not read these. The
   Shepherd Care foundation migration
   (`supabase/migrations/20260518160000_phase5d0_shepherd_care_foundation.sql`)
   deferred "encrypted private notes" explicitly *"if Julian asks for"* them; the
   trigger is now met. Needs a design decision (a `visibility = private_to_creator`
   RLS flag vs. true encryption-at-rest with key management) before any build.
   See `../SHEPHERD_CARE_TRACKER_PLAN.md §12`.

## 4. Recommended next actions

**Status (prior `julian-feedback-plan` work).** Signals 2, 4, and 5 are
addressed in code; the no-contact threshold is now configurable, the capacity
default is 12, and the kept-open case is representable. See `PRODUCT_ROADMAP.md
§6` for the per-phase map and `../MASTER_BLUEPRINT.md` for the live stage map.

Outstanding after this reconciliation:

1. **Build SC.1B — care follow-ups** (`shepherd_care_follow_ups`). Q6 confirms
   Julian wants the task-list side; it is currently deferred-but-stubbed.
2. **Spike SC.4 — private/encrypted notes** (Q8). Decide the interpretation
   with Julian (private-to-creator RLS flag vs. real encryption), then spec.
3. **Decide cadence tiering** (Q5): should `shepherd_care_stale_days` differ for
   groups Julian directly covers vs. those an over-shepherd covers?
4. **Reconcile the care status vocabulary** (Q2) against the shipped
   `healthy/watch/needs_attention` enum, or leave as-is.
5. **Decide LP candidate-pipeline scope** for Julian: keep extending the
   in-app `multiplication_candidates` view, or keep the Google Doc as system of
   record and feed only aggregate counts into LP.

## 5. Still open for Julian

- **Private-notes interpretation (Q8)** — visibility flag vs. true encryption.
  **New decision** raised by this reconciliation.
- **Cadence tiering (Q5)** — one global stale threshold vs. per-oversight-tier.
  **New decision.**
- The default "haven't connected in N weeks" auto-flag **value** — the knob
  exists (`shepherd_care_stale_days`, default 60); the value Julian wants is
  still his call.
- The **group-health grading rubric** Julian is still designing — discovery
  captured in
  [`../GROUP_HEALTH_RUBRIC_DISCOVERY.md`](../plans/GROUP_HEALTH_RUBRIC_DISCOVERY.md).
- The **2026-vs-2027 multiplication split**, which the source does not pin down
  ([fidelity note](./LG_MULTIPLICATION_PLAN_2026.md#timeline-buckets)) — the
  pipeline now stores a per-candidate `target_year` so Julian can set it group
  by group.
- **When/whether to involve the communications director** — deferred design in
  `PRODUCT_ROADMAP.md` EXT.1.
