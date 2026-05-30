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
**Status:** 🟡 **Shipped, wording open.** `shepherd_care_status` enum
(`healthy / watch / needs_attention`) ships today. Whether to adopt Julian's fuller
set (doing well / needs encouragement / needs follow-up / concern / inactive) is an
open refinement — see [`plans/GROUP_HEALTH_RUBRIC_DISCOVERY.md`](./plans/GROUP_HEALTH_RUBRIC_DISCOVERY.md).
❓ **Decision owed:** keep the three, or adopt his five.

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
**Status:** 🟡 **Partly shipped.** Over-shepherd coverage ships (SC.2); a
configurable `shepherd_care_stale_days` ships (default 60, migration `20260528120000`).
❓ **Decision owed:** one staleness window or a different one for directly-overseen
vs. delegated groups, and what values.

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
**Status:** 🟡 **Shipped; one data gap.** LP.1 capacity/demand model + church-attendance
snapshots ship (migration `20260528140000`). The reliable *capture* of church
attendance is a known operational gap, not a code gap. Detail now in
[`archive/LAUNCH_PLANNING_PLAN.md`](./archive/LAUNCH_PLANNING_PLAN.md).

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
**Status:** ✅ **Shipped.** Seasonality quick-fills (Next August / Next January) and
forecast scenarios (LP.1/LP.2). Multiplication source: [`julian-inputs/LG_MULTIPLICATION_PLAN_2026.md`](./julian-inputs/LG_MULTIPLICATION_PLAN_2026.md).
❓ **Decision owed:** is the in-app pipeline the system of record, or does the Google
Doc stay master — and the 2026-vs-2027 split per group.

## Q12 — What makes the tool genuinely useful, week to week
**Julian:** three jobs — (1) know how my leaders are doing, (2) know what groups need
to be launched and when, (3) know the **health of a Life Group** (rubric he's *still
designing*).
**Requirement:** deliver all three jobs.
**Status:**
- Job 1 (leaders) — ✅ delivered by Q1–Q8.
- Job 2 (launches) — ✅ delivered by Q9–Q11.
- Job 3 (group health) — 🟡 **Rubric locked; build pending.** Three dimensions
  (attendance consistency · admin-entered spiritual-growth 1–5 · a relayed leader
  1–5), letter A–D output, monthly cadence, tunable weights/cut-lines/thresholds; see
  [`plans/GROUP_HEALTH_RUBRIC_DISCOVERY.md`](./plans/GROUP_HEALTH_RUBRIC_DISCOVERY.md)
  and ADR 0004 / D8. Build slices #127/#128/#129 can now be cut. ❓ **Only owed:**
  Julian's exact wording for the two 1–5 questions.

---

## Where we stand, in one line
Jobs 1 and 2 (Q1–Q11) are **functionally shipped**; the only North-Star item not built
is **Job 3 / group health (Q12)**, which is blocked on the rubric Julian is still
designing. The remaining items are **decisions for Julian** (Q2 wording, Q5 cadence,
Q11 pipeline ownership), none of which block launch.

## Decisions owed by Julian
1. ~~**Group-health rubric (Q12)**~~ — ✅ **Locked** (grill 2026-05-30; ADR 0004 / D8).
   Only his exact wording for the two 1–5 questions (spiritual growth, relayed group
   question) is still outstanding before #128/#129 ship.
2. **Care cadence (Q5)** — one staleness window or per-oversight-tier, and the values.
3. **Care-status wording (Q2)** — keep three statuses or adopt his five.
4. **Multiplication ownership (Q11)** — app as system of record vs. Google Doc, and the 2026/2027 split.
