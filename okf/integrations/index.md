---
type: Integration
title: External Integrations
description: Supabase (Auth/Postgres/RLS/Edge), Upstash Redis rate limiting, Vercel hosting/analytics, and Supabase Auth email delivery.
resource: repo://lib
tags: [integrations, supabase, upstash, vercel, email, edge-functions]
timestamp: 2026-06-18T00:00:00Z
---

# Purpose

Lists every third-party dependency that carries app behavior, how it's wired,
and its failure mode. There are no payment, queue, or AI integrations.

# Source of truth

- `lib/supabase/*`, `lib/security/rate-limit.ts`, `lib/security/headers.ts`
- `app/layout.tsx` (Vercel components)
- `supabase/functions/*`, `supabase/templates/*`, `supabase/config.toml`
- `docs/architecture/EMAIL_DELIVERY.md`

# Key details

## Supabase (core platform)

`@supabase/supabase-js` (typed reads) + `@supabase/ssr` (cookie sessions).
Postgres with RLS on every operational table; all writes via `SECURITY DEFINER`
RPCs. Server client in `lib/supabase/server.ts` returns `null` when env unset.
Three Edge Functions (Deno) hold the only service-role usage:
`invite-user` (prod), `redeem-invite` (prod, public), `manage-test-auth-users`
(disabled). See [API](/okf/api/index.md).

## Upstash Redis (rate limiting)

`@upstash/ratelimit` + `@upstash/redis` in `lib/security/rate-limit.ts`.
Sliding-window limiters:

- forgot-password: per-IP 5/15min, per-email 3/15min (from `forgot-password/actions.ts`)
- invite-redeem: per-IP ~10/15min (from `invite/[token]/actions.ts`); the Edge
  function adds a DB-backed per-IP throttle (`check_invite_redeem_rate`)

**Fails open:** missing env (`configured: false`) or backend error → request
**allowed** (logged `rate_limit_disabled` / `rate_limit_backend_error`). There is
**no** process-local in-memory fallback for the browser flows — without Upstash,
forgot-password / invite-redeem are simply unthrottled (the Edge `redeem-invite`
DB throttle is separate). Per-IP buckets also need `TRUSTED_PROXY` set, else
`extractClientIp()` is null and the IP check is skipped.

## Vercel (hosting + telemetry)

Git-integrated hosting (auto-deploy on merge to main). `@vercel/analytics`
(Web Vitals) + `@vercel/speed-insights` (RUM) mounted in `app/layout.tsx`.
Security headers (`lib/security/headers.ts`) allow Vercel script + vitals hosts
(CSP report-only).

## Email delivery (Supabase Auth)

No separate transactional provider — Supabase Auth sends invite + password-reset
emails. Production needs custom SMTP configured in the Supabase dashboard (the
default sender is test-only / rate-limited). Templates in `supabase/templates/`
(`invite.html`, `recovery.html`) hard-code the canonical origin (not
`{{ .SiteURL }}`) and use token_hash links to defend against mail-scanner GETs.

# Relationships

- [/okf/api/index.md](/okf/api/index.md)
- [/okf/config/environment.md](/okf/config/environment.md)
- [/okf/auth/auth-overview.md](/okf/auth/auth-overview.md)
- [/okf/runbooks/index.md](/okf/runbooks/index.md)
- [/okf/workflows/deployment.md](/okf/workflows/deployment.md)

# Gotchas

- The service role is confined to Edge Functions — never reference it in Next.
- Email templates must be manually re-pasted into the Supabase dashboard after
  an origin change.
- Rate limiting failing open means a missing Upstash config silently weakens
  abuse protection in production.
- `invite-user` pads latency (~1200–1850ms) to defeat user-enumeration timing.

# Citations

- `lib/security/rate-limit.ts`
- `app/layout.tsx`
- `supabase/functions/invite-user/index.ts`, `supabase/functions/redeem-invite/index.ts`
- `docs/architecture/EMAIL_DELIVERY.md`
