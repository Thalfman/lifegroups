# Life Group Operations Dashboard

A web app for tracking Life Groups: leader weekly check-ins, attendance,
group health, guest pipeline, follow-ups, ministry-wide calendar, and
admin operations. Built with Next.js (App Router) + TypeScript + Tailwind
on top of Supabase (Auth + Postgres + RLS).

## Current roadmap

Direction: **Julian's admin operating system** — shepherd care +
launch planning, not more leader-facing features. The Julian spine
(SC.1A, SC.2, SC.3, LP.1, LP.2) has shipped; follow-on work is sequenced
in the roadmap.

- [`docs/MASTER_BLUEPRINT.md`](./docs/MASTER_BLUEPRINT.md) — **start here:**
  the at-a-glance status map of every workstream, what stage it's in, and
  what's next.
- [`docs/PRODUCT_ROADMAP.md`](./docs/PRODUCT_ROADMAP.md) — ordered
  execution plan, pivot rationale, and reliability / security debt
  appendix.
- [`docs/FEATURE_BACKLOG.md`](./docs/FEATURE_BACKLOG.md) — broader
  feature inventory including deferred items.
- [`docs/SHEPHERD_CARE_TRACKER_PLAN.md`](./docs/SHEPHERD_CARE_TRACKER_PLAN.md)
  — forward-looking plan and as-built summary for SC.*.
- [`docs/LAUNCH_PLANNING_PLAN.md`](./docs/LAUNCH_PLANNING_PLAN.md) —
  forward-looking plan and as-built summary for LP.*.

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
   Without env vars, the app renders typed fallback demo data on every
   public preview page and redirects protected routes to `/login`.
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
- **Protected (sign-in required)**:
  - Admin: `/admin`, `/admin/people`, `/admin/groups`,
    `/admin/groups/[groupId]/calendar`, `/admin/check-ins`,
    `/admin/check-ins/[groupId]`, `/admin/guests`, `/admin/follow-ups`,
    `/admin/calendar`, `/admin/settings`, `/admin/super-admin`.
  - Leader: `/leader`, `/leader/[groupId]/calendar`,
    `/leader/[groupId]/checkin`.

  Each enforces its own role gate and reads through Supabase Auth /
  RLS. `/admin/super-admin` is super_admin only; the other admin routes
  accept ministry_admin and super_admin. The legacy `/staff` surface
  was removed — see Role model below.

## Role model

App-login roles live on `profiles.role` (the `user_role` enum). The five
values, in order from most to least privileged:

- `super_admin` — top-level owner / operator. Treated as a superset of
  `ministry_admin` for read access. Bootstrapped manually (see Sign-in
  setup below). Sees the `/admin/super-admin` console for audit-log
  access and the one in-app workflow that can change a profile's role;
  the workflow can only assign `ministry_admin`, `leader`, or
  `co_leader`, never `super_admin` itself, and never `staff_viewer`.
- `ministry_admin` — ministry operations admin. Sees `/admin`. This is
  Julian's role.
- `staff_viewer` — **deprecated.** The role value is retained in the
  `user_role` SQL enum for backwards compatibility, but the Staff View
  product surface (`/staff`) has been removed. Any account still set to
  `staff_viewer` is routed to `/unauthorized` until reassigned.
- `leader` — app-login role scoped to assigned groups only via active
  `group_leaders` rows. Sees `/leader`.
- `co_leader` — same scoping as `leader`.

Two clarifications worth calling out:

- **`member` is not an app-login role.** Members are non-auth
  participant records in the `members` table and are linked to groups
  through `group_memberships`. They never sign in. `profiles.role` does
  not contain `member`.
- **`group_memberships.role` is a separate enum** (`role_in_group`:
  `member | leader | co_leader`) describing a person's role within a
  specific group, not their app-login role.

## Sign-in setup

1. Apply `supabase/migrations/20260517040000_phase2_schema.sql`,
   `supabase/seed/phase2_seed.sql`, and
   `supabase/migrations/20260518000000_phase4_rls.sql`.
2. Create one Supabase Auth user per seed profile email
   (`avery.bennett@example.org`, `jordan.hayes@example.org`,
   `casey.morgan@example.org`, etc.) with a development-only password.
3. Link each auth user to its profile row by following
   `supabase/dev/README.md`.
4. **Super admin bootstrap:** create your own Supabase Auth user and
   link it to a `super_admin` profile by following the "Super admin
   bootstrap" section of `supabase/dev/README.md`.
5. Visit `/login` and sign in with the email + password you set.

Real users (e.g. Julian as `ministry_admin`, additional leaders) are
invited from `/admin/super-admin` once a `super_admin` is signed in. See
[`docs/SUPER_ADMIN_INVITE_USER_WORKFLOW.md`](./docs/SUPER_ADMIN_INVITE_USER_WORKFLOW.md).

## How data loads

- Protected routes use a cookie-authenticated server client built with
  `@supabase/ssr`. Every query runs through Row Level Security and is
  automatically scoped to the signed-in user.
- Public preview routes always render fallback demo data; they do not
  call Supabase.
- When Supabase env vars are missing, protected routes redirect to
  `/login` and the preview routes still render demo data.

## Personas

Julian is the primary ministry admin and operator persona used
throughout admin-facing copy. Tom holds the owner / `super_admin`
account for bootstrap, oversight, and emergency access. Authorization is
role-based — no Julian or Tom UUIDs or emails are hardcoded in code,
migrations, or RLS.

## Supabase notes

- Schema migration: `supabase/migrations/20260517040000_phase2_schema.sql`
- RLS migration: `supabase/migrations/20260518000000_phase4_rls.sql`
- Seed file: `supabase/seed/phase2_seed.sql`
- Dev auth bootstrap: `supabase/dev/README.md`
- Schema docs: [`docs/DATABASE_SCHEMA.md`](./docs/DATABASE_SCHEMA.md)
- Seed + dev auth bootstrap: [`supabase/dev/README.md`](./supabase/dev/README.md)
- Env vars are **optional** for build; required only for sign-in and
  live data.
- **No service role key** is used or expected anywhere in Next runtime
  code. All app-driven writes flow through narrow `public.admin_*`,
  `public.leader_*`, and `public.super_admin_*` `SECURITY DEFINER` RPC
  functions, each of which writes a paired `audit_events` row in the
  same transaction. The service role is confined to Supabase Edge
  Functions (`invite-user`, `manage-test-auth-users`).
- **No hard deletes** outside RPC bodies in normal product workflows;
  operational tables use soft-deactivation.

## Implementation history

Historical phase specs and verification logs (Phase 5A, 5B, 5C, 6.0,
7.0, pre-launch polish, old completion roadmaps) have been moved to
[`docs/archive/`](./docs/archive/README.md) so this top-level README
stays focused on current state. See the archive README for the full
listing.
