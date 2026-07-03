# Architecture

Snapshot of the running app — a behavior-level map of routes, auth, and the
read/write boundaries. It deliberately **cross-links** the detailed docs rather
than duplicating them:

- Product direction — [`PRD.md`](../PRD.md) and the
  [`README.md`](../../README.md) role model + route table.
- SQL schema — [`DATABASE_SCHEMA.md`](./DATABASE_SCHEMA.md).
- Visibility ladder + the two privacy exceptions —
  [`RLS_VISIBILITY.md`](./RLS_VISIBILITY.md). Rendered diagrams (inline SVG +
  viewer links, auto-built from the `*.drawio` sources) live in
  [`diagrams.md`](./diagrams.md): the oversight ladder (downward-visibility),
  the Care · Plan · Multiply nav spine, and the system architecture
  (read/write paths).
- Email / invite delivery — [`EMAIL_DELIVERY.md`](./EMAIL_DELIVERY.md).
- Deploy + Edge-Function release boundary —
  [`DEPLOYMENT.md`](./DEPLOYMENT.md) and
  [`../runbooks/RELEASE.md`](../runbooks/RELEASE.md).

The navigation spine is the **2026-06 Care · Plan · Multiply pivot** (ADR 0016).
Pre-pivot surfaces are not deleted — they stay resolvable by direct URL behind
hidden nav flags and now carry a "preserved, not actively maintained" banner
(#596).

## Stack

- Next.js 16 App Router (React Server Components) + TypeScript.
- Tailwind + a small in-house design system under `components/lg/`
  (warm-pastoral: Newsreader / Geist / JetBrains Mono, OKLCH cream /
  sage / clay, 232px sidebar shell, mobile drawer below 768px).
- Supabase: `@supabase/supabase-js` for typed reads,
  `@supabase/ssr` for cookie-aware server/browser auth clients,
  Postgres with RLS, Edge Functions for service-role workflows.
- Upstash Redis + `@upstash/ratelimit` for the forgot-password
  throttle.

## Routes

See the README route table for the canonical list; this is the behavior-level
shape. The full enumeration lives in `app/`.

- **Public** (no auth): `/`, `/login`, `/forgot-password`,
  `/reset-password`, `/unauthorized`, `/welcome`, `/support`,
  `/account-deletion`, `/privacy`, and `/invite/[token]` (self-signup invite
  redemption). `/a11y-harness` is a build-time test route gated behind
  `NEXT_PUBLIC_A11Y_HARNESS` and never ships in a normal build.
- **Protected** (under `app/(protected)/`):
  - Shared signed-in: `/account`.
  - Admin (`ministry_admin` + `super_admin`) — the visible nav spine is
    **Care · Plan · Multiply**: `/admin` (landing), `/admin/care`,
    `/admin/plan`, `/admin/multiply` (+ `/admin/multiply/criteria`,
    `/admin/multiply/settings`), joined by the **Groups** and **People**
    management tabs (`/admin/groups`, `/admin/groups/[groupId]`,
    `/admin/groups/[groupId]/calendar`, `/admin/people`,
    `/admin/people/[kind]/[personId]`) and `/admin/settings`. The
    shepherd-care detail surfaces back the Care area:
    `/admin/shepherd-care`, `/admin/shepherd-care/[profileId]`,
    `/admin/shepherd-care/over-shepherds`,
    `/admin/shepherd-care/over-shepherds/[overShepherdId]`.
  - **Off-nav frozen** pre-pivot surfaces (resolve by direct URL,
    role-guarded, banner-annotated): `/admin/guests`, `/admin/check-ins`,
    `/admin/check-ins/[groupId]`, `/admin/leader-pipeline`,
    `/admin/group-health`, `/admin/planning`, `/admin/launch-planning`,
    `/admin/calendar`. `/admin/follow-ups` is a **Care alias** — it
    alias-renders the canonical `/admin/care` shell on the Follow-ups tab
    (a 200, never a redirect), so it is not "frozen" and carries no banner.
  - `super_admin` only: `/admin/super-admin`.
  - Over-Shepherd: `/over-shepherd`, `/over-shepherd/[profileId]`.
  - Leader: `/leader`, `/leader/[groupId]/calendar`,
    `/leader/[groupId]/checkin`, `/leader/[groupId]/care`.

The protected route group's layout redirects unauthenticated users to
`/login` and signed-in users without a linked profile to
`/unauthorized`. Each page then applies its own role check via the
redirect-guards in `lib/auth/session.ts`.

`staff_viewer` is deprecated. The enum value is retained for
backwards compatibility; the `/staff` surface was removed.

## Auth + session

- **Supabase clients** in `lib/supabase/`:
  - `server.ts` — cookie-aware `createSupabaseServerClient()` for
    Server Components and Server Actions.
  - `middleware.ts` — `updateSupabaseSession()` refreshes auth cookies
    on every request. Wired via the root `proxy.ts` (Next 16's renamed
    `middleware` convention).
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

- `lib/dashboard/queries.ts` exposes `getAdminDashboardData(client)`,
  which returns a `DashboardResult<T>` carrying
  `source: "live" | "fallback"` plus an optional `error` so the UI
  can label what it is showing. (The dormant leader-dashboard
  orchestrator was retired to git history — the live `/leader` surface
  reads through `lib/leader/leader-reads.ts` instead.)
- The query falls back to `lib/dashboard/fallback-data.ts` whenever
  the client is `null` (no env vars) or a Supabase error is surfaced.
- Typed read helpers live in `lib/supabase/read-models.ts` (and the
  per-surface `*-reads.ts` modules) with **explicit column allowlists**
  for privacy-sensitive surfaces (e.g. `LEADER_FOLLOW_UP_COLUMNS` omits
  `admin_private_note`; `SHEPHERD_CARE_*` columns are admin-only). There
  are **no** `select("*")` call sites on any table — every read names its
  columns.
- Reads flow through the **reads seam** (`lib/supabase/reads-seam.ts`,
  ADR 0015) so tests inject in-memory adapters instead of a live database,
  and reads **degrade gracefully** — a failed read suppresses derived
  output rather than reporting a false zero.

## Write path

- All app-driven writes flow through narrow `SECURITY DEFINER` RPCs —
  mostly the `public.admin_*`, `public.leader_*`,
  `public.over_shepherd_*`, and `public.super_admin_*` families, plus a
  few purpose-named ones (e.g. `set_note_transparency_grant`). Each writes
  a paired `audit_events` row in the same transaction; if the audit insert
  fails, the data change rolls back. Server Actions follow a fixed
  validate → guard → RPC → `revalidatePath` → log pipeline (the Write
  Action Runner, ADR 0001/0005).
- **No service role key in the Next runtime.** Service role is confined to
  Supabase Edge Functions. In production exactly **two** run: `invite-user`
  (super-admin-initiated invites) and `redeem-invite` (public token
  redemption). `manage-test-auth-users` is `enabled = false` in
  `supabase/config.toml` so it is never deployed to prod — local
  test-account seeding uses `npm run seed:test-auth` /
  `remove:test-auth` instead. See
  [`../runbooks/RELEASE.md`](../runbooks/RELEASE.md) and
  [`EMAIL_DELIVERY.md`](./EMAIL_DELIVERY.md).
- **No hard deletes** in normal workflows. Operational tables use
  soft-deactivation (`status`, `archived_at`, `ended_at`, `active`).
  Permanent deletion is Super-Admin-only, writes a tombstone, and lives in
  the danger zone.

## Row Level Security

- Helper SQL functions in `public` (`auth_profile_id`, `auth_role`,
  `auth_is_admin`, `auth_is_leader_of`, …) drive the read policies.
- Every operational table has RLS enabled:
  - Admins (`super_admin` / `ministry_admin`) read everything.
  - Leaders / co-leaders read only rows scoped to their active group
    assignments via `auth_is_leader_of(group_id)`.
  - `audit_events` is admin-only.
  - Shepherd-care tables are admin-only — no leader path.
- Two visibility exceptions ride on the ladder (full detail in
  [`RLS_VISIBILITY.md`](./RLS_VISIBILITY.md)): the Ministry Admin's
  **Private Care Note** (hidden even from the Super Admin, E2E-encrypted)
  and author-private **Care Notes** (sealed to their author until the
  Ministry Admin flips that person's transparency grant).
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
