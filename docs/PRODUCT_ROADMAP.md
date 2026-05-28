# Product Roadmap

## 1. Purpose

This is the **active product roadmap** for the Life Group Operations
Dashboard. It is the ordered execution plan; the broader inventory of
possible features (including deferred and rejected items) lives in
[`FEATURE_BACKLOG.md`](./FEATURE_BACKLOG.md). Historical phase specs and
verification logs are preserved under
[`docs/archive/`](./archive/README.md).

The current direction is **Julian's admin operating system** — shepherd
care + launch planning, not more leader-facing features. The rationale
is in §2 below.

## 2. Pivot rationale (Julian's feedback)

Julian reviewed an early version of the app in May 2026 and gave this
feedback (verbatim):

> I would try to focus on something specifically for myself rather than
> the leaders, but definitely want to be thinking of them too! I probably
> will want to loop our communications director in too if there's
> something that becomes more external as well.
>
> I really liked the follow up page! There's 63 Life or Co Life Shepherds
> and 3 over shepherds (like coaches), so I primarily am training the
> over shepherds to be serving their leaders, but I also work heavily
> with leaders too. So, I have an excel spreadsheet that is specific to
> "caring" for people, so like putting a note in of how a leader is
> doing, when I connected with them, etc. but it's a very informal
> spreadsheet lol. I would love more help creating a system to track
> that.
>
> Another thing that I'm hoping to create is something that helps me
> track and anticipate how many people are in a life group, the church,
> and when we need to launch groups.

**Population context.** ~63 Life / Co-Life Shepherds, 3 over-shepherds
sitting above them. Julian primarily trains the over-shepherds; he also
works directly with leaders.

**Product implications.**
- Build Julian's admin OS first; don't overbuild leader tools.
- Care notes are more sensitive than ordinary follow-ups. **Admin-only**
  in the MVP — no leader exposure.
- Over-shepherd is real, but the MVP tracks **coverage** for Julian, not
  over-shepherd login.
- Capacity planning is a first-class admin tool, not a dashboard tile.
- Communications director may be involved later — only when something
  becomes external / public / comms-related.

**Updated north star.** Julian's admin operating system for shepherding
and launch planning, backed by the existing security model (RLS-first,
narrow `SECURITY DEFINER` RPCs, audit events, no service role in Next
runtime, no hard deletes in normal workflows).

**Open questions for future Julian sync** (originally posed before SC
follow-on work). The **2026-05-27** materials Julian sent — captured
verbatim under [`julian-inputs/`](./julian-inputs/README.md) with a
question-by-question mapping in
[`julian-inputs/FEEDBACK_MAP.md`](./julian-inputs/FEEDBACK_MAP.md) — answer
most of them. Status per question:

- **Answered** — What fields does Julian's spreadsheet contain? Name,
  Issue, Date of first communication, Next step, Update of communication,
  Misc. note. Note/date-oriented, not task-heavy
  ([template](./julian-inputs/MIN_CARE_LIST_TEMPLATE.md)).
- **Partial** — "Doing well" vs. "needs attention"? No fixed rubric yet;
  Julian is "still working on an evaluation system" — signals are
  consistent attendance and spiritual growth.
- **Partial** — Care cadence? Ad hoc per leader ("broad breast strokes or
  specific concerns"), conversation-driven follow-up dates. No standing
  cadence.
- **Partial** — Should over-shepherds see assigned shepherds / notes /
  edit? Men's & women's groups have an over-shepherd; mixed/couples groups
  report to Julian directly. No request for over-shepherd **login** — the
  MVP coverage-only stance (SC.2) holds.
- **Partial (future scope)** — Should leaders see / update their own care
  status? Yes eventually, with **broad notes** for simplicity and
  confidentiality.
- **Answered** — Private pastoral content or out of the app? Keep notes
  **broad** and confidential. Confirms the admin-only design already
  shipped.
- **Answered** — Capacity demand model? Primary signal = people in groups
  (leader-updated); church attendance is the denominator (% in a group;
  ~60% now). Matches LP.1's manual-input model.
- **Open** — Auto-flag "haven't connected in N weeks"? Julian wants
  follow-up timing captured but named no threshold.
- **Open** — When to loop in the communications director? Not addressed.

See §6 for the **new product signals** these materials surfaced that the
current roadmap does not yet model.

## 3. Current app state

Verified from repo inspection on the branch this PR is opened against.

> **2026-05 surface audit.** The `/admin` dashboard was reoriented to
> lead with shepherd care + launch planning instead of weekly check-ins;
> the sidebar's "Shepherd" group became "Admin OS" and now leads with
> Shepherd care and Launch planning, Guests was removed from nav, and
> the `missing_check_in` attention priority moved from 20 → 65. See
> [`PRODUCT_SURFACE_AUDIT_2026-05.md`](./PRODUCT_SURFACE_AUDIT_2026-05.md)
> for the before/after, the rationale, and how to reverse it.

**Stack**
- Next.js (App Router, route groups) + TypeScript + Tailwind.
- Supabase (Auth + Postgres + RLS + Edge Functions).
- `@supabase/ssr` cookie-authenticated server client in protected routes.

**Security posture**
- **RLS-first.** Row Level Security policies govern reads; writes flow
  through narrow `SECURITY DEFINER` RPCs (`public.admin_*`,
  `public.leader_*`, `public.super_admin_*`).
- Every write RPC writes its matching `audit_events` row in the same
  transaction. If the audit insert fails, the data change rolls back.
- **No service role key in the Next runtime.** The service role is
  confined to Supabase Edge Functions (`invite-user`,
  `manage-test-auth-users`).
- **No hard deletes in normal product workflows.** Operational tables use
  soft-deactivation (`status`, `archived_at`, `ended_at`, `active`).
- Read-models in `lib/supabase/read-models.ts` use **explicit column
  allowlists** for sensitive surfaces (e.g. `LEADER_FOLLOW_UP_COLUMNS`
  omits `admin_private_note`); no `select("*")` on sensitive paths.

**Role model**
Five roles on `profiles.role` (`user_role` enum):
- `super_admin` — owner / operator.
- `ministry_admin` — Julian's role.
- `staff_viewer` — **deprecated.** Enum retained for compatibility; UI
  surface removed.
- `leader`, `co_leader` — scoped to assigned groups via active
  `group_leaders` rows.

`member` is **not** an app-login role. Members are non-auth participant
records in the `members` table linked to groups via `group_memberships`.
They never sign in. No public signup.

**Admin routes currently shipped** (`app/(protected)/admin/`)
- `/admin` — dashboard (six summary tiles, attention queue, capacity
  buckets, weekly health buckets, setup gaps; reads through
  `lib/admin/metrics.ts` helpers).
- `/admin/people` — filterable directory of leaders + members with role
  swap and deactivation.
- `/admin/groups` — filterable group directory with leader chips,
  capacity, and latest check-in status.
- `/admin/groups/[groupId]/calendar` — per-group calendar overrides.
- `/admin/check-ins` and `/admin/check-ins/[groupId]` — read-only weekly
  check-in review.
- `/admin/guests` — guest pipeline (`new` → `contacted` → `interested` →
  `assigned` → `attended` → `placed` → `not_now`).
- `/admin/follow-ups` — admin follow-up workflow.
- `/admin/calendar` — read-only ministry-wide master calendar.
- `/admin/settings` — metric defaults + per-group overrides.
- `/admin/super-admin` — super_admin-only console: audit log, role
  changes, **invite-user form**, test account management, system status.

**Leader routes currently shipped** (`app/(protected)/leader/`)
- `/leader` — leader dashboard with assigned groups + open follow-ups.
- `/leader/[groupId]/calendar` — leader calendar view.
- `/leader/[groupId]/checkin` — weekly check-in submission form.

**Deprecated**
- Staff View (`/staff`) — removed. `staff_viewer` enum value retained for
  backwards compatibility; profiles with this role are routed to
  `/unauthorized` until reassigned.

**Visual state**
- The current visual shell is the warm-pastoral system: Newsreader (display)
  + Geist (body) + JetBrains Mono fonts, OKLCH cream/sage/clay palette,
  232 px sidebar shell under `components/lg/shell/`, mobile drawer below
  768 px. This is what runs today.

**Invite User workflow**
- Implemented end-to-end in the repo: server action
  `app/(protected)/admin/super-admin/invite-user-actions.ts`, form
  `components/admin/forms/invite-user-form.tsx`, and Edge Function
  `supabase/functions/invite-user/`. The detailed workflow contract is
  documented in [`SUPER_ADMIN_INVITE_USER_WORKFLOW.md`](./SUPER_ADMIN_INVITE_USER_WORKFLOW.md).
- INV.1 below treats this as **verify-and-polish only** rather than
  greenfield work.

## 4. North-star links

- **Julian admin OS** — Shepherd care + launch planning, owned by this
  roadmap. Plans:
  [`SHEPHERD_CARE_TRACKER_PLAN.md`](./SHEPHERD_CARE_TRACKER_PLAN.md),
  [`LAUNCH_PLANNING_PLAN.md`](./LAUNCH_PLANNING_PLAN.md).
- **Full inventory of features** — [`FEATURE_BACKLOG.md`](./FEATURE_BACKLOG.md).
- **Invite user workflow contract** —
  [`SUPER_ADMIN_INVITE_USER_WORKFLOW.md`](./SUPER_ADMIN_INVITE_USER_WORKFLOW.md).
- **Reliability / security debt track** — appendix A below. Orthogonal
  to the product roadmap; runs in parallel.

## 5. Active roadmap

Execution order:
**INV.1 → SC.1 → SC.2 → SC.3 → LP.1 → LP.2 → LDR.1 → EXT.1.**

The Julian spine (SC.1A, SC.2, SC.3, LP.1, LP.2) has shipped; the as-
built specs are in [`docs/archive/`](./archive/README.md). The plans in
`SHEPHERD_CARE_TRACKER_PLAN.md` and `LAUNCH_PLANNING_PLAN.md` remain the
forward-looking reference for SC.1B/follow-ons and LDR.1 / EXT.1.

---

### INV.1 — Super Admin Invite User

**Purpose.** Let `super_admin` invite real users and link Supabase Auth to
`profiles` rows without manual SQL. The real Julian use case: invite Julian
as `ministry_admin` so he can sign in to his own admin OS.

**Status.** The repo already contains an end-to-end implementation
(`/admin/super-admin` form, server action, Edge Function). INV.1 is
**verify and polish only** in that case. If repo verification finds a gap,
build the gap in a separate implementation PR.

**Scope.**
- Verify against [`SUPER_ADMIN_INVITE_USER_WORKFLOW.md`](./SUPER_ADMIN_INVITE_USER_WORKFLOW.md).
- Invite `ministry_admin` (Julian) and `leader` (a real shepherd) end to
  end in a real Supabase project.
- Polish only — copy, validation, error tokens, audit event rendering.

**Out of scope.**
- Invited-status lifecycle / resend affordance unless already built.
- Delivery webhooks.
- Public signup.
- `super_admin` assignment via this flow.
- `staff_viewer` assignment.

**Likely files / routes.**
- `/admin/super-admin`
- `app/(protected)/admin/super-admin/invite-user-actions.ts`
- `components/admin/forms/invite-user-form.tsx`
- `supabase/functions/invite-user/index.ts`
- `docs/SUPER_ADMIN_INVITE_USER_WORKFLOW.md` (source of truth contract)

**Security / privacy.**
- Service role only inside the Edge Function.
- No service role in Next runtime.
- Every write audited.

**Acceptance criteria.**
- Inviting a `ministry_admin` works end-to-end (email arrives,
  profile + auth user link by `auth_user_id`, audit row visible).
- Inviting a `leader` works end-to-end.
- Audit event appears in `/admin/super-admin`.

**Manual verification.**
- Walk through `SUPER_ADMIN_INVITE_USER_WORKFLOW.md` against the live
  staging project. Tick the verification checklist there.

---

### SC.1 — Julian Shepherd Care Tracker MVP

**Purpose.** Replace Julian's informal Excel "caring" spreadsheet. Give
him an admin-only system to track per-shepherd care, last contact, next
touchpoint, and care status.

**Scope.**
- New route `/admin/shepherd-care`.
- Care profile per shepherd.
- Interaction log (append-only history of touchpoints).
- Last-contact + next-touchpoint fields.
- Care status per shepherd.
- Optional admin-only follow-up items for care work (separate from the
  existing leader-visible `follow_ups` table).

**Out of scope.**
- Leader access in the MVP.
- Co-leader access in the MVP.
- Over-shepherd login views in the MVP.
- Public access.
- SMS / email reminders.
- Exports.
- AI summaries.

**Likely files / tables / routes.**
- Route: `/admin/shepherd-care`.
- New tables: `shepherd_care_profiles`, `shepherd_care_interactions`,
  optionally `shepherd_care_follow_ups`.
- Read helpers added to `lib/supabase/read-models.ts` with explicit column
  allowlists.
- Admin RPCs (`admin_*`) with paired audit rows.

**Security / privacy.**
- `super_admin` and `ministry_admin` only.
- No leader-facing care notes.
- No `select("*")` read paths on care tables.
- All writes through `SECURITY DEFINER` RPCs with audit rows in the same
  transaction.

**Acceptance criteria.**
- Julian can open a shepherd's care profile from the directory.
- Julian can log an interaction (date, type, notes).
- Julian can see the last contact and the next touchpoint at a glance.
- A "needs attention" view surfaces shepherds who haven't been contacted
  recently or have overdue touchpoints.

**Manual verification.**
- Create a care profile for a seed shepherd.
- Add an interaction; confirm it appears in the log.
- Confirm the dashboard recency surface updates.
- Sign in as a `leader` and confirm `/admin/shepherd-care` is denied.
- Confirm `audit_events` row written for every care action.

---

### SC.2 — Over-Shepherd Coverage Tracking

**Purpose.** Help Julian track which over-shepherd / coach is covering
which shepherds. This is **for Julian's view**, not for over-shepherds to
sign in and use.

**Scope.**
- Track coverage assignments (over-shepherd ↔ shepherd).
- Show coverage in the shepherd care directory (filter / group by
  over-shepherd).
- Let Julian assign and unassign coverage.

**Out of scope.**
- Over-shepherd dashboard / login views.
- Over-shepherd access to care notes.
- A new global login role for over-shepherds unless later justified.

**Likely files / tables / routes.**
- New table: `shepherd_assignments` (or equivalent).
- Route surfaces inside `/admin/shepherd-care`.
- RPCs: `admin_assign_over_shepherd`, `admin_unassign_over_shepherd`.

**Security / privacy.**
- `super_admin` and `ministry_admin` only.
- No over-shepherd access in this phase.

**Acceptance criteria.**
- Each shepherd can be assigned to an over-shepherd / coach.
- The directory groups or filters by over-shepherd.
- Assignment changes are audited.

**Manual verification.**
- Assign and unassign coverage.
- Confirm `audit_events` row.
- Confirm directory grouping reflects the change.

---

### SC.3 — Julian Care Dashboard

**Purpose.** Give Julian a triage view of who needs his attention this
week without scanning the full list of 63 shepherds.

**Scope.**
- Dashboard cards: stale contact, active concerns, recent connections,
  overdue touchpoints.
- Sort by recency and care status.

**Out of scope.**
- Over-shepherd-facing dashboard.
- Leader-facing dashboard.
- Public / comms / export features.

**Likely files.**
- `/admin/shepherd-care` (dashboard surface within this route).
- Care read models (extension of SC.1 read helpers).
- Pure helper functions for recency / status bucketing.

**Security / privacy.** Same as SC.1.

**Acceptance criteria.**
- Julian sees who to connect with this week without scanning the full
  list.

**Manual verification.**
- Seed care interactions across a range of dates and statuses.
- Confirm buckets and sort order behave as expected.

---

### LP.1 — Capacity and Launch Planning MVP

**Purpose.** Answer "do I need to launch more groups before August?"

**Scope.**
- New route `/admin/launch-planning`.
- Manual assumptions input:
  - current church attendance
  - expected growth
  - target group participation %
  - average group size / capacity
  - launch buffer %
  - planning window / date
- Computed outputs:
  - current capacity (from existing group data)
  - projected demand
  - capacity gap
  - recommended new groups
  - leader need
  - suggested launch timeline

**Out of scope.**
- Scenario branching (deferred to LP.2).
- Automated alerts.
- External integrations.
- Church management system sync.

**Likely files / tables / routes.**
- Route: `/admin/launch-planning`.
- Storage: `app_settings.launch_planning` row (JSON), or a simple
  `launch_planning_assumptions` table.
- Helpers: `lib/admin/launch-planning.ts` (pure calculation functions).
- RPC: `admin_update_launch_planning_assumptions` with audit.

**Security / privacy.**
- `super_admin` and `ministry_admin` only.
- Audit assumption changes.
- No service role.

**Acceptance criteria.**
- Julian can enter assumptions.
- Outputs compute immediately on change.
- Assumptions persist across sessions.
- `audit_events` row written on save.

**Manual verification.**
- Enter a baseline set of assumptions.
- Adjust one input at a time; confirm outputs change as expected.
- Confirm audit row.

---

### LP.2 — Forecast Scenarios

**Purpose.** Let Julian compare named scenarios side by side.

**Scope.**
- Scenarios: Conservative, Expected, Stretch (named, editable).
- Mark one scenario as "current".
- Compare capacity gaps and recommended-launch counts side by side.

**Out of scope.**
- Time-series forecasting.
- Automated attendance ingestion.

**Likely files / tables / routes.**
- New table: `launch_planning_scenarios`.
- Route surfaces inside `/admin/launch-planning`.

**Security / privacy.** Same as LP.1.

**Acceptance criteria.**
- Create two scenarios.
- Compare them side by side.
- Mark one as current.

**Manual verification.**
- Create, edit, and compare scenarios.
- Confirm audit rows.

---

### LDR.1 — Optional Leader Tools Later

**Purpose.** Deferred bucket for leader-facing improvements Julian may
want later.

**Scope when revisited.**
- Leader UX refinements.
- Attendance / check-in flow polish.
- Leader calendar refinements.
- Leader follow-up status workflow improvements.
- Possible leader / over-shepherd care-adjacent workflows, only if Julian
  explicitly asks later.
- **Leader self-update of care status (Julian P6, answers 6–8).** Julian wants
  leaders to "update the system too, but broad notes given simplicity and
  confidentiality." Deferred design, not a build: a leader-facing input limited
  to *broad* notes / a coarse self-reported status, never exposing the
  admin-only shepherd-care notes. Requires a privacy review before any work,
  since it widens who can write to care-adjacent data. Awaiting Julian's
  explicit go-ahead.

**Out of scope.**
- Shepherd care notes in the MVP.
- Julian's private / admin care tracking.
- Over-shepherd coverage tracking in the MVP.

**Security / privacy.**
- Leader access remains scoped by active `group_leaders` only.
- No care-note exposure unless a later phase explicitly designs a safe,
  limited view with privacy review.

**Acceptance.** Not active now.

---

### EXT.1 — External / Comms Features Later

**Purpose.** Deferred bucket for anything public or external.

**Scope when revisited.**
- Public guest forms.
- Communications director read-only views.
- SMS / email automation.
- Exports.

**Comms-director trigger (Julian P6, early review).** Julian: "I probably will
want to loop our communications director in too if there's something that
becomes more external." Deferred design, not a build: define *when* something
crosses from internal to external (the trigger) and a comms-director read-only
surface scoped to only that external slice. Needs its own threat model and a
scope conversation with Julian + the comms director before any work.

**Out of scope.**
- Anything external before Julian and the communications director
  explicitly define the scope together.
- Shepherd care notes.
- Audit logs.

**Security / privacy.**
- Requires a separate threat model and privacy review before any work
  begins.

**Acceptance.** Not active now.

---

## 6. New signals from Julian's 2026-05-27 inputs

Surfaced by [`julian-inputs/FEEDBACK_MAP.md`](./julian-inputs/FEEDBACK_MAP.md)
§3.

**Implementation status (PR #87, branch `claude/julian-feedback-plan-4vDle`).**
Most of these signals are now built; the list below is annotated with where
each landed:
- **P1 — Shepherd-care stale-contact threshold** is now an admin-configurable
  `shepherd_care_stale_days` metric default (was hardcoded 60).
- **P2 — Capacity** defaults to 12 with a per-group `allow_over_capacity`
  ("open by choice") flag; **church attendance** is captured as a dated time
  series (`church_attendance_snapshots`) surfacing "% of the church in a group"
  on launch planning.
- **P3 — Seasonality**: launch planning's growth-date field has
  "Next August / Next January" quick-fills; the worship-center demand spike is
  modeled via the existing `expected_growth` + an LP.2 scenario.
- **P4 — Multiplication pipeline**: groups gained `audience_category` /
  `life_stage` / `launched_on`; a `multiplication_candidates` pipeline with a
  readiness rubric (12+ members, 3+ years, co-shepherd 1+ year, willing, need)
  is on the launch-planning page, grouped by audience × life stage.
- **P5 — Group-health grading**: discovery only — see
  [`GROUP_HEALTH_RUBRIC_DISCOVERY.md`](./GROUP_HEALTH_RUBRIC_DISCOVERY.md).
  Held pending Julian's rubric.
- **P6 — Leader self-update + comms-director**: deferred design notes added to
  LDR.1 / EXT.1 below.

The original signal descriptions follow.

- **Group-health grading rubric (new feature area).** Julian explicitly
  wants to "grade" group health (consistent attendance, spiritual growth
  happening, others TBD) and is still designing the rubric himself. Next
  step is a short **discovery**, not a build, to capture the grading
  dimensions before any feature work. Distinct from shepherd care and
  launch planning.
- **Multiplication candidate pipeline (LP gap).** The
  [2026 multiplication plan](./julian-inputs/LG_MULTIPLICATION_PLAN_2026.md)
  is a named pipeline (group → stage-of-life segment → readiness → target
  year) that LP.* does not model — LP aggregates capacity math but does
  not track *which named groups* multiply and when. **Scope call for
  Julian:** extend launch planning to track named candidates with target
  years, or keep the Google Doc as system of record and feed only
  aggregate counts into LP. Multiplication criteria Julian named: 3+ years
  as a group, 1+ year of co-shepherd serving, 12+ members, a need for a
  similar-stage group, and shepherd willingness.
- **Two-options-per-person goal.** "Offer all people at least two life
  group options of their choosing" is a coverage/variety target, not just
  a seat count — relevant to how launch planning recommends *which kinds*
  of groups to launch (by stage of life), not only how many.
- **Group-full = 12 with opt-to-stay-open.** Capacity default is 12, with
  an explicit "leaders may keep it open" exception. **Verify** that the
  app's `default_group_capacity` is 12 and that the kept-open-past-12 case
  is representable in capacity metrics.
- **New worship center → demand spike.** A concrete future demand driver
  to model as expected growth in LP scenarios.
- **Church-number capture is unsolved.** Julian has no reliable method to
  capture church attendance yet; LP.1 leaving it manual is correct for
  now, but this is a known data-quality gap.

**Still open for Julian:** the no-contact auto-flag threshold (or none);
the comms-director trigger; the 2026-vs-2027 multiplication split (the
source does not pin it down); and the group-health grading rubric Julian
is still designing.

## Appendix A — Reliability / security debt track

Runs in parallel to the feature roadmap above. Items here trade off
against feature work but are sequenced independently.

### P0 — Immediate

1. **Baseline observability.** Structured logging on critical server
   paths (auth, session, server actions, edge functions). Include
   `event`, `route_or_action`, `actor_role`, `request_id`, `latency_ms`,
   `outcome`, `error_code`.
2. **Harden `getCurrentSession()`.** Remove throw-driven 500s for
   transient Supabase read failures. Return controlled auth outcomes
   (redirect / unauthorized) with explicit error classification (auth
   missing, profile missing, profile inactive, backend transient).
3. **Rate-limit forgot-password.** Per-IP and per-email windowed limits.
   Keep generic user-facing response (no account discovery). Log
   throttle events with anonymized identifiers. **(Shipped — see
   `lib/security/rate-limit.ts` and `app/forgot-password/actions.ts`.)**

### P1 — Near-term

4. **Mitigate timing side-channel in invite flow.** Normalize timing
   between "existing user" and "invite user" branches. Keep super-admin
   gate as defense-in-depth, not the sole control.
5. **Reduce unsafe trust-boundary casts.** Replace unvalidated `as` casts
   at ingress with runtime-validated parsing (login profile read, RPC
   wrapper call boundaries). Introduce narrow DTO validators.
6. **Minimum test suite.** Three layers — unit (validators / parsers /
   role predicates), integration (auth / session gating, key action
   contracts), E2E smoke (admin login, leader login, one protected route
   each). CI gate before merge. **(Partial — vitest scaffold in CI;
   coverage expansion still owed.)**

### P2 — Medium-term

7. **Remove or formalize dead modules.** Confirm usage of placeholder
   `lib/permissions`, `lib/health`, `lib/reports`. Delete unused.
   **(Shipped — deleted in the May 2026 cleanup.)**
8. **Refactor oversized components.** Split by LOC and churn — calendar
   shell, check-in form, groups directory — into domain subcomponents /
   hooks / view-models.
9. **Constrain broad `select("*")`.** Phase A: privacy-sensitive and
   high-traffic paths. Phase B: remaining read-models for payload
   minimization and schema-change resilience. Shared column constants.
10. **Validate session caching semantics.** Confirm `cache()` behavior
    for within-request role / profile consistency. Document role-change
    refresh boundaries. Regression test for role-change visibility.

### Preserve these strengths (do not regress)

- `SECURITY DEFINER` RPC-centered write model.
- RLS-centered data access.
- Service-role key kept out of app runtime.
- Generic auth error responses (reduce enumeration risk).

### Definition of done

- P0 / P1 items merged with tests and logging evidence.
- Incident triage possible from logs without local repro.
- No uncaught auth / session transient failures producing user-facing
  500s.
- At least one automated test in each layer.
