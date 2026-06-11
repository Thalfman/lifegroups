# Capacity & Multiplication — PRD

> 📌 **What this is.** The product requirements for Julian's **capacity planning
> and multiplication** workspace — north-star **job 2**: _"know what groups need
> to be launched, and when"_
> ([`../julian-inputs/SYSTEMS_CONVERSATION.md`](../julian-inputs/SYSTEMS_CONVERSATION.md)
> Q9–Q12). It re-frames the work that today is split across Launch Planning and
> the Multiplication planner into **one connected flow**.
>
> **Supersedes** `MULTIPLICATION_PLANNER.md` (retired; in git history — the
> narrower "replace the Google Doc" spec) and folds in the launch-planning
> capacity story. Traces to [`../PRD.md`](../PRD.md) Q9–Q11 and
> [`../adr/0006-multiplication-planner-supersedes-google-doc.md`](../adr/0006-multiplication-planner-supersedes-google-doc.md).
> Vocabulary follows [`../../CONTEXT.md`](../../CONTEXT.md).

_Status legend:_ ✅ exists (reuse) · 🟡 exists, needs rework · 🆕 net-new.

---

## 1. The problem

Capacity and multiplication are **shipped but missing the mark.** The machinery
exists — capacity math, a forecast, a readiness checker, a candidate pipeline —
but Julian's verdict is that it "isn't really easy to follow or use." Four
concrete reasons:

1. **The story is split across disconnected surfaces.** Capacity lives in
   `/admin/launch-planning` (forecast math) and a dashboard `CapacityBuckets`
   tile; multiplication lives in a separate `/admin/multiplication` planner. The
   two pages link to each other but never tell **one** story. Julian can't follow
   the single thread he actually thinks in:
   > _this group is full → here's the person ready to lead the next one → so we
   > multiply it this August._
2. **There is no real leader pipeline.** "Who leads the next group?" is captured
   only as a free-text `successor_designate` string on a candidate. There is no
   first-class apprentice concept, no readiness stage, and no way to see **who is
   ready to lead** across the ministry. This is the missing spine that should tie
   a full group to a multiplication.
3. **The forecast and the real groups don't talk.** `lib/admin/launch-planning.ts`
   computes "you need N new groups" from church-attendance demand, but nothing
   connects that number to _which actual groups are ready to multiply_ or _whether
   we have the leaders to staff them._ The recommendation floats free of the plan.
4. **Capacity is a faceless global default.** "Full at 12" is modelled as a
   ministry-wide default with per-group overrides, not as a deliberate **target
   Julian sets and reads each group against.** It tells him a count, not a plan.

### Goal

**One place to plan capacity and multiplication that Julian can actually follow** —
from "this group is filling up" to "here's who's ready to lead" to "so here's what
we launch in August," with the leader-supply math done for him. Outcome over
feature count: he should be able to answer _what's full, who's ready, and what we
launch next_ without opening the spreadsheet or the Google Doc.

---

## 2. Persona & scope

- **Primary persona:** Julian, the **Ministry Admin** — oversees 60+ Leaders
  across the ministry. (Super Admin inherits access; Over-Shepherds and Leaders do
  **not** see this surface.)
- **North-star trace:** job 2 of Q12, detailed in Q9 (the numbers he uses), Q10
  (when a group is "full" / ready to multiply), Q11 (season-driven launching).
- **In scope:** the integrated capacity + leader-pipeline + multiplication
  workspace described below.
- **Out of scope:** see §8.

---

## 3. Core concepts (ubiquitous language)

The fix is to name four nouns and **connect them**, so the whole feature hangs
together instead of living as separate screens. New terms here should be added to
[`../../CONTEXT.md`](../../CONTEXT.md) when built.

### 3.1 Target size & capacity status — 🟡

Every group has a **target size** — the headcount Julian considers "full" for
_that_ group (default 12, per Q10, but explicitly his to set per group). A group's
**capacity status** is read against its own target:

| Status             | Meaning                                 | Rule                           |
| ------------------ | --------------------------------------- | ------------------------------ |
| **Room**           | comfortably below target                | `members < warning threshold`  |
| **Filling**        | approaching target                      | `warning ≤ members < target`   |
| **Full**           | at/over target, action implied          | `members ≥ target`             |
| **Open by choice** | at/over target, intentionally kept open | `Full` + `allow_over_capacity` |

> Reuse, don't rebuild: `effectiveCapacity()`, `capacityStatus()`, and the
> threshold constants already exist in
> [`../../lib/admin/metrics.ts`](../../lib/admin/metrics.ts) (today's statuses:
> `ok / warning / full / open_by_choice / unknown / excluded`). The shift is
> framing — present capacity as a **per-group target Julian owns**, label the
> ladder in his words, and prompt him to confirm each group's target rather than
> silently inheriting the global default.

### 3.2 Leader Pipeline & Apprentice — 🆕

An **Apprentice** is a leader-in-training attached to a group, the person being
raised up to lead the _next_ group. This is the **net-new spine** that connects a
full group to a multiplication. Each apprentice carries a **readiness stage**:

> **Identified → In training → Ready to lead → Launched**

The **Leader Pipeline** is the roll-up of every apprentice and their stage — the
answer to _"who is ready to lead?"_ across the ministry, and the **supply side** of
the forecast (§3.4). This replaces the free-text `successor_designate` string with
a real, trackable record.

> This is what Julian's Google Doc gestured at with its second `(Name)` entries —
> `(Tony L.)`, `(Cindy Kessaris)`, `(Jon H.)` — which ADR-0006 reads as "the
> apprentice intended to carry the multiplied group." The Doc had nowhere to track
> their readiness; the pipeline does.

### 3.3 Multiplication Candidate — 🟡

A **group flagged to multiply.** Already modelled in `multiplication_candidates`
with target year, status (`watching / planned / launched / deferred`), the two
manual readiness flags, audience × life-stage segmentation, and meeting time. Two
changes:

- **Linked to an Apprentice** (§3.2) instead of a free-text successor name — so a
  candidate's "who leads it" is a real pipeline record with a readiness stage.
- **Readiness stays as-is** — the 5-criterion check in
  [`../../lib/admin/multiplication.ts`](../../lib/admin/multiplication.ts)
  (`evaluateReadiness()`: 12+ members, 3+ years, co-leader 1+ yr, leader willing,
  need for a similar group) is unchanged. "A group does not need to meet each."

### 3.4 Launch Plan / Forecast — ✅

The **supply-vs-demand** model. **Demand** = projected church attendance × target
participation %, plus a launch buffer (Q9, Q11). Already computed in
[`../../lib/admin/launch-planning.ts`](../../lib/admin/launch-planning.ts)
(`computeLaunchPlan()`, scenarios, seasonality anchors for August/January).

**Two supply dimensions — kept separate, never summed.** A launch needs _both_ a
place for people and a person to lead it; these are different constraints and the
forecast must report each on its own axis (summing them would double-count — a
ready group with its ready apprentice attached is one launch, not two):

- **Capacity supply (seats)** — open seats in existing groups + seats from each
  _new_ group a launch creates. Answers "is there room for the people?" Already
  computed (`available_seats`, `recommended_new_groups`).
- **Staffing supply (leaders)** — the count of apprentices at the **Ready to lead**
  stage (§3.2). Answers "do we have people to lead the new groups?" Net-new; the
  pipeline is its source.

The forecast's job is to surface the **binding constraint**: leaders _needed_ for
the planned launches vs. leaders _available_. Crucially, demand must use the same
unit as today's model — `launch count × leaders_per_new_group` (default 2), not the
launch count itself — so "launch 3 groups" needs **6** leaders, not 3. With 2
apprentices Ready, Julian sees "3 groups planned · need 6 leaders · 2 Ready ·
**short 4**." (Open decision §9-f: whether one apprentice represents a whole launch
team, i.e. `leaders_per_new_group = 1` for pipeline purposes — until decided, use
the scenario's `leaders_per_new_group`.) Capacity and staffing are reported side by
side, never added together. (See R10.)

**How the four connect (the thread that's missing today):**

```
Target size  →  a group goes Full  →  its Apprentice reaches "Ready to lead"
      →  it becomes a ready Multiplication Candidate
      →  the Forecast counts it as supply against seasonal demand
```

---

## 4. The integrated workspace

**One nav entry — "Capacity & Multiplication"** — consolidating today's
`/admin/launch-planning` and `/admin/multiplication` into a single surface with
three connected views. The point is that the views share data and tell one story,
not that they live behind one URL.

### View A — Capacity Board 🟡 (the replace-the-spreadsheet view)

An at-a-glance grid of **all active groups**, each showing:

- `members / target` and capacity-status color (§3.1).
- audience × life-stage segment (so it reads like Julian's Doc).
- a **"ready to multiply" badge** when a group is **Full _and_ has an apprentice
  who is Ready to lead** — the single most important signal, surfaced where Julian
  already looks.
- filters by segment and status; sortable by fullness.

This is the headline: open it and _see what's full and what's ready_, the job the
spreadsheet does today but scattered and manual.

### View B — Leader Pipeline 🆕

Every **apprentice** and their **stage** (§3.2), grouped by stage so "who is Ready
to lead" is a glance, not a hunt. From here Julian can add an apprentice to a
group, advance a stage, and see which groups have **no** apprentice yet (the gap
that blocks multiplication). This is the supply side made visible.

### View C — Multiplication Plan 🟡

Candidates grouped by **target year** (2026 / 2027 / TBD) and **audience ×
life-stage** — the shape of Julian's Doc — each row tied to its **group** and its
**apprentice**. Two ways to drive it, per the locked decision:

- **System-suggested.** The board flags groups that are **at/over target** (Full or
  Open by choice) **and have a Ready apprentice** as suggested candidates. The
  5-criterion readiness is shown as **context** (e.g. "meets 4/5"), used to rank
  and annotate, not to suppress (see R9 for the exact rule).
- **Scenario planning on top.** Julian runs _"launch N groups in `<year>`"_ against
  seasonal demand (reusing scenarios + the August/January anchors) and sees a
  **live leader-supply-vs-demand gap**, in leaders: _"3 groups planned for August ·
  need 6 leaders · 2 apprentices Ready · short 4"_ (demand = launches ×
  `leaders_per_new_group`; see §3.4). That gap is the number the current tool can't
  show because it has no pipeline to count.

---

## 5. Functional requirements

Grouped by view; each traces to a concept (§3) and names existing code to reuse.

### Capacity Board

- **R1 — Per-group target size.** Surface each group's target and prompt Julian to
  confirm/set it (not silently inherit the global default). Reuse
  `effectiveCapacity()` and the `capacity` / `capacity_override` fields. (§3.1, Q10)
- **R2 — Capacity-status ladder in Julian's words.** Render _Room / Filling / Full
  / Open by choice_ from `capacityStatus()`. Keep `allow_over_capacity` and
  `exclude_from_capacity_metrics`. (§3.1, Q10)
- **R3 — Board across the ministry.** A scannable grid of all active groups with
  `members / target`, status color, and segment; filter by segment/status. (§4-A)
- **R4 — "Ready to multiply" badge.** Show it when a group is **at/over target**
  (capacity status `Full` _or_ `Open by choice`) **and** has an apprentice at
  _Ready to lead_. The 5-criterion readiness is **not a gate** by default (same
  no-floor rule as R9; whether to add a criteria floor is open decision §9-e — if
  adopted it applies to _both_ the badge and suggestions). This is the join between
  capacity and pipeline. (§3.1, §3.4)

### Leader Pipeline

- **R5 — First-class Apprentice records.** Create/edit an apprentice on a group
  with a readiness **stage** (Identified → In training → Ready to lead →
  Launched). Net-new. (§3.2)
- **R5a — Expected-ready date.** Each apprentice carries an optional
  **expected-ready date/season** — when Julian expects them to reach _Ready to
  lead_. This is what lets a "launch N by August" scenario count apprentices who
  _will_ be ready by the target date, not only those Ready today (the walkthrough's
  date-adjustment depends on it). Stored on the pipeline record (§6-1). (§3.4, R10)
- **R6 — Pipeline roll-up.** List all apprentices grouped by stage; highlight
  groups with no apprentice. (§4-B)
- **R7 — Migrate `successor_designate`.** Seed apprentices from existing candidate
  successor names and from the Doc's second `(Name)` entries; the candidate then
  links to the apprentice record rather than a string. (§3.2, ADR-0006)

### Multiplication Plan

- **R8 — Candidate ⇄ apprentice link.** A candidate references its apprentice
  (§3.3); the planner shows the apprentice's stage inline. Keep target year,
  status, segment, meeting time, notes, and the readiness chips from
  `evaluateReadiness()`. (§3.3)
- **R9 — System-suggested candidates.** Surface a group as a suggestion when it is
  **at/over target** (capacity status `Full` _or_ `Open by choice`) _and_ has an
  apprentice at **Ready to lead**. The 5-criterion readiness
  (`evaluateReadiness()`) is shown as **context, not a gate** — its chips/`metCount`
  rank and annotate suggestions (e.g. "meets 4/5") rather than include or exclude
  them, consistent with Julian's "a group does not need to meet each." (Whether a
  hard criteria floor should _also_ gate suggestions is open decision §9-e; default
  is no floor.) (§4-C, §3.3)
- **R10 — Scenario forecast with explicit launch count + staffing supply.** A
  scenario must carry, in addition to today's demand assumptions, an **explicit
  planned launch count and target season/year** (net-new inputs — the existing
  `launch_planning_scenarios` only stores demand assumptions and _derives_
  `recommended_new_groups`, so it cannot represent "Julian plans 3 by August"). The
  forecast then reports the two supply dimensions **separately** (§3.4). Staffing
  demand = `launch count × leaders_per_new_group` (reuse the existing assumption,
  default 2); staffing supply = apprentices that will be **Ready by the scenario's
  target date** (see R5a / §6-1); the gap is demand − supply, in leaders. Reuse
  `computeLaunchPlan()`, the scenarios table, and `nextSeasonAnchorIso()` for the
  Aug/Jan anchors; add the launch-count + target-date inputs and a staffing-gap
  output. (§3.4, §9-f, Q9, Q11)
- **R11 — Target year stays in-app data.** Keep per-candidate `target_year`,
  filterable (2026 / 2027 / TBD), per ADR-0006 — no paper decision. (Q11)

---

## 6. Data-model changes

Described as **intent**, not migrations. All additive/nullable; all writes through
the existing audited path (`runAdminWriteAction` → `SECURITY DEFINER` `admin_*` RPC,
with a paired `audit_events` row written in the same transaction), admin-only RLS,
no hard deletes (archive via `archived_at`) — consistent with ADR-0001 and the
existing pipeline.

1. **`leader_pipeline` (apprentices) — 🆕.** One row per apprentice: `group_id`, a
   `readiness_stage` enum (`identified / in_training / ready_to_lead / launched`),
   an optional **`expected_ready_on` date** (R5a — drives by-the-season staffing
   supply), notes, audit/archival columns. New `admin_*` RPCs for
   create/advance/archive. Seeded from `successor_designate` + the Doc.
   **The person — provisional shape so the first slice isn't blocked (resolve §9-b
   before the schema slice lands):** store both a required **`display_name` text**
   _and_ a **nullable `member_id` FK** to `members`. The seed populates only
   `display_name` (the Doc has names, not records); Julian can later attach the
   `members` row. This avoids a rewrite whichever way §9-b lands — name-only stays
   valid, and a `profiles` link, if chosen instead, is an additive nullable column,
   not a type change to the existing data.
2. **`multiplication_candidates` — 🟡.** Add a nullable FK to a `leader_pipeline`
   row; retain `successor_designate` through migration, then treat the link as the
   source of truth. **Constraint:** the linked apprentice must belong to the
   candidate's own group — both rows carry `group_id`, so the RPC (and, where
   expressible, a DB check) must reject a link where
   `leader_pipeline.group_id ≠ multiplication_candidates.group_id`, or the planner
   and ready badges would count the wrong leader for the group. Everything else
   unchanged.
3. **Capacity / target — 🟡.** Reframe the per-group **target** in the UI and
   prompt Julian to set it — but **resolve the override precedence first.**
   `effectiveCapacity()` today ranks `capacity_override` (on
   `group_metric_settings`) **above** `groups.capacity`, so a Board edit to
   `groups.capacity` on a group that has an override would be silently ignored by
   status and forecast math. The Board must edit **the effective target source**:
   when an override exists, either edit/clear the override (so the displayed,
   edited, and computed target are the same number), or migrate legacy overrides
   onto `groups.capacity` and retire `capacity_override` as the target input. Keep
   `allow_over_capacity` and `exclude_from_capacity_metrics` (they are not target
   values). Exact migrate-vs-edit-override choice is a build-slice call; the
   invariant is **one visible source of truth for a group's target.**
4. **Forecast supply — 🟡.** Extend the launch-planning inputs aggregator to count
   apprentices that are (or are projected to be) `ready_to_lead` by a scenario's
   target date as **staffing supply**, reported **separately** from seat capacity
   (§3.4) — not added to it. New pure inputs/outputs in
   `lib/admin/launch-planning.ts`; the launch-count + target-date scenario fields
   (R10) are the only schema additions.

---

## 7. A week with Julian (walkthrough)

> It's June. Julian opens **Capacity & Multiplication**.
>
> The **Capacity Board** shows his groups by segment. Three "Families with kids"
> groups are **Full**; one — the Cahills (12) — wears a green **"ready to
> multiply"** badge. He glances at the **Leader Pipeline**: the Cahills' apprentice
> (Gonzalez) is **Ready to lead**; the other two full groups have apprentices still
> **In training**, so no badge.
>
> He opens the **Multiplication Plan**. The Cahills' group is already **suggested**
> for him (at/over target + Ready apprentice; readiness shown as "meets 4/5"). He
> runs a scenario: _"launch 3 groups by August."_ At 2 leaders per new group the
> forecast reads **need 6 leaders · 1 Ready · short 5.** That gap is his to-do list
> — he develops apprentices and sets their expected-ready dates toward August,
> instead of guessing from a spreadsheet.

Every step is one surface, and each view feeds the next — the thread that's broken
today.

---

## 8. Out of scope

- **Leader-facing surfaces.** No new Leader/Over-Shepherd views (LDR.1 frozen).
- **Group-Health Grade (Q12, job 3).** Tracked separately in
  [`GROUP_HEALTH_RUBRIC_DISCOVERY.md`](./GROUP_HEALTH_RUBRIC_DISCOVERY.md).
- **"Launch from scratch" interest lists** — people interested in a not-yet-existent
  group (the Doc's interested couples). Needs a prospective-group model; deferred
  per ADR-0006.
- **Communications-director / external comms** (EXT.1).
- **Automated church-attendance capture** — stays manual input (Q9 known gap).

---

## 9. Open decisions owed by Julian

- **a. "Filling" threshold.** The warning band today is 80% of target — keep, or a
  different cut (e.g. "within 2 of target")?
- **b. What an Apprentice _is_.** A link to an existing `members` record, a link to
  a `profiles` person, or a lightweight name? (Drives R5/R7.) **Provisional shape
  pending this decision:** `display_name` text + nullable `member_id` (§6-1), so the
  first slice can ship without a rewrite either way — but confirm before the schema
  slice lands.
- **c. Default target per segment.** One ministry default (12), or different
  targets by audience/life-stage (e.g. retirement groups smaller)?
- **d. Stage vocabulary.** Are _Identified / In training / Ready to lead /
  Launched_ the right words, or does Julian have his own?
- **e. Criteria floor for the badge & suggestions.** Default is **no floor** —
  at/over target + a Ready apprentice is enough (R4, R9), with the 5 criteria shown
  as context. If Julian wants a floor (e.g. "≥3 of 5"), it applies to **both** the
  badge and suggestions so they stay consistent.
- **f. Leaders per launch for staffing supply.** Demand defaults to launches ×
  `leaders_per_new_group` (2). If Julian counts one apprentice as a whole launch
  team, set the pipeline multiplier to 1 (§3.4, R10).

None of these block drafting implementation slices; they refine specifics. Per
ADR-0006's spirit, we prefer building the obviously-better tool over soliciting
governance rulings.

---

## 10. Success criteria

**Outcome-based.** This succeeds when:

1. Julian can answer **"what's full?"**, **"who's ready to lead?"**, and **"what do
   we launch next, and can we staff it?"** from **one surface**, without the
   spreadsheet or the Google Doc.
2. Every full group's path to multiplication is visible: its apprentice and that
   apprentice's stage.
3. A seasonal scenario ("launch N by August") shows a real **leader-supply gap**,
   not just a seat count.
4. Julian stops maintaining the Google Doc in parallel (the ADR-0006 adoption
   test).

### Traceability

| Requirement           | Julian's source                         | Reuses                                                    |
| --------------------- | --------------------------------------- | --------------------------------------------------------- |
| R1–R4 capacity board  | Q9, Q10                                 | `lib/admin/metrics.ts`                                    |
| R5–R7 leader pipeline | Q11/Q12 (Doc successors); net-new spine | `multiplication_candidates.successor_designate`, ADR-0006 |
| R8–R9 candidates      | Q10, Q11                                | `lib/admin/multiplication.ts`                             |
| R10–R11 forecast      | Q9, Q11                                 | `lib/admin/launch-planning.ts`                            |

---

## Next step

This PRD can be sliced into tracer-bullet implementation issues (suggested
ordering: per-group target framing → apprentice pipeline → candidate⇄apprentice
link + seed → capacity board → forecast-with-supply + suggestions).
