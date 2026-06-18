---
type: Workflow
title: Deployment & Release Flow
description: Vercel auto-deploys code on merge to main; migrations and Edge Functions are released manually and separately.
resource: repo://docs/runbooks/RELEASE.md
tags: [deployment, vercel, supabase, migrations, edge-functions, release]
timestamp: 2026-06-18T00:00:00Z
---

# Purpose

The single most important release rule: **code deploys automatically;
migrations never do.** Forgetting this leaves production code ahead of its
schema. This file captures the three independent release tracks.

# Source of truth

- `docs/architecture/DEPLOYMENT.md`, `docs/runbooks/RELEASE.md`
- `docs/runbooks/LAUNCH_RUNBOOK.md`, `docs/runbooks/BACKUP_AND_RESTORE.md`
- `supabase/config.toml`, `supabase/migrations/`, `next.config.ts`

# Key details

## Hosting

Vercel (Git-integrated). Targets Vercel Hobby + Supabase **Pro** (daily
backups, no auto-pause). Live: `https://fvclifegroups.vercel.app/`.

## Track 1 — Code (automatic)

Merge PR to `main` → Vercel builds (`npm run build`, inlines `NEXT_PUBLIC_*`)
and promotes to production. No migrations run.

## Track 2 — Schema migrations (manual, schema-first)

Migrations are **never** auto-applied. From the approved branch:

```bash
supabase link --project-ref <prod-ref>
supabase db push          # applies pending migrations in timestamp order
supabase migration list   # verify local and remote columns match
```

Apply the migration **before** the code that depends on it ships
(schema-first). Follow `docs/runbooks/RELEASE.md`.

## Track 3 — Edge Functions (manual, separate)

```bash
supabase functions deploy invite-user redeem-invite
```

Production runs only `invite-user` + `redeem-invite`.
`manage-test-auth-users` is `enabled=false` so a blanket deploy / the Supabase
GitHub integration won't push it.

## Build-time vs runtime

`NEXT_PUBLIC_*` are inlined at build — changing them requires a rebuild. Server
env (Supabase URL/key fallback, Upstash, log salt) is read at runtime.

## Recovery / go-live

`LAUNCH_RUNBOOK.md` (go-live steps), `BACKUP_AND_RESTORE.md` (recovery),
super-admin clean-slate snapshots + tombstones for data recovery.

# Relationships

- [/okf/config/environment.md](/okf/config/environment.md)
- [/okf/integrations/index.md](/okf/integrations/index.md)
- [/okf/runbooks/index.md](/okf/runbooks/index.md)
- [/okf/workflows/testing.md](/okf/workflows/testing.md)

# Gotchas

- **Migrations don't auto-deploy.** Production has drifted behind `main` before
  — verify `supabase migration list` parity after every schema release.
- Do not set a service-role key in any Vercel env.
- Email templates pin a hard-coded origin — re-paste in the Supabase dashboard
  after an origin change.
- The Supabase GitHub integration redeploys all `enabled=true` functions on
  push — `manage-test-auth-users` stays `enabled=false` to avoid that.

# Citations

- `docs/architecture/DEPLOYMENT.md:1-75`
- `docs/runbooks/RELEASE.md`
- `supabase/config.toml`
