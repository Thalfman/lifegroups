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
- **Phase 5B.1 (current): admin weekly check-in review — a read-only `/admin/check-ins` route (super_admin + ministry_admin) and a per-group detail route at `/admin/check-ins/[groupId]?week=YYYY-MM-DD`. Six summary tiles (Active groups, Submitted, Missing, Did not meet, Planned pause, Needs follow-up) sit above a card list of every non-closed group with its weekly status, attendance counts, health pulse, follow-up flag, and a 140-char leader-note preview. The "missing" rule matches the existing admin dashboard (`lifecycle_status = 'active'` AND no session OR session.status = `'not_submitted'`), so the dashboard count and the new page agree. A week selector dropdown scrolls back through the last eight Mondays; the URL stays canonical so a week can be linked, bookmarked, or pasted into pastoral conversation. No new RPCs, no new RLS policies, no service role, no client-side writes. Two additive read-model tweaks (`fetchLatestHealthUpdates` accepts an `updateWeek` option; `fetchAttendanceRecordsForSessions` widens past the PostgREST 1000-row default cap) keep behavior backwards-compatible. See `docs/PHASE_5B_1_ADMIN_CHECKIN_REVIEW.md` and `docs/PHASE_5B_1_VERIFICATION.md`.**

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
- **Public**: `/`, `/admin-preview`, `/leader-preview`, `/login`, `/unauthorized`. The
  preview routes always render fallback demo data so the design demo stays
  visible without secrets.
- **Protected (sign-in required)**: `/admin`, `/admin/people`,
  `/admin/groups`, `/admin/check-ins`, `/admin/super-admin`, and
  `/leader`. Each enforces its own role gate and reads through
  Supabase Auth / RLS. `/admin/super-admin` is super_admin only; the
  other admin routes (including `/admin/check-ins`) accept
  ministry_admin and super_admin. (`/staff` was removed in the
  Phase 5B.0 post-merge cleanup — see Role model below.)

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
- Env vars are **optional** for build; required only for sign-in and live data.
- No service role key is used or expected anywhere in app code. Phase 5A.1
  introduced live writes for admin people / assignment management; Phase
  5A.2 adds live writes for admin group management (create, edit, close,
  reopen); Phase 5B.0 adds live writes for leader weekly check-ins and
  attendance submission; Phase 5A.3 adds one super_admin-only role-change
  RPC. All app-driven writes flow through narrow `public.admin_*`,
  `public.leader_*`, and `public.super_admin_*` SECURITY DEFINER RPC
  functions only. There are no hard deletes outside those RPC bodies.
