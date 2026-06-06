# Life Group Operations

Julian's admin operating system for shepherding Life Group leaders and
planning group launches. The app is currently for the ministry's
oversight tiers only — not for group leaders themselves.

## Language

### People & roles

**Leader**:
A person who leads a Life Group (the `leader` role; `co_leader` → Co-Leader).
Leaders are the people the ministry cares for. They have a deliberately minimal,
**maintenance-mode** surface — they log in only to submit weekly check-ins (the
source of the Health Pulse) and view their group calendar. The app is built for
the oversight tiers; no new Leader-facing features ship without Julian's explicit
go-ahead (LDR.1).
_Avoid_: Shepherd (there is no "Shepherd" tier — only Leaders and the
Over-Shepherds who oversee them), group leader.

**Over-Shepherd**:
A coach responsible for a set of Leaders. Sits above Leaders and below
the Ministry Admin in the oversight ladder. Tracked today as coverage data;
becoming a login tier. Kept as a single atomic term even though there is no
standalone "Shepherd".
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

**Super Admin ▸ Ministry Admin ▸ Over-Shepherd ▸ Leader**

The Leader tier has only a minimal **maintenance-mode** surface (weekly
check-ins + group calendar); it is not the headline product and is frozen to
new features without Julian's go-ahead (LDR.1). The one deliberate exception
to "higher tiers see everything below" is private care notes — see CONTEXT
note on Private Care Note below.

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
"delete" means everywhere except the Super Admin danger zone.
_Avoid_: Delete, soft-delete (as a user-facing label), remove.

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

**Audience**:
Who a Life Group is for, by the `audience_category` attribute — Men, Women, or
Mixed / couples. A user-facing grouping on the capacity board and the
multiplication planner.
_Avoid_: Segment, gender category.

**Category**:
The free-form bracket a Life Group serves, by the `category_id` attribute — a
label from the `group_categories` catalog (e.g. "20-30s", "Young families"),
applied to the group's Audience via a cell (`category_type_targets`). Replaced
the retired `life_stage` enum as the single segmentation source (#398). A group
with no category reads as **Uncategorized** — a visible bucket so untagged
groups are never lost. The `group_life_stage` enum type still exists but is no
longer read by any code path.
_Avoid_: Segment, age bracket, cohort, life stage (the old enum).

**Segment**:
The internal umbrella term for the Audience × Category bucket (the cell) a group
falls into. Stays in code and docs (`segmentLabel`, `buildPlannerSegments`,
`bucketGroupsBySegment`); it is **not shown to users** — surfaces say Audience,
Category, or Group type instead. Treated like "Admin OS": an internal-only name.
_Avoid_: Segment, segmented, unsegmented (as user-facing labels).

**Cell**:
The live unit of the groups overhaul: one `category_type_targets` row =
(Audience × Category). A cell is **active** when the category is applied to that
top type. Each active cell carries its own **target group count**, derived
**coverage**, derived **capacity issue**, per-cell **interest**, and readiness
signal. A category not applied to a type has no active cell there (blank on the
Multiply grid).
_Avoid_: Tile, slot, segment (the internal umbrella name, not this row).

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
**cell** (Audience × Category); the per-type boards roll their cells up. The
unit moves onto the Multiply grid (rows = categories, columns = the three types)
in a later slice.
_Avoid_: Launch planning (the superseded framing), split.

**Multiplication Pillar**:
A computed readiness signal assessed per cell, each in its **natural unit** (not
all A–F): **Interest** (a count of `interested` prospects whose desired cell
matches), **Capacity** (a derived issue / no-issue — see Derived Capacity),
**Group Health** and **Leader Health** (A–F roll-ups of that cell's grades over
the Ministry Year). The standalone **overflow** pillar was dropped (#401), folded
into Capacity Facet A. There is no single overall multiplication letter — the
pillars stand on their own.
_Avoid_: Metric, score, criterion (that word belongs to a rubric's inputs);
overflow (the retired pillar).

**Derived Capacity** (capacity issue):
Capacity is **derived, not fed** (#401). With a universal cap of **12** members
per group, a cell has a capacity issue when **either** facet trips: **Facet A —
over-capacity** (any active group in the cell has > 12 members) or **Facet B —
thin availability** (≤ 1 _joinable_ group, i.e. an active group under 12). An
**active cell with no active groups** still counts — it has no joinable group, so
Facet B trips. Capacity is **required by default** in the trigger, so a required
capacity issue **blocks readiness** (it is not merely a side banner). The old fed
headroom / full-group-count / "offerings" inputs on `multiplication_config` are
retired.
_Avoid_: Headroom, offerings, fed capacity, overflow (all retired).

**Target & Coverage** (`have X of Y`):
A per-cell **target group count** the admin sets ("40-50s Men should have 2"),
read against **coverage** `have X of Y`, where **X = active + actively-launching**
groups in the cell (`lifecycle_status` ∈ active, launching*soon; mere plans do not
count) and **Y = target_count**. Targets are **tracking only** — they never feed
the multiply trigger.
\_Avoid*: Quota, goal, capacity (the target is a group _count_, not a member cap).

**Multiplication Trigger**:
The Ministry-Admin-configured rule over the pillars that signals "multiply this
type" — each pillar required or not, with a threshold in its natural unit. Julian
owns the trigger; the app surfaces the signal, it does not decide for him.
_Avoid_: Alert, threshold (when you mean the whole configured trigger).

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
are **Home · Care · Plan · Multiply · Settings** (ADR 0016); the former Groups,
Planning, People, Calendar, and Follow-ups tabs are hidden behind Super-Admin
nav-visibility flags, default off. In the UI it is **labelled "Ministry Admin"** (the landing
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
Rubric, the Multiplication Trigger, and his per-type Capacity feed (ADR
0007/0018/0019). Visible to Ministry Admin and Super Admin. The per-person Care
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
