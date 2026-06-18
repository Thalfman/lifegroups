---
type: Runbook
title: Operational Runbooks
description: Common operational issues inferable from the repo — env/build failures, migration drift, auth/email problems, rate-limit behavior — and where the full runbooks live.
resource: repo://docs/runbooks
tags: [runbooks, operations, troubleshooting, incident]
timestamp: 2026-06-18T00:00:00Z
---

# Purpose

First-stop triage for the failure modes this architecture makes likely. Points
to the repo's existing runbooks for depth.

# Source of truth

- `docs/runbooks/`: `RELEASE.md`, `LAUNCH_RUNBOOK.md`, `BACKUP_AND_RESTORE.md`,
  `INCIDENT_RESPONSE.md`, `OBSERVABILITY.md`, `rls-integration-harness.md`,
  `care-notes-visibility-setup.md`, `SEEDED_AUTH_ROUTE_SMOKE.md`
- `docs/architecture/DEPLOYMENT.md`, `EMAIL_DELIVERY.md`

# Key details — common issues

## Protected routes redirect to /login locally

Cause: Supabase env vars unset → server client is `null` (demo mode). Fix: set
`NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in
`.env.local`. Public preview routes still render demo data by design.

## Code shipped but feature 500s / column missing

Cause: migration not applied (migrations never auto-deploy). Fix: `supabase db
push` then `supabase migration list` to confirm parity. Follow `RELEASE.md`
(schema-first). This drift has happened in production before.

## Invite/reset emails go to wrong host or don't send

Causes: (a) email templates hard-code origin — re-paste `invite.html` /
`recovery.html` into the Supabase dashboard after an origin change; (b) prod
needs custom SMTP (default sender is test-only/rate-limited). See
`EMAIL_DELIVERY.md`.

## Leader can't log in / lands on /unauthorized

Causes: `leader_surface` flag frozen in `/admin/super-admin`; or profile
`status≠active` (→ `auth_profile_id()` NULL → RLS denies). Check the flag and
profile status. **Not** a cause: an empty `group_leaders` set — `requireLeader()`
still admits an active leader with the flag live; `/leader` just renders the
empty state and `/leader/[groupId]/*` redirects back to `/leader`.

## Over-shepherd sees nothing

Cause: `auth_over_shepherd_id()` requires exactly one active `over_shepherds`
row matched by email — 0 or >1 matches resolve to NULL. Verify the email
mapping and active coverage assignments.

## Rate limiting not working in prod

Causes: (a) Upstash env unset → `rate-limit.ts` returns `configured: false` and
the browser-flow checks **allow every request** (no process-local in-memory
bucket — Redis is simply absent for forgot-password / invite throttles; the Edge
`redeem-invite` DB throttle is separate). Set `UPSTASH_REDIS_REST_URL` +
`_TOKEN`. (b) **per-IP buckets silently skipped** because `extractClientIp()`
returns null unless `TRUSTED_PROXY` is set (the launch runbook uses
`TRUSTED_PROXY=vercel`). Setting Redis alone is not enough — set `TRUSTED_PROXY`
too or the IP throttles never engage.

## CI fails on fitness test

Cause: a security invariant regressed (`select("*")`, direct table write,
missing audit pairing, hardcoded identity, action not using run-action). Fix the
code — these are intentional gates, not flakes. See
[testing](/okf/workflows/testing.md).

## Build fails on missing toolchain

`verify:toolchain` failed — run `npm install`.

## Permanent deletion / data recovery

Permanent deletion writes a **tombstone** (recoverable row snapshot);
clean-slate/history resets write snapshots. Recovery via super-admin restore
RPCs and `BACKUP_AND_RESTORE.md`.

# Relationships

- [/okf/workflows/deployment.md](/okf/workflows/deployment.md)
- [/okf/config/environment.md](/okf/config/environment.md)
- [/okf/auth/auth-overview.md](/okf/auth/auth-overview.md)
- [/okf/integrations/index.md](/okf/integrations/index.md)

# Gotchas

- Observability: structured JSON logs (`event`, `outcome`, `actor_role`,
  `latency_ms`, `request_id`) collectable from the log drain; `read_bundle`
  lines time server reads. Authed `/admin/*` can't be timed locally (redirect
  without Supabase env). See `OBSERVABILITY.md`.
- Logs never contain passwords/bodies (fitness-checked) — don't expect to debug
  note contents from logs.

# Citations

- `docs/runbooks/RELEASE.md`
- `docs/runbooks/INCIDENT_RESPONSE.md`
- `docs/architecture/EMAIL_DELIVERY.md`
- `lib/security/rate-limit.ts`
