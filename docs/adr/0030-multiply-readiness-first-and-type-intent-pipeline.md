# Multiply leads with Readiness and reframes Plan as a type-intent Pipeline

The Multiply area's tab order and second tab are reworked. **Readiness** becomes
the first (default) tab. The **Plan** tab is renamed **Pipeline** — to stop it
colliding with the top-level **Plan** area (the Interest Funnel) — and reframed
from "pick one concrete group to multiply" to a **type-first** working list: the
Ministry Admin pipelines a **group type**, and the existing groups of that type
appear beneath it as **candidates**. The third tab stays **Shepherds**.

**Status:** Accepted — amends ADR 0022 (Multiply's tab set) and completes ADR
0029 (the readiness checklist) in the UI. The tab order/default amends ADR
0022's "Plan is the landing tab." The `in_pipeline` flag amends
[ADR 0034](./0034-collapse-cells-to-group-type-list.md)'s candidate model.

## Why

ADR 0022 unified Multiply as **Plan · Readiness · Shepherds** with Plan as the
default and the per-group planner as the working view. In use, two problems
surfaced. First, "Plan" names two different things one level apart — the
top-level **Plan** area (Interest Funnel) and this tab — which reads as
confusing. Second, Julian doesn't only multiply a _named_ group; he often plans
to launch another group **of a type** ("we want another Young Families group")
before any specific existing group is the one spawning it. The group-anchored
planner couldn't express that intent without a concrete group, so the act of
planning was blocked on a detail that often isn't known yet.

## Decisions

### 1. Readiness is the first and default tab

Tab order becomes **Readiness · Pipeline · Shepherds**, and Readiness is the
default landing tab (the `?tab=` default flips from `plan` to `readiness`).
Readiness is the "merger" view — the at-a-glance per-type signal — so it leads.

### 2. The Plan tab is renamed **Pipeline** and is type-first

A **Pipeline** entry is a **group type** the admin intends to multiply. Adding a
type to the Pipeline is an **intentful act** and must **never be blocked**: a
type can sit in the Pipeline with **no candidate groups and no matched shepherds
yet**. The Pipeline is an **action-view** over the existing per-type **Target &
Coverage** (`group_type_configs`) — it does **not** introduce a second per-type
target; "how many of this type we want" stays owned by the coverage target. The
type-level intent is a lightweight additive flag (e.g. `in_pipeline`) on the
per-type config, **not** a candidate row.

This is a deliberate, partial **reversal of #738** (the
`20260708000000_collapse_cells_to_group_type_list` migration), which retired
type-only candidate "watches" and made a concrete group mandatory. We bring the
type-level unit back — but as an intent flag on the per-type config keyed by the
free-text group type, **not** as the type-only candidate rows #738 deleted. So
#738's candidate-table simplification stands: candidates remain always
group-anchored.

### 3. Candidates are existing groups, with a potential → locked-in lifecycle

A **Candidate** is only ever an **existing group** (a type can't be "willing"; a
group's shepherd can). Under a pipelined type, every active group of that type is
auto-listed as a **Potential candidate** with no saved row. Selecting one opens
its readiness checklist; saving **locks it in**, creating the
`multiplication_candidates` row. **Lock-in is a deliberate assessment, never a
gate** — a group can be locked in with any number of checklist boxes ticked, even
zero ("a group does not need to meet each", per ADR 0029 and Julian's source).

### 4. The checklist is five plain checkboxes; the member-count field is dropped

Completing ADR 0029 in the UI: all five readiness criteria — **12+ members · 3+
years · Co-Shepherd 1+ yr · Shepherd willing · Need for similar group** — render
as a contiguous block of plain checkboxes at the bottom of the lock-in form. The
separate **"Members (entered)"** number field (`manual_member_count`) is removed
from the form — "12+ members" is now a pure judgment checkbox, so the number box
no longer feeds it and only added clutter. The column stays dormant (no data
deletion); the roster count is still shown on the candidate summary line.

### 5. Meeting time leaves the candidate form

The **Meeting time** field is removed from the candidate form ("it doesn't matter
on Multiply"). The `meeting_time` column is retained (no hard delete). Because the
planner component is also rendered by the frozen, off-nav `/admin/planning` host
(ADR 0022), the field disappears there too — acceptable, since Planning is
frozen.

### 6. Shepherds: dropdown-first apprentice, name field only as a fallback

On the Shepherds tab's add-apprentice form, an apprentice is picked from the
**group-member dropdown**; when a member is selected, **no name field is shown**
(the name derives from the member). A free-text name input appears **only** for
the fallback case — someone not yet a member record — so the roster being
incomplete never hard-blocks adding an apprentice (members-only was considered and
rejected for that reason).

### 7. Shepherds match a type by their group's type

A shepherd (apprentice) is a candidate to lead a new group of type _T_ when
**their group's type is _T_**. Readiness surfaces matched shepherds under each
type (Ready-to-lead first) but **does not require** a matched shepherd for a type
to be pipelined. The Readiness tab's own layout is unchanged (the per-type grid);
it only gains links down to a type's candidates and shepherds.

## Consequences

- The `?tab=` default and any "Plan tab" deep-links/labels change to
  `readiness` / "Pipeline"; the `MultiplyTabKey` `"plan"` key may be renamed to
  `"pipeline"` (with redirect tolerance for old links).
- A new additive `in_pipeline`-style flag on `group_type_configs`, written through
  the existing admin SECURITY DEFINER RPC family with a paired `audit_events` row
  (write-path invariant). No new "intent" table; no revival of type-only candidate
  rows.
- The candidate form is restructured (auto-listed potential candidates per type,
  lock-in save, five checkboxes, no member-count/meeting-time fields). The frozen
  `/admin/planning` host shares the component, so its planner changes shape too;
  this is acceptable under its frozen status.
- `manual_member_count` and `meeting_time` columns become dormant-but-retained.
