# Settings Overhaul — Group Categories, Targets & Numeric Triggers — PRD

> ⚠️ **Superseded (2026-07-03, #828).** This PRD specifies the retired
> **Cell (Audience × Category)** Settings model — per-cell targets and the
> tiered trigger cascade. That data model was collapsed to a single free-text
> **Group type** per group by
> [ADR 0034](../adr/0034-collapse-cells-to-group-type-list.md) (migration
> `20260708000000`, #738): per-type config now lives in `group_type_configs`
> and the trigger resolves global → per-type. Kept as the historical record of
> the numeric-trigger and Settings-reshape reasoning; do not build from it.
>
> 📌 **What this is.** The agreed design for reshaping **Settings** around groups.
> Three complaints drive it: (1) too much explanatory prose on the Settings, Care,
> and Multiply surfaces; (2) Settings "misses the mark for groups" — there's no way
> to say _how many groups of a given kind we want_; (3) the multiply **triggers** use
> letter grades for things that are really **counts** (interest, capacity).
>
> Builds on [`CAPACITY_AND_MULTIPLICATION_PRD.md`](./CAPACITY_AND_MULTIPLICATION_PRD.md),
> [`../adr/0019-multiplication-by-type-and-pillars.md`](../adr/0019-multiplication-by-type-and-pillars.md),
> and [`../adr/0018-configurable-af-health-rubrics.md`](../adr/0018-configurable-af-health-rubrics.md).
> Vocabulary follows [`../../CONTEXT.md`](../../CONTEXT.md).

_Status legend:_ ✅ exists (reuse) · 🟡 exists, needs rework · 🆕 net-new.

---

## 1. The problem

Today the multiply machinery operates **only at the top type level** — three boards,
Men's / Women's / Mixed. Settings lets Julian feed a capacity figure and a trigger
per type, but:

- He can't express **"40-50s Men should have 2 groups"** — there's no per-sub-tier
  target, and no read on whether he's hit it.
- The trigger laundered everything through **A–F letters**. Interest is really a
  **headcount**; capacity is really about **full groups and thin availability**.
  A letter grade hides the number he actually thinks in.
- The Settings / Care / Multiply surfaces carry **multi-clause paragraphs** of help
  text that crowd the controls.

## 2. The shape we agreed

### 2.1 Groups are a **matrix**, not a tree 🆕

- **Top type stays fixed:** Men's / Women's / Mixed (`audience_category`). ✅
- A new admin-defined **category catalog** holds free-form labels — `"20-30s"`,
  `"40-50s"`, `"Young families"`. 🆕
- A category can be **applied to one or more top types**. The same `"20-30s"` label
  can sit under Men's, Women's, and Mixed.
- The live unit is the **cell** = (top type × category). `"20-30s Men"` is a
  distinct cell from `"20-30s Women"`. Each cell carries its own target, derived
  capacity, derived interest, and readiness signal.

### 2.2 A group joins a cell 🟡

- A group lands in a cell via `audience_category` (✅ exists) + a new
  **`category_id`** FK to the catalog. 🆕
- **`category_id` replaces `life_stage`.** Stop reading the `life_stage` enum
  everywhere; deprecate/drop the column. One source of truth for a group's cell.
- **Start fresh:** ship an **empty** catalog. Existing groups are **uncategorized**
  until an admin tags them. A visible **"Uncategorized" bucket** keeps them from
  disappearing; their cells show `0 / target` until assigned.

### 2.3 Targets & coverage 🆕

- Each cell carries a **target group count** ("must have 2"), set by the admin.
- Coverage reads **`have X of Y`**, where **X = active + actively-launching** groups
  in the cell (mere plans do **not** count).
- Targets are **tracking only** — they do **not** feed the multiply trigger.
- Coverage is surfaced in **three** places:
  1. on each **Multiply grid cell**, beside the readiness signal;
  2. a **dedicated coverage panel** (sortable by biggest shortfall);
  3. **inline in Settings > Groups** as a live `currently 1 / target 2` readout.

### 2.4 Triggers read in natural units 🟡

The readiness pillars and their units:

| Pillar           | Unit                         | Source                                       |
| ---------------- | ---------------------------- | -------------------------------------------- |
| **interest**     | **number of people**         | prospects in state `interested` for the cell |
| **capacity**     | **derived issue / no-issue** | group sizes + joinable-group count           |
| **groupHealth**  | **A–F letter**               | group health rubric ✅                       |
| **leaderHealth** | **A–F letter**               | leader health rubric ✅                      |
| ~~overflow~~     | —                            | **folded into capacity Facet A; dropped**    |

**Capacity is no longer fed and there are no "offerings."** It is a **derived,
multi-faceted** signal:

- Universal cap of **12** members per group.
- **Facet A — over-capacity:** any group in the cell has **>12** members.
- **Facet B — thin availability:** **≤ 1** joinable group (under 12) in the cell.
- **Either facet trips** the capacity issue.

**The trigger rule is global with per-cell overrides.** The admin marks **each
pillar required or not** and sets its threshold (interest ≥ N; health ≥ letter;
capacity required/not). A cell reads **"ready"** when every _required_ pillar
clears. This preserves the existing flexible per-pillar config from
[ADR 0019](../adr/0019-multiplication-by-type-and-pillars.md), only with the new
units.

### 2.5 Interest is captured at intake 🟡

- The prospect / planning form (`prospect-create-form.tsx`) gains a
  **"interested in: top type + category"** input. 🆕
- New prospect fields: **`desired_audience_category`** + **`desired_category_id`**. 🆕
- Per-cell interest = count of prospects in state **`interested` only** (not
  `matched`, `joined`, `not_at_this_time`, or archived) whose desired cell matches.
- `fetchFunnelVolumeByType` is rewired to a **per-cell tally off the prospect's
  desired fields**, rather than the joined group's type. 🟡

### 2.6 Multiply surface 🟡

- `/admin/multiply` becomes a **grid: rows = categories, columns = the three
  types.** Each cell shows readiness + `have X of Y`. Cells where the category
  isn't applied to that type render **blank**. Designed for a **handful** of
  categories.

### 2.7 Settings structure 🟡

- New **Groups tab** owns: the category catalog, the type×category matrix,
  per-cell targets, and the trigger rule. The old **Multiply config tab folds
  into Groups.**
- **Care stays the default tab.**

### 2.8 Commentary 🟡

- **Trim, don't gut** across Settings, Care, and Multiply: one tight sentence per
  section; cut the multi-clause explanations.
- **Care is commentary-only — no structural change** to its six sub-tabs or the
  rubric editors.

---

## 3. Data-model deltas

| Change              | Table / column                                                                            | Notes                        |
| ------------------- | ----------------------------------------------------------------------------------------- | ---------------------------- |
| 🆕 Category catalog | `group_categories` (id, label)                                                            | free-form labels             |
| 🆕 Cell config      | `category_type_targets` (audience_category, category_id, target_count, trigger overrides) | one row per active cell      |
| 🆕 Group → cell     | `groups.category_id` FK                                                                   | **replaces** `life_stage`    |
| 🟡 Retire enum      | `groups.life_stage`                                                                       | stop reading; deprecate/drop |
| 🆕 Prospect intent  | `prospects.desired_audience_category`, `prospects.desired_category_id`                    | drives per-cell interest     |

Capacity feed columns (fed headroom, full-group count, offerings) on
`multiplication_configs` are **retired** — capacity is now derived.

---

## 4. Open implementation notes (non-blocking)

1. **Default trigger thresholds.** Pick sane starting values (e.g. interest ≥ a
   small N, capacity required, health not-required until grades exist) and call
   them out in the migration.
2. **"Joinable / launching" definitions.** Reuse existing group lifecycle state to
   define _active + launching_ (coverage X) and _joinable = active & under 12_
   (capacity Facet B).
3. **Reads seam.** New per-cell tallies go through the reads seam
   ([ADR 0015](../adr/0015-reads-seam-for-surface-orchestration.md)); writes go
   through audited RPCs.

---

## 5. Out of scope

- No change to the health **rubric** model (group/leader A–F) beyond trimming its
  editor's prose.
- No change to Care's structure.
- No leader-pipeline / successor work (covered by the capacity PRD).
