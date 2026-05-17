# Architecture

## Current stack
- Next.js App Router frontend.
- TypeScript across app.
- Tailwind styling with reusable UI primitives and dashboard design components.
- Supabase-ready placeholders under `lib/supabase`.

## Phase 1 UI foundation
- Reusable layout shell and section headers for page consistency.
- Reusable dashboard cards, placeholders, and status badges.
- Preview pages:
  - `/`
  - `/admin-preview`
  - `/leader-preview`
- Static sample content only (no runtime data reads).

## Phase 2 database foundation (preserved)
- SQL schema/migrations live under `supabase/migrations`.
- Seed data lives under `supabase/seed`.
- Human-readable schema docs live under `docs/DATABASE_SCHEMA.md` and `docs/SEED_DATA.md`.
- Readable TypeScript schema/enums live under `types/database.ts` and `types/enums.ts`.

## Runtime boundaries for this phase
- No runtime Supabase client usage in pages.
- No auth/session integration yet.
- No Row Level Security policy implementation yet.
- Vercel build remains independent from Supabase environment variables.
