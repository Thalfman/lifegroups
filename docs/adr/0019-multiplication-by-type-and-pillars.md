# Multiplication by group type, assessed by five pillars

Multiplication re-frames from planning individual groups to deciding whether to
launch another group of a **type**. The unit is the **Audience** (Men's,
Women's, Mixed) — three boards. Each board is assessed by five **pillars**, and
Julian configures a **trigger rubric** over the pillar grades that signals
"multiply this type." This supersedes the per-group lens of ADR 0006.

## The five pillars

Each pillar is a computed A–F per type, over the Ministry Year (Aug–May):

- **Capacity** — **Julian-fed**. He keeps the real headcount/capacity data by his
  own methods, so the app does not compute this from in-app memberships; he
  provides it per type. He can also configure **two offerable capacity options**
  (a customizable label + target size each) to present to anyone interested; the
  largest option's capacity feeds the pillar when no explicit headroom is fed.
  (This is why ADR 0016 can safely turn off the capacity board.)
- **Overflow** — _Capacity (additional): groups overflowing._ Grades the magnitude
  of full groups of the type (the fed full-group count), a distinct signal from
  the single-group multiply flag.
- **Interest** — computed from the Interest Funnel (Prospect volume for the type).
- **Group Health** — roll-up of that type's Group-Health Grades (ADR 0018).
- **Leader Health** — roll-up of that type's Leader-Health Grades (ADR 0018).

There is **no single overall multiplication letter**. The pillars stand on their
own and the trigger rubric — not a blended grade — produces the signal.

## The trigger, and the individual-group exception

Julian owns the **Multiplication Trigger** (a rule over the pillar grades); it
lives in Settings with his other rubrics (ADR 0007/0018). The trigger is
**directional per pillar**, because health is not monotonic: high health can
warrant multiplying _or_ holding, and low health can warrant splitting _or_ not
multiplying. So each pillar's condition names a direction — **at least** (fires
on high), **at most** (fires on low), or **between** (fires within a band) — not
just a minimum. The app surfaces the signal; it does not decide for him.
Capacity can still flag a **single full group** to multiply on its own — the one
place an individual group, not a type, is the unit — raised as a manual flag from
the Capacity input.

## What ADR 0006 keeps

ADR 0006's seed and its faithful-transcription provenance of Julian's
multiplication Doc are **retained** — the `groups` / `multiplication_candidates`
rows and their preserved ambiguity stay as the data substrate. What changes is
the _planning lens_ on top: per-type pillar boards rather than a per-group
candidate list as the primary surface.

## Consequences

- Multiplication reads three in-app sources (funnel, group grades, leader grades)
  and one Julian-fed input (capacity); it does not depend on the in-app
  membership counts ADR 0016 turns off.
- The Multiplication Trigger is a third Julian-owned rubric alongside the two
  health rubrics; all three live in Settings, never the Super Admin Console.
