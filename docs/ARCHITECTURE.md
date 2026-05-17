# Architecture

## Runtime
- Next.js App Router (React Server Components by default).
- TypeScript strict mode.
- Tailwind CSS + CSS variables for tokens.

## UI structure
- `components/layout/*` contains shell/navigation/page framing.
- `components/dashboard/*` contains reusable preview cards/badges/states.
- `components/ui/*` contains primitive UI building blocks.

## Current boundaries
- No Supabase client initialization in runtime paths.
- No auth, server actions, cron, workers, or external paid services.
- Static sample content only for Phase 1 previews.
