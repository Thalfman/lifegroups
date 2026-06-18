---
type: Workflow
title: Local Development Setup
description: How to install, run, and exercise the app locally — demo mode vs live Supabase, and test-auth seeding.
resource: repo://package.json
tags: [local-dev, setup, supabase-cli, scripts]
timestamp: 2026-06-18T00:00:00Z
---

# Purpose

Get a working local environment fast and understand the two modes: demo
(no env) vs live (Supabase wired). Needed before running or debugging anything.

# Source of truth

- `package.json` (scripts, Node engine), `README.md` (Local development)
- `.env.example`, `supabase/dev/README.md`, `CLAUDE.md` (Commands)
- `scripts/seed-test-auth-users.ts`, `scripts/verify-toolchain.mjs`

# Key details

## Prerequisites

Node `>=20.19 <21` (pinned in `package.json` engines). npm (no yarn/pnpm).

## Minimal start (demo mode)

```bash
npm install
npm run dev          # http://localhost:3000
```

Without env vars: public preview routes render typed demo data; protected
routes redirect to `/login`.

## Live data / sign-in

```bash
cp .env.example .env.local
# fill NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
npm run dev
```

Then either point at a real Supabase project (apply migrations + seed, bootstrap
a super_admin per `supabase/dev/README.md`) or run a local stack:

```bash
supabase start            # local Postgres + Auth (keys auto-generated)
npm run seed:test-auth    # 5 test users + 2 test groups (--dry-run supported)
npm run remove:test-auth  # tear down
```

## Key scripts

| Command                                       | What it does                         |
| --------------------------------------------- | ------------------------------------ |
| `npm run dev`                                 | Next dev server                      |
| `npm run build`                               | Production build                     |
| `npm run start`                               | Serve production build               |
| `npm run lint`                                | verify-toolchain + ESLint            |
| `npm run typecheck`                           | verify-toolchain + `tsc --noEmit`    |
| `npm test` / `npm run test:run`               | Vitest watch / once (CI)             |
| `npm run test:integration`                    | RLS harness (needs `supabase start`) |
| `npm run test:a11y`                           | Playwright + axe                     |
| `npm run analyze`                             | Bundle analyzer report               |
| `npm run seed:test-auth` / `remove:test-auth` | test auth users                      |

## Pre-commit hook (husky + lint-staged)

`.husky/pre-commit`: lint-staged (Prettier) → `npm run typecheck` →
`npm run test:run`. Keep both green before committing. (Note: one source
indicated the hook may be developer-optional; the canonical CLAUDE.md describes
it as active — verify locally.)

## Test users (local)

admin / over-shepherd / leader1 / leader2 / co-leader (`*.local` emails),
passwords from `TEST_*_PASSWORD` env, mapped to 2 test groups. See
`scripts/seed-test-auth-users.ts`.

# Relationships

- [/okf/workflows/testing.md](/okf/workflows/testing.md)
- [/okf/workflows/deployment.md](/okf/workflows/deployment.md)
- [/okf/config/environment.md](/okf/config/environment.md)
- [/okf/runbooks/index.md](/okf/runbooks/index.md)

# Gotchas

- `verify:toolchain` runs first in lint/typecheck/test and fails fast if shim
  binaries are missing — run `npm install` if it complains.
- Integration tests are **opt-in** (excluded from `test:run`) and require a
  running local Supabase stack.
- Migrations are never auto-applied — apply them explicitly against your target.

# Citations

- `package.json:8-23`
- `README.md:189-241`
- `supabase/dev/README.md`
