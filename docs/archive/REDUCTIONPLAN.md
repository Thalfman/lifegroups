# FVC Life Groups UI/UX Reduction Plan

## Goal

Simplify the app UI without removing important functionality.

The current app feels too complex because related workflows are split across too many top-level pages and tabs. The simplified structure should make the app easier for a first-time admin to understand, scan, and use.

Primary design principle:

> Organize around user jobs, not internal feature modules.

This plan is UI/UX only. It does not include Super Admin, permissions, security, backend behavior, production readiness, or testing tasks.

---

# 1. Proposed Main Navigation

Replace the current broad navigation with this simplified structure:

- Home
- Groups
- Care
- People
- Planning
- Settings

Super Admin is intentionally out of scope.

> Boundary note: "Out of scope" means unchanged, not removed. The existing Super Admin Console and its nav entry (`/admin/super-admin`, added only for `role === "super_admin"` in `adminNavGroups`, per ADR 0002) must stay exactly as-is. This six-item structure describes the normal-admin navigation and does not replace or hide the Super Admin entry for super-admin users.

---

# 2. Navigation Mapping

| Current Area          | Move To  | Reason                                                            |
| --------------------- | -------- | ----------------------------------------------------------------- |
| Dashboard             | Home     | Home should show what needs attention now.                        |
| Groups & lifecycle    | Groups   | Group setup, lifecycle, and status belong together.               |
| Group Health          | Groups   | Health is part of group status, not a separate top-level concept. |
| Leader Care           | Care     | Leader contact and care activity belong with follow-ups.          |
| Follow-ups            | Care     | Follow-ups are part of care work.                                 |
| People                | People   | Directory and person management belong together.                  |
| Leader Pipeline       | People   | Apprentices are people, not a separate planning area.             |
| Launch Planning       | Planning | Launches and capacity are future-facing planning work.            |
| Ministry Calendar     | Planning | Calendar is also future-facing planning work.                     |
| Settings & thresholds | Settings | Configuration should stay separate and quiet.                     |

---

# 3. Home

## Purpose

Home should answer:

> What needs my attention first?

Home should be a triage page, not a full reporting dashboard.

## Found

The Dashboard shows multiple metrics, cards, and actions with similar visual weight. It includes useful information, but the first-time user has to decide what matters most.

Generic action labels like `Open ->` make the page less clear.

## Actionable Changes

- Rename `Dashboard` to `Home`.
- Make Home focused on priority and next action.
- Remove generic `Open ->` links.
- Replace generic links with specific action labels.
- Visually rank the most urgent items first.
- Keep secondary metrics lower on the page.
- Use short reason text under priority items.

## Home Structure

| Section           | Content                                                                   | Primary Actions                                 |
| ----------------- | ------------------------------------------------------------------------- | ----------------------------------------------- |
| Needs Attention   | Leaders needing contact, groups needing health checks, overdue follow-ups | `View care`, `Review groups`, `Open follow-ups` |
| This Week         | Upcoming meetings, due follow-ups, launch milestones                      | `View planning`                                 |
| Ministry Snapshot | Active groups, people in groups, capacity, group health summary           | `View groups`                                   |
| Recent Activity   | Recent care notes, completed follow-ups, group updates                    | `View activity`                                 |

> Notes on Recent Activity:
>
> - There is no separate Activity page (no `/admin/activity` route exists). `View activity` should scroll to or expand Home's own Recent Activity section, or link to the relevant item's surface (group, follow-up). It is not a link to a new top-level area.
> - Recent Activity may show only metadata, links, and counts (for example "care logged for X", "follow-up completed"). It must not render private-note, admin-summary, or interaction-note bodies — those stay on the guarded `/admin/shepherd-care` surface and never leave it.

## Better Dashboard Action Labels

Replace vague labels with specific labels:

| Current   | Replace With          |
| --------- | --------------------- |
| `Open ->` | `Review group health` |
| `Open ->` | `Contact leaders`     |
| `Open ->` | `Open follow-ups`     |
| `Open ->` | `View launch plan`    |
| `Open ->` | `Review group setup`  |

---

# 4. Groups

## Purpose

Groups should be the source of truth for group setup, health, attendance, capacity, lifecycle, and group-related activity.

## Found

Group information is spread across multiple places:

- Groups
- Group Health
- Calendar
- Launch Planning
- Leader Care
- Follow-ups

This makes users work too hard to understand the real status of a group.

The app also uses combined labels like `Active Healthy`, which can hide whether the group is actually assessed, fully set up, or simply active.

## Actionable Changes

- Merge `Group Health` into `Groups`.
- Keep group setup, lifecycle, health, capacity, attendance, and group-related activity together.
- Make group cards easier to scan.
- Separate lifecycle, setup, health, and capacity into distinct UI labels.
- Avoid combined status labels like `Active Healthy`.

## Merge Into Groups

| Current Concept               | New Location             |
| ----------------------------- | ------------------------ |
| Group list                    | Groups                   |
| Group lifecycle               | Groups                   |
| Group setup gaps              | Groups                   |
| Group health                  | Groups                   |
| Health check editor           | Group detail             |
| Attendance/capacity           | Group detail             |
| Group-related follow-ups      | Group detail or Care     |
| Group-related calendar events | Group detail or Planning |

## Groups Tabs

Use these tabs:

- All Groups
- Needs Setup
- Needs Health Check
- Needs Attention
- Archived

## Groups Tab Definitions

| Tab                | Shows                                                                  |
| ------------------ | ---------------------------------------------------------------------- |
| All Groups         | Every active group by default, with filters available.                 |
| Needs Setup        | Groups missing leader, meeting details, capacity, or other setup info. |
| Needs Health Check | Groups that are not assessed or missing required ratings.              |
| Needs Attention    | Groups with health, capacity, follow-up, or care concerns.             |
| Archived           | Archived or inactive groups.                                           |

## Group Card Structure

Each group card should have separate visual zones:

| Zone     | Content                                  |
| -------- | ---------------------------------------- |
| Header   | Group name and lifecycle status          |
| Setup    | Leader assignment and setup completeness |
| Health   | Health status                            |
| Capacity | Current size vs capacity                 |
| Meeting  | Day, time, and location                  |
| Actions  | Primary action: `View group`             |

## Avoid Combined Status Labels

Avoid:

- `Active Healthy`

Use separated labels:

- Lifecycle: `Active`
- Health: `Not assessed`
- Setup: `Needs leader`
- Capacity: `Open`

## Recommended Group Status Labels

### Lifecycle

- Active
- Paused
- Archived

### Setup

- Setup complete
- Needs setup
- Needs leader
- Missing meeting details

### Health

- Not assessed
- No current concerns
- Needs attention

### Capacity

- Open
- Near full
- Full

## Group Detail Tabs

Inside a group detail page, use these tabs:

- Overview
- People
- Health
- Attendance
- Follow-ups
- Events

## Group Detail Tab Definitions

| Tab        | Contains                                                                            |
| ---------- | ----------------------------------------------------------------------------------- |
| Overview   | Summary, lifecycle, leader, meeting details, setup status, next recommended action. |
| People     | Leaders, co-leaders, members, apprentices connected to the group.                   |
| Health     | Health check status, ratings, missing ratings, health history.                      |
| Attendance | Attendance history, capacity, trends.                                               |
| Follow-ups | Follow-ups related to this group.                                                   |
| Events     | Group-related calendar events.                                                      |

> Boundary note: Attendance/health data comes from the check-in flow, which is currently frozen — `attendance_sessions` and `group_health_updates` stop receiving new data and `/admin/check-ins` stays behind the frozen-surface gate (ADR 0002, ADR 0009). Treat the `Attendance` tab as historical/read-only (or hidden) unless check-ins are re-enabled via the runtime flags described in ADR 0009, so admins are not shown stale or broken attendance trends as if live.

# 5. Care

## Purpose

Care should answer:

> Who needs attention?

Leader Care and Follow-ups should feel like one workflow.

## Found

`Leader Care` and `Follow-ups` are separate areas, but from a user perspective they both represent care work and next steps.

A user should not need to check multiple top-level pages to understand who needs attention.

## Actionable Changes

- Merge `Leader Care` and `Follow-ups` into one `Care` area.
- Organize Care by urgency and completion status.
- Make care actions explicit.
- Use clear action labels like `Log contact`, `Create follow-up`, and `Mark complete`.

> Boundary notes (this is navigation consolidation only, not a data or route merge):
>
> - "Care" is the user-facing nav label/area only. The existing `/admin/shepherd-care` route path and filenames stay frozen, per ADR `0008` — renaming touches RLS/RPC/audit-sensitive care code for no functional payoff. Any actual route migration needs its own ADR.
> - Care follow-ups stay on the dedicated shepherd-care tables (`shepherd_care_follow_ups`), kept separate from the leader-readable generic `follow_ups` table because care content is more sensitive and generic follow-ups have reachable leader read paths. Generic and care follow-ups may cross-link as counts/links only — generic surfaces must not read care-note content.

## Merge Into Care

| Current Concept      | New Location |
| -------------------- | ------------ |
| Leader Care          | Care         |
| Leader contact queue | Care         |
| Follow-ups           | Care         |
| Due follow-ups       | Care         |
| Care history         | Care         |
| Logged calls/notes   | Care         |
| Completed follow-ups | Care         |

## Care Tabs

Use these tabs:

- Needs Contact
- Follow-ups
- Due Soon
- Recent Care
- Completed

## Care Tab Definitions

| Tab           | Shows                                                                                                                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Needs Contact | Leaders / co-leaders who need outreach. (Care is per-leader per `docs/PRD.md`; do not pull members or other non-leader people into shepherd-care unless a separate member-care model is defined.) |
| Follow-ups    | Open follow-up tasks.                                                                                                                                                                             |
| Due Soon      | Follow-ups due soon or overdue.                                                                                                                                                                   |
| Recent Care   | Recently logged calls, notes, meetings, or care activity.                                                                                                                                         |
| Completed     | Completed follow-ups and finished care tasks.                                                                                                                                                     |

## Care Item Structure

Each care item should show:

| Field         | Example                           |
| ------------- | --------------------------------- |
| Person        | `Test Co-Leader`                  |
| Reason        | `No recent contact`               |
| Related group | `Anderson Life Group`             |
| Due date      | `Due today`                       |
| Owner         | `Assigned to Tom`                 |
| Action        | `Log contact` or `View follow-up` |

## Care Action Labels

Use explicit labels:

- Log contact
- Create follow-up
- View follow-up
- Mark complete
- Add note

Avoid vague labels:

- Open
- Manage
- Update

## Leader Detail Tabs

Inside a leader care profile, use these tabs:

- Overview
- Contact History
- Follow-ups
- Notes
- Group

## Leader Detail Tab Definitions

| Tab             | Contains                                                  |
| --------------- | --------------------------------------------------------- |
| Overview        | Leader summary, assigned group, care status, next action. |
| Contact History | Calls, notes, texts, meetings, and care touchpoints.      |
| Follow-ups      | Open and completed tasks for this leader.                 |
| Notes           | Longer pastoral/admin notes.                              |
| Group           | Link and summary for the leader’s group.                  |

> Boundary note: The `Notes` tab is ministry-admin / private-note-only. It must not surface private pastoral notes on over-shepherd or leader-facing care surfaces (for example `/over-shepherd/[profileId]`). Over-shepherds can never read private notes per `docs/adr/0002-oversight-ladder-and-leader-gating.md`. This consolidation is a UI layout change only and must preserve that existing boundary.

---

# 6. People

## Purpose

People should answer:

> Who is involved, and what is their relationship to groups?

Access and account details should stay secondary unless needed.

## Found

The People area includes directory, add-person, assignments, login/member distinctions, and role changes. Leader Pipeline exists separately, even though apprentices are people.

This makes the app feel more modular and technical than necessary.

## Actionable Changes

- Keep people-related work under `People`.
- Move `Leader Pipeline` into `People`.
- Rename `Leader Pipeline` to `Apprentices`.
- Make role and group relationship clearer in each person row.
- Keep access/login details secondary.

## Merge Into People

| Current Concept      | New Location |
| -------------------- | ------------ |
| Directory            | People       |
| Add person           | People       |
| Assignments          | People       |
| Leader Pipeline      | People       |
| Apprentices          | People       |
| Login/member filters | People       |

## People Tabs

Use these tabs:

- Directory
- Leaders
- Members
- Apprentices
- Add Person

## People Tab Definitions

| Tab         | Shows                             |
| ----------- | --------------------------------- |
| Directory   | Everyone.                         |
| Leaders     | Current leaders and co-leaders.   |
| Members     | Group members.                    |
| Apprentices | Leader pipeline / future leaders. |
| Add Person  | Add a new person.                 |

## Rename Leader Pipeline

Rename:

- `Leader Pipeline`

To:

- `Apprentices`

Reason:

`Apprentices` is simpler, more human, and fits inside People.

> Integration note: Surfacing apprentices under People is a navigation/entry-point change only. The leader-pipeline data must remain wired into the Planning workspace's capacity and multiplication flow (see `docs/plans/CAPACITY_AND_MULTIPLICATION_PRD.md`; the `/admin/launch-planning` page uses the pipeline as staffing supply). Planning must still answer whether upcoming launches have enough ready leaders — moving the People-facing view must not sever that staffing/supply integration.

## Person Row/Card Structure

Each person row should show:

| Field                  | Example                                  |
| ---------------------- | ---------------------------------------- |
| Name                   | `Test Co-Leader`                         |
| Role                   | `Leader` or `Member`                     |
| Group                  | `Anderson Life Group`                    |
| Status                 | `Active`                                 |
| Contact/Care indicator | `Needs contact` or `No current concerns` |
| Action                 | `View person`                            |

## Person Detail Tabs

Inside a person detail page, use these tabs:

- Overview
- Group
- Care
- Activity
- Access

## Person Detail Tab Definitions

| Tab      | Contains                                                     |
| -------- | ------------------------------------------------------------ |
| Overview | Name, role, status, contact info.                            |
| Group    | Current group assignment and group role.                     |
| Care     | Related care history and follow-ups.                         |
| Activity | Recent group/admin activity.                                 |
| Access   | Login and role details, shown only to users with permission. |

> Boundary note: The `Access` tab applies only to app-login (auth-backed) profiles. Members are non-login participant records and never sign in, so member detail pages must not show an `Access` tab or offer any account or role-management affordances. Keep this restriction even though the `Person Detail` layout is shared across the People area.

> Boundary note: The `Care` tab is for leader / co-leader profiles. The care model is per-leader (one care row/status per leader, per `docs/PRD.md`), and members are separate participant records. Make the `Care` tab conditional on leader/co-leader profiles, or define a distinct member-care model first — do not show leader shepherd-care history on member detail pages, which would either expand shepherd-care scope to members or produce empty/broken member care pages.

---

# 7. Planning

## Purpose

Planning should answer:

> What is coming next?

Calendar, launches, capacity, and scenarios belong together.

## Found

Launch Planning and Ministry Calendar are separate top-level areas, but they are both future-facing workflows.

Launch Planning also contains multiple planning concepts that can feel heavy as a standalone module.

## Actionable Changes

- Combine `Launch Planning` and `Ministry Calendar` into `Planning`.
- Use simpler planning labels.
- Make Calendar and Launches feel like related future-facing work.
- Make list-style upcoming events more prominent than dense calendar scanning.

## Merge Into Planning

| Current Concept      | New Location |
| -------------------- | ------------ |
| Launch Planning      | Planning     |
| Ministry Calendar    | Planning     |
| Forecast             | Planning     |
| Scenarios            | Planning     |
| Capacity planning    | Planning     |
| Group multiplication | Planning     |

## Planning Tabs

Use these tabs:

- Calendar
- Launches
- Capacity
- Scenarios
- Multiplication

## Planning Tab Definitions

| Tab            | Shows                                     |
| -------------- | ----------------------------------------- |
| Calendar       | Upcoming ministry and group events.       |
| Launches       | Upcoming group launches and launch plans. |
| Capacity       | Current and forecasted group capacity.    |
| Scenarios      | What-if planning.                         |
| Multiplication | Group multiplication planning.            |

## Rename Launch Planning Tabs

| Current Tab               | New Tab        |
| ------------------------- | -------------- |
| Overview                  | Launches       |
| Forecast                  | Capacity       |
| Scenarios                 | Scenarios      |
| Groups and multiplication | Multiplication |

## Calendar UI Direction

The Calendar should prioritize scanability:

- Make upcoming events easier to see than the full month grid.
- Keep month view available.
- Make list view prominent.
- Use clear event type colors.
- Avoid overcrowded day cells.

---

# 8. Settings

## Purpose

Settings should stay separate from daily operational work.

## Found

Settings and thresholds are necessary, but they should not compete with daily workflows like Groups, Care, People, and Planning.

## Actionable Changes

- Keep Settings as a quiet secondary area.
- Keep configuration separate from operational work.
- Group settings into simple, predictable tabs.

## Settings Tabs

Use these tabs:

- General
- Thresholds
- Notifications
- Imports

## Settings Tab Definitions

| Tab           | Shows                                                  |
| ------------- | ------------------------------------------------------ |
| General       | Basic ministry/app defaults.                           |
| Thresholds    | Care stale days, capacity warnings, health thresholds. |
| Notifications | Reminder/email preferences, if present later.          |
| Imports       | Import tools, only if normal admins need them.         |

> Boundary note: Bulk people import is currently a security-critical write path gated by `requireSuperAdminSession()` in the Super Admin Console. This `Imports` tab is a navigation/discoverability idea only and must not move imports out from behind Super Admin. Imports remain super-admin-only unless a separate, explicit authorization decision changes that boundary.

---

# 9. Final Simplified Structure

## Home

- Needs Attention
- This Week
- Ministry Snapshot
- Recent Activity

## Groups

- All Groups
- Needs Setup
- Needs Health Check
- Needs Attention
- Archived

## Group Detail

- Overview
- People
- Health
- Attendance
- Follow-ups
- Events

## Care

- Needs Contact
- Follow-ups
- Due Soon
- Recent Care
- Completed

## Leader Detail

- Overview
- Contact History
- Follow-ups
- Notes
- Group

## People

- Directory
- Leaders
- Members
- Apprentices
- Add Person

## Person Detail

- Overview
- Group
- Care
- Activity
- Access

## Planning

- Calendar
- Launches
- Capacity
- Scenarios
- Multiplication

## Settings

- General
- Thresholds
- Notifications
- Imports

---

# 10. Highest-Impact Simplification Changes

## Priority 1: Merge Group Health Into Groups

Found:

Groups and Group Health feel like separate places to understand the same thing.

Actionable change:

Make Groups the source of truth for setup, health, attendance, and capacity.

Impact:

Users no longer need to check multiple pages to understand group status.

---

## Priority 2: Merge Leader Care and Follow-Ups Into Care

Found:

Leader Care and Follow-ups both answer “who needs attention?” but are separate.

Actionable change:

Create one Care area with Needs Contact, Follow-ups, Due Soon, Recent Care, and Completed tabs.

Impact:

Users can manage care work from one place.

---

## Priority 3: Make Home a Triage Page

Found:

The dashboard shows many metrics and actions with similar visual weight.

Actionable change:

Organize Home around Needs Attention, This Week, Ministry Snapshot, and Recent Activity.

Impact:

Users immediately know what to do first.

---

## Priority 4: Move Leader Pipeline Into People

Found:

Leader Pipeline feels like another module, even though it is about people.

Actionable change:

Rename Leader Pipeline to Apprentices and place it under People.

Impact:

The app feels more human and easier to understand.

---

## Priority 5: Combine Calendar and Launch Planning Into Planning

Found:

Calendar and Launch Planning are separate future-facing workflows.

Actionable change:

Create one Planning area with Calendar, Launches, Capacity, Scenarios, and Multiplication.

Impact:

Users have one place to understand what is coming next.

---

# 11. Status Label Simplification

## Found

Some labels combine multiple meanings, such as:

- `Active Healthy`

This can hide whether the group is actually assessed, fully set up, or simply active.

## Actionable Change

Use separate status categories.

### Lifecycle

- Active
- Paused
- Archived

### Setup

- Setup complete
- Needs setup
- Needs leader
- Missing meeting details

### Health

- Not assessed
- No current concerns
- Needs attention

### Capacity

- Open
- Near full
- Full

## Rule

Never combine lifecycle, health, setup, and capacity into one status chip.

Use separate labels so users can scan each meaning independently.

---

# 12. Copy Simplification Rules

## Found

Several UI actions use generic labels, especially `Open ->`.

Generic labels make users work harder because they have to infer where the action leads.

## Actionable Changes

| Avoid             | Use                      |
| ----------------- | ------------------------ |
| `Open ->`         | `Review group health`    |
| `Open`            | `View group`             |
| `Manage`          | `Edit group`             |
| `Update`          | `Save changes`           |
| `Leader Pipeline` | `Apprentices`            |
| `Group Health`    | `Health` inside Groups   |
| `Launch Planning` | `Planning` or `Launches` |

## Button Rules

- Use verbs that describe the outcome.
- Avoid generic buttons when the destination or result matters.
- Use `View` for navigation.
- Use `Save`, `Create`, `Log`, or `Mark complete` for state-changing actions.

---

# 13. What Not To Do

Do not solve the complexity by adding more dashboards, more filters, or more top-level pages.

Avoid:

- More navigation items
- More standalone modules
- More status chips without categories
- More equal-weight dashboard cards
- More generic Open buttons

The simplification should come from consolidation, clearer labels, and better grouping.

---

# 14. Bottom Line

The app feels complex because related workflows are split across too many top-level areas.

Simplify the app into:

- Home
- Groups
- Care
- People
- Planning
- Settings

Then consolidate the biggest overlaps:

- Group Health -> Groups
- Leader Care + Follow-ups -> Care
- Leader Pipeline -> People as Apprentices
- Launch Planning + Calendar -> Planning
- Dashboard -> Home triage

This keeps the functionality but makes the product easier to understand, easier to scan, and easier for a first-time admin to use confidently.
