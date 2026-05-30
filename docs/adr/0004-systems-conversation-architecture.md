# Architecture decisions for the systems conversation (Q1–Q12)

The North Star is Julian's systems conversation
([`../julian-inputs/SYSTEMS_CONVERSATION.md`](../julian-inputs/SYSTEMS_CONVERSATION.md),
2026-05-27). This ADR records the architecture decisions taken in response, mapped
**1:1 to the questions**. The product side of the same mapping is [`../PRD.md`](../PRD.md).
Deeper decisions have their own records — [ADR 0001](./0001-admin-write-action-runner.md),
[ADR 0002](./0002-oversight-ladder-and-leader-gating.md),
[ADR 0003](./0003-private-care-note-encryption.md) — and are referenced below rather than restated.

Status: **Accepted.** Most are implemented; the exceptions are called out.

---

## D1 — Care list is data, not a spreadsheet  · _answers Q1, Q3, Q6_
**Decision.** Model the care list as a per-leader **profile** plus an **append-only
interaction history** plus a **follow-up task list** — the "A1" model — rather than a
freeform sheet. Q6 ("both!") makes history *and* tasks first-class; Q3 fixes what an
interaction must remember (issue/good-thing + whether/when/what follow-up).
**Consequences.** `shepherd_care_profiles`, `shepherd_care_interactions`,
`shepherd_care_follow_ups`. The spreadsheet columns in
[`../julian-inputs/MIN_CARE_LIST_TEMPLATE.md`](../julian-inputs/MIN_CARE_LIST_TEMPLATE.md)
map onto profile fields.

## D2 — A per-leader status enum, kept small  · _answers Q2_
**Decision.** Ship one low-cardinality `shepherd_care_status`
(`healthy / watch / needs_attention`) plus free-text notes, rather than encoding
Julian's candidate five-word vocabulary. Q2 showed he thinks in *issue + next step*,
not a fixed taxonomy.
**Open.** Whether to widen the enum to his five words is deferred to Julian (see PRD Q2);
the enum is the cheap thing to change later.

## D3 — Cadence is tiered by oversight, not a global interval  · _answers Q5, Q7_
**Decision.** There is **no single check-in interval**. Model *who oversees whom*
(`shepherd_coverage_assignments`) and derive a configurable staleness signal
(`shepherd_care_stale_days`) instead of a hard cadence. This is the data backbone for
the oversight ladder in [ADR 0002](./0002-oversight-ladder-and-leader-gating.md).
**Open.** One staleness window vs. per-tier windows (directly-overseen mixed/couples vs.
delegated men's/women's) is Julian's call.

## D4 — Over-Shepherd is a new, coverage-scoped login tier  · _answers Q5, Q7_
**Decision.** Add `over_shepherd` to the role ladder with a login bridge and
coverage-scoped RLS, per [ADR 0002](./0002-oversight-ladder-and-leader-gating.md). Q7
confirms exactly **3 over-shepherds** and that any future write access is limited to
**broad notes** for simplicity/confidentiality.
**Consequences / deferral.** Read + coverage ship now; over-shepherd *write* and a future
leader surface are deferred (LDR.1), not deleted.

## D5 — Private notes use client-side zero-knowledge encryption  · _answers Q8_
**Decision.** A note tier readable by Julian alone — excluding `super_admin` — cannot be
met by RLS (which grants SELECT to super-admin too). Adopt **client-side AES-256-GCM with
keys wrapped under WebAuthn PRF + recovery code**, server stores ciphertext only. Full
record: [ADR 0003](./0003-private-care-note-encryption.md). This is the one deliberate
inversion of the downward-visibility ladder (ADR 0002).
**Consequences.** `shepherd_care_private_notes`, key-slot table, `lib/crypto/private-notes.ts`;
super-admin read path closed and proven (#114).

## D6 — All admin writes flow through one audited runner  · _cross-cutting, enables Q1–Q8_
**Decision.** Every write (care, coverage, follow-ups, launch settings) goes through the
`runAdminWriteAction` gateway over `SECURITY DEFINER` RPCs that emit a paired
`audit_events` row — no service-role key in app runtime. Full record:
[ADR 0001](./0001-admin-write-action-runner.md).
**Why here.** The care and privacy requirements (Q3, Q7, Q8) only hold if every mutation is
authorized and audited uniformly.

## D7 — Launch planning is a manual-input capacity/demand model  · _answers Q9, Q10, Q11_
**Decision.** Compute capacity/demand from **people-in-groups** (leader-updated) and
**church-attendance snapshots**, with capacity default **12** + opt-to-stay-open, a
**multiplication readiness rubric** (12+ / 3+ years / need), seasonality quick-fills
(Aug/Jan), and named forecast scenarios. Inputs are manual by design — no realtime/cron
(see [`../architecture/FREE_TIER_NOTES.md`](../architecture/FREE_TIER_NOTES.md)).
**Known gap.** Reliable *capture* of church attendance is operational, not architectural
(Q9). **Open:** app vs. Google Doc as system of record (Q11).

## D8 — Group health is deliberately unbuilt  · _answers Q12_
**Decision.** Do **not** design a group-health schema until Julian's rubric exists. Q12
says he's *still designing* the evaluation system, and "spiritual growth" has no data
source today. Keep it in discovery
([`../plans/GROUP_HEALTH_RUBRIC_DISCOVERY.md`](../plans/GROUP_HEALTH_RUBRIC_DISCOVERY.md))
rather than guess.
**Open.** Dimensions, weights, output shape, and growth capture — the one gate left on
Julian's stated vision.

---

## Consequences in aggregate
- The data model serves the three jobs of Q12: care (D1–D6), launches (D7), and a reserved
  seat for health (D8).
- Two guarantees are load-bearing under review: the **downward-visibility ladder** (ADR 0002)
  and its single **private-note inversion** (ADR 0003 / D5).
- The open items are all **Julian decisions**, not engineering unknowns: Q2 wording, Q5
  cadence, Q11 ownership, and Q12 rubric.
