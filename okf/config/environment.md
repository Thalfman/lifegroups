---
type: Configuration
title: Environment, Config & Feature Flags
description: Required vs optional env vars (build vs runtime), feature/frozen-surface flags, and where config lives — no secret values.
resource: repo://.env.example
tags: [config, environment, feature-flags, supabase, vercel]
timestamp: 2026-06-18T00:00:00Z
---

# Purpose

What must be set to run, build, and deploy, and what degrades gracefully when
unset. Critical for debugging "redirects to /login locally" and deployment.

# Source of truth

- `.env.example`, `docs/architecture/DEPLOYMENT.md`, `docs/architecture/EMAIL_DELIVERY.md`
- `lib/supabase/config.ts`, `lib/shared/site-origin.ts`, `lib/security/rate-limit.ts`
- `lib/observability/identifiers.ts`, `next.config.ts`, `supabase/config.toml`

# Key details

## Env vars are OPTIONAL for build

Without Supabase env vars the build succeeds, Supabase clients return `null`,
protected routes redirect to `/login`, and public preview routes render typed
demo data. This is intentional (demo mode).

## Next runtime env vars (no secret values shown)

`lib/env.ts` resolves the **server-only** names `SUPABASE_URL` /
`SUPABASE_PUBLISHABLE_KEY` **before** their `NEXT_PUBLIC_*` fallbacks. The
`NEXT_PUBLIC_*` forms are inlined at build; the server-only forms are read at
runtime — prefer them for a build-once / deploy-many (runtime-evaluated) setup so
the config isn't baked into the bundle.

| Name                                                                | Scope         | Required                          | Purpose                                                                                                           |
| ------------------------------------------------------------------- | ------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_URL` → `NEXT_PUBLIC_SUPABASE_URL`                         | server→public | for live data/sign-in             | Supabase project URL (server alias preferred, runtime-read)                                                       |
| `SUPABASE_PUBLISHABLE_KEY` → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | server→public | for live data/sign-in             | Publishable key (server alias preferred; the full `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is the inlined fallback) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`                                     | public        | fallback                          | Legacy anon key, accepted if publishable unset                                                                    |
| `NEXT_PUBLIC_SITE_URL` / `SITE_URL`                                 | public/server | optional                          | Public origin for invite/reset redirect links; defaults to request header                                         |
| `NEXT_PUBLIC_A11Y_HARNESS`                                          | build-time    | CI only                           | Enables `/a11y-harness` route (inlined at build)                                                                  |
| `UPSTASH_REDIS_REST_URL`                                            | server        | optional (recommended prod)       | Distributed rate limiting                                                                                         |
| `UPSTASH_REDIS_REST_TOKEN`                                          | server        | optional                          | Upstash auth token                                                                                                |
| `TRUSTED_PROXY`                                                     | server        | optional (needed for IP throttle) | Which proxy header to trust (`vercel`); without it `extractClientIp()` returns null and per-IP limits are skipped |
| `LOG_HASH_SALT`                                                     | server        | optional                          | Salt for deterministic user-id hashing in logs                                                                    |
| `NODE_ENV`                                                          | server        | auto                              | Controls secure-cookie flag                                                                                       |

**No service-role key in any Next runtime env** — the app never reads one
(fitness test `no-service-role` enforces). Service role lives only in Edge
Function secrets.

## Edge Function secrets (Supabase, not Next)

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`; plus
`ENABLE_TEST_AUTH_USERS` and `TEST_*_PASSWORD` for the disabled
`manage-test-auth-users` function.

## Feature flags & frozen-surface gates

Stored in `platform_config` (super-admin-only), toggled from `/admin/super-admin`:

The actual `FEATURE_FLAG_DEFINITIONS` **frozen-surface** flags are only
`leader_surface`, `check_ins`, and `guests`:

- `leader_surface` — leader login (**on by default**, ADR 0024)
- `check_ins` — leader/admin check-in surfaces (frozen, separate from leader_surface)
- `guests` — frozen pre-pivot guest pipeline

There is **no `group_health` flag** — `/admin/group-health` (and planning,
calendar, launch-planning, leader-pipeline) are banner-only (`requireAdmin()` +
`FrozenSurfaceBanner`), reachable by any admin via direct URL. Other flags:
nav-visibility (`nav_show_groups`/`nav_show_people`/`nav_show_planning` —
Groups+People seeded on), `care_member_list`, `usage_tracking`, mute flags.
Admin reads flags per-tier (ADR 0026); leaders read via a leader-safe RPC.

## Build/runtime config

- `next.config.ts`: security headers (`buildSecurityHeaders()`, CSP report-only),
  legacy redirects, `optimizePackageImports` (lucide/radix), `staleTimes`
  (dynamic 30s / static 180s).
- Node pinned `>=20.19 <21` (`package.json` engines); CI uses Node 20, RLS
  integration uses Node 22 (realtime WebSocket need).
- `supabase/config.toml`: `invite-user` + `redeem-invite` enabled;
  `manage-test-auth-users` `enabled=false`.

# Relationships

- [/okf/integrations/index.md](/okf/integrations/index.md)
- [/okf/workflows/deployment.md](/okf/workflows/deployment.md)
- [/okf/workflows/local-development.md](/okf/workflows/local-development.md)
- [/okf/auth/auth-overview.md](/okf/auth/auth-overview.md)
- [/okf/runbooks/index.md](/okf/runbooks/index.md)

# Gotchas

- Email templates (`supabase/templates/invite.html`, `recovery.html`) hard-code
  the public origin (not `{{ .SiteURL }}`) — must be re-pasted in the Supabase
  dashboard after an origin change (see EMAIL_DELIVERY.md).
- Rate limiting **fails open**: missing Upstash env → permissive in-memory
  limiter (fine locally, weak against distributed abuse in prod).
- `NEXT_PUBLIC_*` are inlined at **build** time — changing them needs a rebuild.
- Never commit `.env.local`; copy from `.env.example`.

# Citations

- `.env.example`
- `docs/architecture/DEPLOYMENT.md:21-48`
- `lib/security/rate-limit.ts`
- `supabase/config.toml`
