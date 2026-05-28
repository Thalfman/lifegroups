---
title: Life Group Operations Dashboard — Julian's Admin OS
created: 2026-05-28
updated: 2026-05-28
status: draft
owner: Tom Halfman
primary_user: Julian Guevara (Life Group Director, Fox Valley Church)
source_branch: claude/julian-feedback-plan-4vDle
supersedes: docs/PRODUCT_ROADMAP.md (this PRD is the canonical product spec; the roadmap becomes the execution log)
---

# PRD: Life Group Operations Dashboard — Julian's Admin OS

## 0. Document Purpose

This PRD is the canonical product specification for the Life Group Operations Dashboard, written for the product owner (Tom), the primary user (Julian), and downstream implementation workflows (server-action authors, RPC authors, migration writers).

It consolidates and supersedes the prose roadmap in `docs/PRODUCT_ROADMAP.md`, the Julian feedback synthesis in `docs/julian-inputs/FEEDBACK_MAP.md`, the per-area plans (`SHEPHERD_CARE_TRACKER_PLAN.md`, `LAUNCH_PLANNING_PLAN.md`, `GROUP_HEALTH_RUBRIC_DISCOVERY.md`), and Julian's verbatim 2026-05-27 inputs (`docs/julian-inputs/SYSTEMS_CONVERSATION.md`, `MIN_CARE_LIST_TEMPLATE.md`, `LG_MULTIPLICATION_PLAN_2026.md`).

The PRD uses **Glossary-anchored vocabulary** (§3); FRs, UJs, and SMs all use Glossary terms exactly. Features in §4 nest Functional Requirements (FR-N) under behavioral descriptions. Inline `[ASSUMPTION: ...]` tags mark inferences not directly attested by Julian; they are indexed in §10. `[NOTE FOR PM]` callouts flag decisions still open.

Security and privacy invariants live in `_bmad-output/project-context.md` (RPC-only writes, audit-in-txn, no service role in Next runtime, soft-deactivate over hard-delete). Those rules are inputs to this PRD, not restated here.

## 1. Vision

The Life Group Operations Dashboard is Julian's admin operating system for running the Fox Valley Church life-group ministry. It replaces three loose artifacts Julian uses today — an informal Excel "min. care list" for tracking how each of his 60+ shepherds is doing, a Google Doc for tracking which groups should multiply and when, and ad-hoc mental math for "do I need to launch more groups before August?" — with one secure, audited surface owned by Julian and (initially) one engineer.

The product exists because Julian is the system: he is the only person tracking shepherd care, the only person planning group multiplication, and the only person estimating capacity against church growth. The current setup does not scale to the ~63 shepherds + 3 over-shepherds Julian oversees, does not preserve a defensible trail of pastoral care, and gives him no early-warning system for a capacity crunch (notably the new worship center expected to drive a demand spike). The dashboard is designed around Julian's workflow first, with secondary surfaces for shepherds (the existing leader check-in flow) and explicit deferral of over-shepherd login, leader self-update, and external/comms-director surfaces until Julian validates the core.

The product matters because pastoral care done badly is invisible; this tool makes "who has Julian not connected with in 60 days" a single glance instead of a spreadsheet scan, and turns "should we launch groups in August" from a guess into a number with assumptions Julian controls.

## 2. Target User

### 2.1 Jobs To Be Done

- **Julian (Life Group Director, `ministry_admin`)**: needs to know how each shepherd is doing without scanning a list of 63; remember what was discussed and what the next step is; decide whether the church needs more groups launched and when; track which named groups are candidates to multiply and on what timeline; eventually grade group health on his own rubric.
- **Tom (Builder, `super_admin`)**: needs to invite real users (Julian first, then real shepherds), keep the system secure (RLS-first, audit-everything), and ship features Julian will use rather than features that look clever.
- **Over-shepherds (3 coaches)**: are *tracked* in v1, not *logged in*. Julian wants visibility into "who is covering whom" without taking on the work of managing over-shepherd accounts or exposing pastoral notes to them.
- **Shepherds (~63 leaders + co-leaders)**: continue using the existing leader check-in flow (`/leader/[groupId]/checkin`) to submit weekly attendance, pulse, and follow-ups. They do not see Julian's care notes.

### 2.2 Non-Users (v1)

- **Over-shepherds as authenticated users.** Tracked in `shepherd_assignments`, not given a login surface, dashboard, or read access to care notes. (Q5 confirmed: Julian wants coverage tracking for himself, not over-shepherd-facing tools.)
- **Communications director.** Deferred until Julian and the comms director jointly define what crosses the internal-to-external boundary (EXT.1).
- **Public / guest self-serve.** No public signup. Guests are entered by admins through the existing guest pipeline.
- **Group members.** Members are non-auth participant records in the `members` table. They never sign in.
- **`staff_viewer` role.** Deprecated. Routed to `/unauthorized`; not a target user.

### 2.3 Key User Journeys

**UJ-1. Julian opens his Monday-morning triage view.**
> Julian, between meetings on Monday morning, signs in to the admin OS. He has not touched the app since last Tuesday. He lands on the shepherd care dashboard. A single card surfaces 4 shepherds with stale contact (no interaction in 60+ days), 2 with active concerns, and 1 with an overdue next-touchpoint. Julian taps the stale-contact card, sees the four names with a one-line "last issue" excerpt for each, and decides which two he will text today. He closes the app. *Climax:* the moment value is delivered is the at-a-glance triage list that replaced last week's spreadsheet scroll. *Edge case:* if the stale-days threshold is set wrong (too low → noise; too high → blind spots), Julian adjusts it once in `/admin/settings`; the dashboard recomputes immediately.

**UJ-2. Julian logs a care interaction after a shepherd call.**
> Julian just finished a 20-minute call with a shepherd whose group attendance has dipped. Authenticated already. He opens the shepherd's care profile from the directory, taps "Log interaction," enters the date (today), type (call), and a 2-sentence note ("Group attendance dipped 3 weeks in a row; member moved away. Going to send him the assessment article. Follow up in 2 weeks."). He sets the next-touchpoint date to two weeks out and saves. *Climax:* he sees the interaction at the top of the log, the `last_contact_at` field rolls forward, the dashboard's stale-contact bucket drops by one, and an `audit_events` row is written in the same transaction. *Resolution:* the shepherd has dropped off Julian's "needs attention" list; in two weeks, the overdue-touchpoint card will surface this shepherd again unless Julian logs another interaction.

**UJ-3. Julian decides whether to launch groups before August.**
> It's late spring. Julian opens `/admin/launch-planning`. He enters current church attendance (the number he just got from the Worship team), his expected growth for the new worship center launch, his target group participation % (he picks ~60% based on today's rate), and the date he's planning *to*. The system computes: current capacity from real group data, projected demand, the capacity gap, and a recommended number of new groups, with a suggested launch timeline anchored to August. Julian uses the seasonality quick-fill ("Next August") instead of typing a date. *Climax:* he sees "capacity gap: 32 seats; recommended new groups: 3" and decides which audiences (men / women / mixed) those groups should serve based on the segmentation. *Resolution:* he goes to the multiplication-candidate pipeline (UJ-4) to see which named candidate groups are ready.

**UJ-4. Julian reviews the multiplication pipeline before a leadership meeting.**
> Julian opens the launch-planning page's multiplication-candidates surface. Candidates are grouped by audience × life stage. For each, he sees readiness signals: member count (≥12), years meeting (≥3), co-shepherd tenure (≥1 year), shepherd willingness, and whether there's documented need for a similar group. He marks one candidate as "target 2026" and another as "target 2027." *Climax:* the candidate list shows which groups are ready *now* vs. need development, segmented by audience so Julian can answer "do I need more men's groups or women's groups." *Edge case:* a candidate that does not meet all five criteria is flagged but not excluded — Julian can override.

**UJ-5. Tom invites Julian into the app for the first time.**
> Tom, signed in as `super_admin`, goes to `/admin/super-admin`, opens the invite-user form, enters Julian's email and role (`ministry_admin`), and submits. The Edge Function (running the only service-role key) creates the auth user, links a `profiles` row, and writes an `audit_events` row. Julian gets an invite email. He sets a password and lands on the admin dashboard. *Climax:* Julian can see his real shepherds (once seeded) on the care dashboard. *Resolution:* Tom hands off; Julian starts using the product on his real list.

## 3. Glossary

Downstream artifacts (server actions, RPCs, migrations, UI) use these terms verbatim. Synonyms anywhere in this PRD are a discipline violation.

- **Life Group** — a small group of members led by one or more Shepherds; tracked in the `groups` table; has an audience (men/women/mixed) and a life stage; has a capacity (default 12) and an `allow_over_capacity` flag.
- **Member** — a non-auth participant record in `members`, linked to a Life Group via `group_memberships`. Members never sign in.
- **Shepherd** — a leader of a Life Group. App role is `leader` or `co_leader`, scoped to assigned groups via `group_leaders`. Julian oversees ~63 Shepherds total. (Julian uses "Shepherd" and "leader" interchangeably; this PRD picks **Shepherd** as canonical.)
- **Over-Shepherd** — a coach who oversees a subset of Shepherds. Three total. Tracked in `shepherd_assignments` but **does not log in** in v1.
- **Care Profile** — one `shepherd_care_profiles` row per Shepherd that Julian is actively caring for. Holds `admin_summary`, current care status, last-contact / next-touchpoint dates.
- **Care Interaction** — one append-only `shepherd_care_interactions` row per touchpoint (call, text, in-person, etc.). The history Julian relies on.
- **Care Follow-Up** — optional `shepherd_care_follow_ups` row when Julian wants a discrete to-do tied to a Care Profile (separate from the leader-visible `follow_ups` table).
- **Stale Contact** — a Shepherd whose `last_contact_at` is older than `shepherd_care_stale_days` (admin-configurable; default 60).
- **Health Status** — the canonical `groups.health_status`; the latest leader-reported pulse rolls forward to this column.
- **Group Health Grade** — the *computed* (and not-yet-built) score that combines attendance consistency, spiritual growth, and other dimensions Julian is still defining. Distinct from Health Status. **Not in v1** pending Julian's rubric.
- **Capacity Gap** — projected demand minus current capacity, computed on `/admin/launch-planning` from assumptions Julian enters.
- **Launch Planning Assumptions** — the JSON blob (or row set) holding Julian's inputs: current church attendance, expected growth, target group participation %, average group size, launch buffer %, planning window/date.
- **Forecast Scenario** — a named bundle of Launch Planning Assumptions ("Conservative," "Expected," "Stretch") for side-by-side comparison. One is marked current.
- **Multiplication Candidate** — a `multiplication_candidates` row representing a named Life Group that may launch a new group, with a `target_year` and readiness signals.
- **Readiness Signal** — one of the five criteria Julian named: ≥12 members, ≥3 years meeting, ≥1 year co-shepherd tenure, shepherd willingness, documented need for a similar group.
- **Audit Event** — one `audit_events` row written *in the same transaction* as every write RPC; failure rolls back the write.
- **Actor** — the human attributed to an audit event, resolved via `public.auth_profile_id()` (filtered to `status='active'`).

## 4. Features

### 4.1 Shepherd Care Tracker

**Description:** Julian's replacement for the informal Excel min. care list. Admin-only (`super_admin` + `ministry_admin`). The surface is `/admin/shepherd-care`. Each Shepherd Julian is caring for has a Care Profile (one row), an append-only history of Care Interactions, and (optionally) discrete Care Follow-Ups. The data is sensitive pastoral content: column-level allowlists in `lib/supabase/read-models.ts` keep it out of leader-facing reads, and there is no leader access to Care Profiles or Care Interactions in v1. Realizes UJ-1 and UJ-2.

The shipped schema mirrors the columns Julian's spreadsheet had (Name, Issue, Date of first communication, Next step, Update of communication, Misc. note) — see `MIN_CARE_LIST_TEMPLATE.md` and Part B of the audit checklist.

**Functional Requirements:**

#### FR-1: Create and maintain a Care Profile per Shepherd

Julian (or Tom) can create a Care Profile for any Shepherd in the directory. The profile holds `admin_summary` (free text), current care status, `last_contact_at`, and `next_touchpoint_due`. Realizes UJ-2.

**Consequences (testable):**
- Creating, updating, or closing a Care Profile writes an `audit_events` row in the same transaction; audit failure rolls back.
- `/admin/shepherd-care` is denied to any role other than `super_admin` or `ministry_admin` (Shepherd attempting access → `/unauthorized`).
- Reads of `shepherd_care_profiles` never use `select("*")`; they go through `lib/supabase/read-models.ts` with an explicit column allowlist.

#### FR-2: Log a Care Interaction

Julian can log a Care Interaction against a Care Profile with date, type, and free-text notes. The interaction is append-only (no edits or deletes in normal workflow). Saving rolls `last_contact_at` forward to the interaction date. Realizes UJ-2.

**Consequences (testable):**
- A new interaction with `interaction_at > profile.last_contact_at` updates `last_contact_at` in the same transaction.
- The interaction history view shows interactions in reverse-chronological order, paginated.
- Notes may contain free text; the input is sanitized against script injection but otherwise unrestricted.

#### FR-3: Set a Next Touchpoint

Julian can set `next_touchpoint_due` on a Care Profile. When it falls in the past and no interaction logged since, the profile appears in the "overdue touchpoint" bucket on the care dashboard.

**Consequences (testable):**
- A profile with `next_touchpoint_due < today` and no Care Interaction after `next_touchpoint_due` appears in the overdue bucket.
- Logging a Care Interaction after the due date clears the overdue state for that cycle.

#### FR-4: Surface Stale Contact triage

The care dashboard surfaces Shepherds whose `last_contact_at` is older than `shepherd_care_stale_days` (admin-configurable default 60) as Stale Contacts. Realizes UJ-1.

**Consequences (testable):**
- Changing `shepherd_care_stale_days` in `/admin/settings` immediately changes which Shepherds appear in the Stale Contact bucket.
- A Shepherd without a Care Profile is **not** considered Stale Contact (out of scope until a profile exists).

#### FR-5: Optional Care Follow-Ups

Julian can attach discrete Care Follow-Ups to a Care Profile, separate from the leader-visible `follow_ups` table. These are admin-only.

**Consequences (testable):**
- A Care Follow-Up is invisible to any `leader`/`co_leader` query path.
- Completing a Care Follow-Up writes an audit row.

**Feature-specific NFRs:**
- Care content is **admin-only.** No leader exposure, no over-shepherd exposure, no export, no SMS/email reminders in v1.
- All writes through `SECURITY DEFINER` `admin_*` RPCs with paired audit inserts.

**Notes:** `[NOTE FOR PM]` The default Stale Contact threshold (60 days) is Julian's *knob to turn*, not Julian's value. The current default is engineering's guess; Julian needs to set the real value once he uses the dashboard. Tracked as OQ-1.

---

### 4.2 Over-Shepherd Coverage Tracking

**Description:** Lets Julian see which Over-Shepherd is covering which Shepherd, *for Julian's view only*. The surface is `/admin/shepherd-care/over-shepherds`. Over-Shepherds are not authenticated users in v1 (see §2.2). Julian's mixed/couples groups have no Over-Shepherd because Julian fills that role directly. Realizes UJ-1 (filtering the dashboard by Over-Shepherd).

**Functional Requirements:**

#### FR-6: Assign and unassign Over-Shepherd coverage

Julian can assign any Shepherd to an Over-Shepherd or set "Julian direct." Assignments live in `shepherd_assignments`.

**Consequences (testable):**
- An assign / unassign call writes an `audit_events` row in the same transaction.
- The shepherd care directory exposes a "filter by Over-Shepherd" or "group by Over-Shepherd" affordance.
- Setting "Julian direct" is a real assignment value, not a null.

#### FR-7: Show Over-Shepherd coverage in the directory

The directory at `/admin/shepherd-care` shows each Shepherd's Over-Shepherd inline and supports grouping or filtering by it.

**Consequences (testable):**
- A Shepherd with no assignment renders as "Unassigned" (not blank).
- The Over-Shepherd grouping respects the same column-allowlist read model as the rest of the directory.

**Notes:** `[NON-GOAL for v1]` Over-Shepherd login, dashboard, or any read access to Care Notes. Revisit only on Julian's explicit request with privacy review.

---

### 4.3 Launch Planning

**Description:** Answers "do I need to launch more groups before August?" The surface is `/admin/launch-planning`. Julian enters Launch Planning Assumptions; the system computes current capacity from real group data and surfaces Capacity Gap, recommended new groups, leader need, and a suggested launch timeline. Assumptions persist across sessions. Realizes UJ-3.

**Functional Requirements:**

#### FR-8: Enter and persist Launch Planning Assumptions

Julian can enter current church attendance, expected growth, target group participation %, average group size, launch buffer %, and planning window/date. Saving persists the assumptions and writes an `audit_events` row.

**Consequences (testable):**
- Saving updates the persisted assumption blob and writes one `audit_events` row per save.
- Reloading the page recovers the last-saved assumptions.
- Adjusting one input recomputes outputs without a full page reload.

#### FR-9: Compute capacity, demand, gap, recommendation

The page computes — from current group data and saved assumptions — current capacity, projected demand, Capacity Gap, recommended new-group count, leader need, and a suggested launch timeline.

**Consequences (testable):**
- Calculations live in pure helpers in `lib/admin/launch-planning.ts` and are unit-tested independent of the database.
- A change to `default_group_capacity` (default 12) in settings updates the computed current capacity.

#### FR-10: Seasonality quick-fills

The growth-date field has quick-fill buttons for "Next August" and "Next January" — Julian's two named launch windows. Realizes UJ-3.

**Consequences (testable):**
- "Next August" resolves to the next 1 August relative to today.
- "Next January" resolves to the next 1 January relative to today.
- Quick-fills overwrite the date field's current value.

#### FR-11: Church-attendance time series

Church attendance is captured as a dated time series in `church_attendance_snapshots` (not just the latest value). The launch-planning page surfaces "% of the church in a group" — Julian's preferred metric.

**Consequences (testable):**
- Each snapshot save writes an `audit_events` row.
- The "% in a group" figure uses the most recent snapshot's `attendance` value as denominator and the live group-membership count as numerator.
- Historical snapshots are preserved (no in-place update of the latest row).

#### FR-12: Forecast Scenarios

Julian can create named Forecast Scenarios ("Conservative," "Expected," "Stretch"), edit each, compare them side by side, and mark one as current. Each scenario carries its own Launch Planning Assumptions.

**Consequences (testable):**
- Creating, editing, or marking-current writes one audit row per action.
- The compare view shows Capacity Gap and recommended-launch counts for each scenario.
- Exactly one scenario is marked current at any time (writing "current" to another scenario clears the previous current in the same transaction).

**Feature-specific NFRs:**
- All assumption changes are audited.
- `church_attendance_snapshots` is treated as admin-sensitive: column-allowlist read model; no leader read.

**Notes:** `[NOTE FOR PM]` Julian still has no reliable method to capture church attendance (per his answer 9). Manual entry is correct for v1 — automating it is OQ-5.

---

### 4.4 Multiplication Pipeline

**Description:** Tracks named Multiplication Candidate groups with `target_year`, audience, life stage, and Readiness Signals. The surface is `/admin/launch-planning` (a tab/section), grouped by audience × life stage. Replaces (or feeds) Julian's Google Doc multiplication plan. Realizes UJ-4.

`[ASSUMPTION: A1]` The app is the system of record for Multiplication Candidates going forward; the Google Doc becomes historical. Julian has not explicitly endorsed this — engineering made the call (see FEEDBACK_MAP.md §4.3). **OQ-2.**

**Functional Requirements:**

#### FR-13: Maintain a Multiplication Candidate row per candidate group

Julian can mark any Life Group as a Multiplication Candidate, assign a `target_year` (e.g., 2026, 2027), and record Readiness Signal values.

**Consequences (testable):**
- Creating, editing, or removing a candidate writes one audit row per action.
- A candidate inherits the source group's `audience_category` and `life_stage` for grouping.

#### FR-14: Readiness rubric

Each candidate displays the five Readiness Signals: member count (≥12), years meeting (≥3), co-shepherd tenure (≥1 year), shepherd willingness, documented need for a similar group. Candidates that do not meet all five are flagged but not hidden.

**Consequences (testable):**
- The rubric values are computed from existing group data where possible (member count, years meeting); shepherd willingness and "documented need" are admin-entered.
- A candidate failing one signal renders with a visual flag distinct from "fully ready."

#### FR-15: Group by audience × life stage

The pipeline view groups candidates by `audience_category` (men / women / mixed) × `life_stage`. This lets Julian answer "do I need more men's groups or more women's groups?" Realizes UJ-4.

**Consequences (testable):**
- Empty (audience × life-stage) cells render as "no candidates" rather than collapsing.
- Filtering by audience or life stage narrows the visible candidates without losing the group-by structure.

**Feature-specific NFRs:**
- Audited writes, admin-only access (same as §4.1, §4.3).

**Notes:** `[ASSUMPTION: A2]` The "documented need for a similar group" signal is admin-entered free text or a boolean. Julian has not specified how it is captured.

---

### 4.5 Invite User (Super-Admin)

**Description:** Lets `super_admin` (Tom) invite real users and link Supabase Auth to `profiles` rows without manual SQL. Surface: `/admin/super-admin` invite form. Server action calls a Supabase Edge Function that holds the *only* service-role key in the system. Realizes UJ-5.

**Functional Requirements:**

#### FR-16: Invite a `ministry_admin` (Julian)

Tom enters Julian's email + role `ministry_admin`. The Edge Function creates the auth user, links a `profiles` row by `auth_user_id`, and writes an audit row.

**Consequences (testable):**
- The invite flow is end-to-end against a real Supabase project (manual verification per `SUPER_ADMIN_INVITE_USER_WORKFLOW.md`).
- The audit event for the invite is visible in `/admin/super-admin`.

#### FR-17: Invite a `leader` (real Shepherd)

Same flow, role `leader`. Used for onboarding real Shepherds once Julian asks for it.

**Consequences (testable):**
- A `leader` invite cannot escalate to `ministry_admin` or `super_admin` — role is the form's input, not the user's.
- Inviting an email already mapped to a `profiles` row surfaces a clear error rather than silently linking.

**Feature-specific NFRs:**
- Service role lives **only** in the Edge Function; never in the Next runtime.
- Audit row written for every invite.

**Notes:** `[NON-GOAL for v1]` Invited-status lifecycle / resend affordance, delivery webhooks, public signup, `super_admin` assignment via this flow, `staff_viewer` assignment.

---

### 4.6 Group Segmentation & Capacity Posture

**Description:** Every Life Group has an `audience_category` (men / women / mixed), a `life_stage`, a `launched_on` date, a `capacity` (default 12), and an `allow_over_capacity` boolean (Julian's "leaders may keep it open" exception per answer 10). These attributes feed Launch Planning (§4.3) and the Multiplication Pipeline (§4.4). Editable in the existing admin groups directory.

**Functional Requirements:**

#### FR-18: Set audience, life stage, launch date per group

Julian can set/edit each group's `audience_category`, `life_stage`, and `launched_on`. Each edit is audited.

**Consequences (testable):**
- Enum values are constrained at the database level (CHECK / enum type) and in `types/enums.ts`.
- A nullable value is allowed for newly-imported groups; admin UI flags it.

#### FR-19: Capacity = 12 with opt-to-stay-open

`default_group_capacity` is 12. Per-group `allow_over_capacity` is a boolean; when true, the group is *not* counted against "needs additional capacity" math even when membership ≥ capacity.

**Consequences (testable):**
- A group with `members = 13` and `allow_over_capacity = false` contributes 1 to the over-capacity count on the admin dashboard.
- A group with `members = 13` and `allow_over_capacity = true` does not.

---

### 4.7 Group Health Grade *(NOT in v1 — discovery only)*

**Description:** Julian wants to "grade" Life Group Health on a rubric he is still designing (his answer 12). The candidate dimensions are Attendance Consistency (derivable from existing `attendance_records`), Spiritual Growth (no data source today), Leader Health/Support Need (from existing `group_health_updates.pulse`), and possibly others. Distinct from `groups.health_status` (the latest pulse), which already exists. The discovery is captured in `docs/GROUP_HEALTH_RUBRIC_DISCOVERY.md`.

**This feature is `[BLOCKED on Julian]` until OQ-3 is resolved.** Building a scoring model before Julian's rubric is settled would bake in the wrong assumptions. The thin schema sketch in the discovery doc (a `group_health_assessments` table) is a sketch, not a commitment.

**Functional Requirements:** None in v1. When unblocked, FRs will be added here.

---

### 4.8 Leader Self-Update of Care Status *(NOT in v1 — deferred)*

**Description:** Julian (answer 7) wants Shepherds to update their own care status eventually, with **broad notes only** for simplicity and confidentiality. This widens who can write to care-adjacent data and requires a privacy review before any work. Deferred to LDR.1.

**Functional Requirements:** None in v1. `[BLOCKED on Julian go-ahead + privacy review]`.

---

### 4.9 Communications Director Surface *(NOT in v1 — deferred)*

**Description:** Julian (early review) said he may want to "loop our communications director in too if there's something that becomes more external." Requires a joint scope conversation between Julian and the comms director to define the internal-to-external boundary, and a threat model before any work. Deferred to EXT.1.

**Functional Requirements:** None in v1. `[BLOCKED on Julian + comms-director scope conversation]`.

## 5. Non-Goals (Explicit)

- **Not a leader-engagement product.** This is Julian's admin OS first. Shepherd-facing features land only when they remove friction from Julian's loop (e.g., the existing check-in form) or when Julian explicitly asks.
- **Not a public-facing surface.** No public signup, no public guest forms, no marketing site.
- **Not a comms / SMS / email automation tool.** No outbound automation in v1. Reminders, nudges, and digest emails are deferred. Auth recovery email is the only exception.
- **Not a CMS-integration platform.** No automated sync from a church management system (Planning Center, Breeze, etc.) in v1. Church attendance is manual.
- **Not a member-of-the-public account system.** Members do not sign in. The `member` enum value is not an app login role.
- **Not over-shepherd-facing.** Over-Shepherds are tracked, not authenticated.
- **No hard deletes** in any normal workflow. Soft-deactivate via the per-table sentinel; the only exceptions (`leader_submit_group_checkin`-driven cleanup) are intentional and preserved (see project-context.md).
- **Not regenerated types.** `types/database.ts` is hand-edited per migration; the Supabase type generator is banned (project-context.md rule).

## 6. MVP Scope

### 6.1 In Scope

- §4.1 Shepherd Care Tracker (Care Profiles, Care Interactions, Care Follow-Ups, Stale Contact triage, configurable threshold). **Shipped.**
- §4.2 Over-Shepherd Coverage (tracking + directory grouping; no login). **Shipped.**
- §4.3 Launch Planning (assumptions, capacity math, seasonality quick-fills, church-attendance time series, Forecast Scenarios). **Shipped.**
- §4.4 Multiplication Pipeline (named candidates with target year, readiness rubric, audience × life-stage grouping). **Shipped — scope confirmation pending Julian (OQ-2).**
- §4.5 Invite User end-to-end. **Shipped; verify against `SUPER_ADMIN_INVITE_USER_WORKFLOW.md` and walk Julian through.**
- §4.6 Group Segmentation & Capacity Posture (audience / life-stage / launched-on / capacity / allow-over-capacity). **Shipped.**
- Existing leader check-in surface (`/leader/[groupId]/checkin`) — kept as-is. No new leader features in v1.

### 6.2 Out of Scope for MVP

- §4.7 Group Health Grade — `[NOTE FOR PM]` This is emotionally load-bearing for Julian (answer 12). Revisit *the moment* Julian sends rubric dimensions. OQ-3.
- §4.8 Leader Self-Update of Care Status — deferred (LDR.1); needs privacy review.
- §4.9 Communications Director Surface — deferred (EXT.1); needs scope conversation.
- Over-Shepherd login / dashboard / read access to Care Notes — deferred indefinitely; no current ask.
- Public guest forms, SMS/email automation, exports, AI summaries — deferred (EXT.1 bucket).
- Reliability / security debt items in PRODUCT_ROADMAP.md Appendix A (baseline observability, `getCurrentSession()` hardening, broader test coverage, `select("*")` constraint). These run in parallel and are *not* this PRD's scope.

## 7. Success Metrics

**Primary**

- **SM-1: Julian opens the app at least once a week for 8 consecutive weeks.** Measured from auth session timestamps on Julian's account. Validates the whole product. If Julian stops opening it, no other metric matters.
- **SM-2: Julian logs at least one Care Interaction per week for 8 consecutive weeks.** Measured from `shepherd_care_interactions` rows attributed to Julian. Validates FR-2 specifically and §4.1 broadly — proves the dashboard replaced the spreadsheet rather than added to it.
- **SM-3: Julian saves Launch Planning Assumptions at least once per quarter.** Validates §4.3 — proves the launch planning page is consulted at real decision points, not just demo'd.

**Secondary**

- **SM-4: Julian marks at least one Multiplication Candidate's `target_year` per quarter.** Validates §4.4. If Julian never touches the pipeline, the build-vs-Google-Doc scope call (OQ-2) was wrong.
- **SM-5: The Stale Contact bucket on the care dashboard is non-empty within 4 weeks of go-live.** Validates FR-4 against real data — the threshold is set somewhere meaningful, the data is seeded.

**Counter-metrics (do not optimize)**

- **SM-C1: Number of Care Interactions per Shepherd per week.** Should *not* be optimized. Julian explicitly described ad-hoc, conversation-driven cadence (answer 3); pushing high-frequency contact would distort his pastoral judgment. Counterbalances SM-2 — we want consistent engagement, not max throughput.
- **SM-C2: Number of leader-facing features shipped.** Should *not* be optimized. The roadmap pivot is explicitly "Julian's admin OS, not more leader features" (PRODUCT_ROADMAP.md §2). Counterbalances the natural temptation to ship visible UI for the larger user pool.

## 8. Open Questions

| ID | Question | Owner | Status |
|---|---|---|---|
| **OQ-1** | What value of `shepherd_care_stale_days` does Julian actually want? Knob defaults to 60. | Julian | Knob shipped; value awaiting Julian |
| **OQ-2** | Is the in-app Multiplication Pipeline the system of record, or does the Google Doc stay canonical with the app only consuming aggregates? Engineering chose "app as system of record" by default. | Julian | Needs explicit confirmation |
| **OQ-3** | What dimensions, weights, and output shape (letter / 1–5 / status bucket) make up the Group Health Grade rubric? | Julian | Blocks §4.7 entirely; discovery doc captures the 5 sub-questions |
| **OQ-4** | When does something cross from internal to external (the trigger for looping in the communications director)? What scope does the comms director get? | Julian + comms director | Blocks §4.9; needs scope conversation, then threat model |
| **OQ-5** | What is the source of truth for church attendance? Manual is fine for v1 but is a known data-quality gap. | Julian / Worship team | Out of scope for v1; revisit when manual-entry friction shows in usage |
| **OQ-6** | Should Shepherds eventually self-update their care status? If yes, with what scope of "broad notes"? | Julian | Blocks §4.8; needs privacy review before any build |
| **OQ-7** | The original questions Tom asked Julian via text — Q6 and Q8 — are not in the email record. The corresponding answers ("Maybe both!" and "Yes, that would be helpful.") are unmoored. | Tom / Julian | Reconstruct or drop |
| **OQ-8** | What is the 2026-vs-2027 multiplication split per named candidate? The source `LG_MULTIPLICATION_PLAN_2026.md` does not pin it down. | Julian | Knob exists per candidate (`target_year`); values awaiting Julian |

## 9. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Julian never actually uses the shipped surface; product is built on a guess of his needs. | Medium | Critical | Block all new feature work after the current branch merges; sequence: merge → invite Julian → usability session on his real list → re-plan from his feedback. |
| The Multiplication Pipeline (§4.4) is over-build — Julian prefers the Google Doc. | Medium | Medium | OQ-2. Acceptable cost-of-build; reversible (soft-deactivate the pipeline UI; data stays for forensics). |
| Care Notes leak to a non-admin role through a future change (mis-scoped RPC, widened read model, removed RLS check). | Low | Critical | Defense in depth: RLS denies leader/co-leader reads at the row level; `lib/supabase/read-models.ts` column allowlists deny at the column level; `mapRpcError` discipline keeps Postgres errors from leaking schema; reviewer-checked audit-in-txn rule. |
| `staff_viewer` regression: a future migration grants this role broader access than its app-denied stance implies. | Low | High | project-context.md flags that `staff_viewer` is *not* RLS-denied even though it is app-denied; mitigation lives in code-review discipline + the eventual migration to drop the grant. |
| Julian's group-health rubric (OQ-3) lands but is incompatible with the candidate schema in `GROUP_HEALTH_RUBRIC_DISCOVERY.md`. | Medium | Low | The discovery doc is a sketch, not a commitment; rebuild the schema once Julian decides. |
| Email delivery for invite (FR-16/17) is unreliable in real-world Supabase Auth setup. | Low | High | Verify against a real Supabase project before declaring INV.1 done. No fallback in v1; manual SQL is the escape hatch (super_admin only). |

## 10. Assumptions Index

Every `[ASSUMPTION]` from the document, surfaced for explicit confirmation:

- **A1 (§4.4 intro):** The app is the system of record for Multiplication Candidates going forward; the Google Doc becomes historical. Julian has not endorsed this — engineering made the call. (Same as OQ-2.)
- **A2 (FR-14):** The "documented need for a similar group" Readiness Signal is admin-entered free text or a boolean. Julian has not specified the shape.

## 11. Source Materials & Provenance

This PRD draws on the following inputs. The PRD supersedes them as the canonical product spec; they remain the source of truth for *provenance* (what Julian actually said) and *implementation detail* (the per-area plans).

| Source | Role |
|---|---|
| `docs/julian-inputs/SYSTEMS_CONVERSATION.md` | Julian's verbatim 12 answers, 2026-05-27. The empirical basis for the whole PRD. |
| `docs/julian-inputs/MIN_CARE_LIST_TEMPLATE.md` | The 7 columns of Julian's informal "caring" spreadsheet → §4.1 schema. |
| `docs/julian-inputs/LG_MULTIPLICATION_PLAN_2026.md` | Julian's named multiplication-plan document → §4.4. |
| `docs/julian-inputs/FEEDBACK_MAP.md` | Synthesis of the above against the prior roadmap; the answers-vs-open-questions matrix this PRD inherits. |
| `docs/PRODUCT_ROADMAP.md` | The prior roadmap (now superseded for forward planning; remains an execution log of shipped phases SC.1A / SC.2 / SC.3 / LP.1 / LP.2). |
| `docs/SHEPHERD_CARE_TRACKER_PLAN.md` | The per-area implementation plan for §4.1, including the A2 (profiles + interactions) model decision. |
| `docs/LAUNCH_PLANNING_PLAN.md` | The per-area implementation plan for §4.3. |
| `docs/GROUP_HEALTH_RUBRIC_DISCOVERY.md` | The discovery doc that holds §4.7 open pending Julian's rubric. |
| `_bmad-output/project-context.md` | The security / privacy / type-system invariants every feature inherits. Not restated in the PRD. |

## 12. Definition of Done (per feature, inherits from project-context.md)

A feature in this PRD is not done until:

- [ ] `npm run typecheck && npm run test:run && npm run lint` all green.
- [ ] Every new server action calls `startActionLog("domain.area.verb")` at entry and `ctx.finish(outcome)` on every return branch.
- [ ] `mapRpcError` updated for every new `RAISE` token, with one test per token.
- [ ] Every new write RPC has a paired `audit_events` insert in the same transaction — reviewer-verified against the migration SQL.
- [ ] `types/database.ts` hand-edited for any new column / RPC / changed signature.
- [ ] No new `as never` outside `lib/**/rpc.ts`.
- [ ] `revalidatePath(...)` asserted in the action test for every mutating success branch.
- [ ] Read paths use column allowlists in `lib/supabase/read-models.ts`; no `select("*")` on sensitive tables.
- [ ] Manual verification walkthrough run against staging for any feature affecting auth, RPC, or sensitive reads.

---

*End of PRD. Open questions OQ-1 through OQ-8 are the gating items for the next planning cycle. All other forward feature work should pause until Julian has actually used the v1 surface.*
