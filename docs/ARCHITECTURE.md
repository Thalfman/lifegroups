# Architecture

## Current stack
- Next.js 15 App Router frontend (React Server Components).
- TypeScript across app.
- Tailwind styling with reusable UI primitives and dashboard design components.
- `@supabase/supabase-js` for typed reads and `@supabase/ssr` for
  cookie-aware server/browser auth clients.

## Phase 1 UI foundation (preserved)
- Reusable layout shell and section headers for page consistency.
- Reusable dashboard cards, placeholders, and status badges.

## Phase 2 database foundation (preserved)
- SQL schema/migrations live under `supabase/migrations`.
- Seed data lives under `supabase/seed`.
- Human-readable schema docs live under `docs/DATABASE_SCHEMA.md` and
  `docs/SEED_DATA.md`.
- Readable TypeScript schema/enums live under `types/database.ts` and
  `types/enums.ts`.

## Phase 3 read data flow (still in use)
- `lib/dashboard/queries.ts` exposes `getAdminDashboardData(client)` and
  `getLeaderDashboardData(client, { assignedGroupIds })`. Each returns a
  `DashboardResult<T>` carrying `source: "live" | "fallback"` plus an optional
  `error` so the UI can label what it is showing.
- The queries fall back to `lib/dashboard/fallback-data.ts` whenever the client
  is `null` (no env vars) or a Supabase error is surfaced. Any thrown error
  also returns the demo data with the error message attached.
- Typed read helpers live in `lib/supabase/read-models.ts` and accept either
  the anon publishable client or the cookie-authenticated server client.

## Phase 4 authentication & RLS
- **Supabase auth helpers** live under `lib/supabase/`:
  - `server.ts` — cookie-aware `createSupabaseServerClient()` for Server
    Components and Server Actions.
  - `browser.ts` — `createSupabaseBrowserClient()` for client components.
  - `middleware.ts` — `updateSupabaseSession()` that refreshes auth cookies on
    every request. Wired up via the root `middleware.ts`.
  - All three return `null` when env vars are missing so the build never fails
    on unset secrets.
- **Session helpers** live under `lib/auth/`:
  - `roles.ts` exports the `UserRole` union, role-set predicates
    (`isAdminRole`, `isAdminOrStaffRole`, `isLeaderRole`),
    `defaultLandingPathForRole`, and `navItemsForRole`.
  - `session.ts` exports `getCurrentSession()` (memoized per request),
    `requireRole(allowed)`, and the convenience wrappers `requireAdmin`,
    `requireAdminOrStaff`, `requireLeader`.
- **Routes**:
  - Public: `/`, `/admin-preview`, `/leader-preview`, `/login`,
    `/unauthorized`. Preview routes always render demo data and never call
    Supabase.
  - Protected (under `app/(protected)/`): `/admin`, `/leader`, `/staff`. The
    group layout redirects unauthenticated users to `/login` and stuck-but-
    signed-in users (no linked profile) to `/unauthorized`. Each page then
    applies its own role check.
- **Login / logout** are Server Actions in `app/login/actions.ts` and
  `app/(protected)/actions.ts`. The login form uses `useActionState` and
  surfaces only a generic "Invalid email or password." error so passwords are
  never logged or echoed.
- **Leader scoping**: `getCurrentSession()` loads the signed-in user's active
  `group_leaders` rows. The leader dashboard renders one card per assigned
  group, stacked vertically.

## Row Level Security
- Helper SQL functions in the `public` schema (`auth_profile_id`,
  `auth_role`, `auth_is_admin`, `auth_is_staff_viewer`,
  `auth_is_admin_or_staff`, `auth_is_leader_of`) drive the read policies.
- Every operational table has RLS enabled with **select-only** policies:
  - Admins (super_admin / ministry_admin) and staff viewers read everything.
  - Leaders / co-leaders read only rows scoped to their active group
    assignments (joins are gated via `auth_is_leader_of(group_id)`).
  - `audit_events` is admin-only.
  - `app_settings` allows any authenticated user.
- **No write policies are added in this phase.** Inserts/updates/deletes will
  arrive in Phase 5 alongside the first write workflows.

## Runtime boundaries for this phase
- Supabase clients only run **select** queries from the app.
- No service role key is referenced, imported, or expected in any client or
  server path.
- The Vercel build remains independent from Supabase environment variables;
  preview pages render demo data when env vars are missing and protected
  pages compile cleanly (the redirect to `/login` runs at request time).
- Write workflows (attendance submission, guest capture, follow-up updates,
  admin review queues) ship in Phase 5 once RLS has been verified end-to-end.
