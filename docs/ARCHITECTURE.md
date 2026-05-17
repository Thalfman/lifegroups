# Architecture

## Current stack
- Next.js 15 App Router frontend (React Server Components).
- TypeScript across app.
- Tailwind styling with reusable UI primitives and dashboard design components.
- `@supabase/supabase-js` read-only client under `lib/supabase/`.

## Phase 1 UI foundation (preserved)
- Reusable layout shell and section headers for page consistency.
- Reusable dashboard cards, placeholders, and status badges.
- Preview pages:
  - `/`
  - `/admin-preview`
  - `/leader-preview`

## Phase 2 database foundation (preserved)
- SQL schema/migrations live under `supabase/migrations`.
- Seed data lives under `supabase/seed`.
- Human-readable schema docs live under `docs/DATABASE_SCHEMA.md` and `docs/SEED_DATA.md`.
- Readable TypeScript schema/enums live under `types/database.ts` and `types/enums.ts`.

## Phase 3 read data flow
- Pages (`app/admin-preview/page.tsx`, `app/leader-preview/page.tsx`) are async Server
  Components that call into the dashboard data layer.
- `lib/dashboard/queries.ts` exposes `getAdminDashboardData()` and
  `getLeaderDashboardData()`. Each returns a `DashboardResult<T>` carrying
  `source: "live" | "fallback"` plus optional `error` so the UI can label what it is
  showing.
- The queries first check `lib/supabase/config.ts::isSupabaseConfigured()`. When env
  vars are missing they immediately return the typed fallback data from
  `lib/dashboard/fallback-data.ts`. When configured, they call the typed read
  helpers in `lib/supabase/read-models.ts` and compose DTOs in TypeScript (no
  stored procedures).
- Any thrown error or surfaced Postgrest error falls back to demo data with the
  error message included for the UI to render via `DashboardErrorNotice`.

## Runtime boundaries for this phase
- Supabase client is **read-only**; no inserts, updates, deletes, RPC writes, or
  server actions exist.
- No auth/session integration; the leader dashboard picks the first active group
  as a stand-in until Phase 4 wires Supabase Auth, protected routes, role-aware
  access, and assigned-leader scoping.
- No Row Level Security policy enforcement. Live mode reads with the public anon
  key — Phase 4 introduces RLS-bound reads scoped to the authenticated leader or
  admin.
- Phase 4 is a security foundation only — it does not add write paths. The first
  write workflows (attendance submission, guest capture, follow-up updates, and
  admin review queues) arrive in Phase 5 once RLS has been verified end-to-end.
- The Vercel build remains independent from Supabase environment variables; pages
  render demo data when env vars are missing.
