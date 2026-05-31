# Capacity & Multiplication — PRD

> 📌 **What this is.** The product requirements for Julian's **capacity planning
> and multiplication** workspace — north-star **job 2**: *"know what groups need
> to be launched, and when"*
> ([`../julian-inputs/SYSTEMS_CONVERSATION.md`](../julian-inputs/SYSTEMS_CONVERSATION.md)
> Q9–Q12). It re-frames the work that today is split across Launch Planning and
> the Multiplication planner into **one connected flow**.
>
> **Supersedes** [`MULTIPLICATION_PLANNER.md`](./MULTIPLICATION_PLANNER.md) (the
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
   > *this group is full → here's the person ready to lead the next one → so we
   > multiply it this August.*
2. **There is no real leader pipeline.** "Who leads the next group?" is captured
   only as a free-text `successor_designate` string on a candidate. There is no
   first-class apprentice concept, no readiness stage, and no way to see **who is
   ready to lead** across the ministry. This is the missing spine that should tie
   a full group to a multiplication.
3. **The forecast and the real groups don't talk.** `lib/admin/launch-planning.ts`
   computes "you need N new groups" from church-attendance demand, but nothing
   connects that number to *which actual groups are ready to multiply* or *whether
   we have the leaders to staff them.* The recommendation floats free of the plan.
4. **Capacity is a faceless global default.** "Full at 12" is modelled as a
   ministry-wide default with per-group overrides, not as a deliberate **target
   Julian sets and reads each group against.** It tells him a count, not a plan.

### Goal

**One place to plan capacity and multiplication that Julian can actually follow** —
from "this group is filling up" to "here's who's ready to lead" to "so here's what
we launch in August," with the leader-supply math done for him. Outcome over
feature count: he should be able to answer *what's full, who's ready, and what we
launch next* without opening the spreadsheet or the Google Doc.

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
*that* group (default 12, per Q10, but explicitly his to set per group). A group's
**capacity status** is read against its own target:

| Status | Meaning | Rule |
|---|---|---|
| **Room** | comfortably below target | `members < warning threshold` |
| **Filling** | approaching target | `warning ≤ members < target` |
| **Full** | at/over target, action implied | `members ≥ target` |
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
raised up to lead the *next* group. This is the **net-new spine** that connects a
full group to a multiplication. Each apprentice carries a **readiness stage**:

> **Identified → In training → Ready to lead → Launched**

The **Leader Pipeline** is the roll-up of every apprentice and their stage — the
answer to *"who is ready to lead?"* across the ministry, and the **supply side** of
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
participation %, plus a launch buffer (Q9, Q11). **Supply** = open seats today +
groups ready to multiply + apprentices ready to lead. Already computed in
[`../../lib/admin/launch-planning.ts`](../../lib/admin/launch-planning.ts)
(`computeLaunchPlan()`, scenarios, seasonality anchors for August/January). The
gap is that supply currently counts only seats — it should also count **ready
leaders from the pipeline**, so "you need N groups" can be checked against "you
have M ready leaders."

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
- a **"ready to multiply" badge** when a group is **Full *and* has an apprentice
  who is Ready to lead** — the single most important signal, surfaced where Julian
  already looks.
- filters by segment and status; sortable by fullness.

This is the headline: open it and *see what's full and what's ready*, the job the
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

- **System-suggested.** The board flags groups that are **Full + have a Ready
  apprentice + meet the readiness criteria** as suggested candidates — Julian
  doesn't have to hunt for them.
- **Scenario planning on top.** Julian runs *"launch N groups in `<year>`"* against
  seasonal demand (reusing scenarios + the August/January anchors) and sees a
  **live leader-supply-vs-demand gap**: *"3 groups planned for August · 2
  apprentices Ready · 1 short."* That gap is the number the current tool can't
  show because it has no pipeline to count.

---

## 5. Functional requirements

Grouped by view; each traces to a concept (§3) and names existing code to reuse.

### Capacity Board
- **R1 — Per-group target size.** Surface each group's target and prompt Julian to
  confirm/set it (not silently inherit the global default). Reuse
  `effectiveCapacity()` and the `capacity` / `capacity_override` fields. (§3.1, Q10)
- **R2 — Capacity-status ladder in Julian's words.** Render *Room / Filling / Full
  / Open by choice* from `capacityStatus()`. Keep `allow_over_capacity` and
  `exclude_from_capacity_metrics`. (§3.1, Q10)
- **R3 — Board across the ministry.** A scannable grid of all active groups with
  `members / target`, status color, and segment; filter by segment/status. (§4-A)
- **R4 — "Ready to multiply" badge.** Compute and show it when a group is Full and
  has a Ready apprentice. This is the join between capacity and pipeline. (§3.4)

### Leader Pipeline
- **R5 — First-class Apprentice records.** Create/edit an apprentice on a group
  with a readiness **stage** (Identified → In training → Ready to lead →
  Launched). Net-new. (§3.2)
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
- **R9 — System-suggested candidates.** Surface Full + Ready-apprentice +
  criteria-meeting groups as suggestions. (§4-C)
- **R10 — Scenario forecast with leader supply.** Extend the forecast so supply
  counts ready apprentices, and "launch N in `<year>`" shows the supply-vs-demand
  gap. Reuse `computeLaunchPlan()`, scenarios, and `nextSeasonAnchorIso()` for
  August/January. (§3.4, Q9, Q11)
- **R11 — Target year stays in-app data.** Keep per-candidate `target_year`,
  filterable (2026 / 2027 / TBD), per ADR-0006 — no paper decision. (Q11)

---

## 6. Data-model changes

Described as **intent**, not migrations. All additive/nullable; all writes through
the existing audited path (`runAdminWriteAction` → `SECURITY DEFINER` `admin_*` RPC
+ paired `audit_events`), admin-only RLS, no hard deletes (archive via
`archived_at`) — consistent with ADR-0001 and the existing pipeline.

1. **`leader_pipeline` (apprentices) — 🆕.** One row per apprentice: `group_id`,
   the person (see open decision §9-b), a `readiness_stage` enum
   (`identified / in_training / ready_to_lead / launched`), notes, audit/archival
   columns. New `admin_*` RPCs for create/advance/archive. Seeded from
   `successor_designate` + the Doc.
2. **`multiplication_candidates` — 🟡.** Add a nullable FK to a `leader_pipeline`
   row; retain `successor_designate` through migration, then treat the link as the
   source of truth. Everything else unchanged.
3. **Capacity — 🟡.** No new column required; reframe `groups.capacity` as the
   per-group **target** in UI and prompt Julian to set it. Keep
   `group_metric_settings` overrides (`capacity_override`, `allow_over_capacity`,
   `exclude_from_capacity_metrics`).
4. **Forecast supply — 🟡.** Extend the launch-planning inputs aggregator to count
   `ready_to_lead` apprentices as available leaders; no schema change, a new pure
   input in `lib/admin/launch-planning.ts`.

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
> for him (Full + Ready apprentice + meets criteria). He runs a scenario:
> *"launch 3 groups by August."* The forecast reads **demand needs 3 · 1
> apprentice Ready · 2 short.** That gap is his to-do list — he flips two
> apprentices' target dates and goes to develop the other two leaders, instead of
> guessing from a spreadsheet.

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
- **b. What an Apprentice *is*.** A link to an existing `members` record, a link to
  a `profiles` person, or a lightweight name + stage? (Drives R5/R7 and §6-1.)
- **c. Default target per segment.** One ministry default (12), or different
  targets by audience/life-stage (e.g. retirement groups smaller)?
- **d. Stage vocabulary.** Are *Identified / In training / Ready to lead /
  Launched* the right words, or does Julian have his own?
- **e. "Ready to multiply" rule.** Is the badge "Full + Ready apprentice," or
  should it also require some of the 5 readiness criteria?

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

| Requirement | Julian's source | Reuses |
|---|---|---|
| R1–R4 capacity board | Q9, Q10 | `lib/admin/metrics.ts` |
| R5–R7 leader pipeline | Q11/Q12 (Doc successors); net-new spine | `multiplication_candidates.successor_designate`, ADR-0006 |
| R8–R9 candidates | Q10, Q11 | `lib/admin/multiplication.ts` |
| R10–R11 forecast | Q9, Q11 | `lib/admin/launch-planning.ts` |

---

## Next step

This PRD can be sliced into tracer-bullet implementation issues (suggested
ordering: per-group target framing → apprentice pipeline → candidate⇄apprentice
link + seed → capacity board → forecast-with-supply + suggestions).
