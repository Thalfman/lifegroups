# Architecture

Snapshot of the running app. For active product direction see
[`PRD.md`](../PRD.md); for the SQL schema see
[`DATABASE_SCHEMA.md`](./DATABASE_SCHEMA.md).

## Stack

- Next.js 15 App Router (React Server Components) + TypeScript.
- Tailwind + a small in-house design system under `components/lg/`
  (warm-pastoral: Newsreader / Geist / JetBrains Mono, OKLCH cream /
  sage / clay, 232px sidebar shell, mobile drawer below 768px).
- Supabase: `@supabase/supabase-js` for typed reads,
  `@supabase/ssr` for cookie-aware server/browser auth clients,
  Postgres with RLS, Edge Functions for service-role workflows.
- Upstash Redis + `@upstash/ratelimit` for the forgot-password
  throttle.

## Routes

- **Public**: `/`, `/login`, `/forgot-password`, `/reset-password`,
  `/unauthorized`.
- **Protected** (under `app/(protected)/`):
  - Admin (`ministry_admin` + `super_admin`): `/admin`,
    `/admin/people`, `/admin/groups`,
    `/admin/groups/[groupId]/calendar`, `/admin/check-ins`,
    `/admin/check-ins/[groupId]`, `/admin/guests`,
    `/admin/follow-ups`, `/admin/calendar`, `/admin/settings`,
    `/admin/shepherd-care`, `/admin/shepherd-care/[profileId]`,
    `/admin/launch-planning`.
  - `super_admin` only: `/admin/super-admin`.
  - Leader: `/leader`, `/leader/[groupId]/calendar`,
    `/leader/[groupId]/checkin`.

The protected route group's layout redirects unauthenticated users to
`/login` and signed-in users without a linked profile to
`/unauthorized`. Each page then applies its own role check.

`staff_viewer` is deprecated. The enum value is retained for
backwards compatibility; the `/staff` surface was removed.

## Auth + session

- **Supabase clients** in `lib/supabase/`:
  - `server.ts` — cookie-aware `createSupabaseServerClient()` for
    Server Components and Server Actions.
  - `middleware.ts` — `updateSupabaseSession()` refreshes auth cookies
    on every request. Wired via the root `middleware.ts`.
  - Both return `null` when env vars are missing so the build never
    fails on unset secrets.
- **Session helpers** in `lib/auth/`:
  - `roles.ts` — the `UserRole` union, role-set predicates
    (`isAdminRole`, `isLeaderRole`, etc.), `defaultLandingPathForRole`,
    `navItemsForRole`.
  - `session.ts` — `getCurrentSession()` (memoized per request),
    `requireRole(allowed)`, and `requireAdmin` / `requireLeader`
    wrappers. Loads the signed-in user's active `group_leaders` rows
    for leader scoping.
- **Login / logout** are Server Actions in `app/login/actions.ts` and
  `app/(protected)/actions.ts`. The login form uses `useActionState`
  and surfaces only a generic "Invalid email or password" error so
  passwords are never logged.

## Read path

- `lib/dashboard/queries.ts` exposes `getAdminDashboardData(client)`
  and `getLeaderDashboardData(client, { assignedGroupIds })`. Each
  returns a `DashboardResult<T>` carrying
  `source: "live" | "fallback"` plus an optional `error` so the UI
  can label what it is showing.
- The queries fall back to `lib/dashboard/fallback-data.ts` whenever
  the client is `null` (no env vars) or a Supabase error is surfaced.
- Typed read helpers live in `lib/supabase/read-models.ts` with
  **explicit column allowlists** for privacy-sensitive surfaces
  (e.g. `LEADER_FOLLOW_UP_COLUMNS` omits `admin_private_note`;
  `SHEPHERD_CARE_*` columns are admin-only). No `select("*")` on
  sensitive tables.

## Write path

- All app-driven writes flow through narrow `SECURITY DEFINER` RPCs
  named `public.admin_*`, `public.leader_*`, or
  `public.super_admin_*`. Each writes a paired `audit_events` row in
  the same transaction; if the audit insert fails, the data change
  rolls back.
- **No service role key in the Next runtime.** Service role is
  confined to Supabase Edge Functions (`invite-user`,
  `manage-test-auth-users`).
- **No hard deletes** in normal workflows. Operational tables use
  soft-deactivation (`status`, `archived_at`, `ended_at`, `active`).

## Row Level Security

- Helper SQL functions in `public` (`auth_profile_id`, `auth_role`,
  `auth_is_admin`, `auth_is_leader_of`, …) drive the read policies.
- Every operational table has RLS enabled:
  - Admins (`super_admin` / `ministry_admin`) read everything.
  - Leaders / co-leaders read only rows scoped to their active group
    assignments via `auth_is_leader_of(group_id)`.
  - `audit_events` is admin-only.
  - Shepherd-care tables are admin-only — no leader path.
- Write policies are deliberately absent at the table level; writes go
  through the RPCs above.

## Runtime boundaries

- Env vars (`NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) are **optional** for build.
  Without them, the Supabase clients return `null` and protected
  routes redirect to `/login`.
- No service role key is referenced, imported, or expected in any
  client or server path inside Next.
- No realtime subscriptions, cron, or background jobs at runtime.
