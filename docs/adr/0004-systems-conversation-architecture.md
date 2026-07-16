# Architecture decisions for the systems conversation (Q1–Q12)

The North Star is Julian's systems conversation
([`../julian-inputs/SYSTEMS_CONVERSATION.md`](../julian-inputs/SYSTEMS_CONVERSATION.md),
2026-05-27). This ADR records the architecture decisions taken in response, mapped
**1:1 to the questions**. The product side of the same mapping is [`../PRD.md`](../PRD.md).
Deeper decisions have their own records — [ADR 0001](./0001-admin-write-action-runner.md),
[ADR 0002](./0002-oversight-ladder-and-leader-gating.md),
[ADR 0003](./0003-private-care-note-encryption.md) — and are referenced below rather than restated.

**Status:** Accepted. Most are implemented; the exceptions are called out.

---

## D1 — Care list is data, not a spreadsheet · _answers Q1, Q3, Q6_

**Decision.** Model the care list as a per-leader **profile** plus an **append-only
interaction history** plus a **follow-up task list** — the "A1" model — rather than a
freeform sheet. Q6 ("both!") makes history _and_ tasks first-class; Q3 fixes what an
interaction must remember (issue/good-thing + whether/when/what follow-up).
**Consequences.** `shepherd_care_profiles`, `shepherd_care_interactions`,
`shepherd_care_follow_ups`. The spreadsheet columns in
`MIN_CARE_LIST_TEMPLATE.md` (retired to git history)
map onto profile fields.

## D2 — A per-leader status enum · _answers Q2_

**Decision.** Ship one `shepherd_care_status` enum plus free-text notes. Originally three
low-cardinality values (`healthy / watch / needs_attention`); **resolved 2026-05-30** to
adopt Julian's five verbatim — `doing_well / needs_encouragement / needs_follow_up /
concern / inactive`. The note field still carries the "next step" Julian thinks in; the
enum carries "is there an issue, and how bad."
**Migration.** Backfill existing rows `healthy → doing_well`, `watch →
needs_encouragement`, `needs_attention → needs_follow_up` (the milder action state, so the
migration never silently escalates a record to `concern`). `concern` and `inactive` are
net-new, populated by hand. The one-time backfill is a schema migration, not a
`runAdminWriteAction` call; _ongoing_ status edits keep flowing through the audited runner.
**Note.** `inactive` is a lifecycle state, not a severity level — it shares the enum but
reads on a different axis. `needs_follow_up` now also exists in `group_health_status`
(the pulse); different enum types, distinct concepts (Leader Care Status vs Health Pulse).

## D3 — Cadence is tiered by oversight, not a global interval · _answers Q5, Q7_

**Decision.** There is **no single check-in interval**. Model _who oversees whom_
(`shepherd_coverage_assignments`) and derive a configurable staleness signal
(`shepherd_care_stale_days`) instead of a hard cadence. This is the data backbone for
the oversight ladder in [ADR 0002](./0002-oversight-ladder-and-leader-gating.md).
**Resolved 2026-05-30 — per-tier.** Two staleness windows, derived from coverage (no new
per-group field): **directly-overseen** (falls to the Ministry Admin) gets the shorter
window — "in the weeds"; **delegated** (has an active over-shepherd assignment) gets the
longer one, since the over-shepherd carries frequent contact. Proposed defaults **30 / 60
days** (Julian confirms the exact numbers).
**Clock source — Julian only, for now.** The staleness clock resets on **Ministry-Admin
interactions only**; over-shepherds have no write path yet (#126), so there are no
over-shepherd interactions to count. Once #126 ships, revisit whether an over-shepherd's
logged note should reset the clock on their delegated groups. Build tracked in #123.

## D4 — Over-Shepherd is a new, coverage-scoped login tier · _answers Q5, Q7_

**Decision.** Add `over_shepherd` to the role ladder with a login bridge and
coverage-scoped RLS, per [ADR 0002](./0002-oversight-ladder-and-leader-gating.md). Q7
confirms exactly **3 over-shepherds** and that any future write access is limited to
**broad notes** for simplicity/confidentiality.
**Consequences / deferral.** Read + coverage ship now; over-shepherd _write_ and a future
leader surface are deferred (LDR.1), not deleted.

## D5 — Private notes use client-side zero-knowledge encryption · _answers Q8_

**Decision.** A note tier readable by Julian alone — excluding `super_admin` — cannot be
met by RLS (which grants SELECT to super-admin too). Adopt **client-side AES-256-GCM with
keys wrapped under WebAuthn PRF + recovery code**, server stores ciphertext only. Full
record: [ADR 0003](./0003-private-care-note-encryption.md). This is the one deliberate
inversion of the downward-visibility ladder (ADR 0002).
**Consequences.** `shepherd_care_private_notes`, key-slot table, `lib/crypto/private-notes.ts`;
super-admin read path closed and proven (#114).

## D6 — All admin writes flow through one audited runner · _cross-cutting, enables Q1–Q8_

**Decision.** Every write (care, coverage, follow-ups, launch settings) goes through the
`runAdminWriteAction` gateway over `SECURITY DEFINER` RPCs that emit a paired
`audit_events` row — no service-role key in app runtime. Full record:
[ADR 0001](./0001-admin-write-action-runner.md).
**Why here.** The care and privacy requirements (Q3, Q7, Q8) only hold if every mutation is
authorized and audited uniformly.

## D7 — Launch planning is a manual-input capacity/demand model · _answers Q9, Q10, Q11_

**Decision.** Compute capacity/demand from **people-in-groups** (leader-updated) and
**church-attendance snapshots**, with capacity default **12** + opt-to-stay-open, a
**multiplication readiness rubric** (12+ / 3+ years / need), seasonality quick-fills
(Aug/Jan), and named forecast scenarios. Inputs are manual by design — no realtime/cron
(see [`../architecture/FREE_TIER_NOTES.md`](../architecture/FREE_TIER_NOTES.md)).
**Known gap.** Reliable _capture_ of church attendance is operational, not architectural
(Q9). **Open:** app vs. Google Doc as system of record (Q11).

## D8 — Group health is a tunable, admin-entered rubric · _answers Q12_

**Decision (rubric locked 2026-05-30).** The group-health grade is computed from
**three fixed dimensions** — attendance consistency (rolling 8-week average % vs. the
configurable healthy threshold), an admin-entered spiritual-growth 1–5, and a leader-
answered group question relayed and entered by the admin — output as a **letter A–D**
backed by an internal numeric, on a **monthly** review period. Multiplication readiness
is excluded to avoid double-counting D7's launch pipeline. The full rubric is
[`../plans/GROUP_HEALTH_RUBRIC_DISCOVERY.md`](../plans/GROUP_HEALTH_RUBRIC_DISCOVERY.md);
build slices are #127/#128/#129.

**Why it's recorded here.** Two non-obvious calls a future reader will question:

1. **The rubric is _configuration data, not hardcoded constants_.** Weights, A/B/C/D
   cut-lines, and per-dimension thresholds are admin-tunable through the audited write
   path, so the grade math reads from settings, not literals. Julian is "still tuning his
   evaluation system" — this lets him dial it in over months without an engineer. The
   _set_ of three dimensions stays code-level (each needs its own data source), so the
   tunability is deliberately bounded.
2. **The whole grade is admin-entered + computed, by design.** Two of three dimensions are
   1–5 judgments keyed by the Ministry Admin (spiritual growth; the relayed leader
   question). This keeps the build off the **frozen leader surface** (LDR.1) and inside
   the established admin-scoped, `SECURITY DEFINER` + paired-audit pattern.

**Held earlier; superseded.** D8 originally deferred all schema until the rubric existed;
that gate is now cleared. **Outstanding:** only Julian's exact _question wordings_ for the
two 1–5 inputs.

---

## Consequences in aggregate

- The data model serves the three jobs of Q12: care (D1–D6), launches (D7), and a reserved
  seat for health (D8).
- Two guarantees are load-bearing under review: the **downward-visibility ladder** (ADR 0002)
  and its single **private-note inversion** (ADR 0003 / D5).
- The open items are all **Julian decisions**, not engineering unknowns: Q2 wording, Q5
  cadence, and Q11 ownership. Q12's rubric is now **locked** (D8); only Julian's two
  question wordings remain before #128/#129 ship.
