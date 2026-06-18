---
type: Workflow
title: Testing
description: The test lanes — Vitest unit, the machine-checked fitness suite, opt-in RLS integration, and Playwright a11y — and what each gates.
resource: repo://tests
tags: [testing, vitest, playwright, fitness, ci, rls]
timestamp: 2026-06-18T00:00:00Z
---

# Purpose

Tests encode the security invariants. Knowing which lane catches what — and
which run in CI vs on a schedule — saves time and prevents shipping regressions
that the fitness suite would block.

# Source of truth

- `tests/fitness/**`, `tests/integration/**`, `tests/a11y/**`, `tests/stubs/`
- `vitest.config.ts`, `vitest.integration.config.ts`, `playwright.config.ts`
- `.github/workflows/{ci,rls-integration,seeded-auth-route-smoke}.yml`

# Key details

## Unit / component (Vitest) — gating

`npm run test:run` (what CI runs). Colocated `**/__tests__/**/*.test.ts(x)`
(most under `lib/admin/__tests__/`). Node environment. The **reads seam** lets
tests inject in-memory adapters — no live Supabase needed. Excludes
`tests/integration/**`, `.claude/**`, `supabase/functions/**`. Single test:
`npx vitest run path/to/file.test.ts -t "name"`.

## Fitness suite (Vitest, in the gating lane) — security invariants

Static scans in `tests/fitness/**`. A regression fails the build:

- `no-service-role` — no service-role key in app/lib
- `no-direct-table-writes` — no `.from().insert|update|delete|upsert`
- `no-select-star` — explicit column allowlists only
- `no-hardcoded-identity` — no hardcoded role/email/UUID in `lib/auth/**` or RLS
- `actions-use-run-action` — every `app/**/actions.ts` routes through a
  run-action adapter (or documented exemption)
- `leader-allowlist-no-admin-private` — leader reads never include `admin_private_note`
- `write-rpc-audit-pairing` — every write RPC pairs an `audit_events` insert
- `security-definer-search-path` — SECURITY DEFINER fns pin `search_path`
- `audit-no-sensitive-plaintext`, `no-sensitive-data-in-logs`,
  `rls-coverage-completeness`
  Scans are static/conservative — audit pairing, broad RLS, hard deletes still
  need human review too.

## Integration (Vitest) — opt-in / scheduled

`npm run test:integration` (`vitest.integration.config.ts`,
`fileParallelism:false`). Runs against a **live local Supabase stack**
(`supabase start`) to exercise real RLS + SECURITY DEFINER RPCs. CI:
`.github/workflows/rls-integration.yml` (Node 22, weekly Mon 06:00 UTC +
path-filtered PRs + manual). Not in the default PR lane.

## Accessibility (Playwright + axe)

`npm run test:a11y` (`tests/a11y/`, against `NEXT_PUBLIC_A11Y_HARNESS` build
route). Projects: chromium + mobile-iphone/android/webkit. Second CI job in
`ci.yml`. Also a scheduled seeded-auth route smoke
(`seeded-auth-route-smoke.yml`, weekly Mon 07:00 UTC).

## CI lanes summary

- `ci.yml` (PR + push to main): job 1 lint → typecheck → build → `test:run`;
  job 2 Playwright a11y.
- `rls-integration.yml`, `seeded-auth-route-smoke.yml`: scheduled/opt-in.
- Codex review loop is **advisory only** — never auto-merges.

# Relationships

- [/okf/workflows/local-development.md](/okf/workflows/local-development.md)
- [/okf/architecture/request-lifecycle.md](/okf/architecture/request-lifecycle.md)
- [/okf/data/index.md](/okf/data/index.md)
- [/okf/decisions/index.md](/okf/decisions/index.md) (ADR 0015 reads seam)

# Gotchas

- Don't add `select("*")` or direct table writes — the fitness lane fails the
  build, not just a warning.
- The default `test:run` lane never touches a database; RLS behavior is only
  exercised by the opt-in integration lane.
- `perf-harness.spec.ts` is measurement-only (no threshold gate).

# Citations

- `tests/fitness/` (19 files)
- `vitest.config.ts`, `vitest.integration.config.ts`, `playwright.config.ts`
- `.github/workflows/ci.yml`
