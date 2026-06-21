# Configurable, fluid A–F health rubrics (Group and Leader)

**Status:** Accepted

ADR 0007 shipped Group Health with placeholder labels and **deferred the
rubric**, because Julian was still designing how to grade a group. This ADR
resolves that by handing him the builder instead of hardcoding a formula: a
**configurable Health Rubric** of weighted criteria (e.g. Attendance, Unity,
Growth, plus any custom ones) whose **weightings total 100**. The same mechanism
is added for a new **Leader-Health Grade**. Both run on an **A / B / C / D / F**
scale — the **F** is new (the enum was A–D). This supersedes the "defer the
rubric" half of ADR 0007.

## How a grade is produced

Per group (and per leader), each criterion is scored and rolled up by its weight
into an overall A–F. The grade is **fluid**: editing an input re-grades
immediately, no fixed monthly/yearly cadence. A **manual override** can still
force the letter (honouring the existing this-month / until-cleared override
scopes). Grades are tracked within the current **Ministry Year** (August–May).

## What ADR 0007 keeps

ADR 0007's _ownership_ principle is unchanged and load-bearing: the rubric is
**Julian's pastoral copy**, so it lives in **Settings**, not the Super Admin
Console. Tom does not edit Julian's criteria or weightings.

## The model-clarity tension, accepted with eyes open

ADR 0010's model-clarity gate warns against "demanding precision a sane default
could supply, such as a decimal coefficient a non-technical ministry user cannot
confidently give." A weight-to-100 rubric is exactly that shape, so it is the one
place we accept the tension — because Julian explicitly asked to own the weights,
and because the output stays coarse (a letter, not a decimal) and every input has
a sane default. If this proves too fiddly in practice, the fallback is
"weights advise, human sets the letter," recorded here as the known retreat.

## Consequences

- The `group_health_letter` enum gains `F`; a parallel Leader-Health grade and
  its rubric are added. Two rubrics now exist (Group, Leader), both Julian-owned.
- "Leader Health" is a genuine **fourth** health concept (see CONTEXT.md) and
  must stay distinct from Leader Care Status (pastoral signal) and Health Pulse
  (self-report).
- Both grades feed the Multiplication pillars as ministry-year roll-ups
  (ADR 0019).
