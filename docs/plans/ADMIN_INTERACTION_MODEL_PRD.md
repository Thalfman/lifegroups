# PRD: Admin Interaction Model

_Progressive disclosure and density across the admin app_

|                  |                                                                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Status**       | Implementation-ready for ticketing (rev 5); Group health filter logic and the P1 ranked queue are gated on director sign-off |
| **Owner**        | Tom                                                                                                                          |
| **Date**         | 2026-06-02                                                                                                                   |
| **Source input** | Live UX review of the authenticated admin app (June 2026), plus reviewer feedback on rev 1 through rev 4                     |
| **Related PRD**  | Launch Planning Simplification PRD (separate, in flight)                                                                     |
| **Surface**      | `/admin` (all admin surfaces)                                                                                                |

---

## Problem Statement

The admin app is functionally complete but cognitively expensive. Editing and creation render inline inside list pages, dashboards show metrics without telling the user what to do next, and several surfaces stack many forms, repeated save buttons, and unlabeled actions on one screen. The problem is density, not missing function: a user can find the tools, but must slow down and parse each page instead of being guided to the next right action. Left unsolved, the primary admin (the ministry director) carries avoidable friction on routine weekly work, and the heaviest pages (People, Group health) remain error-prone and inaccessible to keyboard and screen-reader users.

## Guiding Principle

Every admin surface has **one primary job and one primary next action**. All secondary actions and complex editing live behind progressive disclosure: drawers, modals, dedicated routes, or collapsible sections. This single principle generates most of the requirements below and is the test for every future surface.

## Editing Pattern (decided)

This is the standard for all list-to-detail editing. It was an open question in rev 1 and is now fixed, so the first implementation does not set the pattern by accident.

- **Desktop:** a right-side drawer for editing a record opened from a list.
- **Mobile:** a full-screen sheet or a dedicated route.
- **Modals:** only for small confirmations or single-action tasks, never large forms.
- **Dedicated routes:** for complex workflows such as People assignments, if a drawer becomes too crowded.

## Goals

1. Reduce visible density on the heaviest surfaces so the primary task is obvious at a glance, not buried among secondary controls.
1. Establish one consistent editing pattern (out of the list flow) used everywhere, replacing today’s mix of inline forms.
1. Make the dashboard prioritize work rather than only report it.
1. Bring all interactive controls to accessible names with record context, and working focus management, so keyboard and screen-reader use works.
1. Ship a reference implementation on one surface first, validate it, then propagate, so the pattern is de-risked before app-wide rollout.

## Non-Goals

1. **New features.** This PRD changes how existing function is presented, not what the app does.
1. **Data model or permissions changes.** Role boundaries (admin-private vs leader-visible) stay as designed.
1. **Launch planning content density, attendance recording, decimal forecast inputs, and Groups vocabulary.** These belong to the Launch Planning Simplification PRD. See Scope Boundary.
1. **Settings copy and verbosity reduction.** The content-level rewrite is owned by the other PRD. This PRD owns only the Settings interaction and accessibility fixes (requirement 5).
1. **Known-password test accounts.** A security and data-integrity issue, urgent but not a UX concern. It is a readiness gate (see Related Work In Flight), not work performed here.
1. **Visual rebrand.** No theme, palette, or typography overhaul.

## Scope Boundary (shared surfaces)

Two surfaces appear in both this PRD and the Launch Planning Simplification PRD. Ownership is assigned explicitly so both efforts do not edit the same files in different directions:

- **Launch planning.** The default-tab initial-state fix is owned **here** (it is an interaction bug). All Launch planning content, forecast inputs, and vocabulary are owned by the **other PRD**.
- **Settings.** The collapsible “Advanced thresholds” interaction and the form-label and accessibility fixes are owned **here** (requirement 5). Copy, wording, and verbosity reduction are owned by the **other PRD**.

## Related Work In Flight

This PRD does not run in isolation.

- **Launch Planning Simplification PRD.** The parallel effort, and the owner of the shared Launch planning content and Settings copy. Keep the two in sync on the two shared surfaces above.
- **Structural consolidation (recently completed).** The merge of the Capacity board, Launch planning, and Multiplication into one surface created the merged surfaces this PRD now refines. Treat it as the baseline these changes sit on.
- **Compliance and access ticket for known-password test accounts (readiness gate).** Out of scope here, but a separate ticket with a named owner and a target date must exist before this PRD is considered ready for implementation. Readiness-gate evidence (ticket id or URL, owner, target date, current status) is recorded in the implementation kickoff notes.

## User Stories

**Primary admin (ministry director)**

- As the ministry director, I want the dashboard to tell me what needs attention next, so I can start working without reading every metric.
- As the ministry director, I want to review group health as a triage list and open one group at a time to edit, so I am not faced with dozens of forms at once.
- As the ministry director, I want to edit a person, group, or follow-up in a focused panel rather than an inline form, so the rest of the list stays stable and uncluttered.

**Super admin**

- As a super admin, I want operational sections collapsed by default with high-risk actions isolated, so I am not scrolling one very long page and risking the wrong control.
- As a super admin, I want a frozen or deferred area to read as intentional, not broken, so I trust the navigation.

**Keyboard and screen-reader users**

- As a keyboard or screen-reader user, I want repeated actions to carry record context and predictable focus behavior, so I can tell controls apart and complete edits with confidence.

## Requirements

### Must-Have (P0)

**1. One editing pattern, out of the list flow.**
Replace inline edit and create forms with the Editing Pattern above. Inline editing is permitted only for approved low-risk single-field updates, named in the implementation ticket. This is the unifying fix; requirement 2 is its most important instance.

P0 reviewed list surfaces (the authoritative scope; any surface excluded from P0 must be listed with a rationale):

- People, Groups, Group health, Follow-ups
- Leader care directory and detail, where list editing occurs
- Calendar occurrence detail, if applicable

Scope note (Leader care): P0 here covers only moving any list-style editing in Leader care into the Editing Pattern. The broader care-action simplification is P1 (requirement 10). Keep this boundary explicit in implementation tickets so P0 does not absorb the full care-detail redesign.

Acceptance criteria:

- [ ] No list page renders a full multi-field inline create or edit form within the list. Approved inline exceptions are limited to low-risk single-field updates and named in the implementation ticket.
- [ ] Editing or creating a record opens a focused surface per the Editing Pattern, without displacing or reflowing the underlying list.
- [ ] Closing returns the user to their prior scroll position and filter state.
- [ ] Follow-up creation follows this pattern, and the “No follow-ups yet” empty state disappears or is replaced while creation is active. _(Resolves the rev 1 priority conflict: follow-up creation is P0, not P1.)_
- [ ] Groups list editing no longer expands inline beneath the list, and its repeated Edit and Calendar controls carry record context (see requirement 4).

Focus and keyboard behavior for drawers and sheets:

- [ ] Opening moves focus into the editing surface.
- [ ] Closing returns focus to the triggering control.
- [ ] Escape and an explicit close control both work.
- [ ] A keyboard-only user can complete the entire edit flow.
- [ ] Unsaved changes are preserved, or the user is clearly warned before discard.

**2. Group health becomes a triage workflow.**
Convert the repeated form table into a review table, with editing in the Editing Pattern surface for one group at a time.

- [ ] The default view is a triage table: group, last check-in, attendance trend, current grade, missing ratings, last saved.
- [ ] Filters exist for Not assessed, Needs rating, Watch, and Needs follow-up, using the definitions below.
- [ ] Opening a group reveals its rating fields in the editing surface; saving affects only that group.
- [ ] The list renders no per-row save buttons.

Filter definitions (provisional, to be confirmed by the ministry director before the final filter logic ships):

- **Not assessed:** no health rating has ever been recorded for the group.
- **Needs rating:** an assessment exists but one or more required ratings are missing, or the latest assessment is older than the director-defined interval.
- **Watch:** the latest grade is below the director-defined threshold, or the attendance trend is declining.
- **Needs follow-up:** an action or flag from the latest assessment is still open.

Data fallback: if a required field is unavailable (for example, attendance trend, or a director-defined interval or threshold), the implementation either omits that column or filter with a documented reason, or derives it from an existing source approved by the director. Do not invent placeholder logic. The layout, drawer pattern, and table scaffolding are not gated; only the final filter logic is (see Open Questions).

**3. People splits into distinct workflows.**
Separate the directory, add-person, and assignment functions so they are not stacked on one long page.

- [ ] People defaults to the Directory view. Add person and Assignments are secondary views reached by explicit actions, not shown below directory search results by default.
- [ ] Directory, Add person, and Assignments are distinct views or clearly separated sections.
- [ ] A no-results search does not leave a large unrelated section (such as Assignments) visible.
- [ ] Group assignment happens in a detail surface or a dedicated group page, not repeated inline for every group on the People screen.

**4. Accessible names with record context.**
Repeated controls must be distinguishable; standalone generic controls are acceptable when their context is unambiguous. Prove it with more than axe alone.

- [ ] Repeated actions in lists, tables, cards, and operational sections include record or section context in their accessible names (for example, “Open Anderson calendar”, “Save Anderson health rating”).
- [ ] Standalone generic controls are acceptable only when the surrounding semantic structure makes their purpose unambiguous.
- [ ] Axe passes with no critical or serious violations on the reviewed surfaces.
- [ ] A Playwright accessibility-name check verifies that repeated actions include record context such as group, person, date, or section name. _(Axe catches missing names but not present-but-ambiguous ones such as repeated “Edit”.)_

**5. Settings semantics fixed.**

- [ ] No empty headings.
- [ ] Every input has both a visible label and a programmatic label association.
- [ ] Related threshold fields are grouped.
- [ ] Advanced thresholds are collapsed or progressively disclosed, not shown by default.

Settings is part of P0 for semantics, grouping, progressive disclosure, and labels, but is not required to use the list-to-detail drawer pattern (requirement 1). Owner note: this PRD owns Settings interaction and accessibility; copy and verbosity are owned by the Launch Planning Simplification PRD.

**6. Quick wins.**
Small, high-visibility fixes that ship first.

- [ ] No admin entry point presents Guests as an active workflow unless the user is clearly told it is frozen or deferred before navigating. Covers the dashboard Guests card, any sidebar or nav entry, the `/admin/guests` route, and any OPEN call to action or pipeline language.
- [ ] Launch planning loads with the Overview tab selected and its content visible by default (no “Pick a section above” empty state on first load).

**7. Dashboard “Needs attention” area (minimal).**

- [ ] The dashboard shows a “Needs attention” area with direct links to the real admin actions available, typically 3 to 5, drawn from existing admin concerns where the admin can act: unassigned leaders or groups, overdue or missing health assessments, open follow-ups, and setup gaps.
- [ ] Each link lands on a filtered view where possible.
- [ ] Frozen or deferred workflows may appear as a status or context notice, but not as imperative action links unless a real admin action is available.
- [ ] If fewer than 3 real actions exist, show only those plus a clear “nothing else needs attention” state; do not pad the list to reach 3.
- [ ] The P0 categories may use the listed existing admin concerns without waiting for ranked-priority sign-off. Stakeholder sign-off is required only before the P1 ranked action queue (requirement 8).
- [ ] This area surfaces the categories with live counts. The ranked, imperative next-action ordering is P1 (requirement 8). Without at least this area, the dashboard violates the guiding principle after P0.

### Should-Have (P1)

**8. Dashboard action queue (full).**

- [ ] A single ranked “Top next actions” list that orders across the attention categories by priority and phrases each as an imperative action (for example, “Assign leaders to 16 groups”, “Set meeting day and time for 8 groups”).
- [ ] Counts and ordering reflect current state as the underlying data changes.

**9. Super Admin collapses into sections.**

- [ ] Operational sections (Access, People import, Coverage, Features, Diagnostics, Test tools, Audit, Maintenance, Danger Zone) are collapsed by default with working anchors.
- [ ] Opening an anchor link expands the target section and scrolls to and focuses its heading.
- [ ] Danger Zone and test-account actions are visually separated from routine controls.

**10. Leader care actions simplified.**
This is the broader care-detail redesign; the P0 work in requirement 1 only moves list-style editing into the pattern.

- [ ] Care actions are presented as plain, separate choices (for example, Log call/text/visit, Set next touchpoint, Update status, Add private summary), or field changes auto-detect what to save.
- [ ] The admin-only nature of notes remains clearly stated.

### Could-Have (P2)

**11. Calendar filter affordances.** Add Clear all, Select all, and compact filter chips; consider defaulting admin work to the List view.
**12. Saved views and filters.** Persisted filter and view selections per user.
**13. Full responsive audit.** A pass over every legacy surface for phone usability, beyond the mobile-capable editing pattern delivered in P0.

## Success Metrics

Measurable now (engineering and audit):

- **Inline-form invariant:** 0 list pages render a full multi-field inline create or edit form; any approved single-field inline exception is named in the implementation ticket. _(Target met at P0 completion.)_
- **Focus management:** the drawer and sheet keyboard checklist in requirement 1 passes. _(Target met at P0 completion.)_
- **Accessible names:** axe reports no critical or serious violations, and the Playwright name check confirms repeated actions carry record context. _(Target met at P0 completion.)_
- **Density on the heaviest surface:** Group health renders no per-row save buttons and shows a single triage table above the fold. _(Target met at P0 completion.)_

Requires the primary user’s input (self-reported by the ministry director):

- **Time to complete the weekly health-review routine** drops noticeably after the triage workflow ships. Baseline before P0, re-check two weeks after.
- **Perceived “where do I start” friction on the dashboard** improves after the Needs attention area ships.

These are deliberately lightweight. This is a ministry operations tool, not a product with analytics infrastructure, so the honest measures are architectural invariants plus the director’s qualitative read.

## Open Questions

- **[Stakeholder] Director sign-off on the Group health filter thresholds and the dashboard ranked action ordering.** Blocking for the final filter logic in requirement 2 and the ranked ordering in requirement 8. Not blocking for layout, the drawer pattern, the Group health table scaffolding, or the P0 dashboard Needs-attention categories, which may use the listed existing admin concerns. Engineering can build the Group health shell and the P0 dashboard area in parallel with gathering these. Confirm thresholds and ordering match the director’s mental model before those parts ship.
- **[Stakeholder] Mobile usage.** Confirm whether the director uses this on a phone, which raises the priority of the P2 responsive audit. Non-blocking.

_(Resolved since rev 1: the editing pattern is decided, see Editing Pattern; the reference implementation is Group health, see Sequencing.)_

## Sequencing

The order separates effort from severity, so quick fixes and large redesigns are not lumped together.

1. **Quick wins:** Guests entry points, Launch planning default tab, contextual names for repeated existing labels, and the low-risk Settings fixes (empty headings and label associations). The Settings threshold grouping and Advanced thresholds disclosure can follow with the pattern work.
1. **Group health reference implementation.** Chosen first: it has a single dominant workflow, a clean before-and-after shape, and obvious density reduction. People is more entangled (identity, directory, assignments, groups, permissions), so it is the wrong place to prove the pattern. Build the shell and table scaffolding in parallel with gathering the director’s threshold sign-off; land the final filter logic once signed off.
1. **Propagate the validated pattern** to Groups and Follow-ups.
1. **Split People** into Directory, Add person, and Assignments.
1. **Information prioritization:** dashboard action queue and Super Admin collapse.
1. **Polish:** Calendar filters, saved views, full responsive audit.

Drawer and sheet focus management and keyboard flow are verified as part of each migrated surface (steps 2 to 4), not in the quick-win pass. This matches the intake, plan, execute, retro loop: run the retro after step 2 before propagating.

## Appendix: mapping the UX review to this PRD

| #   | Review finding                  | Disposition                                                                                                                              |
| --- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Dashboard action queue          | P0 Needs-attention area, 3 to 5 real-action links, no padding, categories not gated (req 7) + P1 ranked queue, gated on sign-off (req 8) |
| 2   | Frozen Guests link              | P0 quick win, all entry points (req 6)                                                                                                   |
| 3   | Launch planning default tab     | P0 quick win (req 6); interaction fix owned here                                                                                         |
| 4   | Split People                    | P0 (req 3), defaults to Directory; instance of the editing pattern                                                                       |
| 5   | Group health workflow           | P0 (req 2); reference implementation; shell not gated, final filter logic gated on sign-off                                              |
| 6   | Unique accessible names         | P0 (req 4); repeated actions carry record context, verified with axe and Playwright                                                      |
| 7   | Inline editing swallowing lists | P0 (req 1); the unifying fix, with an explicit surface inventory                                                                         |
| 8   | Leader care actions             | P1 (req 10); P0 only moves list-style editing (req 1)                                                                                    |
| 9   | Follow-up creation state        | P0, folded into req 1 (was P1 in rev 1)                                                                                                  |
| 10  | Calendar filters                | P2 (req 11)                                                                                                                              |
| 11  | Super Admin collapse            | P1 (req 9), anchors expand and focus the target section                                                                                  |
| 12  | Settings semantics              | P0 semantics, grouping, disclosure, and labels (req 5); not required to use the drawer pattern; copy and verbosity in the other PRD      |
| —   | Known-password test accounts    | Out of scope; readiness gate ticket with recorded evidence required before implementation                                                |
