# Architecture

## Current stack
- Next.js App Router frontend.
- TypeScript across app.
- Tailwind styling with reusable UI primitives.
- Supabase-ready placeholders under `lib/supabase`.

## Phase 2 database foundation
- SQL schema/migrations live under `supabase/migrations`.
- Fake seed data lives under `supabase/seed`.
- Human-readable schema docs live under `docs/DATABASE_SCHEMA.md` and `docs/SEED_DATA.md`.
- Readable TypeScript schema/enums live under `types/database.ts` and `types/enums.ts`.

## Runtime boundaries for this phase
- No runtime Supabase client usage in pages.
- No auth/session integration yet.
- No Row Level Security policy implementation yet.
- Vercel build remains independent from Supabase environment variables.
