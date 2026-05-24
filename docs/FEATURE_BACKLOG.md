# Feature Backlog

A broader inventory of features for the Life Group Operations Dashboard
after Julian's feedback pivot. The ordered execution plan lives in
[`PRODUCT_ROADMAP.md`](./PRODUCT_ROADMAP.md); this document is the wider
catalogue, including deferred and rejected items.

## 1. Feature backlog principles

- **Julian-first.** The next phase of work targets Julian's personal
  ministry-admin workflow, not leader tools.
- **Shepherd care and launch planning are the priority** for the next
  release cycle.
- Existing leader tools (`/leader`, weekly check-ins, follow-ups,
  calendar) stay supported, but they are not the focus of the next
  build.
- Over-shepherd and leader involvement are **future possibilities**, not
  MVP assumptions.
- External / comms features are deferred until the communications
  director is explicitly involved.
- Care notes are sensitive and **admin-only** in the MVP.
- Every feature must preserve the existing security posture:
  - RLS-first
  - Narrow `SECURITY DEFINER` RPC writes
  - `audit_events` row in the same transaction as every write
  - No service role in the Next runtime
  - No hard deletes in normal workflows

## 2. Feature categories

- **Current shipped** — present in the repo today.
- **Near-term planned** — committed in `PRODUCT_ROADMAP.md`.
- **Later optional** — possibilities Julian might want after the MVP.
- **Explicitly deferred** — not now, may return after scope discussion.
- **Explicitly rejected / not now** — actively excluded.

## 3. Current shipped features

Verified from repo inspection. Each item below has an implemented
`page.tsx` or backing module.

**Admin (`/admin/...`)**
- Admin dashboard (six summary tiles, attention queue, capacity buckets,
  weekly health buckets, setup gaps).
- People management (filterable directory; add / edit / deactivate
  leaders and members; leader role swap).
- Group management (filterable directory; create / edit / soft-close /
  reopen groups).
- Admin weekly check-in review (`/admin/check-ins` and
  `/admin/check-ins/[groupId]?week=...`).
- Guest pipeline (`/admin/guests`).
- Follow-ups workflow (`/admin/follow-ups`).
- Ministry-wide master calendar (`/admin/calendar`).
- Per-group calendar overrides
  (`/admin/groups/[groupId]/calendar`).
- Settings — metric defaults and per-group metric overrides
  (`/admin/settings`).
- Super admin console (`/admin/super-admin`) — audit log, role
  management, system status, test account management.
- **Super Admin Invite User** — server action, form, and Edge Function
  are all present. Workflow contract documented in
  [`SUPER_ADMIN_INVITE_USER_WORKFLOW.md`](./SUPER_ADMIN_INVITE_USER_WORKFLOW.md).
  Marked as "verify-and-polish" in INV.1 of the roadmap rather than as
  fully launched, until a real end-to-end verification is recorded.

**Leader (`/leader/...`)**
- Leader dashboard with assigned groups and open follow-ups.
- Leader group calendar (`/leader/[groupId]/calendar`).
- Leader weekly check-in submission
  (`/leader/[groupId]/checkin`).
- Leader follow-up status updates (`open → in_progress`,
  `open → done`, `in_progress → done`).

**Other**
- Test auth users tooling (super admin panel + CLI scripts in
  `supabase/dev/`).

## 4. Julian spine (shipped)

These items in `PRODUCT_ROADMAP.md` have shipped. The deep dives in §5
remain as feature-level reference (problem framing, scope, audit
events, open questions); the as-built specs live under
[`docs/archive/`](./archive/README.md).

- **INV.1** — Super Admin Invite User.
- **SC.1A** — Julian Shepherd Care Tracker MVP.
- **SC.2** — Over-Shepherd Coverage Tracking.
- **SC.3** — Julian Care Dashboard.
- **LP.1** — Capacity and Launch Planning MVP.
- **LP.2** — Forecast Scenarios.

Outstanding from the SC.* line: **SC.1B** — admin-only care follow-ups
(parallel to `follow_ups`); planned, not yet built.

## 5. Feature deep dives

### INV.1 — Super Admin Invite User

- **Problem.** Currently profiles must be linked to auth users manually.
  Julian himself needs an invite path to sign in as `ministry_admin`.
- **Primary user.** `super_admin`.
- **Secondary users.** The invitee (a future `ministry_admin`, `leader`,
  or `co_leader`).
- **Suggested route.** `/admin/super-admin` (existing).
- **Core UI pieces.** Invite form (exists), audit-log row rendering for
  invite events.
- **Data model needs.** No schema change. Uses `auth.users` (Supabase
  Auth) linked to `profiles.auth_user_id`.
- **RPC / write needs.** Edge Function `invite-user` (service role
  isolated); paired RPC on profile creation.
- **Audit events.** Invite issued, invite linked, role assignment.
- **Privacy / security notes.** Service role only inside the Edge
  Function; no service role in Next runtime.
- **MVP scope.** Invite `ministry_admin`, `leader`, `co_leader`.
- **Later enhancements.** Invited-status lifecycle, resend, delivery
  webhooks.
- **Open questions.** Does Julian want to be able to bulk-invite the 63
  shepherds, or one at a time?
- **Acceptance criteria.** Invite an account end-to-end, sign in, see
  audit row.

### SC.1 — Julian Shepherd Care Tracker MVP

- **Problem.** Julian's care work today lives in an informal Excel
  spreadsheet; he has no recency view, no overdue flagging, and no
  history.
- **Primary user.** Julian (`ministry_admin`).
- **Secondary users.** `super_admin` for support / ownership.
- **Suggested route.** `/admin/shepherd-care`.
- **Core UI pieces.** Directory of shepherds with care status; per-
  shepherd care profile drawer; interaction log; add-interaction form;
  needs-attention filter.
- **Data model needs.** `shepherd_care_profiles`,
  `shepherd_care_interactions`, optional `shepherd_care_follow_ups`.
- **RPC / write needs.** `admin_upsert_care_profile`,
  `admin_log_care_interaction`, `admin_set_next_touchpoint`, and
  follow-up-style RPCs if care-specific follow-ups are included.
- **Audit events.** `admin.care.upsert_profile`,
  `admin.care.log_interaction`, `admin.care.set_next_touchpoint`, etc.
- **Privacy / security notes.** Admin-only RLS; explicit column
  allowlists in read models; no leader-facing surface.
- **MVP scope.** Profile + interaction log + next touchpoint + needs-
  attention list.
- **Later enhancements.** Care follow-ups, smart cadence flags, AI
  summaries (only if Julian asks).
- **Open questions.** See the "Open questions" list in
  [`PRODUCT_ROADMAP.md`](./PRODUCT_ROADMAP.md) §2 — needs the
  current spreadsheet column list before final schema.
- **Acceptance criteria.** Julian can open a care profile, log an
  interaction, see last contact and next touchpoint, and see a needs-
  attention view.

### SC.2 — Over-Shepherd Coverage Tracking

- **Problem.** Julian needs to know which of the 3 over-shepherds is
  covering which of the 63 shepherds, and how full each over-shepherd's
  caseload is.
- **Primary user.** Julian.
- **Secondary users.** `super_admin`.
- **Suggested route.** Section inside `/admin/shepherd-care`.
- **Core UI pieces.** Assignment form, grouping/filter by over-shepherd
  in directory, coverage summary cards.
- **Data model needs.** `shepherd_assignments` linking over-shepherd
  profile → covered shepherd profile.
- **RPC / write needs.** `admin_assign_over_shepherd`,
  `admin_unassign_over_shepherd`.
- **Audit events.** Assignment, unassignment.
- **Privacy / security notes.** Admin-only. No over-shepherd login
  access in this phase.
- **MVP scope.** Assignment + directory grouping/filter only.
- **Later enhancements.** Optional over-shepherd dashboard if Julian
  explicitly asks.
- **Open questions.** Should over-shepherds appear in the role enum as a
  distinct value, or stay as a `ministry_admin` / `leader` with an
  attribute flag? (To resolve in the SC.2 implementation phase.)
- **Acceptance criteria.** Each shepherd can be assigned to an over-
  shepherd; directory groups or filters by coverage; assignments
  audited.

### SC.3 — Julian Care Dashboard

- **Problem.** Julian needs a triage view so he knows who to connect
  with this week without scrolling 63 rows.
- **Primary user.** Julian.
- **Secondary users.** `super_admin`.
- **Suggested route.** Dashboard surface within `/admin/shepherd-care`.
- **Core UI pieces.** Cards for stale contact, active concerns, recent
  connections, overdue touchpoints.
- **Data model needs.** None new (reads SC.1 + SC.2 tables).
- **RPC / write needs.** None.
- **Audit events.** None (read-only).
- **Privacy / security notes.** Same as SC.1.
- **MVP scope.** Four buckets, sort by recency and status.
- **Later enhancements.** Saved views, custom thresholds.
- **Open questions.** Default recency threshold? (See open questions
  in [`PRODUCT_ROADMAP.md`](./PRODUCT_ROADMAP.md) §2.)
- **Acceptance criteria.** Julian opens the page and immediately knows
  who needs attention this week.

### LP.1 — Capacity and Launch Planning MVP

- **Problem.** Julian needs to decide when to launch new groups based on
  expected attendance growth. Today this lives in his head.
- **Primary user.** Julian.
- **Secondary users.** `super_admin`.
- **Suggested route.** `/admin/launch-planning`.
- **Core UI pieces.** Assumptions form (church attendance, expected
  growth, target participation %, average group size, launch buffer,
  planning window); outputs panel (current capacity, projected demand,
  capacity gap, recommended new groups, leader need, suggested
  timeline, risk level OK / Watch / Launch Needed).
- **Data model needs.** Either `app_settings.launch_planning` JSON row
  (preferred for MVP) or a small `launch_planning_assumptions` table.
- **RPC / write needs.** `admin_update_launch_planning_assumptions`.
- **Audit events.** Assumption updates.
- **Privacy / security notes.** Admin-only. No service role. Standard
  RPC + audit pattern.
- **MVP scope.** Single assumption set + immediate computed outputs.
- **Later enhancements.** LP.2 scenarios.
- **Open questions.** Does demand model use attendance only, or factor
  in guests / placed members? (See `LAUNCH_PLANNING_PLAN.md`.)
- **Acceptance criteria.** Julian enters assumptions, sees outputs,
  values persist, audit row written.

### LP.2 — Forecast Scenarios

- **Problem.** Julian wants to compare conservative / expected / stretch
  forecasts side by side.
- **Primary user.** Julian.
- **Secondary users.** `super_admin`.
- **Suggested route.** Section within `/admin/launch-planning`.
- **Core UI pieces.** Scenario list, scenario editor, side-by-side
  comparison view, "mark current" affordance.
- **Data model needs.** `launch_planning_scenarios` table.
- **RPC / write needs.** Create / update / archive scenario; mark current.
- **Audit events.** Scenario CRUD and "mark current".
- **Privacy / security notes.** Same as LP.1.
- **MVP scope.** Two or three named scenarios + comparison + mark
  current.
- **Later enhancements.** Time-series forecasting, attendance ingestion.
- **Open questions.** Maximum number of scenarios? Default templates?
- **Acceptance criteria.** Create two scenarios, compare them, mark one
  as current.

## 6. Later optional features

Possibilities Julian may want after the MVP. None are committed.

- Over-shepherd login views.
- Leader-facing care-adjacent workflows (only if Julian explicitly asks).
- Leader mobile UX polish.
- Richer calendar UX (multi-event days, recurring templates, etc.).
- Reports and exports (admin-only).
- Communications director read-only views.
- Public guest intake forms.
- SMS / email reminders.
- Scenario planning enhancements (time-series, attendance ingestion).
- Mobile app wrapper.

## 7. Explicitly deferred features

- Public signup.
- Public guest forms.
- SMS / email automation.
- Prayer / care-sensitive leader-facing notes.
- External / comms features.
- Native mobile app.
- Google Calendar sync.
- Bulk exports.
- Advanced / configurable dashboard builder.
- AI summaries.

## 8. Explicitly rejected / not now

- Reviving Staff View.
- Leader access to Julian's care notes.
- Raw SQL console in the app.
- Broad admin delete tools (use soft-deactivation).
- Service role usage in the Next runtime.
- Public unauthenticated admin surfaces.
- Hard deletes in normal product workflows.

## 9. Priority table

| Priority | Feature | Primary user | Why now | Dependency | Risk | Status |
|---|---|---|---|---|---|---|
| P0 | INV.1 Super Admin Invite User | Super admin | Julian needs to sign in as `ministry_admin` | None | Low | Shipped |
| P0 | SC.1A Shepherd Care Tracker | Julian | Replace Excel caring spreadsheet | INV.1 | Med (privacy) | Shipped |
| P1 | SC.2 Over-Shepherd Coverage | Julian | Track which over-shepherd covers whom | SC.1A | Low | Shipped |
| P1 | LP.1 Launch Planning MVP | Julian | Anticipate August group launches | None | Low | Shipped |
| P2 | SC.3 Care Dashboard | Julian | Triage view across 63 shepherds | SC.1A | Low | Shipped |
| P2 | LP.2 Forecast Scenarios | Julian | Compare conservative / expected / stretch | LP.1 | Low | Shipped |
| P2 | SC.1B Care Follow-Ups | Julian | Admin-only task list parallel to `follow_ups` | SC.1A | Low | Planned |
| P3 | LDR.1 Optional Leader Tools | Leaders | Only if Julian asks | SC.1A + SC.2 shipped | Med (privacy) | Deferred |
| P3 | EXT.1 External / Comms | Comms dir. | Only after comms dir. involved | Separate review | High (privacy) | Deferred |

## 10. Next cutline

The Julian spine (INV.1, SC.1A, SC.2, SC.3, LP.1, LP.2) has shipped.
The next forward-looking work is:

1. SC.1B — admin-only care follow-ups (parallel to `follow_ups`).
2. Whatever Julian raises in his next sync (see open questions in
   [`PRODUCT_ROADMAP.md`](./PRODUCT_ROADMAP.md) §2).

Everything else in this document is either deferred until Julian asks
for it, or already shipped.

## 11. Relationship to PRODUCT_ROADMAP.md

- [`PRODUCT_ROADMAP.md`](./PRODUCT_ROADMAP.md) is the **ordered execution
  plan** — what we build next, in order, with acceptance criteria.
- This document (`FEATURE_BACKLOG.md`) is the **broader inventory** of
  possible product features, including ones we will not ship soon.
- If the roadmap and the backlog disagree on order or scope, the roadmap
  wins.
