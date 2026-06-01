# PRD: Surface Simplification

> 📌 **What this PRD is.** A scoped product requirements document for making the app
> simple to use, audited against a single root principle rather than against a list of
> known issues. Four surfaces were named to me as examples, but they are symptoms, not
> the diagnosis, so this PRD extracts the principle behind them and then sweeps every
> in-scope surface against it independently. It is derived from a read-only audit of the
> repository at HEAD `c335a8a`, and every claim traces to a file. It is written to be
> **sliced into GitHub issues**: each requirement is independently shippable and ordered
> by dependency and risk.
> 
> **Scope boundary.** In scope: per-surface density and progressive disclosure, one
> primary action per surface, first-run and empty states, and the simpler models the
> audit calls for, including the schema changes some require. Out of scope: surface count
> and navigation, settled by the consolidation pass; the entire Super Admin area, which
> the owner has excluded; the frozen `shepherd_care_*` schema and route paths; shared
> infrastructure primitives; and the visual layer. The full exclusions are under
> Non-goals, and the widened scope is re-checked against them before sign-off.
> 
> This PRD follows [`plans/IA_CONSOLIDATION_PRD.md`](./IA_CONSOLIDATION_PRD.md) and
> extends the gate in [`adr/0010-surface-budget.md`](../adr/0010-surface-budget.md).
> Product scope follows the three jobs in [`PRD.md`](../PRD.md). Vocabulary follows
> [`CONTEXT.md`](../../CONTEXT.md), which this PRD also amends.

-----

## Bottom line

The app’s pervasive fault is that it exposes its internal model to the user, and that
fault appears on more surfaces than the four I was given, so the work is to audit against
the principle, not to patch the examples. The audit below walks all eleven in-scope
surfaces. It confirms the four named cases, finds that two of them are broader than
stated, namely that the decimal-coefficient problem also lives in the scenario form and
that the Groups surface carries three separate faults rather than one, and it finds new
problems on Leader care and Group health that were not raised. Three surfaces, Leader
pipeline, People, and Calendar, pass cleanly and are recorded as passing so the audit
reads as comprehensive rather than selective.

Launch planning remains the densest surface by measurement, but density of code is not
the same as importance of fix, and the new findings are presented at equal weight to the
named ones. Super Admin is excluded entirely.

## The principle, and the four tests

The root principle, stated once: **the app should present an intuitive model to the user,
not its internal one.** In practice it records data that should be an editable estimate,
asks for precision that should be a default, and surfaces implementation vocabulary a
ministry leader would never use.

Every surface is audited against four tests that operationalize the principle:

First, **estimate over record.** Does the surface capture a data series or exact value
where an editable estimate or a default would serve, given that no surface uses the
detail it collects?

Second, **default over precision.** Does it demand precision or technical input, such as
a decimal coefficient, that a non-technical ministry user cannot confidently supply, when
a sane default would do?

Third, **ministry words over implementation words.** Does it show internal or developer
vocabulary in the interface rather than language a ministry leader recognizes?

Fourth, **minimum over completeness.** Does it offer more fields or options than the job
the surface exists for actually requires?

The standing test for the whole app is whether a non-technical ministry user can complete
each surface’s job without a glossary.

-----

## Complexity audit, surface by surface

The audit covered eleven in-scope surfaces: the admin home, Leader care, the Over-Shepherd
views, Launch planning, Leader pipeline, Follow-ups, Group health, People, Groups, Calendar,
and Settings. Super Admin was deliberately not audited. Each finding leads with a verdict and
cites file evidence. Surfaces that pass are included.

**A1: Admin home. Verdict: passes, with one open question. 🟢**
The landing is a read-only summary, so the estimate, precision, and minimum-input tests do
not bite, and its vocabulary is clean. It does stack seven cards, two for the lead jobs
(`ShepherdCareTriageCard`, `LaunchPlanningSnapshotCard`) and four weekly-cadence cards
(attention queue, capacity, follow-ups, setup gaps), and it has no single primary action
because it is a launcher. The open question, raised below, is whether the weekly-cadence
cluster still earns its place now that the leader check-in loop is gated off and those cards
read from a quieter source. Evidence: `components/lg/admin/dashboard/DashboardClient.tsx`
(the seven-card composition and the gated-check-ins note).

**A2: Leader care. Verdict: action needed, density and form bloat. 🟡 (family C)**
Vocabulary passes: the five care-status values render through readable labels, and the
Dashboard and Directory views are plainly named. The failures are minimum-input and density.
It is the busiest non-launch surface, 21 components spanning a dashboard mode and a directory
mode, and its `log-interaction-form` carries ten controls to record what is conceptually one
interaction and an optional follow-up. The fix is progressive disclosure and a trimmed
interaction form, owned by family C. The `shepherd_care_*` schema and route path stay frozen
per ADR 0008, so this is surface work only. Evidence: `components/admin/shepherd-care/`
(component count), `components/admin/shepherd-care/log-interaction-form.tsx` (ten controls),
`components/admin/shepherd-care/view-toggle.tsx`.

**A3: Over-Shepherd views. Verdict: near-pass, one open question. 🟢**
The user-facing page title is correctly “My Leaders”, and the surface is read-only and clean
on the precision and minimum-input tests. The residue is vocabulary: the component is named
`MyShepherdsTable` and code comments speak of “Shepherds”, which CONTEXT.md says to avoid, but
those are internal names, which the glossary permits. The open question is whether any column
header or the broad-note form still renders “Shepherd” to the user. “Broad note” is Julian’s
own term from the systems conversation and is left as is. Evidence:
`app/(protected)/over-shepherd/page.tsx` (title “My Leaders”),
`components/over-shepherd/my-shepherds-table.tsx`, `components/over-shepherd/log-broad-note-form.tsx`.

**A4: Launch planning. Verdict: action needed, the worst case on three of four tests. 🔴 (family L)**
This surface fails density, estimate, precision, and minimum-input at once, and it is the
densest in the app: 2,449 lines in its own components, a 555-line route, and the absorbed
`CapacityBoard` (376) and `MultiplicationPlanner` (770) rendered inline for a tree of roughly
4,150 lines over about ten first-load blocks and 58 controls, with no single primary action.
It records church attendance as a time series that feeds only one current number and duplicates
that number in `launch_planning_assumptions`. It asks for decimal coefficients, and the audit
found this is not confined to the assumptions form: `scenario-form.tsx` repeats the same
“Decimal 0 to 1” and “Decimal 0 to 0.95” inputs, so the precision fix must cover both forms.
Owned by family L. Evidence: `components/admin/launch-planning/*.tsx`,
`app/(protected)/admin/launch-planning/page.tsx`,
`components/admin/launch-planning/scenario-form.tsx` (the second set of decimal inputs),
`supabase/migrations/20260528140000_julian_p2_church_attendance.sql`.

**A5: Leader pipeline. Verdict: passes. 🟢 no action.**
It passes all four tests. The `readiness_stage` enum is shown through readable labels,
Identified, In training, Ready to lead, and Launched, never the raw tokens; the add-apprentice
form asks for only name, stage, an expected-ready date, and notes; there are no decimals or
coefficients; and the field set is the minimum the job needs. No change is prescribed. Evidence:
`components/admin/leader-pipeline/leader-pipeline.tsx` (`STAGE_LABEL` usage; the four-field form),
`app/(protected)/admin/leader-pipeline/page.tsx` (the readable-stage lede).

**A6: Follow-ups. Verdict: action needed, density only. 🟡 (family F)**
Vocabulary and inputs pass, and the consolidation pass already fixed its framing. The single
failure is minimum-on-load: a five-filter bar renders before the queue the surface exists to
show. Owned by family F. Evidence: `components/admin/follow-ups/follow-ups-shell.tsx`
(filter bar at lines 223 to 330 ahead of the queue).

**A7: Group health. Verdict: mostly passes, one internal-action leak. 🟡 (family H)**
It passes the precision and estimate tests in the ways that matter: the two admin inputs are
1 to 5 integer ratings, not decimals; the grade is a letter A to D; attendance consistency is
computed, not entered; and the monthly history it keeps is justified because the trend is the
job, unlike church attendance. Two smaller faults remain. It exposes a per-row “Recompute”
button, an internal action, even though the page states grades recompute live on read, and the
per-row inline rating form makes the table dense. Owned by family H. Evidence:
`app/(protected)/admin/group-health/page.tsx` (the “recomputed live on read” note beside a
manual Recompute form; the inline rating form per row).

**A8: People. Verdict: passes. 🟢 no action.**
It passes all four tests. The directory explains that members are non-login participant records
so the central concept is not assumed, the role controls use plain language, and there are no
coefficients. The directory component is large at 580 lines, but that is table rendering of a
list, not conceptual complexity, so no model change is warranted. Evidence:
`app/(protected)/admin/people/page.tsx` (the members explanation),
`components/admin/people-directory.tsx`.

**A9: Groups. Verdict: action needed, three separate faults, not one. 🟡 and 🔴 (family G)**
Groups fails on three independent counts, which is why fixing only “segment” would miss most of
the problem. First, vocabulary: the capacity board and multiplication planner show “Segment”,
“All segments”, and “Unsegmented”, implementation umbrella terms for the real `audience_category`
and `life_stage` attributes. Second, more vocabulary: the create and edit forms label a field
“Bi-weekly parity” with a “Choose week parity” control and a hint that “Odd/even is based on the
calendar week number”, which is developer language a ministry leader would not use. Third,
precision over default: a group’s capacity “stays Unknown until you set it” rather than defaulting
to the ministry default capacity that already exists, so every group demands a manual entry. The
create form also presents twelve fields, more than the job needs on first pass. Owned by family G.
Evidence: `lib/admin/multiplication.ts` (`segmentLabel` returning “Unsegmented”),
`components/admin/capacity-board/capacity-board.tsx` (the “Segment” filter),
`components/admin/forms/group-create-form.tsx` (“Bi-weekly parity”, the twelve fields, “Capacity
(optional)”), `app/(protected)/admin/groups/page.tsx` (“Capacity stays Unknown until you set it”),
`lib/admin/metrics.ts` (`default_group_capacity`).

**A10: Calendar. Verdict: passes. 🟢 no action.**
It passes all four tests. It is a read-only view of meetings, off weeks, and special gatherings,
with plain language and no inputs to over-specify. The word “occurrence” in its lede is mildly
technical but understood in context. No change is prescribed. Evidence:
`app/(protected)/admin/calendar/page.tsx`.

**A11: Settings. Verdict: action needed, verbosity and a dead field. 🔴 (family S)**
It fails minimum-input and carries a dead field. It presents nine metric defaults, per-group
overrides, and an active-overrides list on one surface when an operator changes only a few, and
one field, `check_in_due_day_of_week`, is dead by the model’s own comment. Owned by family S.
Evidence: `components/admin/settings-shell.tsx`, `lib/admin/metrics.ts` (the `MetricDefaults` type
and the legacy-field comment).

-----

## Goals and non-goals

**Goals.** Apply the principle to every surface the audit flagged: replace recorded data with
editable estimates where no surface uses the series, default every input that has a sane value,
remove implementation vocabulary in favor of ministry language, and cut every surface to the
fields its job needs. Specifically, simplify Launch planning’s model and inputs and give it one
primary action; collapse church attendance to one estimate; trim the forecast and both scenario
inputs to percentages; lead Follow-ups and Leader care with their content and trim the
interaction form; remove the Groups vocabulary, the parity language, and the manual-capacity
default; trim Settings; and relabel the Group health recompute action. Extend ADR 0010 so the
principle holds going forward.

**Non-goals.** No structural re-merging and no navigation changes. **No Super Admin work of any
kind**; the owner has excluded the entire area, so nothing under Super Admin is simplified,
trimmed, or restructured, and any change to a shared component that Super Admin also uses must
preserve Super Admin’s current behavior. No change to the `shepherd_care_*` schema or the
`shepherd-care` and `over-shepherd` route paths, which ADR 0008 froze; the church-attendance
change is outside that surface and does not touch the freeze. No change to the behavior of shared
primitives such as `components/layout/shell.tsx`, `components/dashboard/cards`, or the shared form
field styles, beyond surface-local use. No visual rebranding or color and type changes; the visual
layer is sound, which is why Group health’s raw styling is left for a separate pass.

## Success criteria

The pass is complete when each flagged surface satisfies the principle, measured by the four tests.

No surface records a data series that no surface reads: church attendance is a single editable
number, used both for the forecast and the percentage headline. (Per owner sign-off, the
`church_attendance_snapshots` table and its RPC are retained for history but are no longer read by the
forecast or headline, which read only the single `current_church_attendance` assumption value.)
No surface asks for precision a default could supply: the
forecast and both scenario forms present every ratio as a whole-number percentage and default the
rest, group capacity defaults to the ministry value rather than “Unknown”, and the standing test,
that a non-technical user can finish each surface without a glossary, holds. No surface shows
implementation vocabulary: “segment”, “unsegmented”, and “week parity” are gone, replaced by terms
defined in CONTEXT.md, and the Group health “Recompute” action reads as a ministry action. No surface
shows more than its job needs: Launch planning leads with the capacity answer and one primary action,
Follow-ups and Leader care lead with their content, and the Groups create form asks first for only
what a group requires.

Across all surfaces, every flagged surface has one obvious primary action and a defined first-run and
empty state, ADR 0010 carries the principle as a gate, Super Admin behaves exactly as today, and the
navigation, surface count, frozen schema and routes, shared primitives, and visual layer are unchanged.

-----

*Status legend:* 🟢 zero-risk mechanical · 🟡 structural, reversible · 🔴 needs a Julian or Tom
sign-off before build. Each requirement is sized to become one GitHub issue or a small epic, and
every 🔴 item carries a recommended default so sign-off is a yes, not fresh analysis.

## L: Launch planning

**L1: Adopt progressive disclosure, glance then detail. 🔴**
First load shows only the at-a-glance capacity answer and one primary action; the rest moves behind
named tabs. Recommended default tabs: Overview, Forecast, Scenarios, and Groups and multiplication.
Evidence: `components/admin/launch-planning/summary-cards.tsx`,
`app/(protected)/admin/launch-planning/page.tsx` (lines 400 to 511). *Sign-off: ✅ four tabs confirmed (2026-06-01).*

**L2: Name one primary action. 🟡**
Recommended default: **Plan a launch**, creating a scenario from current inputs via
`adminCreateLaunchPlanningScenario`, with **Save forecast** as fallback. Depends on L1. Evidence:
`app/(protected)/admin/launch-planning/scenario-actions.ts`, `.../actions.ts`.

**L3: Make it useful on first run. 🟡**
Use the existing built-in assumptions as default-on values, replace the “save once to persist” nudge
with an inline “Adjust forecast” affordance, replace the em dash metric placeholder with a labelled
empty state, and point to People or Groups when there are no active groups. Evidence:
`app/(protected)/admin/launch-planning/page.tsx` (lines 383 to 398),
`components/admin/launch-planning/summary-cards.tsx`.

**L4: Replace the church-attendance time series with one editable estimate. 🔴 Structural, no migration.**
Make `current_church_attendance` in `launch_planning_assumptions` the single source of truth for both
the forecast and the percentage headline, and reduce the church-attendance card to one value with an
edit control. **Owner sign-off (2026-06-01): single-number surface approved, but the
`church_attendance_snapshots` table and the `admin_record_church_attendance_snapshot` RPC are KEPT and
history is retained — they simply stop being what the forecast and headline read from.** This makes L4 a
surface + source-of-truth change with no schema migration. **ADR 0008 intersection: none**; the table is
outside the frozen `shepherd_care_*` surface. Evidence:
`supabase/migrations/20260528140000_julian_p2_church_attendance.sql`,
`components/admin/launch-planning/church-attendance-card.tsx`, `lib/admin/launch-planning.ts`.
*Sign-off: ✅ single-number model confirmed; history retained (table/RPC kept).*

**L5: Trim the forecast and scenario inputs and state them as percentages. 🔴 Structural at the UI boundary.**
Reduce the default forecast to the two inputs that need a ministry-specific answer, current church
attendance from L4 and target group participation shown as a percentage such as 60 percent, and default
the rest silently: expected growth to zero, average group size to the default capacity, launch buffer to
15 percent, and leaders per new group to two. Apply the same percentage conversion to the scenario form,
which repeats the decimal inputs. Keep storage as a ratio so no schema migration is required; convert at
the UI boundary using the existing `pctValue` helper and its inverse. Evidence:
`components/admin/launch-planning/assumptions-form.tsx`,
`components/admin/launch-planning/scenario-form.tsx` (the duplicate decimal inputs),
`lib/admin/launch-planning.ts`. *Sign-off: ✅ the two required inputs and the silent defaults confirmed (2026-06-01).*

## F: Follow-ups

**F1: Lead with the queue, filters on demand. 🟡**
The status-grouped queue renders first; the five-filter bar collapses behind a “Filter” control, default
view open items sorted by due date. Evidence: `components/admin/follow-ups/follow-ups-shell.tsx`.

**F2: Name one primary action and a sensible default view. 🟢**
Promote **Add follow-up** via `adminCreateFollowUp`, default to open items. Evidence:
`app/(protected)/admin/follow-ups/actions.ts`.

## C: Leader care

**C1: Lead with the attention queue and trim the interaction form. 🟡**
Lead the surface with the care attention queue and keep the full directory and the heavier forms behind
the existing Directory view or disclosure, so the daily decision, who needs attention, is what loads.
Trim the `log-interaction-form` to the minimum an interaction needs, recommended as what happened, the
care-status touch, and an optional follow-up, demoting the rest. This is surface and form work only; the
`shepherd_care_*` schema and route path stay frozen per ADR 0008. Evidence:
`components/admin/shepherd-care/view-toggle.tsx`,
`components/admin/shepherd-care/care-attention-queue.tsx`,
`components/admin/shepherd-care/log-interaction-form.tsx` (ten controls). *Sign-off: confirm which
interaction fields stay in the primary form, recommended as outcome, status, and follow-up.*

## G: Groups

**G1: Retire the segment vocabulary and define the user-facing terms. 🟡**
Remove “segment”, “segmented”, “all segments”, and “unsegmented” from labels, keeping the real attributes.
Recommended default: rename, not remove, since the audience and life-stage grouping is useful; label
`audience_category` as **Audience**, `life_stage` as **Stage of life**, a combined bucket as **Group type**,
and replace “Unsegmented” with **Not categorized**. No migration. Amend CONTEXT.md with **Audience** and
**Stage of life**, and record **Segment** as internal only, as the glossary already treats “Admin OS”.
Evidence: `lib/admin/multiplication.ts`, `components/admin/capacity-board/capacity-board.tsx`, `CONTEXT.md`.
*Sign-off: confirm the four labels and the glossary additions.*

**G2: Replace the bi-weekly parity vocabulary. 🟡**
Relabel the “Bi-weekly parity” field and its “calendar week number” hint in plain language. Recommended
default: ask “Which weeks does it meet?” with options worded as **1st and 3rd** and **2nd and 4th**, or as
**Odd weeks** and **Even weeks** with a one-line plain explanation, on both the create and edit forms. No
migration; the stored value is unchanged. Evidence: `components/admin/forms/group-create-form.tsx`,
`components/admin/forms/group-edit-form.tsx`. *Sign-off: confirm the replacement wording.*

**G3: Default group capacity instead of leaving it Unknown. 🔴**
Default a new group’s capacity to the ministry default capacity rather than “Unknown”, so an operator sets
a per-group number only when a group differs. Recommended default: seed the capacity field and the capacity
math from `default_group_capacity`, and reserve “Unknown” for the rare group with no sensible capacity.
This changes how untagged groups count in the capacity totals, which is why it is sign-off-gated. No schema
change is required; it is a default and a display change. Evidence:
`app/(protected)/admin/groups/page.tsx` (“Capacity stays Unknown”),
`components/admin/forms/group-create-form.tsx`, `lib/admin/metrics.ts` (`default_group_capacity`).
*Sign-off: ✅ confirmed (2026-06-01) — groups default to the ministry capacity and this feeds the capacity math.*

**G4: Collapse the create form to its essentials. 🟡**
Show only the fields a group needs first, recommended as name and meeting day and time, and move audience,
stage of life, launched-on, address, and the parity control behind a “More details” disclosure. Reversible
layout change, no schema impact. Evidence: `components/admin/forms/group-create-form.tsx` (twelve fields).

## S: Settings

**S1: Trim Settings to what an operator changes, default the rest, remove the dead field. 🔴**
Keep care cadence, the two stale-day windows, and the default group capacity in the primary path; move the
capacity and attendance thresholds, the check-in offset, and the missed-check-in window into an “Advanced
thresholds” disclosure with their current defaults; demote per-group overrides and the active-overrides list
into a collapsed section; and remove the dead `check_in_due_day_of_week` field. No migration for the trim;
dropping the dead column is an optional follow-up. Evidence: `components/admin/settings-shell.tsx`,
`lib/admin/metrics.ts`. *Sign-off: ✅ primary-path settings and the field removal confirmed (2026-06-01).*

## H: Group health

**H1: Relabel the recompute action and consider deferring the inline form. 🟡**
Replace the per-row “Recompute” button with ministry language, recommended as **Save this month’s grade**,
or remove it if the live-on-read recompute already persists what is needed, and consider moving the per-row
rating inputs behind an expand control so the table reads first. No model or schema change; grades already
recompute on read. Evidence: `app/(protected)/admin/group-health/page.tsx` (the manual Recompute form beside
the “recomputed live on read” note). *Sign-off: confirm the recompute label, or that the manual action can
be removed.*

## B: Surface-budget principle extension

**B1: Extend ADR 0010 with the principle as a gate. 🟢**
Amend `docs/adr/0010-surface-budget.md` with a section stating that a user-reachable surface, beyond the
existing count rule, presents an intuitive model rather than the internal one, tested four ways: it has one
obvious primary action and does not regress in density; it does not record a series no surface reads; it does
not require precision a default could supply; and its labels use ministry vocabulary. Reference the count rule
rather than restating it. Recommended default: amend in place, so the budget stays one document. Evidence:
`docs/adr/0010-surface-budget.md`.

-----

## Open questions

These are surfaced rather than omitted, because it is not clear whether each is overcomplication or intent.

First, the admin home’s weekly-cadence cluster: with the leader check-in loop gated off, do the attention
queue, capacity, follow-ups, and setup-gaps cards still earn the landing’s primary real estate, or should the
home lead only with the two job cards? Recommended default if changed: keep the two job cards prominent and
demote the cadence cards.

Second, the Leader care interaction form: ten controls may be deliberate richness for a pastoral log. The
recommendation under C1 is to trim to outcome, status, and follow-up, but the owner may want more retained.

Third, the Group health recompute action: is a manual Recompute needed at all, given grades recompute live on
read, or can the button be removed rather than relabelled?

Fourth, the Over-Shepherd table: confirm no column header or the broad-note form renders “Shepherd” to the
user, since the page title is already “My Leaders” and only internal names retain the old term.

Fifth, the Groups launched-on field, which drives the “three years to multiply” rule: for older groups whose
exact launch date is unknown, would an estimated year serve better than a precise date? This is an
estimate-over-record candidate left open because the rule’s precision needs are the owner’s call.

## Recommended issue-slicing order

Slice by risk, lowest first, so the early issues are pure wins and the gate lands before the redesigns.

1. **B1, F2, G1, G2, H1** then the zero-risk and low-risk items: the ADR extension, the Follow-ups primary
   action, the Groups vocabulary and parity renames with the glossary update, and the Group health relabel.
   B1 first, so it gates what follows.
1. **F1, C1**: lead Follow-ups and Leader care with their content, and trim the interaction form. Contained,
   reversible.
1. **G4 then G3**: collapse the Groups create form, then default capacity. G3 is sequenced after the layout
   work and is the one sign-off-gated Groups item.
1. **L3 then L4**: make Launch planning useful on first run, then collapse church attendance. Per the
   2026-06-01 sign-off, L4 retains the `church_attendance_snapshots` history and carries **no schema
   migration** — this PRD ships no migrations.
1. **L5**: trim and re-unit the forecast and scenario inputs on the single church-attendance number.
1. **S1**: trim Settings.
1. **L1 then L2**: the progressive-disclosure redesign and its primary action, sequenced last as the largest
   layout change, after L3 to L5 have simplified what it must lay out.

## Super Admin: excluded, behavior preserved

Super Admin is out of scope in full, by the owner’s instruction, and nothing in this PRD changes it. The
exclusion is safe to honor cleanly, because Super Admin shares almost nothing with the surfaces this PRD
touches: its routes import only the shared `PageHeader`, the auth session helper, and the Supabase server
client, plus its own components, and it reads none of the church-attendance, launch-planning, metric-defaults,
or segmentation data that families L, S, and G act on. The only shared primitives in play are `PageHeader` and
the form field styles, which this PRD uses but does not modify. If any future slice must change a shared
primitive, it must preserve Super Admin’s current rendering and behavior. Evidence: import scan of
`app/(protected)/admin/super-admin/page.tsx` and `components/admin/super-admin/*`.

## Scope re-check after widening

Allowing structural change widens what counts as in scope, so the requirements were re-checked against the
exclusions, and every item stays within them. No requirement changes the surface count or the navigation; L1
and G4 redistribute a surface’s contents but add no destination. No requirement touches Super Admin, and the
one realistic shared-primitive risk is named and fenced above. Per the 2026-06-01 sign-off, L4 now retains
the `church_attendance_snapshots` history, so this PRD ships no schema migration at all; L4, L5, C1, G1, G2,
G3, S1, and H1 all require no migration. No requirement alters a shared
primitive’s behavior or the visual layer. The widened scope therefore reaches the simpler models the owner
asked for without crossing any line the consolidation pass or the ADRs drew.

## Known states, no action in this PRD

Launch planning keeps its title “Capacity” with the eyebrow “Launch planning”, the consolidation pass’s intended
labelling, so no rename is prescribed. The em dash characters in Launch planning’s UI strings are touched only
where L3’s empty-state fix reaches them. Group health renders in raw utility styling unlike the rest of the app,
which is a visual-layer matter and is out of scope here. Group health’s placeholder question wordings are the
intended ADR 0007 fallback, not unfinished UI.

## Sign-off — ✅ resolved 2026-06-01

All five 🔴 items were signed off by the owner. Four were approved as recommended; L4 was approved with one
change (history retained). Issues #221–#226 are updated and moved to `ready-for-agent`.

**L1 ✅**: redesign Launch planning to show the at-a-glance answer plus one primary action, the rest in the four
tabs Overview, Forecast, Scenarios, and Groups and multiplication; the paired action under L2 is Plan a launch,
fallback Save forecast.

**L4 ✅ (changed)**: make a single editable `current_church_attendance` the source of truth for the forecast and
the headline. **The `church_attendance_snapshots` table and its RPC are KEPT (history retained) — they are no
longer read by the forecast/headline. No drop, no migration.**

**L5 ✅**: require only current church attendance and target group participation by default, shown as percentages,
default the rest, and apply the same conversion to the scenario form.

**G3 ✅**: default a new group’s capacity to the ministry default capacity rather than “Unknown”, and feed that
default into the capacity math.

**S1 ✅**: keep care cadence and default capacity in the Settings primary path, demote the rest, and remove the dead
`check_in_due_day_of_week` field.

Reversible items with owner-facing wording to confirm in the same pass, not separately gated: G1’s labels Audience,
Stage of life, Group type, and Not categorized and its glossary additions; G2’s parity replacement wording; C1’s
retained interaction fields; and H1’s recompute label.
