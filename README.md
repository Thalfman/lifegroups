# Life Group Operations Dashboard

This repository contains the Life Group Operations Dashboard web app built with Next.js, TypeScript, and Tailwind.

## Phase status
- Phase 0/1: app foundation and preview UI.
- **Phase 2 (this update): Supabase schema, enums, seed data, and docs only.**
- No live Supabase authentication or production data access yet.

## Local development
1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy env template:
   ```bash
   cp .env.example .env.local
   ```
3. Run dev server:
   ```bash
   npm run dev
   ```

## Scripts
- `npm run dev`
- `npm run lint`
- `npm run typecheck`
- `npm run build`

## Supabase notes
- Migration files: `supabase/migrations`
- Seed files: `supabase/seed`
- Build remains Vercel-compatible without Supabase env vars in Phase 2.
- Supabase runtime integration lands in later phases.
