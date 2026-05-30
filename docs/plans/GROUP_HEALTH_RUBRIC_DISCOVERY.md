# Group-health grading rubric — discovery

**Status: discovery only. No schema or feature work until Julian confirms the
dimensions below.** This document exists because Julian asked for a way to
"grade" group health but is, in his own words, "still working on an evaluation
system" ([systems conversation](../julian-inputs/SYSTEMS_CONVERSATION.md) answer
12; [`julian-inputs/FEEDBACK_MAP.md`](../julian-inputs/FEEDBACK_MAP.md) §3.1).
Building a scoring model before his rubric is settled would bake in the wrong
assumptions, so this captures the design space and the open questions instead.

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
