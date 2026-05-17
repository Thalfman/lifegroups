# Deployment Notes

## Current (Phase 3 — safe Supabase read integration)
- Deploy to Vercel as a standard Next.js app.
- Supabase environment variables are **optional** for build. Without them, the
  preview pages render typed fallback demo data.
- With env vars configured, the same pages run read-only Supabase queries via
  `lib/supabase/client.ts::getReadClient()`.
- `/admin-preview` and `/leader-preview` are marked `dynamic = "force-dynamic"`
  so deploys never bake stale data into the build output.
- No auth, no RLS, no write paths. A publishable (or legacy anon) key alone is
  used for reads.

## Environment variables
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

Set these in the Vercel project settings (Production + Preview). Local dev uses
`.env.local`; copy from `.env.example` and fill in values to read live data.

`NEXT_PUBLIC_SUPABASE_ANON_KEY` is still honored as a fallback when no
publishable key is set, but it is not required for build, preview, production,
or runtime.

## Supabase project setup
1. Create a free Supabase project.
2. Apply `supabase/migrations/20260517040000_phase2_schema.sql`.
3. Apply `supabase/seed/phase2_seed.sql` to populate sample data.
4. From Project Settings → API, copy the project URL and **publishable** key
   into the Vercel env vars above. Do not paste the service role key.

## What lands in Phase 4
- Supabase auth, RLS policies, and assigned-leader scoping.
- The first write paths: attendance submission, guest capture, follow-up state
  changes.
