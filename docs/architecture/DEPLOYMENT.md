# Deployment Notes

## Hosting

- Deploy to **Vercel** as a standard Next.js app.
- Targets **Vercel Hobby** + **Supabase Free** — see
  [`FREE_TIER_NOTES.md`](./FREE_TIER_NOTES.md) for the constraints
  this implies.
- Supabase environment variables are **optional** for build. Without
  them, protected routes redirect to `/login` at request time and the
  build does not fail.

## Environment variables

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

Set both in Vercel project settings (Production + Preview). Locally,
copy `.env.example` to `.env.local` and fill in values to read live
data and exercise sign-in.

`NEXT_PUBLIC_SUPABASE_ANON_KEY` is still honored as a fallback when no
publishable key is set, but is not required.

**Forgot-password throttle** (optional but recommended in production):

```
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

When unset, `lib/security/rate-limit.ts` falls back to a permissive
in-memory limiter that does not protect against distributed abuse.

**Do not** set a service role key in any Next runtime environment. The
app never reads one. Service role is confined to Supabase Edge
Functions (`invite-user`, `manage-test-auth-users`) and lives in their
function secrets.

## Supabase project setup

1. Create a Supabase project.
2. Apply all migrations under `supabase/migrations/` in order. The
   active schema includes profiles + role enum, groups, members,
   group memberships, attendance, guests, follow-ups, audit events,
   app settings, shepherd-care tables, over-shepherds + coverage
   assignments, launch-planning scenarios, and the RLS + RPC
   foundations.
3. Apply `supabase/seed/phase2_seed.sql` for fictional operational
   data suitable for local dashboard prototyping.
4. From Project Settings → API, copy the project URL and
   **publishable** key into the Vercel env vars above. Do **not**
   paste the service role key.
5. Deploy the Edge Functions under `supabase/functions/` if you need
   the invite-user workflow.
6. Bootstrap your own `super_admin` and link seed auth users by
   following [`supabase/dev/README.md`](../../supabase/dev/README.md).
7. Visit `/login` and sign in. Real users (Julian as
   `ministry_admin`, leaders) are then invited from
   `/admin/super-admin` — see
   [`SUPER_ADMIN_INVITE_USER_WORKFLOW.md`](../archive/SUPER_ADMIN_INVITE_USER_WORKFLOW.md).
