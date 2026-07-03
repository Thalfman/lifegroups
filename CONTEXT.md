# Life Group Operations

Julian's admin operating system for shepherding Life Group leaders and
planning group launches, organised as three areas — **Care · Plan · Multiply**
(ADR 0016). The oversight tiers (Ministry Admin, Over-Shepherd) work it day to
day; Over-Shepherds log in to their own coverage-scoped Care surface, and
Shepherds log in to a group-scoped Care surface that is live by default
(ADR 0017/0024; the Super-Admin console keeps the off-switch).

## Language

### People & roles

**Shepherd**:
A person who leads a Life Group (the `leader` role; `co_leader` → Co-Shepherd).
Shepherds are the people the ministry cares for. Their login surface is a
group-scoped **Care** surface — Care Notes + Prayer Requests over their own
members, plus the group calendar (ADR 0017/0020) — RLS-re-audited and **live by
default** (ADR 0024 seeded the verified `leader_surface` flag on per the ADR
0009 verify-before-flip discipline; the Super-Admin console can re-freeze it).
Weekly check-ins (the source of the Health Pulse) stay behind their own gate. **Front-facing copy
says "Shepherd" / "Co-Shepherd" (ADR 0025); the code identity stays `leader` /
`co_leader`** — the role enum values, RPCs, routes (`/leader`), and types are
unchanged, mirroring the existing `shepherd_care_*` / `over_shepherd` naming.
_Avoid_: group leader; and in code identifiers, do **not** rename the `leader` /
`co_leader` role values to "shepherd".

**Over-Shepherd**:
A coach responsible for a set of Shepherds. Sits above Shepherds and below
the Ministry Admin in the oversight ladder. Both coverage data and a login
tier: an Over-Shepherd logs in to a coverage-scoped Care surface over the
Shepherds they cover (ADR 0017). Kept as a single atomic term.
_Avoid_: Coach, over shepherd, overseer.

**Ministry Admin**:
The ministry leader who runs the operating system day to day (Julian). Sees
everything an Over-Shepherd sees, plus more.
_Avoid_: Admin (ambiguous), pastor.

**Super Admin**:
The platform owner (Tom). Top of the oversight ladder; sees everything a
Ministry Admin sees, plus platform/account administration.
_Avoid_: Owner, root, developer.

### The oversight ladder

The roles form a strict visibility ladder — each tier sees what the tier
below sees, and more:

**Super Admin ▸ Ministry Admin ▸ Over-Shepherd ▸ Shepherd**

The Shepherd tier's login surface is a group-scoped **Care** surface (Care Notes +
Prayer Requests + group calendar; ADR 0017/0020), **live by default** per ADR
0024 — the Super-Admin `leader_surface` switch remains as the off-switch, and
weekly check-ins stay behind their own gate. The deliberate exceptions to "higher tiers see everything below" are the
author-private **Care Note** (sealed to its author unless the Ministry Admin
flips that person's transparency toggle) and the Ministry Admin's own **Private
Care Note** (hidden even from the Super Admin) — see the Care concepts below.

### Care concepts

**Private Care Note**:
A pastoral note a Ministry Admin records for their eyes only. Deliberately
escapes the oversight ladder: not visible to other tiers — and, by intent,
not to the Super Admin either.
_Avoid_: Encrypted note, secret note.

**Care Note**:
An author-private pastoral note written _down_ the ladder: an Over-Shepherd
records Care Notes about their Leaders, and a Leader records them about their
group members. Sealed to its author by default. The Ministry Admin can read a
given person's Care Notes only when he flips that person's transparency toggle
on — and when he can, the Super Admin can too (the normal ladder). Distinct
from the Private Care Note, which is the Ministry Admin's _own_ note and is
hidden even from the Super Admin.
_Avoid_: Private Care Note (that is Julian's own note, scoped differently),
shepherd note, member note.

**Prayer Request**:
A request for prayer recorded against a person (a Leader, by their
Over-Shepherd; a member, by their Leader). A list distinct from the Care Note
log — it can carry its own state over time (e.g. answered) — but it follows the
same author-private visibility and Ministry-Admin transparency toggle.
_Avoid_: Prayer note, Care Note (that is the separate running log).

### Deletion concepts

**Archive**:
The default, reversible way anything leaves a working surface — a soft delete
(apprentices, multiplication candidates, launch scenarios, calendar events all
archive). Visibility flows by the oversight ladder; the row stays. This is what
"delete" means everywhere except the Super Admin danger zone. It is also the
user-facing label for taking a **person** out of active use (what the write
path calls deactivation) — surfaces say Archive, not "Deactivate".
_Avoid_: Delete, soft-delete (as a user-facing label), remove, Deactivate (as a
user-facing label).

**Permanent deletion**:
The Super-Admin-only escape hatch that physically removes a row — distinct from
Archive. Lives in the Super Admin Console danger zone behind a type-to-confirm,
routed through an audited `super_admin_*` RPC (never `admin_*`, which is
Ministry-Admin-callable). Refuses (and reports) when any dependent row blocks it
rather than cascading; never reaches Private Care Notes, audit logs, any Super
Admin profile, or `auth.users` identities (only `public.profiles`).
_Avoid_: Hard delete (in user-facing copy), wipe (that is Clean Slate), purge.

**Tombstone**:
The full JSON snapshot of a row captured before Permanent deletion, so the act
is recoverable by re-import. Captured alongside (not instead of) the deletion's
paired `audit_events` row; itself never deletable.
_Avoid_: Backup, archive (that is the soft-delete), trash.

### Group concepts

**Group type**:
A single free-text string on each group (`groups.group_type`, nullable = **Untyped**),
chosen from an admin-managed list. The ministry sets the names to whatever it
wants (e.g. "Men's", "Young families") in Settings › Groups — the list lives in
the `app_settings` `group_types` row. A group type is the **single segmentation
source**: it replaced the retired Cell model (Audience × Category, the
`group_categories` catalog, `category_type_targets`, and per-cell readiness). Per-type
config (a target group count + an optional readiness-rule override) lives in
`group_type_configs`, keyed on the type name; Multiply lists groups by type and
shows each type's **coverage** ("have X of Y") plus that config. A group with no
type reads as **Untyped** — a visible bucket so untyped groups are never lost.
A Prospect can also name one as a **Desired group type** (an interest, not a
fact) from the same list.
_Avoid_: Cell, Audience, Category, segment (as user-facing labels), life stage.

**Segment**:
The internal name for the bucket a group falls into — now simply its **group type**
(null = Untyped). Stays in code (`segmentLabel`, `buildPlannerSegments`,
`bucketGroupsBySegment`); it is **not shown to users** — surfaces say Group type.
Treated like "Admin OS": an internal-only name.
_Avoid_: Segment, segmented, unsegmented (as user-facing labels).

### Interest funnel concepts

**Interest Funnel**:
The pipeline of people interested in joining a Life Group — the app's **Plan**
area. Replaces the former Guests pipeline. A Prospect moves through four states
toward joining, or parks.
_Avoid_: Guests pipeline, guest funnel, lead pipeline.

**Prospect**:
A person interested in joining a Life Group, tracked in the Interest Funnel.
Named distinctly from the **Interested** state so the person and their status
don't share a word.
_Avoid_: Guest, lead, inquirer, interested person.

**Desired group type**:
The kind of group a Prospect wants to join — an **optional, free-text Group
type** captured on the Prospect, drawn from the same admin-managed `group_types`
list as a group's own type (e.g. "Men's", "Women's", "Mixed – Young Families").
It is the same single segmentation source as a group's type, just expressed as a
_want_ rather than a fact; men's/women's stay multi-generational while mixed
types carry the life-stage granularity the ministry authors into the list. When
the Ministry Admin names a type that isn't on the list yet, it is **added to the
master list** so it's reusable everywhere. The desired type is **informational**
(captured and displayed) — it does **not** feed counts or the multiplication
readiness trigger. (Re-introduces, as flat free text, the intent the retired
`desired_audience_category` × `desired_category_id` "desired cell" once carried.)
_Avoid_: Desired cell, desired audience, desired category, preferred segment.

**Prospect state**:
The four colour-coded states a Prospect moves through:

- **Interested** (yellow) — wants to join; no group chosen yet.
- **Matched** (blue) — matched to a specific group and its Leader; follow-up
  under way.
- **Joined** (green) — has joined the matched group; **archived out of the
  active funnel** into a collapsed "Joined" roll-up (no roster row, no count).
- **Not at this time** (orange) — parked; not joining right now.

_Avoid_: Solidified (the earlier word for Matched/Joined), placed, assigned,
contacted.

### Health concepts

Four different "health" ideas live in the system and are easy to conflate.
They answer different questions about different subjects. Two are computed
letter grades (Group-Health Grade, Leader-Health Grade), each from its own
configurable rubric; one is a pastoral signal (Leader Care Status); one is a
leader self-report (Health Pulse).

**Group-Health Grade**:
A letter grade (A / B / C / D / F) for how a Life _Group itself_ is doing —
Julian's "grade them" concept, distinct from how the group's Leader is doing.
Computed from a configurable Health Rubric and updated _fluidly_ as the Ministry
Admin edits the inputs; a manual override can still force the letter. Tracked
within the current Ministry Year.
_Avoid_: Health score, group status, group health (when you mean the grade).

**Health Rubric**:
The Ministry-Admin-configured definition of _what_ the Group-Health Grade
measures: a set of weighted criteria (e.g. Attendance, Unity, Growth, plus any
custom ones) whose weightings total 100. Julian owns and edits it; changing an
input re-grades the group. The rubric the discovery doc deferred is now this
configurable engine, not a hardcoded formula.
_Avoid_: Scorecard, formula, weighting (when you mean the whole rubric).

**Ministry Year**:
The ministry's annual cycle, **August through May** (summer is off). The window
the Group-Health Grade and Leader-Health Grade are tracked within, and the
period the Multiplication pillars assess.
_Avoid_: School year, fiscal year, season, term.

**Leader-Health Grade**:
A letter grade (A / B / C / D / F) for how a _Leader themselves_ is doing,
computed from its own configurable Leader-Health Rubric (criteria + weightings
totalling 100), fluid as inputs change, tracked within the Ministry Year.
Symmetric with the Group-Health Grade but about the person, not the group.
Distinct from **Leader Care Status** (the pastoral "is there an issue, what's
the next step" signal) and from **Health Pulse** (the leader's own self-report).
_Avoid_: Leader health (lowercase, ambiguous), Leader Care Status, leader score.

**Leader-Health Rubric**:
The Ministry-Admin-configured definition of what the Leader-Health Grade
measures — weighted criteria totalling 100 — the leader-facing twin of the
Health Rubric. Julian owns and edits it.
_Avoid_: Scorecard, care rubric.

**Leader Care Status**:
How a _Leader_ is doing from the Ministry Admin's pastoral view — an
"is there an issue, and what's the next step" signal on the person, not the
group.
_Avoid_: Leader health, care category, group health.

**Health Pulse**:
A _Leader's own_ self-reported weekly sentiment about their group. A
subjective leader-entered input — not the computed Group-Health Grade.
_Avoid_: Group health, health status (when you mean the grade).

### Multiplication concepts

**Multiplication**:
The app's third area — deciding when to launch another group. Assessed per
**group type** (ADR 0034 collapsed the retired Audience × Category cell model);
the Readiness tab lists each type with its pillars and coverage.
_Avoid_: Launch planning (the superseded framing), split; cell (retired unit).

**Multiplication Pillar**:
A computed readiness signal assessed per group type, each in its **natural
unit** (not all A–F): **Interest** (a count of `interested` prospects whose
desired group type matches), **Capacity** (a derived issue / no-issue — see
Derived Capacity), **Group Health** and **Leader Health** (A–F roll-ups of that
type's grades over the Ministry Year). The standalone **overflow** pillar was dropped (#401), folded
into Capacity Facet A. There is no single overall multiplication letter — the
pillars stand on their own.
_Avoid_: Metric, score, criterion (that word belongs to a rubric's inputs);
overflow (the retired pillar).

**Derived Capacity** (capacity issue):
Capacity is **derived, not fed** (#401). With a universal cap of **12** members
per group, a group type has a capacity issue when **either** facet trips:
**Facet A — over-capacity** (any active group of the type has > 12 members) or
**Facet B — thin availability** (≤ 1 _joinable_ group, i.e. an active group
under 12). A **group type with no active groups** still counts — it has no
joinable group, so Facet B trips. Capacity is **required by default** in the trigger, so a required
capacity issue **blocks readiness** (it is not merely a side banner). The old fed
headroom / full-group-count / "offerings" inputs on `multiplication_config` are
retired.
_Avoid_: Headroom, offerings, fed capacity, overflow (all retired).

**Target & Coverage** (`have X of Y`):
A per-type **target group count** the admin sets ("Men's should have 2", stored
in `group_type_configs`), read against **coverage** `have X of Y`, where **X =
active + actively-launching** groups of the type (`lifecycle_status` ∈ active,
launching*soon; mere plans do not count) and **Y = target_count**. Targets are **tracking only** — they never feed
the multiply trigger.
\_Avoid*: Quota, goal, capacity (the target is a group _count_, not a member cap).

**Multiplication Trigger** (readiness rule):
The Ministry-Admin-configured rule over the pillars that signals a group type is
ready to multiply — each pillar **required or not**, with a threshold in its
natural unit. Interest is a **count (≥ N people), never a letter**; Capacity is
required/not; Group/Leader Health are ≥ a letter. The rule resolves as **global
→ per-type override** (ADR 0034 collapsed ADR 0021's three-tier cascade): one
global rule per ministry year (`multiplication_readiness_rule`), and any group
type may carry its own rule (`group_type_configs.readiness_rule`, `null` =
inherit the global). A type reads **ready** when every _required_ pillar clears;
not-required pillars are ignored. Julian owns the rule; the app surfaces the
signal, it does not decide for him.
_Avoid_: Alert, threshold (when you mean the whole configured rule); overflow;
per-pillar letter grade for Interest (it is a count).

**Multiplication Pipeline** (the Multiply **Pipeline** tab):
The working list of **group types** the Ministry Admin intends to multiply. Adding
a type to the Pipeline is an **intentful act** — a type can sit in the Pipeline
with **no candidate groups and no matched shepherds yet**; nothing about its
readiness or merge state blocks it. The Pipeline is an **action-view** over the
per-type **Target & Coverage** ("how many of this type we want" stays the single
source of truth — the Pipeline does not introduce a second target). Under each
pipelined type sit its **Multiplication Candidates**; the **Readiness** tab is the
linker that ties a type to its candidates and its shepherds.
_Avoid_: Plan (the top-level Interest-Funnel area, and the tab's old name); a
second per-type target count (Coverage already owns that).

**Multiplication Candidate** (Potential vs Locked-in):
An **existing group** that can/is willing to multiply, shown under its **group
type** in the Pipeline. Only ever an existing group — never a type (a type can't
be "willing"; a group's shepherd can). Two states: a **Potential candidate** is
auto-listed — every active group of a pipelined type simply appears beneath it,
with no saved record. A **Locked-in candidate** is one the admin has deliberately
**assessed and committed**: selecting it opens its Readiness Checklist, and saving
locks it in (creating the candidate record). Lock-in is a **deliberate
assessment, never a gate** — a group can be locked in with any number of checklist
boxes ticked, even zero ("a group does not need to meet each").
_Avoid_: Candidate type (candidates are groups, not types); requiring all criteria
to lock in.

**Multiplication Readiness Checklist**:
The per-**group** list of five guideline boxes on the Multiply **Pipeline** tab
that Julian ticks by hand for a multiplication candidate — **12+ members**, **3+
years as a group**, **Co-Shepherd 1+ year**, **Shepherd willing**, **Need for a
similar group**. Purely his judgment, stored on the candidate (ADR 0029); the
numbers are advisory labels, not computed comparisons. Distinct from the
computed, per-type **Multiplication Pillars / Trigger** — same "12 / 3 / 1"
numbers, different concept and surface. "A group does not need to meet each."
_Avoid_: Pillar, Trigger (those are the computed per-type signal); criteria-as-
gate (the checklist annotates, it never blocks).

### Surfaces

**Home Hub**:
The authenticated landing surface a user sees on sign-in, before entering the
admin OS. Adapts to the viewer's tier (Super / Ministry Admin see the admin-OS
launcher; Over-Shepherd sees a focused one) and shows navigation tiles plus
at-a-glance live stats. Replaces the old straight-to-`/admin` redirect.
_Avoid_: Dashboard (ambiguous with the admin metrics surface), home page.

**Admin OS**:
The working surface a Ministry Admin / Super Admin operates in after leaving the
Home Hub — the sidebar-shell app at `/admin` and its tabs. Post-pivot those tabs
are **Home · Care · Plan · Multiply · Settings** (ADR 0016), joined by the
**Groups** and **People** management tabs, which default **on** per ADR 0024 (the
Super-Admin console can re-hide them). The remaining pre-pivot Planning, Calendar,
and Follow-ups tabs are hidden behind Super-Admin nav-visibility flags, default
off. In the UI it is **labelled "Ministry Admin"** (the landing
title and the sidebar section header), not "Admin OS" — the canonical decision
recorded in the PRD (#175); the rename itself ships with that implementation.
This deliberately overloads "Ministry Admin": it names both the _role_ (the
person, above) and this _surface_ (where that person works). "Admin OS" stays as
the internal name in code and docs; it is not shown to users. Bare "Admin"
remains avoided.
_Avoid_: Admin OS (as a user-facing label), Admin (ambiguous), admin panel,
dashboard.

**Settings**:
The Ministry-Admin configuration surface — ministry/pastoral knobs and all
Julian-owned pastoral copy and rubrics: the Health Rubric, the Leader-Health
Rubric, and the multiplication setup (ADR 0007/0018/0034). Multiplication setup
spans **two** sub-tabs: a **Groups** sub-tab where the admin _creates_ the group
types (free-text names on the admin-managed list, each with its tracking
target), and a **Multiply** sub-tab where the admin sets the readiness trigger
through a two-tier control (global rule → optional per-type override) over those
types.
"Multiply" deliberately overloads the area name: the area reads the signal, this
sub-tab configures it. Visible to Ministry Admin and Super Admin. The per-person Care
Note transparency toggle is _not_ here — it lives inline on each person in Care.
_Avoid_: Admin settings, config (ambiguous with the Super Admin Console).

**Super Admin Console**:
The platform/app configuration surface — feature flags (including the
nav-visibility flags that hide the old tabs and the Leader/Over-Shepherd login
enablement, ADR 0016/0017), user & access management, and platform-level
editable copy. Super Admin only; the Ministry Admin never sees it. Julian-owned pastoral copy (the group-health questions and
care-status labels) is **not** edited here — it stays in Settings so Julian keeps
ownership of his own wording (ADR 0007, PRD Q2).
_Avoid_: Settings (that is the ministry surface), admin panel.
