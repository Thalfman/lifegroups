# Life Group Operations Dashboard

This repository contains the Life Group Operations Dashboard web app built with Next.js, TypeScript, and Tailwind.

## Phase status
- Phase 0: app foundation. ✅
- Phase 1: visual design system + admin/leader preview experiences. ✅
- Phase 2: Supabase schema, enums, seed data, and docs. ✅
- Phase 3: safe Supabase read integration with fallback demo data. ✅
- **Phase 4 (current): security foundation — Supabase Auth, protected routes, role-aware access, assigned leader scoping, and Row Level Security policy enforcement.**
- Phase 5 (next): first write workflows after RLS is verified — attendance submission, guest capture, follow-up updates, and admin review queues.

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
- **Protected (sign-in required)**: `/admin`, `/leader`, `/staff`. Each enforces
  its own role gate and reads through Supabase Auth / RLS.

## Role model
Roles live on `profiles.role` (the existing `user_role` enum):
- `super_admin`, `ministry_admin` → admin dashboards.
- `staff_viewer` → ministry-wide read-only view.
- `leader`, `co_leader` → only their assigned groups.

`super_admin` is treated as a superset of `ministry_admin`.

## Sign-in setup
1. Apply `supabase/migrations/20260517040000_phase2_schema.sql`,
   `supabase/seed/phase2_seed.sql`, and
   `supabase/migrations/20260518000000_phase4_rls.sql`.
2. Create one Supabase Auth user per seed profile email
   (`avery.bennett@example.org`, `jordan.hayes@example.org`,
   `casey.morgan@example.org`, etc.) with a development-only password.
3. Link each auth user to its profile row by following
   `supabase/dev/README.md`.
4. Visit `/login` and sign in with the email + password you set.

## How data loads
- Protected routes use a cookie-authenticated server client built with
  `@supabase/ssr`. Every query runs through Row Level Security and is
  automatically scoped to the signed-in user.
- Public preview routes always render fallback demo data; they do not call
  Supabase.
- When Supabase env vars are missing, protected routes redirect to `/login`
  and the preview routes still render demo data.

## Supabase notes
- Schema migration: `supabase/migrations/20260517040000_phase2_schema.sql`
- RLS migration: `supabase/migrations/20260518000000_phase4_rls.sql`
- Seed file: `supabase/seed/phase2_seed.sql`
- Dev auth bootstrap: `supabase/dev/README.md`
- Schema docs: `docs/DATABASE_SCHEMA.md` and `docs/SEED_DATA.md`
- Env vars are **optional** for build; required only for sign-in and live data.
- No service role key is used or expected anywhere in app code. Write
  workflows are deferred to Phase 5 once RLS is verified end-to-end.
