# Product Roadmap

## 1. Purpose

This is the **active product roadmap** for the Life Group Operations
Dashboard after Julian's pivot feedback (see
[`JULIAN_FEEDBACK_PIVOT.md`](./JULIAN_FEEDBACK_PIVOT.md)).

It replaces the previous phase-number roadmap (`Phase 5A`, `Phase 5B`,
`Phase 5C`, `Phase 6.0`, `Phase 7.0`, etc.) as the front-of-mind execution
plan. Historical phase specs and verification logs are preserved under
[`docs/archive/`](./archive/README.md) for implementation history; they
are not deleted.

This document is the **ordered execution plan**. For the broader inventory
of possible product features (including deferred and rejected items), see
[`FEATURE_BACKLOG.md`](./FEATURE_BACKLOG.md).

## 2. Current app state

Verified from repo inspection on the branch this PR is opened against.

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

## 3. North-star links

- **Julian admin OS** — Shepherd care + launch planning, owned by this
  roadmap. Specs:
  [`SHEPHERD_CARE_TRACKER_PLAN.md`](./SHEPHERD_CARE_TRACKER_PLAN.md),
  [`LAUNCH_PLANNING_PLAN.md`](./LAUNCH_PLANNING_PLAN.md).
- **Full inventory of features** — [`FEATURE_BACKLOG.md`](./FEATURE_BACKLOG.md).
- **Reliability / security technical debt** —
  [`FINALIZED_HOLISTIC_PLAN.md`](./FINALIZED_HOLISTIC_PLAN.md). Orthogonal
  track that runs in parallel; not part of this product roadmap.
- **Invite user workflow contract** —
  [`SUPER_ADMIN_INVITE_USER_WORKFLOW.md`](./SUPER_ADMIN_INVITE_USER_WORKFLOW.md).

## 4. Active roadmap

Execution order:
**R0 → INV.1 → SC.1 → SC.2 → SC.3 → LP.1 → LP.2 → LDR.1 → EXT.1.**

---

### R0 — Roadmap Reset

**Purpose.** Align the documentation with Julian's new direction and clear
the stale phase-number signal from `README.md` and `docs/`.

**Scope.**
- New planning docs (this file, `JULIAN_FEEDBACK_PIVOT.md`,
  `FEATURE_BACKLOG.md`, `SHEPHERD_CARE_TRACKER_PLAN.md`,
  `LAUNCH_PLANNING_PLAN.md`).
- `README.md` rewrite — shorter, current-state focused, pointed at the new
  active docs.
- Move stale phase specs and verification logs to `docs/archive/`.
- Add `docs/archive/README.md` explaining the archive.

**Out of scope.**
- App code, components, libs, types, middleware.
- Supabase migrations, RLS, RPCs, Edge Functions.
- Auth changes.
- CSS, layout, config, package, route copy.

**Likely files.**
- `README.md`
- `docs/JULIAN_FEEDBACK_PIVOT.md`
- `docs/PRODUCT_ROADMAP.md`
- `docs/FEATURE_BACKLOG.md`
- `docs/SHEPHERD_CARE_TRACKER_PLAN.md`
- `docs/LAUNCH_PLANNING_PLAN.md`
- `docs/archive/README.md`
- `docs/archive/<moved phase docs>`

**Security / privacy.** Docs only. No data-path or policy changes.

**Acceptance criteria.**
- New docs created and self-consistent.
- `README.md` is materially shorter and points at `PRODUCT_ROADMAP.md` +
  `FEATURE_BACKLOG.md`.
- Stale phase docs moved (not deleted) to `docs/archive/`.
- `FINALIZED_HOLISTIC_PLAN.md` untouched.
- `SUPER_ADMIN_INVITE_USER_WORKFLOW.md` untouched.

**Manual verification.**
- Open each new doc. Check that all internal links resolve.
- Confirm `README.md`'s "Current roadmap" section links to
  `PRODUCT_ROADMAP.md` and `FEATURE_BACKLOG.md`.
- `git diff --name-status main...HEAD` shows only `README.md` and files
  under `docs/`.

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

## 5. Docs cleanup recommendations

### Keep as active (under `docs/`)

- `PRODUCT_ROADMAP.md` (this file)
- `FEATURE_BACKLOG.md`
- `JULIAN_FEEDBACK_PIVOT.md`
- `SHEPHERD_CARE_TRACKER_PLAN.md`
- `LAUNCH_PLANNING_PLAN.md`
- `FINALIZED_HOLISTIC_PLAN.md`
- `SUPER_ADMIN_INVITE_USER_WORKFLOW.md`
- `ARCHITECTURE.md`
- `DATABASE_SCHEMA.md`
- `SEED_DATA.md`
- `DEPLOYMENT.md`
- `PRODUCT_BRIEF.md`
- `FREE_TIER_NOTES.md`
- `TEST_AUTH_USERS.md`

### Archive candidates (moved to `docs/archive/` in R0)

- Old `PHASE_5A_*.md` specs and verification logs (12 files).
- Old `PHASE_5B_*.md` specs and verification logs (5 files).
- Old `PHASE_5C_*.md` specs and verification logs (4 files).
- Old `PHASE_6_0_*.md` (2 files).
- Old `PHASE_7_0_*.md` (2 files).
- Pre-launch design polish docs:
  `PRELAUNCH_BRAND_AUTH_CLEANUP.md`, `PRELAUNCH_MOBILE_UX_OVERHAUL.md`.
- Old completion roadmaps:
  `APP_COMPLETION_ROADMAP.md`, `CLAUDE_APP_COMPLETION_ROADMAP.md`.
- Stale roadmap doc: `ROADMAP.md` (superseded by `PRODUCT_ROADMAP.md`).
- Already-shipped design extraction doc: `CLAUDE_DESIGN_EXTRACTION.md`.
- Already-shipped QA checklist: `LAUNCH_POLISH_QA.md`.

### Do not delete

No historical doc is deleted. All are moved into `docs/archive/` so the
implementation history is preserved. See
[`docs/archive/README.md`](./archive/README.md) for the full archived
listing and one-line reasons.

### Filename caution

R0 moves only docs that are clearly historical, shipped, superseded, or
no longer active. Broad glob moves were not used. The exact archived list
is enumerated in `docs/archive/README.md` and in the PR description.
