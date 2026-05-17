# Deployment Notes

## Current (through Phase 2)
- Deploy to Vercel as a standard Next.js app.
- Supabase environment variables are **not required** for build/runtime yet.
- Do not import live Supabase query paths into pages until later phases.

## When Supabase is introduced (future phases)
- Add required `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to Vercel.
- Apply migrations then seed data in Supabase.
- Roll out auth and RLS in Phase 4.
