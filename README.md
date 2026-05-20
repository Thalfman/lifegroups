# Life Group Operations Dashboard

This repository contains the Life Group Operations Dashboard web app built with Next.js, TypeScript, and Tailwind.

## Phase status
- Phase 0: app foundation. ✅
- Phase 1: visual design system + admin/leader preview experiences. ✅
- Phase 2: Supabase schema, enums, seed data, and docs. ✅
- Phase 3: safe Supabase read integration with fallback demo data. ✅
- Phase 4: security foundation — Supabase Auth, protected routes, role-aware access, assigned leader scoping, and Row Level Security policy enforcement. ✅
- Phase 4.1: docs + dev-helper patch — super admin bootstrap, role model clarification, Phase 5A scope outline. No app write code. ✅
- Phase 5A.0: admin people & role management UI/UX scaffold — protected `/admin/people` route, disabled action cards, polished empty states, validation helpers, throwing server-action stubs. ✅
- Phase 5A.1: people foundation writes — admins can add leader profiles, add member records, assign leaders/co-leaders to groups, place members in groups, deactivate either, and review an audit trail. Writes flow through six narrow `public.admin_*` SECURITY DEFINER Postgres RPC functions so each data change and its `audit_events` row commit atomically. RLS stays SELECT-only; no service role; no deletes. ✅
- Phase 5A.2: admin group management + super_admin audit visibility — admins can create, edit, close (soft), and reopen Life Groups from `/admin/groups`. Four `admin_*_group` SECURITY DEFINER RPCs follow the Phase 5A.1 pattern (admin gate, audit row in the same transaction, no hard deletes). RLS on `audit_events` is tightened to `super_admin` only; ministry admins retain every other admin workflow but no longer see the audit trail. See `docs/PHASE_5A_ADMIN_MANAGEMENT.md`, `docs/PHASE_5A_ACTION_CONTRACTS.md`, and `docs/PHASE_5A_2_VERIFICATION.md`. ✅
- Phase 5B.0: leader weekly check-ins — leaders and co-leaders sign in to `/leader`, see only the groups they are actively assigned to, and submit a weekly check-in for each one (attendance per active member, optional health pulse, optional admin-visible follow-up signal) or mark the group `did_not_meet` / `planned_pause` for the week. All writes flow through the `leader_submit_group_checkin` SECURITY DEFINER RPC, which atomically upserts `attendance_sessions`, replaces `attendance_records` for that session, preserves `group_health_updates.admin_note`, and writes an `audit_events` row (`leader.submit_checkin`, `leader.update_checkin`, or `leader.mark_did_not_meet`). Closed groups are rejected. No service role; no client-side writes; no hard deletes outside the RPC body. See `docs/PHASE_5B_0_LEADER_CHECKINS.md`, `docs/PHASE_5B_0_VERIFICATION.md`, and `docs/PHASE_5B_0_HARDENING_REPORT.md`. ✅
- Phase 5A.3: super admin console and role-model cleanup — a dedicated `/admin/super-admin` route (super_admin only) hosts the audit log (moved out of `/admin/people` and `/admin/groups`), a role-management form, an 8-row system status checklist, and a Staff View deprecation note. One new `super_admin_update_profile_role` SECURITY DEFINER RPC writes the role change + matching audit row atomically; super_admin / staff_viewer / self-target attempts are rejected with fixed tokens. The `staff_viewer` enum value stays in the database and TS union for compatibility but is no longer promoted anywhere in the UI. See `docs/PHASE_5A_3_SUPER_ADMIN.md` and `docs/PHASE_5A_3_VERIFICATION.md`. ✅
- Phase 5B.1: admin weekly check-in review — a read-only `/admin/check-ins` route (super_admin + ministry_admin) and a per-group detail route at `/admin/check-ins/[groupId]?week=YYYY-MM-DD`. Six summary tiles sit above a card list of every non-closed group with its weekly status, attendance counts, health pulse, follow-up flag, and a 140-char leader-note preview. The "missing" rule matches the existing admin dashboard, a week selector scrolls back through the last eight Mondays, and the URL stays canonical so a week can be linked or bookmarked. No new RPCs, no new RLS policies, no service role, no client-side writes. See `docs/PHASE_5B_1_ADMIN_CHECKIN_REVIEW.md` and `docs/PHASE_5B_1_VERIFICATION.md`. ✅
- Phase 5A.4: admin operations UX + metric settings foundation. `/admin/people` and `/admin/groups` are refactored into filterable directories — search by name / email / status / role / lifecycle / health / meeting day — with leader-role inline swap forms, "Member · non-login" labelling on every member row, and rich group cards that show leader chips, capacity ("Unknown" until set), and latest check-in status. A new `/admin/settings` page (super_admin + ministry_admin) configures ministry-wide metric defaults (default capacity, capacity warning %, capacity full %, check-in due day-of-week, missed-check-in warning weeks, healthy attendance %) and per-group overrides (capacity, warning %, healthy attendance %, manual health status, exclude-from-capacity-metrics flag, admin metric notes). Storage lives in a seeded `app_settings.metric_defaults` row and a new admin-only `group_metric_settings` table. Three new SECURITY DEFINER RPCs — `admin_update_metric_defaults`, `admin_upsert_group_metric_settings`, and a ministry-admin-safe `admin_change_leader_role` — each write paired audit rows atomically. Pure typed helpers in `lib/admin/metrics.ts` (`effectiveCapacity`, `capacityStatus`, `effectiveHealthStatus`, `hasActiveOverrides`, etc.) prepare the dashboard for later phases. See `docs/PHASE_5A_4_ADMIN_OPERATIONS_UX.md` and `docs/PHASE_5A_4_VERIFICATION.md`. ✅
- Phase 6.0: admin dashboard metrics integration. `/admin` is rebuilt as Julian's ministry command center and now consumes the Phase 5A.4 metric settings + helpers end to end. The page accepts `?week=YYYY-MM-DD` (defaults to the current church week, falls back safely on invalid input) and renders six summary cards (Active Groups, Submitted Check-Ins, Missing Check-Ins, Needs Follow-Up, Capacity Watch, Unknown Capacity), a prioritized "Groups needing attention" queue (follow-ups → missing → full → warning → needs-follow-up → watch → unknown capacity → no leader → no members → missing day/time, with secondary-reason badges), a five-bucket capacity section (full / warning / ok / unknown / excluded) that shows the capacity source (override · group · default · unknown), a seven-bucket weekly health section (submitted / missing / did not meet / planned pause / needs follow-up / watch / healthy) with deep links to `/admin/check-ins/[groupId]?week=...`, and a setup-gaps panel for groups missing a leader, meeting day/time, members, or a configured capacity. Excluded-from-capacity-metrics groups stop counting toward capacity but still surface for follow-up, missing check-ins, or no leader. The dashboard is read-only — no new RLS, no new RPCs, no new migrations, no service role, no new write surfaces; all metric math routes through `lib/admin/metrics.ts` (`decodeMetricDefaults`, `effectiveCapacity`, `capacityStatus`, `effectiveHealthStatus`, `isExcludedFromCapacityMetrics`). Capacity thresholds and the default group capacity are configured in `/admin/settings`; per-group overrides win over global defaults. Hardcoded `NEAR_CAPACITY_THRESHOLD = 0.8` and direct `health.pulse` / `group.capacity` reads in the dashboard are gone. Staff View remains deprecated; members remain non-auth participant records. See `docs/PHASE_6_0_ADMIN_DASHBOARD_METRICS.md` and `docs/PHASE_6_0_VERIFICATION.md`. ✅
- Phase 5C.0: guest pipeline + follow-up foundation. Two new admin routes — `/admin/guests` and `/admin/follow-ups` — let ministry admins add a guest, walk them through the seven-stage pipeline (`new` → `contacted` → `interested` → `assigned` → `attended` → `placed` → `not_now`), assign them to a group and a follow-up owner, and create follow-up tasks tied to a group, member, guest, or leader. Leaders and co-leaders see follow-ups assigned to them or tied to a group they actively lead in a new section on `/leader`, and can mark allowed transitions (open → in_progress, open → done, in_progress → done). All writes flow through five new `SECURITY DEFINER` RPCs (`admin_create_guest`, `admin_update_guest_pipeline`, `admin_create_follow_up`, `admin_update_follow_up_status`, `leader_update_follow_up_status`); each writes its `audit_events` row in the same transaction. `admin_private_note` is never returned to leader read paths — the leader follow-up read helper explicitly excludes that column even though table-level RLS still exposes it (column-level redaction is documented as a future follow-up). No SMS, no public guest signup forms, no automation, no reminders, no exports, no care-sensitive notes; no new INSERT/UPDATE/DELETE policies on any table; no service role; no hard deletes. See `docs/PHASE_5C_0_GUEST_PIPELINE_FOLLOWUPS.md` and `docs/PHASE_5C_0_VERIFICATION.md`. ✅
- **Phase 7.0 (current): warm-pastoral design refresh + admin port.** Foundation-level visual rewrite. `app/layout.tsx` switches from a single `Inter` to Newsreader (display, italic) + Geist (body sans) + JetBrains Mono via `next/font/google`; `app/globals.css` adds the full OKLCH `--c-*` palette (cream surfaces, sage primary, clay secondary, amber/rose/blue status tones) plus density vars; `tailwind.config.ts` exposes the palette as direct utilities (`bg-sage`, `text-clay`, `border-line`, etc.) and registers the new font families. The legacy shadcn HSL token bridge stays in place but is re-pointed at the new palette. A new sidebar shell under `components/lg/shell/` (`LgAppShell`, `Sidebar`, `Wordmark`, `Verse`, `TopBar`, `MobileSidebarTrigger`) ships in `app/(protected)/admin/layout.tsx` — 232 px left rail with grouped nav (Dashboard / Manage / Shepherd / System), a Colossians 1:28 "Why we're here" verse card pinned to the bottom, a 56 px sticky top bar with the user pill + sign-out, and a Radix-dialog drawer below 768 px. Every admin route (`/admin`, `/admin/people`, `/admin/groups`, `/admin/check-ins` + nested `[groupId]`, `/admin/guests`, `/admin/follow-ups`, `/admin/calendar`, `/admin/groups/[groupId]/calendar`, `/admin/settings`, `/admin/super-admin`) drops its `<PastoralAppShell>` wrapper and now renders the new `<PageHeader>` (clay uppercase eyebrow + serif title + italic accent + lede) + `<PageBody>` directly. The admin dashboard is a full rewrite: new `components/lg/admin/dashboard/` houses `DashboardClient` composing `SummaryTiles` (6 tone-coded summary cards), `AttentionQueue`, `CapacityBuckets`, `FollowUpsMini`, `WeeklyHealthBuckets` (7-bucket strip), `SetupGaps`, and a restyled inline `WeekSelector`. The leader screens (`/leader/*`) keep wrapping with the legacy `PastoralAppShell` and inherit the new fonts + shadcn palette automatically because `lib/pastoral.ts` already routes through `var(--font-display)` and `var(--font-body)`. New primitives under `components/lg/` (`Icon`, `Pill`, `Button`, `Card`, `SectionLabel`, `Avatar`, `SummaryCard`, `PageHeader`, `PageBody`, `tone.ts`) are ready for later phases to drop into the leader screens. Zero changes to Supabase / RLS / RPCs / migrations / server actions / read-models / data shapes — purely the visual layer and chrome. See `docs/PHASE_7_0_DESIGN_REFRESH.md` and `docs/PHASE_7_0_VERIFICATION.md`.

- Phase 5C.1: guest + follow-up privacy hardening and verification pass. No new features. The Phase 5C.0 read-path boundary that keeps `admin_private_note` out of leader views (the `LEADER_FOLLOW_UP_COLUMNS` allowlist in `lib/supabase/read-models.ts` and the `LeaderFollowUpRow = Omit<FollowUpsRow, "admin_private_note">` type, plus the narrow `LeaderFollowUpItem` view-model in `components/leader/`) is now reinforced with explicit JSDoc privacy contracts on every leader-side reader and on the admin-only `fetchFollowUpsForAdmin` (do-not-call-from-leader warning). One additional reachable leader read path — `fetchOpenFollowUps`, the dashboard summary helper used by the per-group leader dashboard — was previously `.select("*")` and is now narrowed to `LEADER_FOLLOW_UP_COLUMNS` / `LeaderFollowUpRow[]` so the SQL-level claim is honest at the network/SQL layer as well, not just at the rendered-output layer. End-to-end verification confirms (a) `admin_private_note` appears in no leader-facing component prop, action result, RSC payload, or rendered HTML, (b) leaders only see follow-ups assigned to them or tied to a group they actively lead, (c) `leader_update_follow_up_status` allows only `open → in_progress`, `open → done`, and `in_progress → done`, (d) all six new audit actions (`admin.create_guest`, `admin.update_guest_pipeline`, `admin.mark_guest_not_now`, `admin.create_follow_up`, `admin.update_follow_up_status`, `leader.update_follow_up_status`) render friendly summaries in `/admin/super-admin`, and (e) the security greps for service-role usage, client-side deletes, broad write RLS, and stray `admin_private_note` references in leader code paths are all clean. Light UI polish: admin guest + follow-up empty states now distinguish "nothing yet" from "filter mismatch". Column-level RLS / a leader-safe Postgres view is documented as a future hardening item — intentionally not added this phase. See `docs/PHASE_5C_1_PRIVACY_HARDENING.md` and `docs/PHASE_5C_1_VERIFICATION.md`.

## Local development
1. Install dependencies:
   ```bash
   npm install
   ```
2. (Optional) connect to a real Supabase project to see live data:
   ```bash
   cp .env.example .env.local
   # then fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
   # (legacy NEXT_PUBLIC_SUPABASE_ANON_KEY is still accepted as a fallback)
   ```
   Without env vars, the app renders typed fallback demo data on every public
   preview page and redirects protected routes to `/login`.
3. Run dev server:
   ```bash
   npm run dev
   ```

## Scripts
- `npm run dev`
- `npm run lint`
- `npm run typecheck`
- `npm run build`

## Public vs. protected routes
- **Public**: `/`, `/login`, `/forgot-password`, `/reset-password`,
  `/unauthorized`. The landing page is a minimal sign-in entry point.
- **Protected (sign-in required)**: `/admin`, `/admin/people`,
  `/admin/groups`, `/admin/check-ins`, `/admin/guests`,
  `/admin/follow-ups`, `/admin/settings`, `/admin/super-admin`, and
  `/leader`. Each enforces its own role gate and reads through Supabase
  Auth / RLS. `/admin/super-admin` is super_admin only; the other admin
  routes (including `/admin/check-ins`, `/admin/guests`,
  `/admin/follow-ups`, and `/admin/settings`) accept ministry_admin and
  super_admin. (`/staff` was removed in the Phase 5B.0 post-merge
  cleanup — see Role model below.)

## Role model
App-login roles live on `profiles.role` (the `user_role` enum). The five
values, in order from most to least privileged:

- `super_admin` — top-level owner/operator. Treated as a superset of
  `ministry_admin` for read access. Bootstrapped manually (see Sign-in
  setup below). Sees the additional `/admin/super-admin` console
  (Phase 5A.3) for audit-log access and the one in-app workflow that
  can change a profile's role; the workflow can only assign
  `ministry_admin`, `leader`, or `co_leader`, never `super_admin`
  itself, and never `staff_viewer`.
- `ministry_admin` — ministry operations admin. Sees `/admin`.
- `staff_viewer` — **deprecated.** The role value is retained in the
  `user_role` SQL enum for backwards compatibility, but the Staff View
  product surface (`/staff`) has been removed. Any account still set to
  `staff_viewer` is routed to `/unauthorized` until reassigned to an
  active role. No new Staff workflow is planned.
- `leader` — app-login role scoped to assigned groups only via active
  `group_leaders` rows. Sees `/leader`.
- `co_leader` — same scoping as `leader`.

Two clarifications worth calling out:

- **`member` is not an app-login role.** Members are non-auth participant
  records in the `members` table and are linked to groups through
  `group_memberships`. They never sign in. `profiles.role` does not contain
  `member`.
- **`group_memberships.role` is a separate enum** (`role_in_group`:
  `member | leader | co_leader`) describing a person's role *within a
  specific group*, not their app-login role.

Phase 5A will introduce narrow admin workflows for creating and updating
admin, leader, and member records — see
`docs/PHASE_5A_ADMIN_MANAGEMENT.md`.

## Sign-in setup
1. Apply `supabase/migrations/20260517040000_phase2_schema.sql`,
   `supabase/seed/phase2_seed.sql`, and
   `supabase/migrations/20260518000000_phase4_rls.sql`.
2. Create one Supabase Auth user per seed profile email
   (`avery.bennett@example.org`, `jordan.hayes@example.org`,
   `casey.morgan@example.org`, etc.) with a development-only password.
3. Link each auth user to its profile row by following
   `supabase/dev/README.md`.
4. **Super admin bootstrap (Phase 4.1):** create your own Supabase Auth
   user and link it to a `super_admin` profile by following the "Super
   admin bootstrap" section of `supabase/dev/README.md`.
5. Visit `/login` and sign in with the email + password you set.

## How data loads
- Protected routes use a cookie-authenticated server client built with
  `@supabase/ssr`. Every query runs through Row Level Security and is
  automatically scoped to the signed-in user.
- Public preview routes always render fallback demo data; they do not call
  Supabase.
- When Supabase env vars are missing, protected routes redirect to `/login`
  and the preview routes still render demo data.

## Personas

Julian is the primary ministry admin and operator persona used throughout
admin-facing copy. Tom holds the owner/super_admin account for bootstrap,
oversight, and emergency access. Authorization is role-based — no Julian
or Tom UUIDs or emails are hardcoded in code, migrations, or RLS.

## Supabase notes
- Schema migration: `supabase/migrations/20260517040000_phase2_schema.sql`
- RLS migration: `supabase/migrations/20260518000000_phase4_rls.sql`
- Phase 5A.1 admin write functions: `supabase/migrations/20260518050000_phase5a1_admin_people_writes.sql`
- Phase 5A.2 admin group writes + audit visibility: `supabase/migrations/20260518060000_phase5a2_admin_group_writes.sql`
- Phase 5A.2 grants hardening: `supabase/migrations/20260518070000_phase5a2_grants_hardening.sql`
- Phase 5B.0 leader check-in writes: `supabase/migrations/20260518080000_phase5b0_leader_checkin_writes.sql`
- Phase 5A.3 super admin role writes: `supabase/migrations/20260518090000_phase5a3_super_admin_role_writes.sql`
- Phase 5A.4 settings + leader-role swap: `supabase/migrations/20260518100000_phase5a4_settings_and_role.sql`
- Phase 5C.0 guest + follow-up writes: `supabase/migrations/20260518110000_phase5c0_guest_followup_writes.sql`
- Seed file: `supabase/seed/phase2_seed.sql`
- Dev auth bootstrap: `supabase/dev/README.md`
- Schema docs: `docs/DATABASE_SCHEMA.md` and `docs/SEED_DATA.md`
- Phase 5A scope outline: `docs/PHASE_5A_ADMIN_MANAGEMENT.md`
- Phase 5A action contracts: `docs/PHASE_5A_ACTION_CONTRACTS.md`
- Phase 5A.1 verification checklist: `docs/PHASE_5A_1_VERIFICATION.md`
- Phase 5A.2 verification checklist: `docs/PHASE_5A_2_VERIFICATION.md`
- Phase 5B.0 feature spec: `docs/PHASE_5B_0_LEADER_CHECKINS.md`
- Phase 5B.0 verification checklist: `docs/PHASE_5B_0_VERIFICATION.md`
- Phase 5B.0 hardening report: `docs/PHASE_5B_0_HARDENING_REPORT.md`
- Phase 5A.3 super admin console: `docs/PHASE_5A_3_SUPER_ADMIN.md`
- Phase 5A.3 verification checklist: `docs/PHASE_5A_3_VERIFICATION.md`
- Phase 5B.1 admin check-in review: `docs/PHASE_5B_1_ADMIN_CHECKIN_REVIEW.md`
- Phase 5B.1 verification checklist: `docs/PHASE_5B_1_VERIFICATION.md`
- Phase 5A.4 admin operations UX + settings: `docs/PHASE_5A_4_ADMIN_OPERATIONS_UX.md`
- Phase 5A.4 verification checklist: `docs/PHASE_5A_4_VERIFICATION.md`
- Phase 6.0 admin dashboard metrics integration: `docs/PHASE_6_0_ADMIN_DASHBOARD_METRICS.md`
- Phase 6.0 verification checklist: `docs/PHASE_6_0_VERIFICATION.md`
- Phase 5C.0 guest pipeline + follow-up foundation: `docs/PHASE_5C_0_GUEST_PIPELINE_FOLLOWUPS.md`
- Phase 5C.0 verification checklist: `docs/PHASE_5C_0_VERIFICATION.md`
- Phase 5C.1 privacy hardening: `docs/PHASE_5C_1_PRIVACY_HARDENING.md`
- Phase 5C.1 verification checklist: `docs/PHASE_5C_1_VERIFICATION.md`
- Phase 7.0 design refresh: `docs/PHASE_7_0_DESIGN_REFRESH.md`
- Phase 7.0 verification checklist: `docs/PHASE_7_0_VERIFICATION.md`
- Env vars are **optional** for build; required only for sign-in and live data.
- No service role key is used or expected anywhere in app code. Phase 5A.1
  introduced live writes for admin people / assignment management; Phase
  5A.2 adds live writes for admin group management (create, edit, close,
  reopen); Phase 5B.0 adds live writes for leader weekly check-ins and
  attendance submission; Phase 5A.3 adds one super_admin-only role-change
  RPC; Phase 5A.4 adds three more SECURITY DEFINER RPCs for metric defaults,
  per-group overrides, and a ministry-admin-safe `leader` ⇄ `co_leader`
  swap. Phase 5C.0 adds five more SECURITY DEFINER RPCs for the manual
  guest pipeline (`admin_create_guest`, `admin_update_guest_pipeline`)
  and follow-up workflow (`admin_create_follow_up`,
  `admin_update_follow_up_status`, `leader_update_follow_up_status`).
  Phase 5C.1 adds no new RPCs and no new migrations — it is a
  verification + privacy-hardening pass that reinforces the leader-side
  redaction boundary for `follow_ups.admin_private_note` with explicit
  JSDoc privacy contracts and a documented grep-based regression check.
  All app-driven writes flow through narrow `public.admin_*`,
  `public.leader_*`, and `public.super_admin_*` SECURITY DEFINER RPC
  functions only. There are no hard deletes outside those RPC bodies.
  SMS, calendar integration, public guest signup, automated reminders,
  prayer / care-sensitive notes, exports, and a native mobile app are
  all explicitly out of scope through Phase 5C.1.
