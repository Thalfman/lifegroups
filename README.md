# Life Group Operations Dashboard

This repository contains the Life Group Operations Dashboard web app built with Next.js, TypeScript, and Tailwind.

## Phase status
- Phase 0: app foundation. ✅
- Phase 1: visual design system + admin/leader preview experiences. ✅
- Phase 2: Supabase schema, enums, seed data, and docs. ✅
- **Phase 3 (current): safe Supabase read integration with fallback demo data.**
- Phase 4 (next): Supabase auth, Row Level Security, and the first write workflows.

## Local development
1. Install dependencies:
   ```bash
   npm install
   ```
2. (Optional) connect to a real Supabase project to see live data:
   ```bash
   cp .env.example .env.local
   # then fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
   ```
   Without env vars, the app renders typed fallback demo data on every page.
3. Run dev server:
   ```bash
   npm run dev
   ```

## Scripts
- `npm run dev`
- `npm run lint`
- `npm run typecheck`
- `npm run build`

## How data loads in Phase 3
- `app/admin-preview/page.tsx` and `app/leader-preview/page.tsx` are async Server
  Components that call `lib/dashboard/queries.ts`.
- The query layer asks `lib/supabase/config.ts::isSupabaseConfigured()` whether
  the env vars are set. If not, it returns `lib/dashboard/fallback-data.ts`
  immediately.
- If configured, it runs a handful of small read-only Supabase queries from
  `lib/supabase/read-models.ts` and composes the dashboard DTOs in TypeScript.
- Every page header shows a `DataSourceBadge` so it is obvious whether you are
  looking at live Supabase data or fallback demo data.

## Supabase notes
- Migration file: `supabase/migrations/20260517040000_phase2_schema.sql`
- Seed file: `supabase/seed/phase2_seed.sql`
- Schema docs: `docs/DATABASE_SCHEMA.md` and `docs/SEED_DATA.md`
- Env vars are **optional** for build; required only for live data.
- Auth, RLS, and write workflows are intentionally deferred to Phase 4.
