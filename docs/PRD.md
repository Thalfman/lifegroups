# PRD — Life Group Operations

> 📌 **This is THE PRD.** It is derived **1:1 from Julian's systems conversation**
> ([`julian-inputs/SYSTEMS_CONVERSATION.md`](./julian-inputs/SYSTEMS_CONVERSATION.md),
> 2026-05-27) — the North Star. Every requirement below traces to one of Julian's
> twelve questions. The matching architecture decisions are in
> [`adr/0004-systems-conversation-architecture.md`](./adr/0004-systems-conversation-architecture.md).

_Status legend:_ ✅ shipped · 🟡 partial / refinement open · 🔬 discovery (not buildable yet) · ❓ decision owed by Julian.
Evidence cites the migration or PR so each claim is verifiable in git.

---

## Q1 — A blank care spreadsheet (headers/structure)
**Julian:** sent the blank care list; wants its structure captured.
**Requirement:** model the care list as first-class data (one row per leader).
**Status:** ✅ **Shipped.** Care profiles back the spreadsheet structure; columns
captured in [`julian-inputs/MIN_CARE_LIST_TEMPLATE.md`](./julian-inputs/MIN_CARE_LIST_TEMPLATE.md).
Detail: [`plans/SHEPHERD_CARE_TRACKER_PLAN.md`](./plans/SHEPHERD_CARE_TRACKER_PLAN.md) (SC.1A).

## Q2 — Categories for "how a leader is doing"
**Julian:** thinks in terms of *is there an issue and what's the next step*; wants a
category on every leader for quick notes; did **not** adopt the proposed five-word
vocabulary verbatim.
**Requirement:** a per-leader status plus free-text notes.
**Status:** 🟡 **Shipped; wording decided, migration pending.** `shepherd_care_status`
shipped as `healthy / watch / needs_attention`. **Resolved 2026-05-30:** adopt Julian's
five verbatim — `doing_well / needs_encouragement / needs_follow_up / concern / inactive`
(ADR 0004 / D2). Backfill maps `healthy→doing_well`, `watch→needs_encouragement`,
`needs_attention→needs_follow_up`; `concern`/`inactive` are net-new. Mechanical
implementation tracked in #122.

## Q3 — What to remember after connecting with a leader
**Julian:** the issue/concern (or good thing), and whether/when/what follow-up.
**Requirement:** an append-only interaction history with a follow-up hook.
**Status:** ✅ **Shipped.** `shepherd_care_interactions` (history) + the follow-up
linkage (SC.1A/SC.1B).

## Q4 — How he decides someone needs a follow-up
**Julian:** based on what the leader shares; he asks to follow up, then jots it down.
**Requirement:** ad-hoc, admin-created follow-up tasks.
**Status:** ✅ **Shipped.** `shepherd_care_follow_ups` (migration
`20260529007000`, PR #107).

## Q5 — How often to check in
**Julian:** *tiered by oversight* — more in the weeds on the mixed/couples groups he
over-shepherds directly; delegated cadence for men's/women's groups that have their
own over-shepherd. No single standing interval.
**Requirement:** track who oversees whom; a configurable staleness signal, not a
fixed global cadence.
**Status:** 🟡 **Partly shipped; model decided.** Over-shepherd coverage ships (SC.2); a
configurable `shepherd_care_stale_days` ships (default 60, migration `20260528120000`).
**Resolved 2026-05-30 (ADR 0004 / D3):** **per-tier** windows derived from coverage —
directly-overseen (admin) shorter, delegated (has an over-shepherd) longer; proposed
**30 / 60 days**, Julian confirms the numbers. Staleness clock resets on **Ministry-Admin
interactions only for now** (over-shepherd reset deferred to when #126 ships). Build in #123.

## Q6 — History log, task list, or both?
**Julian:** "Maybe both!"
**Requirement:** both a history log and a follow-up/task list (the A1 model).
**Status:** ✅ **Shipped.** History (SC.1A) **and** follow-ups (SC.1B, #107).

## Q7 — The 3 over-shepherds: track them, and let them help update?
**Julian:** track coverage now; *eventually* let over-shepherds update the system too,
but **broad notes only**, given simplicity and confidentiality; wants something for
leaders at some point too.
**Requirement:** coverage tracking now; scoped over-shepherd access; leader access later.
**Status:** 🟡 **Coverage + over-shepherd login shipped; write deferred.** Over-shepherd
role, login bridge, and coverage-scoped read RLS ship (migrations `20260529000000`–
`20260529006000`). Over-shepherd *write* (broad notes) and any leader surface are
deliberately deferred (roadmap LDR.1) — **not blocking.**

## Q8 — Notes only Julian can read (privacy/encryption)
**Julian:** "Yes, that would be helpful."
**Requirement:** a private note tier readable by Julian alone — excluding even
`super_admin`.
**Status:** ✅ **Shipped (SC.4).** Client-side **zero-knowledge encryption**:
`shepherd_care_private_notes` (ciphertext only) + key slots wrapped under WebAuthn PRF
and a recovery code (migrations `20260529008000`/`20260529009000`; crypto in
`lib/crypto/private-notes.ts`; PRs #112–#114; the super-admin read path was explicitly
closed and proven in #114). Decision recorded in [`adr/0003`](./adr/0003-private-care-note-encryption.md).

## Q9 — Launch-planning numbers
**Julian:** mainly *people in groups* (leader-updated); knows *church attendance* is
critical (≈60% in a group today); still figuring out how to capture church numbers.
**Requirement:** capacity/demand model from people-in-groups + church attendance.
**Status:** 🟡 **Shipped, but being re-framed.** LP.1 capacity/demand model +
church-attendance snapshots ship (migration `20260528140000`). The reliable
*capture* of church attendance is a known operational gap, not a code gap. Detail
now in [`archive/LAUNCH_PLANNING_PLAN.md`](./archive/LAUNCH_PLANNING_PLAN.md).
➡️ **Active plan:** the capacity story is being re-framed into the integrated
workspace in [`plans/CAPACITY_AND_MULTIPLICATION_PRD.md`](./plans/CAPACITY_AND_MULTIPLICATION_PRD.md)
— issue-slicing for Q9–Q11 should follow that plan, not treat job 2 as closed.

## Q10 — When is a group "full" / ready to multiply?
**Julian:** full at **12 members**, but leaders may keep it open; multiply when a group
is **12+**, has met **3+ years**, and there's a **need** for a similar group.
**Requirement:** capacity default of 12 with an opt-to-stay-open flag; a multiplication
readiness rubric.
**Status:** ✅ **Shipped.** Capacity default 12 + `allow_over_capacity` (migration
`20260528130000`); `multiplication_candidates` rubric (migration `20260528160000`).

## Q11 — Launch by season, or as capacity fills?
**Julian:** mainly by **season/month (August especially, and January)**, also by church
season — currently launching ahead of the new worship center.
**Requirement:** season-aware planning (Aug/Jan) and scenario modeling for demand spikes.
**Status:** 🟡 **Shipped, but being re-framed.** Seasonality quick-fills (Next August
/ Next January) and forecast scenarios (LP.1/LP.2). Multiplication source:
[`julian-inputs/LG_MULTIPLICATION_PLAN_2026.md`](./julian-inputs/LG_MULTIPLICATION_PLAN_2026.md).
The system-of-record question is resolved by ADR-0006 (the in-app tool wins by
adoption; the 2026-vs-2027 split is in-app `target_year` data).
➡️ **Active plan:** capacity + multiplication are being unified into one workspace —
with a net-new leader pipeline and a staffing-aware forecast — in
[`plans/CAPACITY_AND_MULTIPLICATION_PRD.md`](./plans/CAPACITY_AND_MULTIPLICATION_PRD.md).
Job 2 is **not** "done"; that plan is the current spec for Q9–Q11.

## Q12 — What makes the tool genuinely useful, week to week
**Julian:** three jobs — (1) know how my leaders are doing, (2) know what groups need
to be launched and when, (3) know the **health of a Life Group** (rubric he's *still
designing*).
**Requirement:** deliver all three jobs.
**Status:**
- Job 1 (leaders) — ✅ delivered by Q1–Q8.
- Job 2 (launches) — 🟡 **Functionally shipped, being re-framed.** Capacity,
  forecast, and the multiplication pipeline all ship, but the surfaces are
  disconnected and there is no leader pipeline; the integrated re-frame is specced
  in [`plans/CAPACITY_AND_MULTIPLICATION_PRD.md`](./plans/CAPACITY_AND_MULTIPLICATION_PRD.md)
  (Q9–Q11).
- Job 3 (group health) — 🟡 **Rubric locked; build pending.** Three dimensions
  (attendance consistency · admin-entered spiritual-growth 1–5 · a relayed leader
  1–5), letter A–D output, monthly cadence, tunable weights/cut-lines/thresholds; see
  [`plans/GROUP_HEALTH_RUBRIC_DISCOVERY.md`](./plans/GROUP_HEALTH_RUBRIC_DISCOVERY.md)
  and ADR 0004 / D8. Build slices #127/#128/#129 can now be cut. ❓ **Only owed:**
  Julian's exact wording for the two 1–5 questions.

---

## Where we stand, in one line
All three jobs (Q1–Q12) are **functionally built** — group health included, now that the
rubric is locked (ADR 0004 / D8). **No North-Star item is gated on awaiting Julian:** the
multiplication system-of-record question is resolved by building the better tool
(ADR 0006), and the two group-health question wordings ship as placeholders, a deferred
cosmetic swap (ADR 0007). Remaining work is execution, not decisions — e.g. exposing the
group-health surface in the nav, and the **capacity + multiplication re-frame**
([`plans/CAPACITY_AND_MULTIPLICATION_PRD.md`](./plans/CAPACITY_AND_MULTIPLICATION_PRD.md)):
job 2 is functionally shipped but its surfaces are disconnected and lack a leader
pipeline, so it is being unified rather than treated as closed.

## Decisions owed by Julian
1. ~~**Group-health rubric (Q12)**~~ — ✅ **Locked** (grill 2026-05-30; ADR 0004 / D8).
   The two 1–5 question wordings are **no longer a launch gate**: the grade ships with
   placeholder ("TBD") labels and Julian's wording is a deferred cosmetic swap
   ([ADR 0007](./adr/0007-group-health-ships-with-placeholder-labels.md); #125).
2. ~~**Care cadence (Q5)**~~ — ✅ **Resolved** (per-tier, 30/60 proposed, admin-only clock
   for now; ADR 0004 / D3). Build in #123; Julian confirms the two numbers.
3. ~~**Care-status wording (Q2)**~~ — ✅ **Resolved** (adopt Julian's five; ADR 0004 / D2).
   Mechanical migration tracked in #122.
4. ~~**Multiplication ownership (Q11)**~~ — ✅ **Resolved** — the in-app planner supersedes
   the Google Doc **by adoption, not by decree**, and the 2026/2027 split becomes in-app
   data Julian sets per group, not a paper decision
   ([ADR 0006](./adr/0006-multiplication-planner-supersedes-google-doc.md); build spec
   [`plans/MULTIPLICATION_PLANNER.md`](./plans/MULTIPLICATION_PLANNER.md)).
