# Life Group Operations Dashboard

This repository contains the Life Group Operations Dashboard web app built with Next.js, TypeScript, and Tailwind.

## Phase status
- Phase 0: app foundation.
- **Phase 1 (current): visual design system + admin/leader preview experiences.**
- Phase 2: Supabase schema, enums, seed data, and docs.
- No live Supabase authentication or production data access yet.

## Local development
1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy env template (optional for current phase):
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
- Schema docs: `docs/DATABASE_SCHEMA.md` and `docs/SEED_DATA.md`
- Build remains Vercel-compatible **without** Supabase env vars in this phase.
- Runtime Supabase integration, auth, and RLS land in later phases.
