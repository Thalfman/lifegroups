# Deployment Notes

## Current (Phase 4 security foundation + Phase 4.1 docs/dev-helper patch)
- Deploy to Vercel as a standard Next.js app.
- Supabase environment variables are **optional** for build. Without them, the
  public preview pages render demo data and the protected routes redirect to
  `/login` at request time (no build break).
- With env vars configured, the protected routes (`/admin`, `/leader`,
  `/staff`) read through the cookie-authenticated server client and Row Level
  Security.
- `/admin-preview` and `/leader-preview` are permanently public demo pages
  that always render fallback data; they do not call Supabase.
- All operational tables have RLS enabled. Only SELECT policies exist in this
  phase — write workflows ship in Phase 5.

## Environment variables
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

Set these in the Vercel project settings (Production + Preview). Local dev
uses `.env.local`; copy from `.env.example` and fill in values to read live
data and exercise sign-in.

`NEXT_PUBLIC_SUPABASE_ANON_KEY` is still honored as a fallback when no
publishable key is set, but it is not required for build, preview, production,
or runtime.

**Do not** add a service role key. The app never reads one and refuses to
behave as a backend admin.

## Supabase project setup
1. Create a free Supabase project.
2. Apply schema and seed:
   - `supabase/migrations/20260517040000_phase2_schema.sql`
   - `supabase/seed/phase2_seed.sql`
3. Apply Phase 4 RLS:
   - `supabase/migrations/20260518000000_phase4_rls.sql`
4. From Project Settings → API, copy the project URL and **publishable** key
   into the Vercel env vars above. Do not paste the service role key.
5. Create one Supabase Auth user per seed profile email
   (`avery.bennett@example.org`, `jordan.hayes@example.org`,
   `casey.morgan@example.org`, etc.) with a development-only password.
6. **Bootstrap your `super_admin`:** see "Super admin bootstrap" in
   `supabase/dev/README.md` and use
   `supabase/dev/link_super_admin.sql.example` to link your own Supabase
   Auth user to a `super_admin` profile.
7. Link each seed auth user to its profile row by following
   `supabase/dev/README.md`.
8. Visit `/login` and sign in.

## What lands next (Phase 5A → Phase 5B)
After RLS SELECT policies are verified end-to-end in Phase 4 and the role
model is documented in Phase 4.1:

- **Phase 5A — admin people & role management.** Narrow, allowlisted
  workflows for `super_admin` / `ministry_admin` to create and update
  admin, leader, and member records. Each workflow gets a dedicated server
  action and a matching narrow INSERT/UPDATE RLS policy. See
  `docs/PHASE_5A_ADMIN_MANAGEMENT.md`.
- **Phase 5B — operational writes.** Attendance submission, guest capture,
  follow-up updates, and admin review queues. These arrive alongside the
  broader operational INSERT / UPDATE / DELETE RLS policies.

Neither phase introduces a service role key. The cookie-authenticated
server client remains the only path for writes.
