# Deployment Notes

## Hosting

- Deploy to **Vercel** as a standard Next.js app. The Vercel project is
  Git-integrated: merging to `main` builds and promotes production
  automatically.
- Targets **Vercel Hobby** + **Supabase Pro** (Pro is a production
  requirement — daily backups, no auto-pause) — see
  [`FREE_TIER_NOTES.md`](./FREE_TIER_NOTES.md) for the tier posture.
- Supabase environment variables are **optional** for build. Without
  them, protected routes redirect to `/login` at request time and the
  build does not fail.

> **Releases:** code deploys automatically; **migrations never do**. Every
> release that includes a migration follows
> [`../runbooks/RELEASE.md`](../runbooks/RELEASE.md). Go-live steps live in
> [`../runbooks/LAUNCH_RUNBOOK.md`](../runbooks/LAUNCH_RUNBOOK.md); recovery
> in [`../runbooks/BACKUP_AND_RESTORE.md`](../runbooks/BACKUP_AND_RESTORE.md).

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

**Public endpoint throttles**:

```text
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
RATE_LIMIT_HMAC_SECRET=...
TRUSTED_PROXY=vercel
```

`RATE_LIMIT_HMAC_SECRET` is required in production and must be a strong,
server-only value. It HMACs IP identifiers before rate-limit persistence for
the Next.js forgot-password, invite-redemption, and public-telemetry paths.
Set the same value for the `redeem-invite` Edge Function:

```shell
supabase secrets set RATE_LIMIT_HMAC_SECRET=...
```

The Edge Function fails closed if that secret is absent. Rotating it is safe
but intentionally resets active rate-limit buckets in both runtimes. Never use
a `NEXT_PUBLIC_` name or put the value in logs.

Upstash supplies the distributed Next.js limits and is strongly recommended
in production. If Upstash is absent or errors, public telemetry stays bounded
by a memory-limited per-process fallback; the password-reset and Next invite
layers log the configuration/backend gap. The `redeem-invite` Edge Function
also enforces its service-only database throttle with the same HMAC identifier.

**Do not** set a service role key in any Next runtime environment. The
app never reads one. Service role is confined to Supabase Edge
Functions (`invite-user`, `redeem-invite`, and `purge-profile-auth`) and
lives in their function secrets. `manage-test-auth-users` is local/test-only.

## Supabase project setup

1. Create a Supabase project.
2. Apply all migrations under `supabase/migrations/` in order
   (`supabase link --project-ref <ref>` then `supabase db push` — the
   CLI records each file under its repo version number, which is what
   keeps local and remote histories comparable). The
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
   `ministry_admin`, leaders) are then invited from the Super-Admin
   console at `/admin/super-admin` (Invite user → the invitee redeems
   the emailed link and sets a password).
