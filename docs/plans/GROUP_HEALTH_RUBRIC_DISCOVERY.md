# Group-health grading rubric

**Status: rubric locked (grill session 2026-05-30).** This document started as
discovery because Julian asked for a way to "grade" group health but was, in his
own words, "still working on an evaluation system" ([systems
conversation](../julian-inputs/SYSTEMS_CONVERSATION.md) answer 12;
[`julian-inputs/FEEDBACK_MAP.md`](../julian-inputs/FEEDBACK_MAP.md) §3.1). The
**Locked rubric decisions** section below is the settled rubric the build slices
(#127/#128/#129) are cut against; the design-space material that follows it is
retained for context.

> One item still needs Julian's sign-off before #128/#129 ship: the **exact
> wording** of the spiritual-growth rating and the relayed group question (his
> pastoral call). The rubric *shape* is locked; only his two question texts are
> outstanding.

## Locked rubric decisions

Decided in a grill session walking #125 (PRD Q12 / ADR 0004 D8). These are the
contract for the build slices.

### Dimensions (fixed in code)

The grade is computed from **three** dimensions:

1. **Attendance consistency** — computable from existing data.
2. **Spiritual growth** — net-new admin-entered capture (see below).
3. **Group question (relayed)** — a calibrated 1–5 the *leader* answers but
   *Julian enters* (see below). Replaces the earlier idea of deriving this leg
   from the coarse `pulse` enum.

The three legs are a deliberate triangulation: attendance is **objective**
(the data), spiritual growth is the **admin's** judgment, and the group question
is the **leader's** voice (relayed). Two of the three are admin-entered 1–5s, so
their question wordings must target **distinct, observable facets** — spiritual
growth vs. e.g. engagement/connection — or they collapse into one rating.

**Multiplication readiness is deliberately excluded.** The launch pipeline
already owns "ready to multiply"; folding it into the health grade would
double-count it (a group can be healthy yet nowhere near multiplying, and vice
versa). The dimension *set* is a code-level decision — Julian cannot add or drop
whole dimensions at runtime, because each new dimension needs its own data
source.

### Output shape

A **letter grade (A–D)**, derived from an internal numeric the math produces.
Julian asked to "grade them," so the surface speaks report-card; storing the
underlying number keeps the grade sortable/segmentable and lets the A/B/C/D
cut-lines move without a migration.

### Tunable rubric configuration

Julian can tune, through the audited admin write path, three kinds of number:
**dimension weights**, **A/B/C/D cut-lines**, and **per-dimension thresholds**
(e.g. the healthy-attendance %). The rubric is therefore *configuration data,
not hardcoded constants*. What he cannot change at runtime is the dimension
*membership* (above). The existing per-group **manual override**
(`group_metric_settings.manual_health_status_override`) is retained and is
distinct from rubric tuning.

### Attendance-consistency definition

**Rolling 8-week average attendance %**, compared against the configurable
healthy-attendance threshold (reuses `default_healthy_attendance_pct`, default
60). The 8-week window is itself an admin-tunable per-dimension threshold.

*Why average, not variance:* a pure variance/"steadiness" measure rewards the
wrong thing — a group that reliably gets 30% every week is maximally
"consistent" yet plainly unhealthy. Average-vs-threshold cannot be gamed that
way and reuses the cut-line the app already ships.

*Why 8 weeks:* 4 weeks is too jumpy (a single holiday week tanks the grade), 12
is too laggy for a week-to-week tool; ~2 months smooths noise while still
reacting within a quarter. Tunable if it proves wrong.

*Known limitation:* this measures attendance **level**, not literal
steadiness/decline. A group sliding 90% → 50% can still average above the line.
Trend/decline detection is a possible later refinement, not part of the tracer
(#127).

### Spiritual-growth capture

A **periodic 1–5 rating per group, plus an optional qualitative note**, entered
by **Ministry Admin only**. The 1–5 feeds the computed grade; the note carries
pastoral color. Because there is no rolling data source for spiritual growth, it
is an inherently periodic human judgment, not a continuously-computed signal.

*Why admin-entered, not leader self-reported:* "is spiritual growth happening"
is the pastoral judgment Julian said *he* makes ("how **we** would grade them"),
and self-assessment is biased. (Note: leaders *do* have a live check-in surface
— see CONTEXT.md — so "leaders can't log in" is **not** the reason; the reason
is whose judgment this is.) Admin-only entry also honors **Q7**'s "broad notes
only" ceiling for over-shepherds: a structured rating is not a broad note, so
over-shepherds get **no** spiritual-growth surface.

### Group-question dimension (relayed)

A single **calibrated 1–5 question** about a *distinct, observable* facet of
group life (engagement / relational connection / participation — **not** a
second spiritual-growth question). The **leader answers it and feeds it to
Julian, who enters it** on the admin side, periodic/monthly like spiritual
growth.

*Why relayed rather than leader-entered:* a direct leader question would touch
the **frozen leader surface** (no new leader-facing features without Julian's
go-ahead, LDR.1) and make the slice HITL. Routing it through Julian keeps the
whole grade admin-entered and AFK-ready. Wiring a direct leader question is a
possible later slice if Julian green-lights it.

*Provenance:* the value is **leader-reported, admin-entered** — flag it on the
record so it is not mistaken for Julian's own assessment. It is the leader's
voice in the triangulation, just relayed.

### Weights

Default **attendance 40% · spiritual growth 40% · group question 20%** — the two
dimensions Julian named carry the grade equally; the newest/softest signal gets
a lighter share until trusted. Weights are tunable (see *Tunable rubric
configuration*), so this is only the shipping default.

### Cadence

**Monthly periodic review.** One `group_health_assessments` row per group per
month. The **current** month recomputes on-read as attendance rolls and the
admin updates the two 1–5s; **closed** months are frozen snapshots, giving a
month-over-month history/trend. No cron — computation happens on dashboard-read
and admin-write, consistent with ADR 0004 / D7's manual-input model.

### Override

Ministry Admin (and Super Admin) can force a group's grade. The override is
stored **separately** from the computed grade — the UI shows both ("computed B,
set to A by Julian") so an override never silently destroys the math (#129's
"computed vs. overridden must be distinguishable"). It flows through
`runAdminWriteAction` with paired `audit_events`.

Each override carries a **scope** chosen when it is set: **"this month only"**
(auto-clears at the monthly rollover; the **default**) or **"until I clear it"**
(a standing override that persists across periods and is labeled as such).
Defaulting to month-only keeps a stale forever-"A" from quietly hiding a
declining group.

---

## Design-space notes (retained for context)

The material below predates the locked decisions above and is kept for the
reasoning trail.

## What Julian said

> "...the health of a life group (which I'm still working on an evaluation
> system of how we would grade them, like group is consistently attending,
> spiritual growth is happening, etc.)."

Two signals are explicit — **consistent attendance** and **spiritual growth** —
with an open "etc." Julian owns the rubric; this app's job is to compute and
surface it once the dimensions are fixed.

## Related but distinct: leader care-status vocabulary (Q2)

Two axes are easy to conflate:

- **Group health grade** — the *group's* health Julian is still designing
  (Q12). This document.
- **Leader care status** — how the *leader / shepherd* is doing, tracked in the
  shipped Shepherd Care module (`shepherd_care_status`: `healthy` / `watch` /
  `needs_attention`).

In **Q2**, Tom floated a candidate care-status vocabulary — *doing well / needs
encouragement / needs follow-up / concern / inactive*. Julian did not adopt it
verbatim ("I think having a category for every leader would be good"), so the
shipped three-value enum stands for now. **Open refinement:** align
`shepherd_care_status` with whatever vocabulary Julian settles on. This is a
*care-status* question parked here only because it shares the "how are they
doing" framing; it is **not** part of the computed group grade.

## What the app already has (reusable inputs)

| Signal | Source today | Notes |
|---|---|---|
| Attendance consistency | `attendance_sessions` + `attendance_records` | Per-week present/absent/excused counts already drive the leader check-in flow. A rolling attendance % is computable. |
| Leader-reported pulse | `group_health_updates.pulse` (enum) + `leader_note` | Self-reported weekly sentiment (`healthy` … `needs_leader_support`). Subjective, leader-entered. |
| Follow-up signal | `group_health_updates.follow_up_needed` | Boolean flag a leader can raise. |
| Canonical current health | `groups.health_status` | Carries the latest pulse forward; shown across admin surfaces. |
| Admin override | `group_metric_settings.manual_health_status_override` | Lets an admin force a status regardless of pulse. |
| Healthy-attendance threshold | `app_settings.metric_defaults.default_healthy_attendance_pct` (60) | Already configurable; a rubric could reuse it as the attendance dimension's cut line. |

**Net-new (does not exist today):** any *computed grade* that combines these
into a score or letter; a weighting/rubric definition; a "spiritual growth"
data source (there is no spiritual-growth field anywhere yet); and a dashboard
surface that ranks/segments groups by grade.

## Candidate grading dimensions (to confirm with Julian)

1. **Attendance consistency** — derivable now. Open: rolling window (4/8/12
   weeks?), and whether "consistent" means an average % or a variance measure.
2. **Spiritual growth** — *no data source exists.* Options to put to Julian:
   a periodic leader-entered 1–5 rating, a qualitative pulse, or leave it out
   of the computed score and keep it a note. This is the biggest unknown.
3. **Leader health / support need** — could fold in `pulse` +
   `follow_up_needed`.
4. **Capacity / multiplication readiness** — possibly orthogonal; Phase 4's
   pipeline already covers "ready to multiply," so health grading should
   probably not double-count it.

## Open questions for Julian

- Which dimensions are in the grade, and how are they weighted?
- Output shape: a letter (A–D), a 1–5 score, or a status bucket like the
  existing health pulse?
- How is "spiritual growth" captured — and is it part of the *computed* grade or
  a separate qualitative note?
- Cadence: graded continuously from rolling data, or set on a periodic review?
- Who sets/overrides a grade — admin only, or leaders contribute input
  (consistent with answer 7's "broad notes" stance)?

## Proposed thin schema (NOT to build yet)

Once dimensions are fixed, a minimal model would be a `group_health_assessments`
table (one row per group per review period): `group_id`, `period`, a small set
of dimension scores, an optional computed overall grade, an admin/leader note,
and the standard `created_by` / audit trail — mirroring the
`shepherd_care_*` and `multiplication_candidates` patterns (admin-only RLS,
`SECURITY DEFINER` write RPCs, paired `audit_events`). This is a sketch to react
to, not a commitment.

## Recommendation

Hold implementation. Take the open questions above to Julian, settle the
dimensions and output shape, then open a build issue. Until then, the existing
`group_health_updates` pulse + `groups.health_status` remain the health signal.
